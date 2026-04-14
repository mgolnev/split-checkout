import type { PrismaClient } from "@prisma/client";
import { defaultDisclaimerRows } from "../lib/disclaimers";

/**
 * Добавляет в БД строки из актуального `lib/disclaimers.ts`, которых ещё нет по `code`.
 * Уже существующие записи (в т.ч. из seed-snapshot.json) не перезаписываются —
 * так новые ключи (например common.unresolvedBlock*) появляются после пересида.
 */
export async function mergeMissingDisclaimerTemplates(prisma: PrismaClient): Promise<void> {
  const data = defaultDisclaimerRows().map((row) => ({
    code: row.code,
    title: row.title,
    text: row.text,
    isActive: true,
  }));
  const { count } = await prisma.disclaimerTemplate.createMany({
    data,
    skipDuplicates: true,
  });
  if (count > 0) {
    console.log(`Seed: добавлено дисклеймеров из дефолтов кода (новые коды): ${count}`);
  }
}
