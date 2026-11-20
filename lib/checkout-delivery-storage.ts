const STORAGE_KEY = "gj_checkout_delivery_v1";

type CheckoutDeliverySelection = {
  cityId: string;
  method: "courier" | "pickup" | "pvz";
};

export function loadCheckoutDelivery(): CheckoutDeliverySelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const { cityId, method } = data as Partial<CheckoutDeliverySelection>;
    if (typeof cityId !== "string" || !cityId.trim()) return null;
    if (method !== "courier" && method !== "pickup" && method !== "pvz") return null;
    return { cityId: cityId.trim(), method };
  } catch {
    return null;
  }
}

export function saveCheckoutDelivery(selection: CheckoutDeliverySelection): void {
  if (typeof window === "undefined" || !selection.cityId.trim()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    /* ignore */
  }
}
