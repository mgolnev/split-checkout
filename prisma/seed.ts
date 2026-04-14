import { existsSync, readFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { applySeedSnapshot } from "./seed-apply-snapshot";
import { runBuiltinDemoSeed } from "./seed-builtin-demo";
import { mergeMissingDisclaimerTemplates } from "./seed-merge-disclaimers";

const prisma = new PrismaClient();

async function truncateSeedTables(): Promise<void> {
  /** Одним запросом: на Supabase pooler цепочка deleteMany() часто даёт P1017 (соединение рвётся). */
  await prisma.$executeRawUnsafe(`
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
}

async function main() {
  await truncateSeedTables();

  const snapshotPath = path.join(__dirname, "seed-snapshot.json");
  if (existsSync(snapshotPath)) {
    const raw = JSON.parse(readFileSync(snapshotPath, "utf8")) as unknown;
    await applySeedSnapshot(prisma, raw);
    console.log("Seed: восстановлено из prisma/seed-snapshot.json");
    console.log("Чтобы снова использовать встроенный демо-набор, удалите prisma/seed-snapshot.json");
  } else {
    await runBuiltinDemoSeed(prisma);
    console.log("Seed: встроенный демо-набор (нет prisma/seed-snapshot.json)");
    console.log("Снять снимок с текущей БД: npm run db:seed:export");
  }

  /** Снимок мог быть сделан до появления новых кодов в коде — добиваем только отсутствующие. */
  await mergeMissingDisclaimerTemplates(prisma);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
