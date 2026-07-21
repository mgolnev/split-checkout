import "server-only";

import { buildScenario } from "@/lib/build-scenario";
import {
  availableUnitsForScenario,
  buildPvzSheetThumbMeta,
  EMPTY_METHOD,
  itemsFromPartsByModes,
  mergeProductQty,
  sheetThumbMetaFromPart,
  unitsForMode,
  type CartMethodSummariesResult,
  type MethodCode,
  type MethodSummary,
  type PickupStoreSummary,
} from "@/lib/cart-method-summaries-shared";
import { prisma } from "@/lib/prisma";

export type {
  CartMethodSummariesResult,
  MethodCode,
  MethodSummary,
  PickupStoreSummary,
  ProductQtyPreview,
  SheetThumbMeta,
} from "@/lib/cart-method-summaries-shared";
export {
  buildPvzSheetThumbMeta,
  pickupSummaryFromScenario,
  sheetThumbMetaFromPart,
} from "@/lib/cart-method-summaries-shared";

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

function pickupThumbExtras(
  pickupScenario: Awaited<ReturnType<typeof buildScenario>>,
  courierScenario?: Awaited<ReturnType<typeof buildScenario>> | null,
) {
  const reserveThumb = sheetThumbMetaFromPart(
    pickupScenario.parts.find((p) => p.mode === "click_reserve"),
  );
  const collectThumb = sheetThumbMetaFromPart(
    pickupScenario.parts.find((p) => p.mode === "click_collect"),
  );
  let unavailableThumb: ReturnType<typeof sheetThumbMetaFromPart> | undefined;
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
