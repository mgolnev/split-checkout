#!/usr/bin/env node
/**
 * Печатает строки Supabase для Prisma.
 *
 * Для Vercel в .env достаточно одной DATABASE_URL; migrate на прод — отдельно (README).
 *
 * Usage:
 *   node scripts/supabase-urls.mjs <project-ref> "<plain-password>" [aws-region]
 *
 * Region — из дашборда (pooler host aws-0-REGION.pooler.supabase.com), по умолчанию eu-west-1.
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

const poolerHost = `aws-0-${region}.pooler.supabase.com`;
const userSession = `postgres.${projectRef}`;

// Session mode :5432 — лимит одновременных клиентов = pool_size; при пиках на Vercel возможен MaxClientsInSessionMode.
const sessionPoolerUrl = `postgresql://${userSession}:${enc}@${poolerHost}:5432/postgres?sslmode=require`;

// Transaction mode :6543 — для Prisma на serverless; много параллельных функций не выбивают Session pool.
// connection_limit=1 — один коннект на инстанс serverless через PgBouncer.
const transactionPoolerUrl = `postgresql://${userSession}:${enc}@${poolerHost}:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require`;

// Прямое подключение — удобно локально; с Vercel иногда P1001 (IPv4)
const directDbUrl = `postgresql://postgres:${enc}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("1) VERCEL runtime — DATABASE_URL (Transaction pooler, меньше ошибок MaxClients):");
console.log(transactionPoolerUrl);
console.log("");
console.log("2) Альтернатива DATABASE_URL — Session pooler :5432 (проще, но при нагрузке возможен MaxClients):");
console.log(sessionPoolerUrl);
console.log("");
console.log("3) Локально / Prisma Studio — часто direct host:");
console.log(directDbUrl);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("В Vercel вставьте в DATABASE_URL строку из пункта 1 (или 2). Миграции: npm run db:migrate:deploy или GitHub Action.");
console.log("При P1001 на direct: Supabase → IPv4 add-on или pooler.\n");
