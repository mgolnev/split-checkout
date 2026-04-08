import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [cities, methods, products, rules] = await Promise.all([
    prisma.city.findMany({ orderBy: { name: "asc" } }),
    prisma.deliveryMethod.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.shippingRule.findMany({
      include: { deliveryMethod: true },
    }),
  ]);

  const storesByCity: Record<string, { id: string; name: string }[]> = {};
  const pvzByCity: Record<string, { id: string; name: string; address: string; requiresPrepayment: boolean }[]> =
    {};
  const allowedMethodsByCity: Record<string, string[]> = {};

  for (const c of cities) {
    const stores = await prisma.source.findMany({
      where: { cityId: c.id, type: "store", isActive: true },
      orderBy: { priority: "asc" },
      select: { id: true, name: true },
    });
    storesByCity[c.id] = stores;

    const pvzAll = await prisma.pvzPoint.findMany({
      where: { cityId: c.id, isActive: true },
      orderBy: { name: "asc" },
    });
    pvzByCity[c.id] = pvzAll.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      requiresPrepayment: p.requiresPrepayment,
    }));

    allowedMethodsByCity[c.id] = rules
      .filter((r) => r.cityId === c.id && r.allowed)
      .map((r) => r.deliveryMethod.code);
  }

  return NextResponse.json({
    cities,
    deliveryMethods: methods,
    products,
    storesByCity,
    pvzByCity,
    allowedMethodsByCity,
  });
}
