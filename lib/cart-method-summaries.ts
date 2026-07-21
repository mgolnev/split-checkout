import { buildScenario } from "@/lib/build-scenario";
import { formatHoldNoticeForPart } from "@/lib/hold-display";
import { prisma } from "@/lib/prisma";
import type { ScenarioPart, ScenarioResult } from "@/lib/types";

export type MethodCode = "courier" | "pickup" | "pvz";

export type MethodSummary = {
  totalUnits: number;
  availableUnits: number;
  fullStoreCount: number;
  hasSplit: boolean;
};

/** Сжатая строка корзины для превью в UI (магазин / ПВЗ). */
export type ProductQtyPreview = { productId: string; quantity: number };

/** Подписи срока доставки и хранения под миниатюрами в модалке выбора точки */
export type SheetThumbMeta = { leadText?: string; holdText?: string };

export type PickupStoreSummary = {
  totalUnits: number;
  availableUnits: number;
  reserveUnits: number;
  collectUnits: number;
  remainderUnits: number;
  hasFullCoverage: boolean;
  hasSplit: boolean;
  /** По сценарию самовывоза в эту точку — для миниатюр в модалке */
  immediateLines?: ProductQtyPreview[];
  laterLines?: ProductQtyPreview[];
  unavailableLines?: ProductQtyPreview[];
  reserveThumb?: SheetThumbMeta;
  collectThumb?: SheetThumbMeta;
  unavailableThumb?: SheetThumbMeta;
};

export type CartMethodSummariesResult = {
  orderTotalUnits: number;
  methodSummaries: Record<MethodCode, MethodSummary>;
  pickupSummaryByStore: Record<string, PickupStoreSummary>;
  /** Общий для всех ПВЗ города разрез «в пункте / остаток заказа» по текущим строкам корзины */
  pvzLinePreview?: {
    available: ProductQtyPreview[];
    unavailable: ProductQtyPreview[];
  };
  /** Сроки под блоками «в пункте выдачи» / «другим способом» в модалке ПВЗ */
  pvzSheetThumbMeta?: { atPoint: SheetThumbMeta; other: SheetThumbMeta };
};

function mergeProductQty(lines: { productId: string; quantity: number }[]): ProductQtyPreview[] {
  const m = new Map<string, number>();
  for (const l of lines) {
    m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity);
  }
  return [...m.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Тексты под миниатюрами товаров (как lead + hold в карточке отправления). */
export function sheetThumbMetaFromPart(part: ScenarioPart | undefined): SheetThumbMeta {
  if (!part) return {};
  const leadText = part.leadTimeLabel?.trim() || undefined;
  const holdText = formatHoldNoticeForPart(part.mode, part.holdDays) ?? undefined;
  const o: SheetThumbMeta = {};
  if (leadText) o.leadText = leadText;
  if (holdText) o.holdText = holdText;
  return o;
}

function pickupThumbExtras(
  pickupScenario: ScenarioResult,
  courierScenario?: ScenarioResult | null,
): Pick<PickupStoreSummary, "reserveThumb" | "collectThumb" | "unavailableThumb"> {
  const reserveThumb = sheetThumbMetaFromPart(
    pickupScenario.parts.find((p) => p.mode === "click_reserve"),
  );
  const collectThumb = sheetThumbMetaFromPart(
    pickupScenario.parts.find((p) => p.mode === "click_collect"),
  );
  let unavailableThumb: SheetThumbMeta | undefined;
  if (pickupScenario.remainder.length > 0) {
    unavailableThumb = sheetThumbMetaFromPart(
      pickupScenario.parts.find((p) => p.mode === "courier") ??
        courierScenario?.parts.find((p) => p.mode === "courier"),
    );
    if (!unavailableThumb.leadText && !unavailableThumb.holdText) unavailableThumb = undefined;
  }
  return {
    ...(Object.keys(reserveThumb).length ? { reserveThumb } : {}),
    ...(Object.keys(collectThumb).length ? { collectThumb } : {}),
    ...(unavailableThumb ? { unavailableThumb } : {}),
  };
}

/** Мета для модалки ПВЗ: срок по складу ПВЗ и по курьеру для остатка заказа. */
export function buildPvzSheetThumbMeta(
  pvzScenario: ScenarioResult,
  courierScenario?: ScenarioResult | null,
): { atPoint: SheetThumbMeta; other: SheetThumbMeta } {
  const atPoint = sheetThumbMetaFromPart(pvzScenario.parts.find((p) => p.mode === "pvz"));
  if (pvzScenario.remainder.length === 0) {
    return { atPoint, other: {} };
  }
  const courierPart = courierScenario?.parts.find((p) => p.mode === "courier");
  return { atPoint, other: sheetThumbMetaFromPart(courierPart) };
}

function itemsFromPartsByModes(parts: ScenarioPart[], modes: ScenarioPart["mode"][]): ProductQtyPreview[] {
  return mergeProductQty(parts.filter((p) => modes.includes(p.mode)).flatMap((p) => p.items));
}

function availableUnitsForScenario(scenario: Awaited<ReturnType<typeof buildScenario>>) {
  return scenario.parts.reduce(
    (sum, part) => sum + part.items.reduce((partSum, item) => partSum + item.quantity, 0),
    0,
  );
}

function unitsForMode(
  scenario: Awaited<ReturnType<typeof buildScenario>>,
  mode: "click_reserve" | "click_collect",
) {
  return scenario.parts
    .filter((part) => part.mode === mode)
    .reduce(
      (sum, part) => sum + part.items.reduce((partSum, item) => partSum + item.quantity, 0),
      0,
    );
}

const EMPTY_METHOD: MethodSummary = {
  totalUnits: 0,
  availableUnits: 0,
  fullStoreCount: 0,
  hasSplit: false,
};

/**
 * Сводки по способам доставки для конкретных строк заказа (как в чекауте), а не по всему ассортименту города.
 */
export async function computeCartMethodSummaries(
  cityId: string,
  lines: { productId: string; quantity: number }[],
): Promise<CartMethodSummariesResult> {
  const linePayload = lines
    .map((l) => ({
      productId: l.productId,
      quantity: Math.max(0, Math.floor(Number(l.quantity))),
    }))
    .filter((l) => l.quantity > 0);

  const orderTotalUnits = linePayload.reduce((s, l) => s + l.quantity, 0);

  if (orderTotalUnits <= 0) {
    return {
      orderTotalUnits: 0,
      methodSummaries: {
        courier: { ...EMPTY_METHOD },
        pickup: { ...EMPTY_METHOD },
        pvz: { ...EMPTY_METHOD },
      },
      pickupSummaryByStore: {},
      pvzLinePreview: { available: [], unavailable: [] },
      pvzSheetThumbMeta: { atPoint: {}, other: {} },
    };
  }

  const cityExists = await prisma.city.findUnique({ where: { id: cityId }, select: { id: true } });
  if (!cityExists) {
    return {
      orderTotalUnits,
      methodSummaries: {
        courier: { ...EMPTY_METHOD, totalUnits: orderTotalUnits },
        pickup: { ...EMPTY_METHOD, totalUnits: orderTotalUnits },
        pvz: { ...EMPTY_METHOD, totalUnits: orderTotalUnits },
      },
      pickupSummaryByStore: {},
      pvzLinePreview: { available: [], unavailable: [] },
      pvzSheetThumbMeta: { atPoint: {}, other: {} },
    };
  }

  const stores = await prisma.source.findMany({
    where: { cityId, type: "store", isActive: true },
    orderBy: { priority: "asc" },
    select: { id: true },
  });

  const [courierScenario, pvzScenario] = await Promise.all([
    buildScenario({
      cityId,
      deliveryMethodCode: "courier",
      selectedStoreId: null,
      lines: linePayload,
    }),
    buildScenario({
      cityId,
      deliveryMethodCode: "pvz",
      selectedStoreId: null,
      lines: linePayload,
    }),
  ]);

  const pvzLinePreview = {
    available: itemsFromPartsByModes(pvzScenario.parts, ["pvz"]),
    unavailable: mergeProductQty(pvzScenario.remainder),
  };
  const pvzSheetThumbMeta = buildPvzSheetThumbMeta(pvzScenario, courierScenario);

  const methodSummaries: Record<MethodCode, MethodSummary> = {
    courier: {
      totalUnits: orderTotalUnits,
      availableUnits: availableUnitsForScenario(courierScenario),
      fullStoreCount: 0,
      hasSplit: courierScenario.parts.length > 1 || courierScenario.remainder.length > 0,
    },
    pvz: {
      totalUnits: orderTotalUnits,
      availableUnits: availableUnitsForScenario(pvzScenario),
      fullStoreCount: 0,
      hasSplit: pvzScenario.parts.length > 1 || pvzScenario.remainder.length > 0,
    },
    pickup: {
      totalUnits: orderTotalUnits,
      availableUnits: 0,
      fullStoreCount: 0,
      hasSplit: false,
    },
  };

  const pickupSummaryByStore: Record<string, PickupStoreSummary> = {};
  let bestPickupUnits = 0;
  let fullStoreCount = 0;
  let pickupHasSplit = false;

  for (const store of stores) {
    const pickupScenario = await buildScenario({
      cityId,
      deliveryMethodCode: "pickup",
      selectedStoreId: store.id,
      lines: linePayload,
    });
    const availableUnits = availableUnitsForScenario(pickupScenario);
    const reserveUnits = unitsForMode(pickupScenario, "click_reserve");
    const collectUnits = unitsForMode(pickupScenario, "click_collect");
    const remainderUnits = pickupScenario.remainder.reduce((sum, line) => sum + line.quantity, 0);
    const hasSplit = pickupScenario.parts.length > 1 || pickupScenario.remainder.length > 0;
    const hasFullCoverage = availableUnits >= orderTotalUnits && remainderUnits === 0;

    pickupSummaryByStore[store.id] = {
      totalUnits: orderTotalUnits,
      availableUnits,
      reserveUnits,
      collectUnits,
      remainderUnits,
      hasFullCoverage,
      hasSplit,
      immediateLines: itemsFromPartsByModes(pickupScenario.parts, ["click_reserve"]),
      laterLines: itemsFromPartsByModes(pickupScenario.parts, ["click_collect"]),
      unavailableLines: mergeProductQty(pickupScenario.remainder),
      ...pickupThumbExtras(pickupScenario, courierScenario),
    };

    bestPickupUnits = Math.max(bestPickupUnits, availableUnits);
    pickupHasSplit = pickupHasSplit || hasSplit;
    if (hasFullCoverage) fullStoreCount += 1;
  }

  methodSummaries.pickup.availableUnits = bestPickupUnits;
  methodSummaries.pickup.fullStoreCount = fullStoreCount;
  methodSummaries.pickup.hasSplit = pickupHasSplit;

  return {
    orderTotalUnits,
    methodSummaries,
    pickupSummaryByStore,
    pvzLinePreview,
    pvzSheetThumbMeta,
  };
}

/**
 * Сводка для карты/списка магазинов по уже посчитанному сценарию самовывоза (остаток, добор отправления и т.д.).
 * Совпадает по полям с {@link computeCartMethodSummaries} для одной точки.
 */
export function pickupSummaryFromScenario(
  orderTotalUnits: number,
  scenario: ScenarioResult,
  /** Для подписей к «недоступно здесь»: остаток обычно уходит курьером */
  courierScenario?: ScenarioResult | null,
): PickupStoreSummary {
  const availableUnits = availableUnitsForScenario(scenario);
  const reserveUnits = unitsForMode(scenario, "click_reserve");
  const collectUnits = unitsForMode(scenario, "click_collect");
  const remainderUnits = scenario.remainder.reduce((sum, line) => sum + line.quantity, 0);
  const hasSplit = scenario.parts.length > 1 || scenario.remainder.length > 0;
  const hasFullCoverage = availableUnits >= orderTotalUnits && remainderUnits === 0;
  return {
    totalUnits: orderTotalUnits,
    availableUnits,
    reserveUnits,
    collectUnits,
    remainderUnits,
    hasFullCoverage,
    hasSplit,
    immediateLines: itemsFromPartsByModes(scenario.parts, ["click_reserve"]),
    laterLines: itemsFromPartsByModes(scenario.parts, ["click_collect"]),
    unavailableLines: mergeProductQty(scenario.remainder),
    ...pickupThumbExtras(scenario, courierScenario),
  };
}
