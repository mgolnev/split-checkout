import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Only the public browser Maps key is exposed; hosting secrets stay server-side. */
export async function GET() {
  return NextResponse.json({
    yandexMapsApiKey: process.env.YANDEX_MAPS_API_KEY?.trim() || process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY?.trim() || "",
  }, { headers: { "Cache-Control": "no-store" } });
}
