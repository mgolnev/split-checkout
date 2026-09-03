import { NextResponse } from "next/server";
import {
  databaseUrlSafeInfo,
  errorNamesFromChain,
  prismaDiag,
  prismaMetaSafe,
} from "@/lib/prisma-error-diag";
import { prisma } from "@/lib/prisma";

/** Меняйте при изменении полей диагностики — по значению видно, что задеплоено. */
const HEALTH_DIAG_VERSION = 3;

/**
 * Проверка БД после деплоя: GET /api/health
 * При сбое в теле ответа есть prismaCode / hint — без полного текста ошибки в проде.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      database: "up",
      diagVersion: HEALTH_DIAG_VERSION,
    });
  } catch (e) {
    const { code, hint: hintFromDiag } = prismaDiag(e);
    const hint =
      hintFromDiag ??
      "Полный текст — в логах приложения по строке «[health] database check failed». Сверьте DATABASE_URL и доступ приложения к PostgreSQL.";
    const metaSafe = prismaMetaSafe(e);
    console.error("[health] database check failed", e);
    return NextResponse.json(
      {
        ok: false,
        database: "down",
        error: "connection_failed",
        diagVersion: HEALTH_DIAG_VERSION,
        ...databaseUrlSafeInfo(),
        errorNames: errorNamesFromChain(e),
        ...metaSafe,
        ...(code ? { prismaCode: code } : {}),
        hint,
      },
      { status: 503 },
    );
  }
}
