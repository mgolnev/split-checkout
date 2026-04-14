import { NextResponse } from "next/server";
import { buildScenario } from "@/lib/build-scenario";
import { unresolvedBlockCopy, type DisclaimerTextMap } from "@/lib/disclaimers";
import { prisma } from "@/lib/prisma";

type MethodCode = "courier" | "pickup" | "pvz";

type MethodSummary = {
  totalUnits: number;
  availableUnits: number;
  fullStoreCount: number;
  hasSplit: boolean;
};

type PickupStoreSummary = {
  totalUnits: number;
  availableUnits: number;
  reserveUnits: number;
  collectUnits: number;
  remainderUnits: number;
  hasFullCoverage: boolean;
  hasSplit: boolean;
};

const METHOD_CODES: MethodCode[] = ["courier", "pickup", "pvz"];

function availableUnitsForScenario(
  scenario: Awaited<ReturnType<typeof buildScenario>>,
) {
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

export async function GET() {
  try {
  const [cities, methods, products, rules, disclaimerRows] = await Promise.all([
    prisma.city.findMany({ orderBy: { name: "asc" } }),
    prisma.deliveryMethod.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.shippingRule.findMany({
      include: { deliveryMethod: true },
    }),
    prisma.disclaimerTemplate.findMany({
      select: { code: true, text: true, isActive: true },
    }),
  ]);

  const disclaimerMap = Object.fromEntries(
    disclaimerRows.map((r) => [r.code, r.isActive ? r.text : null]),
  ) as DisclaimerTextMap;

  const checkoutCopy = unresolvedBlockCopy(disclaimerMap);

  const storesByCity: Record<string, { id: string; name: string }[]> = {};
  const pvzByCity: Record<string, { id: string; name: string; address: string; requiresPrepayment: boolean }[]> =
    {};
  const allowedMethodsByCity: Record<string, string[]> = {};
  const methodSummaryByCity: Record<string, Record<MethodCode, MethodSummary>> = {};
  const pickupSummaryByStore: Record<string, Record<string, PickupStoreSummary>> = {};

  for (const c of cities) {
    const stores = await prisma.source.findMany({
      where: { cityId: c.id, type: "store", isActive: true },
      orderBy: { priority: "asc" },
      select: { id: true, name: true },
    });
    storesByCity[c.id] = stores;

    const activeSources = await prisma.source.findMany({
      where: { cityId: c.id, isActive: true },
      select: { id: true },
    });
    const baseInventory = await prisma.inventory.findMany({
      where: {
        sourceId: { in: activeSources.map((s) => s.id) },
        quantity: { gt: 0 },
      },
      select: { productId: true },
      distinct: ["productId"],
    });
    const totalUnits = baseInventory.length;

    const pvzAll = await prisma.pvzPoint.findMany({
      where: { cityId: c.id, isActive: true },
      orderBy: { name: "asc" },
    });
    pvzByCity[c.id] = pvzAll.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      requiresPrepayment: p.requiresPrepayment,
    }));

    allowedMethodsByCity[c.id] = rules
      .filter((r) => r.cityId === c.id && r.allowed)
      .map((r) => r.deliveryMethod.code);

    const nextSummary = Object.fromEntries(
      METHOD_CODES.map((code) => [
        code,
        { totalUnits, availableUnits: 0, fullStoreCount: 0, hasSplit: false },
      ]),
    ) as Record<MethodCode, MethodSummary>;
    const nextPickupSummary: Record<string, PickupStoreSummary> = {};

    if (totalUnits > 0) {
      const [courierScenario, pvzScenario] = await Promise.all([
        buildScenario({
          cityId: c.id,
          deliveryMethodCode: "courier",
          selectedStoreId: null,
        }),
        buildScenario({
          cityId: c.id,
          deliveryMethodCode: "pvz",
          selectedStoreId: null,
        }),
      ]);

      nextSummary.courier.availableUnits = availableUnitsForScenario(courierScenario);
      nextSummary.courier.hasSplit =
        courierScenario.parts.length > 1 || courierScenario.remainder.length > 0;
      nextSummary.pvz.availableUnits = availableUnitsForScenario(pvzScenario);
      nextSummary.pvz.hasSplit = pvzScenario.parts.length > 1 || pvzScenario.remainder.length > 0;

      let bestPickupUnits = 0;
      let fullStoreCount = 0;
      let pickupHasSplit = false;
      for (const store of stores) {
        const pickupScenario = await buildScenario({
          cityId: c.id,
          deliveryMethodCode: "pickup",
          selectedStoreId: store.id,
        });
        const availableUnits = availableUnitsForScenario(pickupScenario);
        const reserveUnits = unitsForMode(pickupScenario, "click_reserve");
        const collectUnits = unitsForMode(pickupScenario, "click_collect");
        const remainderUnits = pickupScenario.remainder.reduce((sum, line) => sum + line.quantity, 0);
        const hasSplit = pickupScenario.parts.length > 1 || pickupScenario.remainder.length > 0;
        const hasFullCoverage = availableUnits >= totalUnits && remainderUnits === 0;

        nextPickupSummary[store.id] = {
          totalUnits,
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
      nextSummary.pickup.availableUnits = bestPickupUnits;
      nextSummary.pickup.fullStoreCount = fullStoreCount;
      nextSummary.pickup.hasSplit = pickupHasSplit;
    }

    methodSummaryByCity[c.id] = nextSummary;
    pickupSummaryByStore[c.id] = nextPickupSummary;
  }

  return NextResponse.json({
    cities,
    deliveryMethods: methods,
    products,
    storesByCity,
    pvzByCity,
    allowedMethodsByCity,
    methodSummaryByCity,
    pickupSummaryByStore,
    checkoutCopy,
  });
  } catch (e) {
    console.error("[bootstrap]", e);
    return NextResponse.json(
      {
        error: "bootstrap_failed",
        message:
          process.env.NODE_ENV === "development"
            ? e instanceof Error
              ? e.message
              : String(e)
            : "Database error",
      },
      { status: 500 },
    );
  }
}
