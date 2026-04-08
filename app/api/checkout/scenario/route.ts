import { NextResponse } from "next/server";
import { buildScenario } from "@/lib/build-scenario";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    cityId?: string;
    deliveryMethodCode?: "courier" | "pickup" | "pvz";
    selectedStoreId?: string | null;
  };

  if (!body.cityId || !body.deliveryMethodCode) {
    return NextResponse.json({ error: "cityId, deliveryMethodCode обязательны" }, { status: 400 });
  }

  try {
    const scenario = await buildScenario({
      cityId: body.cityId,
      deliveryMethodCode: body.deliveryMethodCode,
      selectedStoreId: body.selectedStoreId ?? null,
    });
    return NextResponse.json({ scenario });
  } catch (e) {
    console.error("buildScenario failed:", e);
    const message = e instanceof Error ? e.message : "internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
