import type { OverridePayload } from "./types";
import {
  computeScenario,
  enrichOverrideScenario,
  scenarioFromOverride,
  type EngineInput,
} from "./split-engine";
import type { CartLine, ScenarioResult } from "./types";
import { compactDisclaimers, commonDisclaimer, systemDisclaimer } from "./disclaimers";
import { prisma } from "./prisma";

export async function buildScenario(params: {
  cityId: string;
  deliveryMethodCode: "courier" | "pickup" | "pvz";
  selectedStoreId: string | null;
  lines?: CartLine[];
}): Promise<ScenarioResult> {
  const disclaimerRows = await prisma.disclaimerTemplate.findMany({
    select: { code: true, text: true, isActive: true },
  });
  const disclaimerMap = Object.fromEntries(
    disclaimerRows.map((r) => [r.code, r.isActive ? r.text : null]),
  );

  const finalizeScenario = (scenario: ScenarioResult): ScenarioResult => ({
    ...scenario,
    informers: compactDisclaimers(scenario.informers),
    remainderKeepHint:
      scenario.remainder.length > 0 ? commonDisclaimer("remainderKeep", disclaimerMap) : "",
  });

  const city = await prisma.city.findUnique({ where: { id: params.cityId } });
  if (!city) {
    return finalizeScenario({
      parts: [],
      remainder: [],
      informers: [systemDisclaimer("cityNotFound", disclaimerMap)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: params.deliveryMethodCode,
    });
  }

  const dm = await prisma.deliveryMethod.findFirst({
    where: { code: params.deliveryMethodCode, isActive: true },
  });
  if (!dm) {
    return finalizeScenario({
      parts: [],
      remainder: [],
      informers: [systemDisclaimer("deliveryMethodUnavailable", disclaimerMap)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: params.deliveryMethodCode,
    });
  }

  const rule = await prisma.shippingRule.findUnique({
    where: {
      cityId_deliveryMethodId: { cityId: city.id, deliveryMethodId: dm.id },
    },
    include: {
      ruleSteps: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  const sources = await prisma.source.findMany({
    where: { cityId: city.id, isActive: true },
    orderBy: [{ priority: "asc" }],
  });

  const invFilterByMethod =
    params.deliveryMethodCode === "courier"
      ? { availableForCourier: true }
      : params.deliveryMethodCode === "pickup"
        ? { availableForPickup: true }
        : { availableForPVZ: true };

  const eligibleInventory = await prisma.inventory.findMany({
    where: {
      sourceId: { in: sources.map((s) => s.id) },
      quantity: { gt: 0 },
      ...invFilterByMethod,
    },
    select: { productId: true },
    distinct: ["productId"],
  });
  const requestedLines = params.lines?.length ? params.lines : null;
  const requestedProductIds = requestedLines ? requestedLines.map((line) => line.productId) : [];
  const productIds = requestedLines ? requestedProductIds : eligibleInventory.map((i) => i.productId);

  if (productIds.length === 0) {
    return finalizeScenario({
      parts: [],
      remainder: [],
      informers: [systemDisclaimer("noActiveProductsForMethod", disclaimerMap)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: params.deliveryMethodCode,
    });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    orderBy: { name: "asc" },
  });
  if (products.length === 0) {
    return finalizeScenario({
      parts: [],
      remainder: requestedLines ? requestedLines : [],
      informers: [systemDisclaimer("noActiveProductsForMethod", disclaimerMap)],
      payOnDeliveryOnly: false,
      fromOverride: false,
      deliveryMethodCode: params.deliveryMethodCode,
    });
  }

  const activeProductIds = new Set(products.map((product) => product.id));
  const lines = requestedLines
    ? requestedLines.filter((line) => activeProductIds.has(line.productId))
    : products.map((p) => ({ productId: p.id, quantity: 1 }));

  const inventories = await prisma.inventory.findMany({
    where: {
      productId: { in: [...activeProductIds] },
      sourceId: { in: sources.map((s) => s.id) },
    },
  });

  const override = await prisma.scenarioOverride.findFirst({
    where: {
      cityId: city.id,
      deliveryMethod: params.deliveryMethodCode,
      isEnabled: true,
    },
    orderBy: { name: "asc" },
  });

  const ruleRow = rule
    ? {
        allowed: rule.allowed,
        maxShipments: rule.maxShipments,
        storePickupHoldDays: rule.storePickupHoldDays,
        clickCollectHoldDays: rule.clickCollectHoldDays,
        pvzHoldDays: rule.pvzHoldDays,
        leadTimeDays: rule.leadTimeDays,
        leadTimeLabel: rule.leadTimeLabel,
        deliveryPrice: rule.deliveryPrice,
        freeDeliveryThreshold: rule.freeDeliveryThreshold,
        canUseWarehouse: rule.canUseWarehouse,
        canUseStores: rule.canUseStores,
        canUseClickCollect: rule.canUseClickCollect,
        steps: rule.ruleSteps.map((s) => ({
          sortOrder: s.sortOrder,
          sourceType: s.sourceType,
          matchMode: s.matchMode,
          thresholdPercent: s.thresholdPercent,
          continueAfterMatch: s.continueAfterMatch,
        })),
      }
    : null;

  const productRows = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.price,
    image: p.image,
    sizeLabel: p.sizeLabel,
  }));

  const sourceRows = sources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    priority: s.priority,
  }));

  const invRows = inventories.map((i) => ({
    productId: i.productId,
    sourceId: i.sourceId,
    quantity: i.quantity,
    availableForCourier: i.availableForCourier,
    availableForPickup: i.availableForPickup,
    availableForPVZ: i.availableForPVZ,
  }));

  if (override && !requestedLines) {
    let payload: OverridePayload;
    try {
      payload = JSON.parse(override.payloadJson) as OverridePayload;
    } catch {
      return finalizeScenario({
        parts: [],
        remainder: [],
        informers: ["Override-сценарий содержит некорректный JSON. Исправьте запись в админке."],
        payOnDeliveryOnly: false,
        fromOverride: true,
        deliveryMethodCode: params.deliveryMethodCode,
      });
    }
    const raw = scenarioFromOverride(
      payload,
      productRows,
      ruleRow,
      params.deliveryMethodCode,
      disclaimerMap,
    );
    return finalizeScenario(enrichOverrideScenario(raw, sourceRows));
  }

  const ctx: EngineInput = {
    cartLines: lines,
    deliveryMethodCode: params.deliveryMethodCode,
    cityHasClickCollect: city.hasClickCollect,
    selectedStoreId: params.selectedStoreId,
    products: productRows,
    sources: sourceRows,
    inventories: invRows,
    rule: ruleRow,
    disclaimers: disclaimerMap,
  };

  return finalizeScenario(computeScenario(ctx));
}
