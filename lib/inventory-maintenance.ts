import { prisma } from "@/lib/prisma";

/** Строки остатков без существующего товара или источника (если в БД не сработал CASCADE). */
export async function pruneInventoryOrphans() {
  const [pIds, sIds] = await Promise.all([
    prisma.product.findMany({ select: { id: true } }).then((rows) => rows.map((r) => r.id)),
    prisma.source.findMany({ select: { id: true } }).then((rows) => rows.map((r) => r.id)),
  ]);

  if (pIds.length === 0 || sIds.length === 0) {
    await prisma.inventory.deleteMany();
    return;
  }

  await prisma.inventory.deleteMany({
    where: {
      OR: [{ productId: { notIn: pIds } }, { sourceId: { notIn: sIds } }],
    },
  });
}
