#!/usr/bin/env node
/**
 * Печатает DATABASE_URL для Supabase (прямое подключение, подходит для Vercel + prisma migrate).
 *
 * В дашборде: Project Settings → Database → пароль БД (не JWT service_role).
 * Reference ID проекта = project-ref (в URL проекта или под названием).
 *
 * Usage:
 *   node scripts/supabase-urls.mjs <project-ref> "<plain-password>"
 *
 * Пример:
 *   node scripts/supabase-urls.mjs vbqggwrbfvekjogeheki 'your-password'
 */

const projectRef = process.argv[2];
const password = process.argv[3];

if (!projectRef || password === undefined) {
  console.error(
    "Usage: node scripts/supabase-urls.mjs <project-ref> \"<db-password>\"\n" +
      "Example: node scripts/supabase-urls.mjs vbqggwrbfvekjogeheki 'your-password'",
  );
  process.exit(1);
}

const enc = encodeURIComponent(password);

const databaseUrl = `postgresql://postgres:${enc}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;

console.log("В Vercel → Environment Variables задайте одну переменную:\n");
console.log("DATABASE_URL");
console.log(databaseUrl);
console.log("\nПароль в URL уже закодирован. Pooler :6543 для migrate не используйте.\n");
