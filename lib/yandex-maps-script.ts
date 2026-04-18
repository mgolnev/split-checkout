const SCRIPT_ID = "yandex-maps-api-v3";

/** Загружает JS API 3 и ждёт `ymaps3.ready` (повторные вызовы безопасны). */
export async function loadYandexMapsScript(): Promise<void> {
  if (typeof window === "undefined") return;

  const key = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY?.trim();
  if (!key) throw new Error("NEXT_PUBLIC_YANDEX_MAPS_API_KEY is not set");

  const w = window as unknown as { ymaps3?: { ready: Promise<void> } };
  if (w.ymaps3) {
    await w.ymaps3.ready;
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Yandex Maps script load error")));
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.async = true;
    s.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Yandex Maps script load error"));
    document.head.appendChild(s);
  });

  await (window as unknown as { ymaps3: { ready: Promise<void> } }).ymaps3.ready;
}
