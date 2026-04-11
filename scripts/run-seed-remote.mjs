#!/usr/bin/env node
/**
 * Запускает prisma db seed с DATABASE_URL из DATABASE_URL_PROD (прод / Supabase),
 * не трогая локальный .env.
 *
 *   DATABASE_URL_PROD="postgresql://..." npm run db:seed:remote
 */

import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL_PROD;
if (!url) {
  console.error("Задайте DATABASE_URL_PROD — строку подключения к продовой БД (pooler или direct).\n");
  process.exit(1);
}

const r = spawnSync("npx", ["prisma", "db", "seed"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
  shell: process.platform === "win32",
});

process.exit(r.status ?? 1);
