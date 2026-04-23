/**
 * Разбор цепочки ошибок Prisma/Node для безопасных JSON-ответов API (health, bootstrap).
 */

export function readPrismaCode(o: object): string | undefined {
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
export function errorChain(e: unknown): unknown[] {
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

export function prismaDiag(e: unknown): { code?: string; hint?: string } {
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
  } else if (code === "P2022" || /does not exist.*column|column.*does not exist/i.test(msg)) {
    hint =
      "В БД нет колонки по схеме Prisma (часто после обновления кода) — выполните `npx prisma migrate deploy` к этой БД.";
  } else if (code === "P2021" || /does not exist in the current database/i.test(msg)) {
    hint = "В БД нет таблицы по схеме Prisma — выполните migrate deploy к этой БД.";
  } else if (!code && msg.length > 0 && msg.length < 200) {
    hint = "См. логи сервера; тип ошибки не распознан в ответе.";
  }
  return { code, hint };
}

/** Без пароля и query: только факт наличия env и разбор хоста для отладки ONREZA. */
export function databaseUrlSafeInfo(): {
  databaseUrlSet: boolean;
  databaseUrlParseOk: boolean;
  databaseUrlHost: string | null;
  databaseUrlPort: string | null;
} {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    return {
      databaseUrlSet: false,
      databaseUrlParseOk: false,
      databaseUrlHost: null,
      databaseUrlPort: null,
    };
  }
  try {
    const u = new URL(raw);
    return {
      databaseUrlSet: true,
      databaseUrlParseOk: true,
      databaseUrlHost: u.hostname || null,
      databaseUrlPort: u.port || null,
    };
  } catch {
    return {
      databaseUrlSet: true,
      databaseUrlParseOk: false,
      databaseUrlHost: null,
      databaseUrlPort: null,
    };
  }
}

export function errorNamesFromChain(e: unknown): string[] {
  const names: string[] = [];
  for (const item of errorChain(e)) {
    if (item instanceof Error && item.name && !names.includes(item.name)) names.push(item.name);
    if (names.length >= 8) break;
  }
  return names;
}

/** Безопасные поля Prisma meta (без сырого объекта). */
export function prismaMetaSafe(e: unknown): {
  prismaMetaTable?: string;
  prismaMetaColumn?: string;
} {
  for (const item of errorChain(e)) {
    if (typeof item !== "object" || item === null || !("meta" in item)) continue;
    const meta = (item as { meta: unknown }).meta;
    if (!meta || typeof meta !== "object") continue;
    const m = meta as Record<string, unknown>;
    const t = m.table;
    const col = m.column;
    const out: { prismaMetaTable?: string; prismaMetaColumn?: string } = {};
    if (typeof t === "string" && t.length > 0 && t.length < 200) out.prismaMetaTable = t;
    if (typeof col === "string" && col.length > 0 && col.length < 200) out.prismaMetaColumn = col;
    if (Object.keys(out).length > 0) return out;
  }
  return {};
}
