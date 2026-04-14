import { NextResponse } from "next/server";
import { buildRemainderResolution } from "@/lib/remainder-resolution";
import type { CartLine } from "@/lib/types";

/**
 * Варианты доставки для заданных строк (без полного пересчёта основного сценария).
 * Нужен для UI «снято с отправления» — тот же контракт, что у remainder из /api/checkout/scenario.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    cityId?: string;
    deliveryMethodCode?: "courier" | "pickup" | "pvz";
    selectedStoreId?: string | null;
    lines?: CartLine[];
  };

  if (!body.cityId || !body.deliveryMethodCode || !body.lines?.length) {
    return NextResponse.json(
      { error: "Нужны cityId, deliveryMethodCode и непустой lines" },
      { status: 400 },
    );
  }

  try {
    const remainderResolution = await buildRemainderResolution(
      body.cityId,
      body.deliveryMethodCode,
      body.lines,
      body.selectedStoreId ?? null,
    );
    return NextResponse.json({
      remainderResolution: remainderResolution ?? { lines: body.lines, options: [] },
    });
  } catch (e) {
    console.error("[remainder-resolution]", e);
    const message = e instanceof Error ? e.message : "internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
