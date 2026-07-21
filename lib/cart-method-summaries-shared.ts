import { formatHoldNoticeForPart } from "@/lib/hold-display";
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

export function mergeProductQty(lines: { productId: string; quantity: number }[]): ProductQtyPreview[] {
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

export function itemsFromPartsByModes(parts: ScenarioPart[], modes: ScenarioPart["mode"][]): ProductQtyPreview[] {
  return mergeProductQty(parts.filter((p) => modes.includes(p.mode)).flatMap((p) => p.items));
}

export function availableUnitsForScenario(scenario: ScenarioResult) {
  return scenario.parts.reduce(
    (sum, part) => sum + part.items.reduce((partSum, item) => partSum + item.quantity, 0),
    0,
  );
}

export function unitsForMode(scenario: ScenarioResult, mode: "click_reserve" | "click_collect") {
  return scenario.parts
    .filter((part) => part.mode === mode)
    .reduce(
      (sum, part) => sum + part.items.reduce((partSum, item) => partSum + item.quantity, 0),
      0,
    );
}

export const EMPTY_METHOD: MethodSummary = {
  totalUnits: 0,
  availableUnits: 0,
  fullStoreCount: 0,
  hasSplit: false,
};

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
