import { NextResponse } from "next/server";
import { computeCartMethodSummaries } from "@/lib/cart-method-summaries";

type LineIn = { productId?: string; quantity?: number };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { cityId?: string | null; lines?: LineIn[] };
    const cityId = body.cityId?.trim();
    const raw = Array.isArray(body.lines) ? body.lines : [];

    if (!cityId) {
      return NextResponse.json({ error: "city_required" }, { status: 400 });
    }

    const lines: { productId: string; quantity: number }[] = [];
    for (const row of raw) {
      const productId = typeof row.productId === "string" ? row.productId.trim() : "";
      const q = Math.max(0, Math.floor(Number(row.quantity)));
      if (!productId || q <= 0) continue;
      lines.push({ productId, quantity: q });
    }

    const result = await computeCartMethodSummaries(cityId, lines);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cart-summaries]", e);
    return NextResponse.json(
      {
        error: "cart_summaries_failed",
        message:
          process.env.NODE_ENV === "development"
            ? e instanceof Error
              ? e.message
              : String(e)
            : "Database error",
      },
      { status: 500 },
    );
  }
}
