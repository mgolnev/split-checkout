import { buildScenario } from "@/lib/build-scenario";
import { prisma } from "@/lib/prisma";

export type MethodCode = "courier" | "pickup" | "pvz";

export type MethodSummary = {
  totalUnits: number;
  availableUnits: number;
  fullStoreCount: number;
  hasSplit: boolean;
};

export type PickupStoreSummary = {
  totalUnits: number;
  availableUnits: number;
  reserveUnits: number;
  collectUnits: number;
  remainderUnits: number;
  hasFullCoverage: boolean;
  hasSplit: boolean;
};

export type CartMethodSummariesResult = {
  orderTotalUnits: number;
  methodSummaries: Record<MethodCode, MethodSummary>;
  pickupSummaryByStore: Record<string, PickupStoreSummary>;
};

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
  };
}
