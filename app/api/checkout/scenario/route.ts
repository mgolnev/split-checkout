import { NextResponse } from "next/server";
import { buildScenario } from "@/lib/build-scenario";
import { buildRemainderResolution } from "@/lib/remainder-resolution";
import type { CartLine } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    cityId?: string;
    deliveryMethodCode?: "courier" | "pickup" | "pvz";
    selectedStoreId?: string | null;
    lines?: CartLine[];
  };

  if (!body.cityId || !body.deliveryMethodCode) {
    return NextResponse.json({ error: "cityId, deliveryMethodCode обязательны" }, { status: 400 });
  }

  try {
    const scenario = await buildScenario({
      cityId: body.cityId,
      deliveryMethodCode: body.deliveryMethodCode,
      selectedStoreId: body.selectedStoreId ?? null,
      lines: body.lines?.length ? body.lines : undefined,
    });
    const remainderResolution =
      scenario.remainder.length > 0
        ? await buildRemainderResolution(
            body.cityId,
            body.deliveryMethodCode,
            scenario.remainder,
            body.selectedStoreId ?? null,
          )
        : null;
    return NextResponse.json({ scenario, remainderResolution });
  } catch (e) {
    console.error("buildScenario failed:", e);
    const message = e instanceof Error ? e.message : "internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
