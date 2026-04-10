#!/usr/bin/env node
/**
 * Собирает строки для Vercel из данных Supabase (Prisma: pooler + direct).
 *
 * В дашборде: Project Settings → Database → найдите:
 *   - Reference ID (под названием проекта) = project-ref
 *   - Region pooler host = aws-0-<REGION>.pooler.supabase.com → REGION обычно eu-west-1 и т.д.
 *   - Пароль БД (не service_role JWT!)
 *
 * Usage:
 *   node scripts/supabase-urls.mjs <project-ref> "<plain-password>" [region]
 *
 * Пример:
 *   node scripts/supabase-urls.mjs vbqggwrbfvekjogeheki 'YyU8jK-J7b#n*xU' eu-west-1
 */

const projectRef = process.argv[2];
const password = process.argv[3];
const region = process.argv[4] || "eu-west-1";

if (!projectRef || password === undefined) {
  console.error(
    "Usage: node scripts/supabase-urls.mjs <project-ref> \"<db-password>\" [aws-region]\n" +
      "Example: node scripts/supabase-urls.mjs vbqggwrbfvekjogeheki 'your-password' eu-west-1",
  );
  process.exit(1);
}

const enc = encodeURIComponent(password);

// Как в документации Supabase + Prisma (разные префиксы пользователя!)
const databaseUrl = `postgresql://postgres.${projectRef}:${enc}@aws-0-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require`;
const directUrl = `postgresql://postgres:${enc}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;

console.log("Скопируйте в Vercel → Settings → Environment Variables (Production + Preview при необходимости):\n");
console.log("DATABASE_URL");
console.log(databaseUrl);
console.log("\nDIRECT_URL");
console.log(directUrl);
console.log("\nПароль в URL уже закодирован (# * и др.). Не оборачивайте строки в кавычки в UI Vercel — вставляйте как есть.\n");
