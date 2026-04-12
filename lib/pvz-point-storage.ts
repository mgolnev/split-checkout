const STORAGE_KEY = "gj_last_pvz_point_v1";

type ByCity = Record<string, string>;

function readMap(): ByCity {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return data as ByCity;
  } catch {
    return {};
  }
}

export function loadLastPvzPointId(cityId: string): string | null {
  if (!cityId) return null;
  const id = readMap()[cityId]?.trim();
  return id || null;
}

export function saveLastPvzPoint(cityId: string, pointId: string): void {
  if (typeof window === "undefined" || !cityId || !pointId.trim()) return;
  try {
    const map = readMap();
    map[cityId] = pointId.trim();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
