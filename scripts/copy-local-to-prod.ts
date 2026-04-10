/**
 * Копирует данные из локальной PostgreSQL в продовую (Supabase и т.д.).
 * Схема на проде должна совпадать (миграции уже применены).
 *
 * Не трогает таблицу _prisma_migrations.
 *
 * Usage:
 *   LOCAL_DATABASE_URL="postgresql://..." DATABASE_URL_PROD="postgresql://..." npx tsx scripts/copy-local-to-prod.ts --yes
 *
 * Supabase: прямой host db.<ref>.supabase.co часто только IPv6 → с IPv4-сетей P1001 (как в дашборде).
 * Для копирования с ноутбука используйте **Session pooler** из UI (user postgres.<ref>, aws-0-…pooler…:5432)
 * или платный IPv4 add-on для direct. Строку лучше копировать из Supabase, не собирать вручную.
 *
 * Без флага --yes скрипт только покажет, что будет сделано.
 */

import { PrismaClient } from "@prisma/client";

const localUrl = process.env.LOCAL_DATABASE_URL;
const prodUrl = process.env.DATABASE_URL_PROD;

const confirmed = process.argv.includes("--yes");

async function main() {
  if (!localUrl || !prodUrl) {
    console.error(
      "Задайте переменные:\n" +
        "  LOCAL_DATABASE_URL — локальная БД\n" +
        "  DATABASE_URL_PROD  — прод (Supabase: Session pooler или IPv4 add-on + direct)\n",
    );
    process.exit(1);
  }

  if (localUrl === prodUrl) {
    console.error("LOCAL_DATABASE_URL и DATABASE_URL_PROD не должны совпадать.");
    process.exit(1);
  }

  if (!confirmed) {
    console.log(
      "Будет очищены данные приложения на ПРОДЕ и скопированы из локальной БД.\n" +
        "Запустите с флагом --yes для выполнения.\n",
    );
    process.exit(0);
  }

  const local = new PrismaClient({
    datasources: { db: { url: localUrl } },
  });
  const prod = new PrismaClient({
    datasources: { db: { url: prodUrl } },
  });

  try {
    await prod.$executeRawUnsafe(`
      TRUNCATE TABLE
        "RuleStep",
        "Inventory",
        "ShippingRule",
        "ScenarioOverride",
        "PvzPoint",
        "Source",
        "Product",
        "City",
        "DeliveryMethod",
        "DisclaimerTemplate"
      RESTART IDENTITY CASCADE;
    `);

    const [
      cities,
      deliveryMethods,
      products,
      disclaimers,
      sources,
      shippingRules,
      ruleSteps,
      inventories,
      pvzPoints,
      overrides,
    ] = await Promise.all([
      local.city.findMany(),
      local.deliveryMethod.findMany(),
      local.product.findMany(),
      local.disclaimerTemplate.findMany(),
      local.source.findMany(),
      local.shippingRule.findMany(),
      local.ruleStep.findMany(),
      local.inventory.findMany(),
      local.pvzPoint.findMany(),
      local.scenarioOverride.findMany(),
    ]);

    if (deliveryMethods.length) {
      await prod.deliveryMethod.createMany({ data: deliveryMethods });
      console.log(`  + DeliveryMethod: ${deliveryMethods.length}`);
    }
    if (cities.length) {
      await prod.city.createMany({ data: cities });
      console.log(`  + City: ${cities.length}`);
    }
    if (products.length) {
      await prod.product.createMany({ data: products });
      console.log(`  + Product: ${products.length}`);
    }
    if (disclaimers.length) {
      await prod.disclaimerTemplate.createMany({ data: disclaimers });
      console.log(`  + DisclaimerTemplate: ${disclaimers.length}`);
    }
    if (sources.length) {
      await prod.source.createMany({ data: sources });
      console.log(`  + Source: ${sources.length}`);
    }
    if (shippingRules.length) {
      await prod.shippingRule.createMany({ data: shippingRules });
      console.log(`  + ShippingRule: ${shippingRules.length}`);
    }
    if (ruleSteps.length) {
      await prod.ruleStep.createMany({ data: ruleSteps });
      console.log(`  + RuleStep: ${ruleSteps.length}`);
    }
    if (inventories.length) {
      await prod.inventory.createMany({ data: inventories });
      console.log(`  + Inventory: ${inventories.length}`);
    }
    if (pvzPoints.length) {
      await prod.pvzPoint.createMany({ data: pvzPoints });
      console.log(`  + PvzPoint: ${pvzPoints.length}`);
    }
    if (overrides.length) {
      await prod.scenarioOverride.createMany({ data: overrides });
      console.log(`  + ScenarioOverride: ${overrides.length}`);
    }

    console.log("Готово.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Can't reach") || msg.includes("P1001")) {
      console.error(`
Не удалось подключиться (P1001).

Supabase: прямой db.<ref>.supabase.co на бесплатном плане часто «Not IPv4 compatible» —
с IPv4-only сетей (часть домашних провайдеров, Vercel) direct не открывается.

Что сделать:
  • Вставьте в DATABASE_URL_PROD строку «Session pooler» из Project Settings → Database
    (user postgres.<project-ref>, host aws-0-…pooler.supabase.com, порт 5432).
  • Либо купите IPv4 add-on в Supabase — тогда сработает direct.
  • Либо другая сеть (например хот-спот), если режется исходящий 5432.

Проверьте, что проект не на паузе.
`);
    }
    throw e;
  } finally {
    await local.$disconnect();
    await prod.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
