import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type LineIn = { productId: string; quantity: number };

/** Сумма штук по городу (все активные источники), верхняя граница для корзины. */
async function sumStockByProductForSources(sourceIds: string[], productIds: string[]) {
  if (sourceIds.length === 0 || productIds.length === 0) {
    return new Map<string, number>();
  }
  const rows = await prisma.inventory.groupBy({
    by: ["productId"],
    where: {
      sourceId: { in: sourceIds },
      productId: { in: productIds },
      quantity: { gt: 0 },
    },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.productId, Math.max(0, r._sum.quantity ?? 0)]));
}

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

  const productIds = [...new Set(linesIn.map((l) => l.productId).filter(Boolean))];
  const stockByProduct = await sumStockByProductForSources(sourceIds, productIds);

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
    maxQuantity: number;
    name: string;
    price: number;
    listPrice?: number | null;
    image: string;
    sizeLabel?: string | null;
  }[] = [];
  let subtotal = 0;
  let units = 0;

  for (const line of linesIn) {
    const qReq = Math.max(0, Math.floor(line.quantity));
    if (qReq === 0) continue;
    const p = productMap.get(line.productId);
    if (!p) continue;
    const maxQ = stockByProduct.get(p.id) ?? 0;
    if (maxQ <= 0) continue;
    const q = Math.min(qReq, maxQ);
    const lp = p.listPrice != null && p.listPrice > 0 ? p.listPrice : null;
    resolved.push({
      productId: p.id,
      quantity: q,
      maxQuantity: maxQ,
      name: p.name,
      price: p.price,
      ...(lp != null ? { listPrice: lp } : {}),
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
  const sourceIds = activeSources.map((s) => s.id);
  if (sourceIds.length === 0) {
    return NextResponse.json({ lines: [], units: 0, subtotal: 0 });
  }

  const stockRows = await prisma.inventory.groupBy({
    by: ["productId"],
    where: {
      sourceId: { in: sourceIds },
      quantity: { gt: 0 },
    },
    _sum: { quantity: true },
  });
  const stockByProduct = new Map(stockRows.map((r) => [r.productId, Math.max(0, r._sum.quantity ?? 0)]));
  const ids = [...stockByProduct.keys()].filter((id) => (stockByProduct.get(id) ?? 0) > 0);

  const products = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids }, isActive: true },
        orderBy: { name: "asc" },
      })
    : [];

  let subtotal = 0;
  let units = 0;
  const resolved = products.map((p) => {
    const maxQ = stockByProduct.get(p.id) ?? 0;
    const q = Math.min(1, maxQ);
    subtotal += p.price * q;
    units += q;
    const sl = p.sizeLabel?.trim();
    const lp = p.listPrice != null && p.listPrice > 0 ? p.listPrice : null;
    return {
      productId: p.id,
      quantity: q,
      maxQuantity: maxQ,
      name: p.name,
      price: p.price,
      ...(lp != null ? { listPrice: lp } : {}),
      image: p.image,
      ...(sl ? { sizeLabel: sl } : {}),
    };
  });

  return NextResponse.json({ lines: resolved, units, subtotal });
}
