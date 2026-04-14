import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Снимок БД для сида (см. `scripts/export-seed-snapshot.ts`).
 * Поля совпадают с результатом `findMany` без вложенных relation.
 */
export type SeedSnapshotV1 = {
  version: 1;
  exportedAt?: string;
  deliveryMethods: Prisma.DeliveryMethodUncheckedCreateInput[];
  cities: Prisma.CityUncheckedCreateInput[];
  products: Prisma.ProductUncheckedCreateInput[];
  sources: Prisma.SourceUncheckedCreateInput[];
  inventories: Prisma.InventoryUncheckedCreateInput[];
  shippingRules: Prisma.ShippingRuleUncheckedCreateInput[];
  ruleSteps: Prisma.RuleStepUncheckedCreateInput[];
  pvzPoints: Prisma.PvzPointUncheckedCreateInput[];
  disclaimerTemplates: Prisma.DisclaimerTemplateUncheckedCreateInput[];
  scenarioOverrides: Prisma.ScenarioOverrideUncheckedCreateInput[];
};

const SNAPSHOT_ARRAY_KEYS = [
  "deliveryMethods",
  "cities",
  "products",
  "sources",
  "inventories",
  "shippingRules",
  "ruleSteps",
  "pvzPoints",
  "disclaimerTemplates",
  "scenarioOverrides",
] as const;

function isSnapshotV1(x: unknown): x is SeedSnapshotV1 {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.version !== 1) return false;
  return SNAPSHOT_ARRAY_KEYS.every((k) => Array.isArray(o[k]));
}

/**
 * Вставка данных после TRUNCATE. Порядок важен из‑за внешних ключей.
 */
export async function applySeedSnapshot(prisma: PrismaClient, raw: unknown): Promise<void> {
  if (!isSnapshotV1(raw)) {
    throw new Error("seed-snapshot.json: ожидался объект с version: 1 и массивами таблиц");
  }
  const d = raw;

  await prisma.$transaction(async (tx) => {
    if (d.deliveryMethods.length) {
      await tx.deliveryMethod.createMany({ data: d.deliveryMethods });
    }
    if (d.cities.length) {
      await tx.city.createMany({ data: d.cities });
    }
    if (d.products.length) {
      await tx.product.createMany({ data: d.products });
    }
    if (d.sources.length) {
      await tx.source.createMany({ data: d.sources });
    }
    if (d.inventories.length) {
      await tx.inventory.createMany({ data: d.inventories });
    }
    if (d.shippingRules.length) {
      await tx.shippingRule.createMany({ data: d.shippingRules });
    }
    if (d.ruleSteps.length) {
      await tx.ruleStep.createMany({ data: d.ruleSteps });
    }
    if (d.pvzPoints.length) {
      await tx.pvzPoint.createMany({ data: d.pvzPoints });
    }
    if (d.disclaimerTemplates.length) {
      await tx.disclaimerTemplate.createMany({ data: d.disclaimerTemplates });
    }
    if (d.scenarioOverrides.length) {
      await tx.scenarioOverride.createMany({ data: d.scenarioOverrides });
    }
  });
}
