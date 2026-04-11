import type { CartLine } from "@/lib/types";

export const CHECKOUT_CART_STORAGE_KEY = "gj_checkout_cart_v1";

export type StoredCartLine = CartLine & { size?: string; selected?: boolean };

export type CheckoutCartSnapshot = {
  cityId: string;
  lines: StoredCartLine[];
};

export function loadCheckoutCart(): CheckoutCartSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHECKOUT_CART_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CheckoutCartSnapshot;
    if (!data.cityId || !Array.isArray(data.lines)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveCheckoutCart(snapshot: CheckoutCartSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHECKOUT_CART_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}
