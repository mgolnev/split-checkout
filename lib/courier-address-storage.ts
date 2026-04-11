export const COURIER_ADDRESS_STORAGE_KEY = "gj_courier_address_v1";

export function loadCourierAddress(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(COURIER_ADDRESS_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function saveCourierAddress(address: string): void {
  if (typeof window === "undefined") return;
  try {
    const t = address.trim();
    if (t) localStorage.setItem(COURIER_ADDRESS_STORAGE_KEY, t);
    else localStorage.removeItem(COURIER_ADDRESS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
