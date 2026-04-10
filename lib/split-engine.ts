import type {
  CartLine,
  OverridePayload,
  ScenarioPart,
  ScenarioResult,
} from "./types";
import {
  compactDisclaimers,
  commonDisclaimer,
  methodDisclaimer,
  systemDisclaimer,
} from "./disclaimers";
import type { DisclaimerTextMap } from "./disclaimers";

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  price: number;
  image: string;
};

type SourceRow = { id: string; name: string; type: string; priority: number };

type InvRow = {
  productId: string;
  sourceId: string;
  quantity: number;
  availableForCourier: boolean;
  availableForPickup: boolean;
  availableForPVZ: boolean;
};

type RuleRow = {
  allowed: boolean;
  maxShipments: number;
  storePickupHoldDays: number;
  clickCollectHoldDays: number;
  pvzHoldDays: number;
  leadTimeDays: number;
  leadTimeLabel: string;
  deliveryPrice: number;
  freeDeliveryThreshold: number;
  canUseWarehouse: boolean;
  canUseStores: boolean;
  canUseClickCollect: boolean;
  steps?: {
    sortOrder: number;
    sourceType: string;
    matchMode: string;
    thresholdPercent: number;
    continueAfterMatch: boolean;
  }[];
};

export type EngineInput = {
  cartLines: CartLine[];
  deliveryMethodCode: "courier" | "pickup" | "pvz";
  cityHasClickCollect: boolean;
  selectedStoreId: string | null;
  products: ProductRow[];
  sources: SourceRow[];
  inventories: InvRow[];
  rule: RuleRow | null;
  disclaimers?: DisclaimerTextMap;
};

const cloneLines = (lines: CartLine[]): CartLine[] =>
  lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));

const totalUnits = (lines: CartLine[]) =>
  lines.reduce((s, l) => s + l.quantity, 0);

function subtractLines(
  from: CartLine[],
  take: CartLine[],
): { remaining: CartLine[]; took: CartLine[] } {
  const idx = new Map(from.map((l) => [l.productId, l.quantity]));
  const took: CartLine[] = [];
  for (const t of take) {
    const cur = idx.get(t.productId) ?? 0;
    const use = Math.min(cur, t.quantity);
    if (use > 0) {
      took.push({ productId: t.productId, quantity: use });
      idx.set(t.productId, cur - use);
    }
  }
  const remaining: CartLine[] = [];
  for (const [productId, quantity] of idx) {
    if (quantity > 0) remaining.push({ productId, quantity });
  }
  return { remaining, took };
}

function invMap(
  inventories: InvRow[],
  predicate: (i: InvRow) => boolean,
): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const i of inventories) {
    if (!predicate(i)) continue;
    if (!m.has(i.sourceId)) m.set(i.sourceId, new Map());
    m.get(i.sourceId)!.set(i.productId, i.quantity);
  }
  return m;
}

function canFulfillFromSource(
  need: CartLine[],
  sourceId: string,
  stock: Map<string, Map<string, number>>,
): boolean {
  const sm = stock.get(sourceId);
  if (!sm) return need.every((l) => l.quantity === 0);
  for (const l of need) {
    const q = sm.get(l.productId) ?? 0;
    if (q < l.quantity) return false;
  }
  return true;
}

/** Жадно снимаем максимум единиц с источника */
function allocateFromSource(
  need: CartLine[],
  sourceId: string,
  stock: Map<string, Map<string, number>>,
): CartLine[] {
  const sm = stock.get(sourceId);
  if (!sm) return [];
  const out: CartLine[] = [];
  for (const l of need) {
    const have = sm.get(l.productId) ?? 0;
    const use = Math.min(l.quantity, have);
    if (use > 0) out.push({ productId: l.productId, quantity: use });
  }
  return out;
}

function sortSources(
  sources: SourceRow[],
  typeOrder: "warehouse_first" | "store_first",
) {
  const wh = sources.filter((s) => s.type === "warehouse").sort((a, b) => a.priority - b.priority);
  const st = sources.filter((s) => s.type === "store").sort((a, b) => a.priority - b.priority);
  return typeOrder === "warehouse_first" ? [...wh, ...st] : [...st, ...wh];
}

function buildPart(
  key: string,
  source: SourceRow,
  mode: ScenarioPart["mode"],
  items: CartLine[],
  products: ProductRow[],
  rule: RuleRow | null,
  leadOverride?: string,
): ScenarioPart | null {
  if (items.length === 0) return null;
  const pmap = new Map(products.map((p) => [p.id, p]));
  const lines: ScenarioPart["items"] = [];
  let subtotal = 0;
  for (const l of items) {
    const p = pmap.get(l.productId);
    if (!p) continue;
    lines.push({
      productId: l.productId,
      name: p.name,
      sku: p.sku,
      price: p.price,
      image: p.image,
      quantity: l.quantity,
    });
    subtotal += p.price * l.quantity;
  }
  if (lines.length === 0) return null;
  const freeTh = rule?.freeDeliveryThreshold ?? 0;
  const delPrice = rule?.deliveryPrice ?? 0;
  const deliveryPrice =
    mode === "click_reserve" || mode === "click_collect"
      ? 0
      : subtotal >= freeTh && freeTh > 0
        ? 0
        : delPrice;
  const leadTimeLabel =
    leadOverride ??
    (rule?.leadTimeLabel
      ? rule.leadTimeLabel
      : rule
        ? `Доставка за ${rule.leadTimeDays} дн.`
        : "");
  const holdDays =
    mode === "click_collect"
      ? rule?.clickCollectHoldDays
      : mode === "click_reserve"
        ? rule?.storePickupHoldDays
        : mode === "pvz"
          ? rule?.pvzHoldDays
          : undefined;
  return {
    key,
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.type === "warehouse" ? "warehouse" : "store",
    mode,
    leadTimeLabel,
    holdDays,
    items: lines,
    subtotal,
    deliveryPrice,
    freeDeliveryThreshold: freeTh,
    defaultIncluded: true,
    canToggle: true,
  };
}

function matchStepSource(
  remainder: CartLine[],
  step: NonNullable<RuleRow["steps"]>[number],
  candidates: SourceRow[],
  stock: Map<string, Map<string, number>>,
) {
  if (step.matchMode === "full") {
    for (const src of candidates) {
      if (canFulfillFromSource(remainder, src.id, stock)) {
        return {
          source: src,
          take: allocateFromSource(remainder, src.id, stock),
        };
      }
    }
    return null;
  }

  const threshold = Math.max(1, Math.min(100, step.thresholdPercent || 0)) / 100;
  let best: { source: SourceRow; take: CartLine[]; units: number } | null = null;

  for (const src of candidates) {
    const take = allocateFromSource(remainder, src.id, stock);
    const units = totalUnits(take);
    if (!best || units > best.units) best = { source: src, take, units };
  }

  if (!best) return null;

  const currentUnits = Math.max(1, totalUnits(remainder));
  if (best.units / currentUnits < threshold) return null;

  return { source: best.source, take: best.take };
}

function courierScenarioByRuleSteps(ctx: EngineInput): ScenarioResult {
  const { cartLines, products, sources, inventories, rule } = ctx;
  const stock = invMap(
    inventories,
    (i) => i.availableForCourier && sources.some((s) => s.id === i.sourceId),
  );
  const citySources = sources.filter((s) => stock.has(s.id));
  const warehouses = sortSources(citySources, "warehouse_first").filter((s) => s.type === "warehouse");
  const stores = sortSources(citySources, "warehouse_first").filter((s) => s.type === "store");
  const need = cloneLines(cartLines);
  const parts: ScenarioPart[] = [];
  const informers: string[] = [];
  const maxShipments = Math.max(1, rule?.maxShipments ?? 2);

  const useWh = rule?.canUseWarehouse !== false;
  const useStores = rule?.canUseStores !== false;
  const allSteps = (rule?.steps ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  let remainder = need;

  const candidatesByType = (sourceType: string): SourceRow[] => {
    if (sourceType === "warehouse") return useWh ? warehouses : [];
    if (sourceType === "store") return useStores ? stores : [];
    return [...(useWh ? warehouses : []), ...(useStores ? stores : [])];
  };

  const appendPart = (step: NonNullable<RuleRow["steps"]>[number], matchedSource: SourceRow, matchedTake: CartLine[]) => {
    const part = buildPart(
      `step_${step.sortOrder}_${parts.length + 1}`,
      matchedSource,
      "courier",
      matchedTake,
      products,
      rule,
    );
    if (part) parts.push(part);
    return subtractLines(remainder, matchedTake).remaining;
  };

  const extendAnyStepToLimit = (step: NonNullable<RuleRow["steps"]>[number], currentRemainder: CartLine[]) => {
    let nextRemainder = currentRemainder;

    while (parts.length < maxShipments && nextRemainder.length > 0) {
      const lastSourceId = parts.length > 0 ? parts[parts.length - 1]!.sourceId : undefined;
      const candidates = candidatesByType("any").filter((src) => src.id !== lastSourceId);
      const matched = matchStepSource(nextRemainder, step, candidates, stock);
      if (!matched || matched.take.length === 0) break;

      const part = buildPart(
        `step_${step.sortOrder}_${parts.length + 1}`,
        matched.source,
        "courier",
        matched.take,
        products,
        rule,
      );
      if (!part) break;
      parts.push(part);
      nextRemainder = subtractLines(nextRemainder, matched.take).remaining;
    }

    return nextRemainder;
  };

  for (const step of allSteps) {
    if (parts.length >= maxShipments) break;
    if (remainder.length === 0) break;

    const candidates = candidatesByType(step.sourceType);
    if (!candidates.length) continue;

    const matched = matchStepSource(remainder, step, candidates, stock);
    if (!matched || matched.take.length === 0) continue;

    remainder = appendPart(step, matched.source, matched.take);

    if (step.sourceType === "any" && step.continueAfterMatch) {
      remainder = extendAnyStepToLimit(step, remainder);
      break;
    }

    if (!step.continueAfterMatch) break;
  }

  if (parts.length > 1) {
    informers.push(commonDisclaimer("splitApplied", ctx.disclaimers));
    informers.push(commonDisclaimer("payOnDeliveryOnly", ctx.disclaimers));
  } else if (parts.length === 1 && remainder.length > 0) {
    informers.push(commonDisclaimer("oneShipmentPartial", ctx.disclaimers));
  }
  if (remainder.length > 0) {
    informers.push(commonDisclaimer("remainderUnavailable", ctx.disclaimers));
    informers.push(commonDisclaimer("remainderKeep", ctx.disclaimers));
  }

  if (parts.length === 0) {
    return {
      parts: [],
      remainder: cloneLines(cartLines),
      informers: [methodDisclaimer("courier", "noShipmentBySteps", ctx.disclaimers)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: "courier",
    };
  }

  return {
    parts,
    remainder,
    informers,
    payOnDeliveryOnly: parts.length > 1,
    fromOverride: false,
    deliveryMethodCode: "courier",
  };
}

function courierScenario(ctx: EngineInput): ScenarioResult {
  const { cartLines, products, sources, inventories, rule } = ctx;
  const informers: string[] = [];
  if (!rule?.canUseWarehouse && !rule?.canUseStores) {
    return {
      parts: [],
      remainder: cloneLines(cartLines),
      informers: [
        ...informers,
        methodDisclaimer("courier", "disabledByRule", ctx.disclaimers),
      ],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: "courier",
    };
  }

  const stock = invMap(
    inventories,
    (i) => i.availableForCourier && sources.some((s) => s.id === i.sourceId),
  );
  const citySources = sources.filter((s) => stock.has(s.id));
  const warehouses = sortSources(citySources, "warehouse_first").filter((s) => s.type === "warehouse");
  const stores = sortSources(citySources, "warehouse_first").filter((s) => s.type === "store");

  const need = cloneLines(cartLines);
  const parts: ScenarioPart[] = [];

  const wh = warehouses[0];
  const useWh = rule?.canUseWarehouse !== false && wh;
  const useStores = rule?.canUseStores !== false;
  const total = totalUnits(need);
  const maxShipments = Math.max(1, rule?.maxShipments ?? 2);

  if (rule?.steps?.length) {
    return courierScenarioByRuleSteps(ctx);
  }

  const findStoreWithFullCoverage = (lines: CartLine[]) => {
    if (!useStores) return null;
    for (const st of stores) {
      if (canFulfillFromSource(lines, st.id, stock)) {
        return { source: st, take: allocateFromSource(lines, st.id, stock) };
      }
    }
    return null;
  };

  const findBestStoreCoverage = (lines: CartLine[]) => {
    if (!useStores) return null;
    let best: { source: SourceRow; take: CartLine[]; units: number } | null = null;
    for (const st of stores) {
      const take = allocateFromSource(lines, st.id, stock);
      const units = totalUnits(take);
      if (!best || units > best.units) {
        best = { source: st, take, units };
      }
    }
    return best && best.units > 0 ? best : null;
  };

  const findBestAnyCoverage = (lines: CartLine[], excludeSourceId?: string) => {
    const candidates: SourceRow[] = [
      ...(useWh && wh ? [wh] : []),
      ...(useStores ? stores : []),
    ].filter((s) => s.id !== excludeSourceId);
    let best: { source: SourceRow; take: CartLine[]; units: number } | null = null;
    for (const s of candidates) {
      const take = allocateFromSource(lines, s.id, stock);
      const units = totalUnits(take);
      if (!best || units > best.units) {
        best = { source: s, take, units };
      }
    }
    return best && best.units > 0 ? best : null;
  };

  const extendPartsUpToLimit = (
    currentParts: ScenarioPart[],
    currentRemainder: CartLine[],
  ) => {
    let remainder = currentRemainder;
    let lastSourceId = currentParts.length ? currentParts[currentParts.length - 1]!.sourceId : undefined;

    while (remainder.length > 0 && currentParts.length < maxShipments) {
      const nextStep = findBestAnyCoverage(remainder, lastSourceId);
      if (!nextStep) break;
      const nextPart = buildPart(
        `x${currentParts.length + 1}`,
        nextStep.source,
        "courier",
        nextStep.take,
        products,
        rule,
      );
      if (!nextPart) break;
      currentParts.push(nextPart);
      remainder = subtractLines(remainder, nextStep.take).remaining;
      lastSourceId = nextStep.source.id;
    }

    return remainder;
  };

  /** 1) Весь заказ со склада */
  if (useWh && canFulfillFromSource(need, wh.id, stock)) {
    const took = allocateFromSource(need, wh.id, stock);
    const p = buildPart("w1", wh, "courier", took, products, rule);
    if (p) parts.push(p);
    return {
      parts,
      remainder: [],
      informers: [methodDisclaimer("courier", "fullWarehouse", ctx.disclaimers)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: "courier",
    };
  }

  /** 2) Весь заказ из одного магазина */
  const fullStore = findStoreWithFullCoverage(need);
  if (fullStore) {
    const p = buildPart("s1", fullStore.source, "courier", fullStore.take, products, rule);
    if (p) parts.push(p);
    return {
      parts,
      remainder: [],
      informers: [methodDisclaimer("courier", "fullStore", ctx.disclaimers)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: "courier",
    };
  }

  /** 3-4) Частично со склада (>=40%), затем добираем остаток */
  if (useWh && wh && total > 0) {
    const fromWh = allocateFromSource(need, wh.id, stock);
    const whUnits = totalUnits(fromWh);
    if (whUnits / total >= 0.4) {
      const part1 = buildPart("w1", wh, "courier", fromWh, products, rule);
      if (part1) parts.push(part1);

      let remainder = subtractLines(need, fromWh).remaining;
      const fullStoreForRemainder = findStoreWithFullCoverage(remainder);
      if (fullStoreForRemainder) {
        const part2 = buildPart("s2", fullStoreForRemainder.source, "courier", fullStoreForRemainder.take, products, rule);
        if (part2) parts.push(part2);
        remainder = [];
      } else {
        const stepStore = findBestStoreCoverage(remainder);
        if (stepStore) {
          const part2 = buildPart("s2", stepStore.source, "courier", stepStore.take, products, rule);
          if (part2) parts.push(part2);
          remainder = subtractLines(remainder, stepStore.take).remaining;
        }
      }

      remainder = extendPartsUpToLimit(parts, remainder);

      if (parts.length > 1) {
        informers.push(commonDisclaimer("splitApplied", ctx.disclaimers));
        informers.push(commonDisclaimer("payOnDeliveryOnly", ctx.disclaimers));
      }
      if (remainder.length > 0) {
        informers.push(commonDisclaimer("remainderUnavailable", ctx.disclaimers));
        informers.push(commonDisclaimer("remainderKeep", ctx.disclaimers));
      }

      return {
        parts,
        remainder,
        informers,
        payOnDeliveryOnly: parts.length > 1,
        fromOverride: false,
        deliveryMethodCode: "courier",
      };
    }
  }

  /** 4) Если склад <40%, пробуем >=40% в одном магазине */
  const bestStore = findBestStoreCoverage(need);
  if (bestStore && total > 0 && bestStore.units / total >= 0.4) {
    const part1 = buildPart("s1", bestStore.source, "courier", bestStore.take, products, rule);
    if (part1) parts.push(part1);
    let remainder = subtractLines(need, bestStore.take).remaining;

    if (useWh && wh && canFulfillFromSource(remainder, wh.id, stock)) {
      const take2 = allocateFromSource(remainder, wh.id, stock);
      const part2 = buildPart("w2", wh, "courier", take2, products, rule);
      if (part2) parts.push(part2);
      remainder = [];
    } else {
      const fullStoreForRemainder = findStoreWithFullCoverage(remainder);
      if (fullStoreForRemainder) {
        const part2 = buildPart("s2", fullStoreForRemainder.source, "courier", fullStoreForRemainder.take, products, rule);
        if (part2) parts.push(part2);
        remainder = [];
      } else {
        const stepAny = findBestAnyCoverage(remainder, bestStore.source.id);
        if (stepAny) {
          const part2 = buildPart("x2", stepAny.source, "courier", stepAny.take, products, rule);
          if (part2) parts.push(part2);
          remainder = subtractLines(remainder, stepAny.take).remaining;
        }
      }
    }

    remainder = extendPartsUpToLimit(parts, remainder);

    if (parts.length > 1) {
      informers.push(commonDisclaimer("splitApplied", ctx.disclaimers));
      informers.push(commonDisclaimer("payOnDeliveryOnly", ctx.disclaimers));
    }
    if (remainder.length > 0) {
      informers.push(commonDisclaimer("remainderUnavailable", ctx.disclaimers));
      informers.push(commonDisclaimer("remainderKeep", ctx.disclaimers));
    }

    return {
      parts,
      remainder,
      informers,
      payOnDeliveryOnly: parts.length > 1,
      fromOverride: false,
      deliveryMethodCode: "courier",
    };
  }

  /** 5) Лесенка: оформляем максимально возможную часть, не превышая лимит отправлений */
  const step1 = findBestAnyCoverage(need);
  if (step1) {
    const part1 = buildPart("x1", step1.source, "courier", step1.take, products, rule);
    if (part1) parts.push(part1);
    let remainder = subtractLines(need, step1.take).remaining;

    while (parts.length < maxShipments) {
      const nextStep = findBestAnyCoverage(
        remainder,
        parts.length > 0 ? parts[parts.length - 1]!.sourceId : undefined,
      );
      if (!nextStep) break;
      const nextPart = buildPart(
        `x${parts.length + 1}`,
        nextStep.source,
        "courier",
        nextStep.take,
        products,
        rule,
      );
      if (!nextPart) break;
      parts.push(nextPart);
      remainder = subtractLines(remainder, nextStep.take).remaining;
      if (remainder.length === 0) break;
    }

    if (parts.length > 1) {
      informers.push(commonDisclaimer("splitApplied", ctx.disclaimers));
      informers.push(commonDisclaimer("payOnDeliveryOnly", ctx.disclaimers));
    } else {
      informers.push(commonDisclaimer("oneShipmentPartial", ctx.disclaimers));
    }
    if (remainder.length > 0) {
      informers.push(commonDisclaimer("remainderUnavailable", ctx.disclaimers));
      informers.push(commonDisclaimer("remainderKeep", ctx.disclaimers));
    }

    return {
      parts,
      remainder,
      informers,
      payOnDeliveryOnly: parts.length > 1,
      fromOverride: false,
      deliveryMethodCode: "courier",
    };
  }

  return {
    parts: [],
    remainder: cloneLines(cartLines),
    informers: [methodDisclaimer("courier", "noSimpleShipment", ctx.disclaimers)],
    payOnDeliveryOnly: false,
    fromOverride: false,
    deliveryMethodCode: "courier",
  };
}

function pickupScenario(ctx: EngineInput): ScenarioResult {
  const { cartLines, products, sources, inventories, cityHasClickCollect, selectedStoreId, rule } =
    ctx;
  const informers: string[] = [];

  if (!selectedStoreId) {
    return {
      parts: [],
      remainder: cloneLines(cartLines),
      informers: [methodDisclaimer("pickup", "chooseStore", ctx.disclaimers)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: "pickup",
    };
  }

  const store = sources.find((s) => s.id === selectedStoreId);
  if (!store || store.type !== "store") {
    return {
      parts: [],
      remainder: cloneLines(cartLines),
      informers: [methodDisclaimer("pickup", "storeNotFound", ctx.disclaimers)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: "pickup",
    };
  }

  const stockStore = invMap(
    inventories,
    (i) => i.availableForPickup && i.sourceId === selectedStoreId,
  );
  const stockWh = invMap(
    inventories,
    (i) =>
      i.availableForPickup &&
      sources.some((s) => s.id === i.sourceId && s.type === "warehouse"),
  );

  const warehouses = sortSources(
    sources.filter((s) => s.type === "warehouse"),
    "warehouse_first",
  );
  const wh = warehouses[0];

  const need = cloneLines(cartLines);
  const parts: ScenarioPart[] = [];

  const reserveTake = allocateFromSource(need, store.id, stockStore);
  if (reserveTake.length > 0) {
    const p = buildPart(
      "reserve",
      store,
      "click_reserve",
      reserveTake,
      products,
      rule,
      "Соберём за 30 минут",
    );
    if (p) {
      p.deliveryPrice = 0;
      parts.push(p);
    }
  }

  const afterReserve = subtractLines(need, reserveTake).remaining;
  const canCc =
    cityHasClickCollect &&
    rule?.canUseClickCollect !== false &&
    wh &&
    rule?.canUseWarehouse !== false;

  let remainder = afterReserve;

  if (canCc && afterReserve.length > 0 && wh) {
    const collectTake = allocateFromSource(afterReserve, wh.id, stockWh);
    if (collectTake.length > 0) {
      const p = buildPart(
        "collect",
        wh,
        "click_collect",
        collectTake,
        products,
        rule,
        "Доставим в магазин через 3 дня",
      );
      if (p) {
        p.deliveryPrice = 0;
        parts.push(p);
      }
      remainder = subtractLines(afterReserve, collectTake).remaining;
    }
  }

  if (!cityHasClickCollect && afterReserve.length > 0) {
    informers.push(methodDisclaimer("pickup", "clickCollectUnavailable", ctx.disclaimers));
  }

  if (remainder.length > 0) {
    informers.push(
      methodDisclaimer("pickup", "remainderUnavailableInStore", ctx.disclaimers),
    );
    informers.push(commonDisclaimer("remainderKeep", ctx.disclaimers));
  }

  return {
    parts,
    remainder,
    informers:
      parts.length > 1
        ? [
            ...informers,
            commonDisclaimer("payOnDeliveryOnly", ctx.disclaimers),
          ]
        : informers,
    payOnDeliveryOnly: parts.length > 1,
    fromOverride: false,
    deliveryMethodCode: "pickup",
  };
}

function pvzScenario(ctx: EngineInput): ScenarioResult {
  const { cartLines, products, sources, inventories, rule } = ctx;
  const informers: string[] = [
    methodDisclaimer("pvz", "intro", ctx.disclaimers),
  ];

  if (!rule?.canUseWarehouse) {
    return {
      parts: [],
      remainder: cloneLines(cartLines),
      informers: [...informers, methodDisclaimer("pvz", "disabledByRule", ctx.disclaimers)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: "pvz",
    };
  }

  const wh = sortSources(
    sources.filter((s) => s.type === "warehouse"),
    "warehouse_first",
  )[0];
  if (!wh) {
    return {
      parts: [],
      remainder: cloneLines(cartLines),
      informers: [...informers, methodDisclaimer("pvz", "noWarehouseInCity", ctx.disclaimers)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: "pvz",
    };
  }

  const stock = invMap(
    inventories,
    (i) => i.availableForPVZ && i.sourceId === wh.id,
  );
  const need = cloneLines(cartLines);
  const take = allocateFromSource(need, wh.id, stock);
  const remainder = subtractLines(need, take).remaining;

  const part = buildPart("pvz_wh", wh, "pvz", take, products, rule, rule.leadTimeLabel || "Дата уточняется при выборе ПВЗ");
  const parts = part ? [part] : [];

  if (remainder.length > 0) {
    informers.push(commonDisclaimer("remainderUnavailable", ctx.disclaimers));
    informers.push(commonDisclaimer("remainderKeep", ctx.disclaimers));
  }

  return {
    parts,
    remainder,
    informers,
    payOnDeliveryOnly: false,
    fromOverride: false,
    deliveryMethodCode: "pvz",
  };
}

export function computeScenario(ctx: EngineInput): ScenarioResult {
  let result: ScenarioResult;
  if (!ctx.rule) {
    result = {
      parts: [],
      remainder: cloneLines(ctx.cartLines),
      informers: [systemDisclaimer("noRuleForCityAndMethod", ctx.disclaimers)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: ctx.deliveryMethodCode,
    };
  } else if (!ctx.rule.allowed) {
    result = {
      parts: [],
      remainder: cloneLines(ctx.cartLines),
      informers: [systemDisclaimer("methodDisabledByRule", ctx.disclaimers)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: ctx.deliveryMethodCode,
    };
  } else {
    switch (ctx.deliveryMethodCode) {
      case "courier":
        result = courierScenario(ctx);
        break;
      case "pickup":
        result = pickupScenario(ctx);
        break;
      case "pvz":
        result = pvzScenario(ctx);
        break;
      default:
        result = {
        parts: [],
        remainder: cloneLines(ctx.cartLines),
        informers: [systemDisclaimer("unknownMethod", ctx.disclaimers)],
        payOnDeliveryOnly: false,
        fromOverride: false,
        deliveryMethodCode: ctx.deliveryMethodCode,
        };
        break;
    }
  }
  return { ...result, informers: compactDisclaimers(result.informers) };
}

export function scenarioFromOverride(
  payload: OverridePayload,
  products: ProductRow[],
  rule: RuleRow | null,
  deliveryMethodCode: string,
  disclaimers?: DisclaimerTextMap,
): ScenarioResult {
  const parts: ScenarioPart[] = [];

  for (const op of payload.parts) {
    const sourceStub: SourceRow = {
      id: op.sourceId,
      name: op.sourceId,
      type: op.mode === "click_collect" || op.mode === "pvz" ? "warehouse" : "store",
      priority: 0,
    };
    const p = buildPart(
      op.key,
      sourceStub,
      op.mode,
      op.items,
      products,
      rule,
      op.leadTimeLabel,
    );
    if (p) {
      p.defaultIncluded = op.defaultIncluded !== false;
      p.canToggle = op.canToggle !== false;
      parts.push(p);
    }
  }

  return {
    parts,
    remainder: cloneLines(payload.remainder),
    informers: compactDisclaimers(
      payload.informers?.length
        ? payload.informers!
        : [
            "Активен ручной сценарий (override) для UX-теста.",
            ...(parts.length > 1
              ? [commonDisclaimer("payOnDeliveryOnly", disclaimers)]
              : []),
          ],
    ),
    payOnDeliveryOnly: parts.length > 1,
    fromOverride: true,
    deliveryMethodCode,
  };
}

/** Обогащаем override: подставляем реальные имена источников */
export function enrichOverrideScenario(
  result: ScenarioResult,
  sources: SourceRow[],
): ScenarioResult {
  const smap = new Map(sources.map((s) => [s.id, s]));
  return {
    ...result,
    parts: result.parts.map((p) => {
      const s = smap.get(p.sourceId);
      return s ? { ...p, sourceName: s.name, sourceType: s.type === "warehouse" ? "warehouse" : "store" } : p;
    }),
  };
}
