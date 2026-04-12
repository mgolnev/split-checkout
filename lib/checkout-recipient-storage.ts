export const CHECKOUT_RECIPIENT_STORAGE_KEY = "gj_checkout_recipient_v1";

export type CheckoutRecipientPayload = {
  phone: string;
  fullName: string;
};

export function loadCheckoutRecipient(): CheckoutRecipientPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHECKOUT_RECIPIENT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const phone = typeof (data as { phone?: unknown }).phone === "string" ? (data as { phone: string }).phone.trim() : "";
    const fullName =
      typeof (data as { fullName?: unknown }).fullName === "string"
        ? (data as { fullName: string }).fullName.trim()
        : "";
    if (!phone || !fullName) return null;
    return { phone, fullName };
  } catch {
    return null;
  }
}

export function saveCheckoutRecipient(payload: CheckoutRecipientPayload): void {
  if (typeof window === "undefined") return;
  try {
    const phone = payload.phone.trim();
    const fullName = payload.fullName.trim();
    if (!phone || !fullName) {
      localStorage.removeItem(CHECKOUT_RECIPIENT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(CHECKOUT_RECIPIENT_STORAGE_KEY, JSON.stringify({ phone, fullName }));
  } catch {
    /* ignore */
  }
}

export function clearCheckoutRecipient(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CHECKOUT_RECIPIENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
