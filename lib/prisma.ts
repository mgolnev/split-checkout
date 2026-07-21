import "server-only";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPool: Pool | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool =
    globalForPrisma.prismaPool ??
    new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 30_000,
    });
  globalForPrisma.prismaPool = pool;

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

/** В production на Vercel/ONREZA тоже кэшируем на globalThis — иначе возможны лишние клиенты при hot paths. */
globalForPrisma.prisma = prisma;
