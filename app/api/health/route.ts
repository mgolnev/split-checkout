import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function prismaDiag(e: unknown): { code?: string; hint?: string } {
  if (!e || typeof e !== "object") return {};
  const o = e as Record<string, unknown>;
  const code =
    typeof o.errorCode === "string"
      ? o.errorCode
      : typeof o.code === "string"
        ? o.code
        : undefined;
  const msg = typeof o.message === "string" ? o.message : "";
  let hint: string | undefined;
  if (code === "P1001" || /Can't reach database server|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
    hint =
      "Сервер БД недоступен с хостинга: файрвол, неверный хост/порт или БД не принимает внешние подключения.";
  } else if (code === "P1000" || /Authentication failed|password authentication failed/i.test(msg)) {
    hint = "Неверный логин/пароль в DATABASE_URL или пароль не закодирован в URL (% @ * и т.д.).";
  } else if (code === "P1017") {
    hint = "Сервер закрыл соединение (таймаут/лимит пула).";
  }
  return { code, hint };
}

/**
 * Проверка БД после деплоя: GET /api/health
 * При сбое в теле ответа есть prismaCode / hint — без полного текста ошибки в проде.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "up" });
  } catch (e) {
    const { code, hint } = prismaDiag(e);
    console.error("[health] database check failed", e);
    return NextResponse.json(
      {
        ok: false,
        database: "down",
        error: "connection_failed",
        ...(code ? { prismaCode: code } : {}),
        ...(hint ? { hint } : {}),
      },
      { status: 503 },
    );
  }
}
