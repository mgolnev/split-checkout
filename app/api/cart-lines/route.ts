import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cityId = searchParams.get("cityId");
  const activeSources = await prisma.source.findMany({
    where: { isActive: true, ...(cityId ? { cityId } : {}) },
    select: { id: true },
  });
  const inv = await prisma.inventory.findMany({
    where: {
      sourceId: { in: activeSources.map((s) => s.id) },
      quantity: { gt: 0 },
    },
    select: { productId: true },
    distinct: ["productId"],
  });
  const ids = inv.map((i) => i.productId);
  const products = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids }, isActive: true },
        orderBy: { name: "asc" },
      })
    : [];

  let subtotal = 0;
  let units = 0;
  const resolved = products.map((p) => {
    subtotal += p.price;
    units += 1;
    return {
      productId: p.id,
      quantity: 1,
      name: p.name,
      price: p.price,
      image: p.image,
    };
  });

  return NextResponse.json({ lines: resolved, units, subtotal });
}
