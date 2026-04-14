/**
 * Снимает дамп таблиц чекаута в `prisma/seed-snapshot.json` для использования в `prisma db seed`.
 *
 * Запуск из корня репозитория (нужен `.env` с `DATABASE_URL` на локальную БД):
 *   npm run db:seed:export
 *
 * Затем `npm run db:seed` очистит те же таблицы и восстановит их из снимка.
 */
import "dotenv/config";
import { existsSync, writeFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import type { SeedSnapshotV1 } from "../prisma/seed-apply-snapshot";

const prisma = new PrismaClient();

async function main() {
  const snapshot: SeedSnapshotV1 = {
    version: 1,
    exportedAt: new Date().toISOString(),
    deliveryMethods: await prisma.deliveryMethod.findMany(),
    cities: await prisma.city.findMany(),
    products: await prisma.product.findMany(),
    sources: await prisma.source.findMany(),
    inventories: await prisma.inventory.findMany(),
    shippingRules: await prisma.shippingRule.findMany(),
    ruleSteps: await prisma.ruleStep.findMany({
      orderBy: [{ shippingRuleId: "asc" }, { sortOrder: "asc" }],
    }),
    pvzPoints: await prisma.pvzPoint.findMany(),
    disclaimerTemplates: await prisma.disclaimerTemplate.findMany(),
    scenarioOverrides: await prisma.scenarioOverride.findMany(),
  };

  const outPath = path.join(process.cwd(), "prisma", "seed-snapshot.json");
  if (existsSync(outPath)) {
    console.warn("Перезаписываю существующий файл:", outPath);
  }
  writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log("OK →", outPath);
  console.log(
    "Счётчики:",
    `города ${snapshot.cities.length}, товары ${snapshot.products.length}, ` +
      `источники ${snapshot.sources.length}, остатки ${snapshot.inventories.length}, ` +
      `правила ${snapshot.shippingRules.length}, шаги ${snapshot.ruleSteps.length}, ` +
      `ПВЗ ${snapshot.pvzPoints.length}, дисклеймеры ${snapshot.disclaimerTemplates.length}, overrides ${snapshot.scenarioOverrides.length}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
