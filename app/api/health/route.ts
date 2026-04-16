import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function readPrismaCode(o: object): string | undefined {
  const r = o as Record<string, unknown>;
  if (typeof r.errorCode === "string") return r.errorCode;
  if (typeof r.code === "string") return r.code;
  const d = Object.getOwnPropertyDescriptor(o, "code");
  if (d && typeof d.value === "string") return d.value;
  return undefined;
}

/**
 * Prisma/Node кладут P1000/P1001 во вложенный `cause` или в `AggregateError.errors` —
 * без обхода code не попадает в JSON.
 */
function errorChain(e: unknown): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<unknown>();

  function visit(node: unknown, depth: number) {
    if (node == null || depth > 12) return;
    if (typeof node === "object" && seen.has(node)) return;
    if (typeof node === "object") seen.add(node);
    out.push(node);

    if (typeof node !== "object" || node === null) return;

    if ("cause" in node) {
      const c = (node as { cause: unknown }).cause;
      if (c != null) visit(c, depth + 1);
    }

    if (node instanceof AggregateError && Array.isArray(node.errors)) {
      for (const sub of node.errors) visit(sub, depth + 1);
    }
  }

  visit(e, 0);
  return out;
}

function prismaDiag(e: unknown): { code?: string; hint?: string } {
  const parts: string[] = [];
  let code: string | undefined;
  for (const item of errorChain(e)) {
    if (item instanceof Error && item.message) parts.push(item.message);
    if (typeof item === "object" && item !== null) {
      if (!code) code = readPrismaCode(item);
      const o = item as Record<string, unknown>;
      if (typeof o.message === "string" && !parts.includes(o.message)) parts.push(o.message);
    } else if (typeof item === "string") parts.push(item);
  }
  const msg = parts.join(" ") || (e instanceof Error ? e.message : String(e));
  let hint: string | undefined;
  if (code === "P1001" || /Can't reach database server|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
    hint =
      "Сервер БД недоступен с хостинга: файрвол, неверный хост/порт или БД не принимает внешние подключения.";
  } else if (code === "P1000" || /Authentication failed|password authentication failed/i.test(msg)) {
    hint = "Неверный логин/пароль в DATABASE_URL или пароль не закодирован в URL (% @ * и т.д.).";
  } else if (code === "P1017") {
    hint = "Сервер закрыл соединение (таймаут/лимит пула).";
  } else if (code === "P2021" || /does not exist in the current database/i.test(msg)) {
    hint = "В БД нет таблицы/колонки по схеме Prisma — выполните migrate deploy к этой БД.";
  } else if (!code && msg.length > 0 && msg.length < 200) {
    hint = "См. логи сервера [health]; тип ошибки не распознан в ответе.";
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
