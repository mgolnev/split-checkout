import { NextResponse } from "next/server";
import {
  databaseUrlSafeInfo,
  errorNamesFromChain,
  prismaDiag,
  prismaMetaSafe,
} from "@/lib/prisma-error-diag";
import { prisma } from "@/lib/prisma";

/** Меняйте при изменении полей диагностики — по значению видно, что задеплоено. */
const HEALTH_DIAG_VERSION = 4;

const DB_CHECK_RETRIES = 3;
const DB_CHECK_RETRY_DELAY_MS = 2_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingDatabase() {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DB_CHECK_RETRIES; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true as const, attempts: attempt };
    } catch (e) {
      lastError = e;
      if (attempt < DB_CHECK_RETRIES) {
        await sleep(DB_CHECK_RETRY_DELAY_MS);
      }
    }
  }
  return { ok: false as const, error: lastError, attempts: DB_CHECK_RETRIES };
}

/**
 * Liveness для ONREZA readiness: всегда HTTP 200, если процесс жив.
 * Статус БД — в теле (`database: up|down`); повторы учитывают autosleep Kaiki (~2–3 с).
 */
export async function GET() {
  const db = await pingDatabase();

  if (db.ok) {
    return NextResponse.json({
      ok: true,
      database: "up",
      diagVersion: HEALTH_DIAG_VERSION,
      dbAttempts: db.attempts,
    });
  }

  const e = db.error;
  const { code, hint: hintFromDiag } = prismaDiag(e);
  const hint =
    hintFromDiag ??
    "Полный текст — в логах ONREZA по строке «[health] database check failed». Сверьте DATABASE_URL с панелью Kaiki и доступ compute→БД.";
  const metaSafe = prismaMetaSafe(e);
  console.error("[health] database check failed", e);

  return NextResponse.json(
    {
      ok: false,
      database: "down",
      error: "connection_failed",
      diagVersion: HEALTH_DIAG_VERSION,
      dbAttempts: db.attempts,
      ...databaseUrlSafeInfo(),
      errorNames: errorNamesFromChain(e),
      ...metaSafe,
      ...(code ? { prismaCode: code } : {}),
      hint,
    },
    { status: 200 },
  );
}
