import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

/** В production на Vercel тоже кэшируем на globalThis — иначе возможны лишние клиенты при hot paths. */
globalForPrisma.prisma = prisma;
