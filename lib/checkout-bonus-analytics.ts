/**
 * События блока бонусов на чекауте (ТЗ §12).
 * По умолчанию — CustomEvent на `window`; при наличии `window.gtag` дублируем вызов.
 */

export type BonusAvailabilityState = "none" | "partial" | "full";

export type BonusUnavailableReason =
  | "discounted_items_only"
  | "zero_balance"
  | "min_threshold_not_met"
  | "promo_applied"
  | "empty_cart"
  | null;

export type CheckoutBonusAnalyticsPayload = {
  bonusAvailabilityState: BonusAvailabilityState;
  unavailableReason: BonusUnavailableReason;
  maxBonusToApplyRub: number;
  appliedBonusRub?: number;
};

function pushToGtag(event: string, payload: Record<string, unknown>) {
  const g = typeof window !== "undefined" ? (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag : undefined;
  if (typeof g === "function") {
    try {
      g("event", event, payload);
    } catch {
      /* ignore */
    }
  }
}

export function trackCheckoutBonus(
  event:
    | "bonus_block_viewed"
    | "bonus_toggle_clicked"
    | "bonus_toggle_disabled_viewed"
    | "bonus_unavailable_reason_shown"
    | "bonus_applied"
    | "bonus_removed",
  payload: CheckoutBonusAnalyticsPayload & Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  const body = { event, ...payload };
  try {
    window.dispatchEvent(new CustomEvent("gj-checkout-analytics", { detail: body }));
  } catch {
    /* ignore */
  }
  pushToGtag(event, body);
}
