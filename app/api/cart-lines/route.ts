import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type LineIn = { productId: string; quantity: number };

export async function POST(req: Request) {
  const body = (await req.json()) as { cityId?: string | null; lines?: LineIn[] };
  const cityId = body.cityId ?? null;
  const linesIn = Array.isArray(body.lines) ? body.lines : [];

  const activeSources = await prisma.source.findMany({
    where: { isActive: true, ...(cityId ? { cityId } : {}) },
    select: { id: true },
  });
  const sourceIds = activeSources.map((s) => s.id);
  if (sourceIds.length === 0) {
    return NextResponse.json({ lines: [], units: 0, subtotal: 0 });
  }

  const inv = await prisma.inventory.findMany({
    where: {
      sourceId: { in: sourceIds },
      quantity: { gt: 0 },
    },
    select: { productId: true },
    distinct: ["productId"],
  });
  const availableIds = new Set(inv.map((i) => i.productId));

  const productIds = [...new Set(linesIn.map((l) => l.productId).filter(Boolean))];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        orderBy: { name: "asc" },
      })
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  const resolved: {
    productId: string;
    quantity: number;
    name: string;
    price: number;
    image: string;
    sizeLabel?: string | null;
  }[] = [];
  let subtotal = 0;
  let units = 0;

  for (const line of linesIn) {
    const q = Math.max(0, Math.floor(line.quantity));
    if (q === 0) continue;
    const p = productMap.get(line.productId);
    if (!p || !availableIds.has(p.id)) continue;
    resolved.push({
      productId: p.id,
      quantity: q,
      name: p.name,
      price: p.price,
      image: p.image,
    });
    subtotal += p.price * q;
    units += q;
  }

  return NextResponse.json({ lines: resolved, units, subtotal });
}

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
    const sl = p.sizeLabel?.trim();
    return {
      productId: p.id,
      quantity: 1,
      name: p.name,
      price: p.price,
      image: p.image,
      ...(sl ? { sizeLabel: sl } : {}),
    };
  });

  return NextResponse.json({ lines: resolved, units, subtotal });
}
