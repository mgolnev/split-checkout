import type { ScenarioPart } from "@/lib/types";

export type CheckoutPaymentMethod = "sbp" | "card" | "on_receipt";
export type ShipmentActionStatus = "active" | "awaiting_payment" | "payment_failed" | "paid_online" | "cancelled";

export const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ONLINE_DISCOUNT_RATE = 0.05;

export type ThankYouItem = {
  productId?: string;
  name: string;
  quantity: number;
  price?: number;
  listPrice?: number | null;
  image?: string;
  sizeLabel?: string | null;
  sku?: string;
};

export type ThankYouPart = {
  key: string;
  orderNumber?: string;
  paymentMethod?: CheckoutPaymentMethod;
  paymentDeadlineIso?: string;
  onlineDiscount?: number;
  paidAmount?: number;
  cancellationReason?: "payment_expired" | "customer";
  sourceName: string;
  methodLabel: string;
  leadTimeLabel: string;
  selectedDate?: string;
  selectedSlot?: string;
  mode?: ScenarioPart["mode"];
  holdNotice?: string;
  holdDays?: number;
  freeDeliveryThreshold: number;
  items: ThankYouItem[];
  subtotal: number;
  deliveryPrice: number;
  promoDiscount: number;
  bonusUsed: number;
  actionStatus?: ShipmentActionStatus;
};

export type ThankYouPayload = {
  orderedAtIso?: string;
  orderNumber?: string;
  recipientPhone?: string;
  recipientName?: string;
  parts: ThankYouPart[];
  orderPromoDiscount?: number;
  orderBonusUsed?: number;
  total: number;
  payOnDeliveryOnly: boolean;
  informers?: string[];
  method: string;
  courierAddress?: string | null;
  paymentMethod?: CheckoutPaymentMethod;
  /** One payment lifecycle covers every shipment in the order. Optional for older stored sessions. */
  orderPaymentStatus?: ShipmentActionStatus;
  orderPaymentDeadlineIso?: string;
  orderPaidAmount?: number;
};

export const THANKYOU_STORAGE_KEY = "thankyou";

export function deriveShipmentStatus(
  paymentMethod: CheckoutPaymentMethod | undefined,
  current?: ShipmentActionStatus,
): ShipmentActionStatus {
  if (current) return current;
  return paymentMethod && paymentMethod !== "on_receipt" ? "awaiting_payment" : "active";
}

/** Allocate whole rubles without losing the remainder to rounding. */
export function allocateDiscount(total: number, weights: number[]): number[] {
  const capacity = weights.map((w) => Math.max(0, Math.floor(w)));
  const sum = capacity.reduce((s, w) => s + w, 0);
  const amount = Math.min(sum, Math.max(0, Math.round(total)));
  if (!sum || !amount) return weights.map(() => 0);
  const shares = capacity.map((w) => amount * w / sum);
  const result = shares.map(Math.floor);
  const remainder = amount - result.reduce((s, w) => s + w, 0);
  const ranked = shares.map((share, index) => ({ index, fraction: share - result[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { index } of ranked.slice(0, remainder)) result[index] += 1;
  return result;
}

export function shipmentMerchTotal(part: ThankYouPart): number {
  return Math.max(0, part.subtotal - (part.promoDiscount ?? 0) - (part.bonusUsed ?? 0));
}

export function shipmentTotal(part: ThankYouPart): number {
  return shipmentMerchTotal(part) + part.deliveryPrice - (part.onlineDiscount ?? 0);
}

/** The offer applies to goods after existing discounts; delivery keeps its price. */
export function shipmentOnlineDiscount(part: ThankYouPart): number {
  return part.paymentMethod === "on_receipt" && part.actionStatus === "active"
    ? Math.round(shipmentMerchTotal(part) * ONLINE_DISCOUNT_RATE)
    : 0;
}

export function orderOnlineDiscount(parts: ThankYouPart[]): number {
  return Math.round(parts.reduce((sum, part) => sum + shipmentMerchTotal(part), 0) * ONLINE_DISCOUNT_RATE);
}

export function normalizeThankYouData(raw: ThankYouPayload, now = Date.now()): ThankYouPayload {
  const orderedAtIso = raw.orderedAtIso ?? new Date(now).toISOString();
  const orderNumber = raw.orderNumber ?? `GJ-${now.toString(36).toUpperCase()}`;
  // Migrate older sessions that stored discounts only at the whole-order level.
  const promos = raw.parts.some((p) => p.promoDiscount > 0)
    ? raw.parts.map((p) => p.promoDiscount ?? 0)
    : allocateDiscount(raw.orderPromoDiscount ?? 0, raw.parts.map((p) => p.subtotal));
  const bonuses = raw.parts.some((p) => p.bonusUsed > 0)
    ? raw.parts.map((p) => p.bonusUsed ?? 0)
    : allocateDiscount(raw.orderBonusUsed ?? 0, raw.parts.map((p, i) => p.subtotal - promos[i]));
  const legacyPaymentMethods = new Set(raw.parts.map((part) => part.paymentMethod).filter(Boolean));
  const legacyPaymentMethod = raw.paymentMethod ?? (legacyPaymentMethods.size === 1 ? raw.parts[0]?.paymentMethod : undefined);
  const hasLegacyStatus = raw.parts.some((part) => part.actionStatus !== undefined);
  const legacyStatus = hasLegacyStatus && raw.parts.every((part) => part.actionStatus === "cancelled")
    ? "cancelled"
    : hasLegacyStatus && raw.parts.every((part) => part.actionStatus === "paid_online")
      ? "paid_online"
      : raw.parts.some((part) => part.actionStatus === "payment_failed")
        ? "payment_failed"
      : raw.parts.some((part) => part.actionStatus === "awaiting_payment")
        ? "awaiting_payment"
          : raw.parts.some((part) => part.paymentMethod === "on_receipt") &&
              raw.parts.some((part) => part.paymentMethod !== "on_receipt")
            ? "awaiting_payment"
            : deriveShipmentStatus(legacyPaymentMethod);
  const orderPaymentStatus = raw.orderPaymentStatus ?? legacyStatus;
  const orderPaymentMethod = legacyPaymentMethod ??
    (legacyStatus === "active" ? "on_receipt" : "sbp");
  const orderPaymentDeadlineIso = raw.orderPaymentDeadlineIso ?? raw.parts
    .map((part) => part.paymentDeadlineIso)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ??
    ((orderPaymentStatus === "awaiting_payment" || orderPaymentStatus === "payment_failed")
      ? new Date(Date.parse(orderedAtIso) + PAYMENT_WINDOW_MS).toISOString()
      : undefined);
  return {
    ...raw,
    orderedAtIso,
    orderNumber,
    paymentMethod: orderPaymentMethod,
    orderPaymentStatus,
    orderPaymentDeadlineIso,
    parts: raw.parts.map((part, index) => {
      const paymentMethod = orderPaymentMethod;
      const status = orderPaymentStatus;
      const paymentDeadlineIso = orderPaymentDeadlineIso;
      const expired = (status === "awaiting_payment" || status === "payment_failed") && !!paymentDeadlineIso && now >= Date.parse(paymentDeadlineIso);
      return {
        ...part,
        orderNumber: part.orderNumber ?? (raw.parts.length > 1 ? `${orderNumber}-${index + 1}` : orderNumber),
        paymentMethod,
        paymentDeadlineIso,
        promoDiscount: promos[index],
        bonusUsed: bonuses[index],
        actionStatus: expired ? "cancelled" : status,
        cancellationReason: expired ? "payment_expired" : part.cancellationReason,
      };
    }),
    ...(orderPaymentDeadlineIso && (orderPaymentStatus === "awaiting_payment" || orderPaymentStatus === "payment_failed") && now >= Date.parse(orderPaymentDeadlineIso)
      ? { orderPaymentStatus: "cancelled" as const }
      : {}),
  };
}

/** One successful demo payment settles every shipment at once. */
export function completeOrderPayment(
  data: ThankYouPayload,
  method: Exclude<CheckoutPaymentMethod, "on_receipt">,
  now = Date.now(),
): ThankYouPayload {
  const normalized = normalizeThankYouData(data, now);
  if (normalized.orderPaymentStatus === "cancelled" || normalized.parts.every((part) => part.actionStatus === "cancelled")) {
    return normalized;
  }
  const discount = normalized.paymentMethod === "on_receipt" ? orderOnlineDiscount(normalized.parts) : 0;
  const shares = allocateDiscount(discount, normalized.parts.map(shipmentMerchTotal));
  const parts = normalized.parts.map((part, index) => ({
    ...part,
    paymentMethod: method,
    paymentDeadlineIso: undefined,
    actionStatus: "paid_online" as const,
    onlineDiscount: shares[index] ?? 0,
    paidAmount: shipmentTotal({ ...part, onlineDiscount: shares[index] ?? 0 }),
  }));
  return {
    ...normalized,
    paymentMethod: method,
    orderPaymentStatus: "paid_online",
    orderPaymentDeadlineIso: undefined,
    orderPaidAmount: parts.reduce((sum, part) => sum + (part.paidAmount ?? 0), 0),
    parts,
    total: parts.reduce((sum, part) => sum + shipmentTotal(part), 0),
  };
}

export function failOrderPayment(data: ThankYouPayload, now = Date.now()): ThankYouPayload {
  const normalized = normalizeThankYouData(data, now);
  if (normalized.orderPaymentStatus === "cancelled" || normalized.orderPaymentStatus === "paid_online") return normalized;
  return {
    ...normalized,
    orderPaymentStatus: "payment_failed",
    parts: normalized.parts.map((part) =>
      part.actionStatus === "cancelled" ? part : { ...part, actionStatus: "payment_failed" as const },
    ),
  };
}

export function cancelOrder(data: ThankYouPayload): ThankYouPayload {
  const normalized = normalizeThankYouData(data);
  if (normalized.orderPaymentStatus === "paid_online") return normalized;
  return {
    ...normalized,
    orderPaymentStatus: "cancelled",
    orderPaymentDeadlineIso: undefined,
    parts: normalized.parts.map((part) => ({
      ...part,
      paymentDeadlineIso: undefined,
      actionStatus: "cancelled",
      cancellationReason: "customer",
    })),
  };
}

/** `Оформлен 24 апреля 2026 в 13:13` */
export function formatOrderedAtLine(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const datePart = d
    .toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .replace(/\s*г\.?\s*$/i, "")
    .trim();
  const timePart = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `Оформлен ${datePart} в ${timePart}`;
}

export function thankYouDeliverySummary(parcelCount: number): string {
  if (parcelCount <= 1) return "Собираем заказ и скоро передадим его в доставку";
  if (parcelCount === 2) return "Доставим двумя посылками с разных складов";
  return `Доставим ${parcelCount} посылками с разных складов`;
}

export function thankYouShortPaymentLabel(method?: CheckoutPaymentMethod): string {
  if (method === "on_receipt") return "Оплата при получении";
  if (method === "sbp") return "Оплата через СБП";
  if (method === "card") return "Оплата картой онлайн";
  return "Оплата";
}

export function buildSupportMailHref(data: ThankYouPayload): string {
  const num = data.orderNumber ?? "";
  const subject = encodeURIComponent(`Заказ ${num}`);
  const body = encodeURIComponent(
    `Здравствуйте! Вопрос по заказу ${num}.\n\nТелефон в заказе: ${data.recipientPhone ?? ""}`,
  );
  return `mailto:support@example.com?subject=${subject}&body=${body}`;
}

export function readThankYouPayload(): ThankYouPayload | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(THANKYOU_STORAGE_KEY);
  if (!raw) return null;
  try {
    return normalizeThankYouData(JSON.parse(raw) as ThankYouPayload);
  } catch {
    return null;
  }
}

export function writeThankYouPayload(data: ThankYouPayload): void {
  sessionStorage.setItem(THANKYOU_STORAGE_KEY, JSON.stringify(data));
}
