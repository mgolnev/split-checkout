import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Проверка БД после деплоя: GET /api/health */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "up" });
  } catch (e) {
    console.error("[health] database check failed", e);
    return NextResponse.json(
      { ok: false, database: "down", error: "connection_failed" },
      { status: 503 },
    );
  }
}
