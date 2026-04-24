import type { ScenarioPart } from "@/lib/types";

export type CheckoutPaymentMethod = "sbp" | "card" | "on_receipt";
export type ShipmentActionStatus = "active" | "paid_online" | "cancelled";

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
};

export const THANKYOU_STORAGE_KEY = "thankyou";

export function deriveShipmentStatus(
  paymentMethod: CheckoutPaymentMethod | undefined,
  current?: ShipmentActionStatus,
): ShipmentActionStatus {
  if (current) return current;
  return paymentMethod && paymentMethod !== "on_receipt" ? "paid_online" : "active";
}

export function normalizeThankYouData(raw: ThankYouPayload): ThankYouPayload {
  return {
    ...raw,
    orderedAtIso: raw.orderedAtIso ?? new Date().toISOString(),
    orderNumber: raw.orderNumber ?? `GJ-${Date.now().toString(36).toUpperCase()}`,
    parts: raw.parts.map((part) => ({
      ...part,
      actionStatus: deriveShipmentStatus(raw.paymentMethod, part.actionStatus),
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
