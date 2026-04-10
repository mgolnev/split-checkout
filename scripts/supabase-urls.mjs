#!/usr/bin/env node
/**
 * Печатает строки Supabase для Prisma.
 *
 * Для Vercel: если direct `db.*.supabase.co` даёт P1001 (Can't reach database),
 * используйте **Session pooler** — у него есть IPv4 к пулу, сборка доходит до БД.
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

// Session mode (порт 5432 на pooler) — рекомендуется для Vercel + prisma migrate deploy
const vercelUrl = `postgresql://postgres.${projectRef}:${enc}@aws-0-${region}.pooler.supabase.com:5432/postgres?sslmode=require`;

// Прямое подключение — удобно локально; с Vercel иногда P1001 (IPv4)
const directUrl = `postgresql://postgres:${enc}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("1) VERCEL — вставьте в DATABASE_URL (если был P1001 на direct):");
console.log(vercelUrl);
console.log("");
console.log("2) ЛОКАЛЬНО — можно .env (Prisma Studio, seed):");
console.log(directUrl);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("Не используйте Transaction pooler :6543 для migrate без отдельной настройки.");
console.log("Альтернатива при проблемах с сетью: Supabase → Project Settings → Add IPv4 (платно).\n");
