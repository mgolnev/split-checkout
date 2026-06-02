"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatHoldNoticeForPart } from "@/lib/hold-display";
import { thankYouPartCardPreview } from "@/lib/thank-you-part-preview";
import {
  type CheckoutPaymentMethod,
  type ShipmentActionStatus,
  type ThankYouItem,
  type ThankYouPart,
  type ThankYouPayload,
  deriveShipmentStatus,
  readThankYouPayload,
  writeThankYouPayload,
} from "@/lib/thank-you-session";

const PRODUCT_PLACEHOLDER = "/product-placeholder.svg";
const THUMB_PREVIEW = 5;

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);

function pluralizeDays(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

function CheckoutShell({ children }: { children: ReactNode }) {
  return (
    <div className="checkout-ui relative isolate mx-auto min-h-screen max-w-md bg-neutral-100 pb-10">{children}</div>
  );
}

function SafeProductImage({
  src,
  alt,
  className,
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = !src?.trim() || failed ? PRODUCT_PLACEHOLDER : src;
  return <Image src={url} alt={alt} fill sizes="48px" className={className} onError={() => setFailed(true)} />;
}

function paymentLabel(paymentMethod: CheckoutPaymentMethod | undefined, status: ShipmentActionStatus): string {
  if (status === "cancelled") return "Заказ отменён";
  if (status === "paid_online") return "Оплачено онлайн";
  if (paymentMethod === "on_receipt") return "Оплата при получении";
  if (paymentMethod === "sbp") return "Оплата через СБП";
  if (paymentMethod === "card") return "Оплата картой онлайн";
  return "Оплата";
}

function partHoldLine(part: ThankYouPart): string | null {
  return (
    part.holdNotice ??
    (part.mode != null && part.holdDays
      ? formatHoldNoticeForPart(part.mode, part.holdDays, new Date())
      : part.holdDays
        ? `Срок хранения: ${part.holdDays} ${pluralizeDays(part.holdDays)}`
        : null)
  );
}

function ShipmentThumbStrip({ items }: { items: ThankYouItem[] }) {
  const visible = items.slice(0, THUMB_PREVIEW);
  const extraUnits = items.reduce((s, i) => s + i.quantity, 0) - visible.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="mt-5 flex flex-wrap gap-x-3 gap-y-2.5">
      {visible.map((it, thumbIx) => (
        <div key={`${it.productId ?? it.name}-${thumbIx}`} className="flex w-12 shrink-0 flex-col items-center gap-0.5">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-neutral-100">
            <SafeProductImage src={it.image} alt={it.name} className="object-cover" />
            {it.quantity >= 2 ? (
              <span
                className="cu-text-counter absolute right-0.5 top-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-neutral-900/90 px-[3px] text-white ring-1 ring-white/35"
                aria-label={`${it.quantity} шт.`}
              >
                {it.quantity}
              </span>
            ) : null}
          </div>
          {it.sizeLabel ? (
            <span className="cu-text-caption-medium w-full text-center leading-none">{it.sizeLabel}</span>
          ) : null}
        </div>
      ))}
      {extraUnits > 0 ? (
        <div className="flex aspect-[3/4] w-12 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-xs font-semibold text-neutral-500">
          +{extraUnits}
        </div>
      ) : null}
    </div>
  );
}

function ShipmentCard({
  part,
  index,
  paymentMethod,
  orderedAtIso,
  onCancel,
  onPayNow,
}: {
  part: ThankYouPart;
  index: number;
  paymentMethod?: CheckoutPaymentMethod;
  orderedAtIso: string;
  onCancel: () => void;
  onPayNow: () => void;
}) {
  const status = part.actionStatus ?? deriveShipmentStatus(paymentMethod, undefined);
  const canCancel = status !== "cancelled";
  const canPrepay = paymentMethod === "on_receipt" && status === "active";
  const payment = paymentLabel(paymentMethod, status);
  const preview = thankYouPartCardPreview(part, orderedAtIso, fmt);
  const ship = part.deliveryPrice;
  const showBenefitRow = Boolean(preview.benefitOrFee) || ship > 0;
  const holdLine = partHoldLine(part);
  const shipmentIx = index + 1;

  return (
    <article className="rounded-2xl border border-neutral-100 bg-white p-4">
      <div className="flex items-start gap-3 text-left">
        <span
          className={`mt-px flex shrink-0 items-center justify-center rounded-full border-2 border-black bg-white text-xs font-bold leading-none text-black tabular-nums ${
            shipmentIx > 9 ? "h-5 min-w-5 px-0.5" : "h-5 w-5"
          }`}
          aria-label={`Отправление ${shipmentIx}`}
        >
          {shipmentIx}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="cu-text-headline leading-tight">{preview.primaryHeading}</p>
              {preview.secondaryHeading ? (
                <p className="mt-1.5 text-sm leading-snug text-neutral-600">{preview.secondaryHeading}</p>
              ) : null}
            </div>
            <span
              className="cu-text-headline shrink-0 tabular-nums leading-tight text-right"
              title={preview.priceBreakdownTitle}
            >
              {fmt(preview.lineTotal)}
            </span>
          </div>
          {showBenefitRow ? (
            <div className="mt-1.5 flex items-baseline justify-between gap-4">
              <div className="min-w-0 flex-1">
                {preview.benefitOrFee ? <p className="cu-benefit">{preview.benefitOrFee}</p> : null}
              </div>
              {preview.showIncludingDeliveryCaption ? (
                <span className="cu-text-caption shrink-0 text-right">включая доставку</span>
              ) : null}
            </div>
          ) : null}
          {holdLine ? <p className="mt-1.5 text-xs text-neutral-500">{holdLine}</p> : null}
          <ShipmentThumbStrip items={part.items} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-neutral-100 pt-3">
        <p className="cu-text-body-medium text-neutral-800">{payment}</p>
        {status === "paid_online" ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Оплачено</span>
        ) : null}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!canCancel}
          onClick={onCancel}
          className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
            status === "paid_online" ? "w-full" : "flex-1"
          } ${
            canCancel
              ? "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
              : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
          }`}
        >
          {status === "cancelled" ? "Отменён" : "Отменить"}
        </button>
        {status !== "paid_online" ? (
          <button
            type="button"
            disabled={!canPrepay}
            onClick={onPayNow}
            className={`inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
              canPrepay
                ? "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800"
                : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
            }`}
          >
            Оплатить сразу
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function OrderStatusPage() {
  const router = useRouter();
  const [data, setData] = useState<ThankYouPayload | null | "loading">("loading");

  useEffect(() => {
    const raw = readThankYouPayload();
    if (!raw) {
      setData(null);
      return;
    }
    setData(raw);
  }, []);

  const updateShipmentStatus = useCallback((key: string, nextStatus: ShipmentActionStatus) => {
    setData((prev) => {
      if (!prev || prev === "loading") return prev;
      const next: ThankYouPayload = {
        ...prev,
        parts: prev.parts.map((part) => (part.key === key ? { ...part, actionStatus: nextStatus } : part)),
      };
      writeThankYouPayload(next);
      return next;
    });
  }, []);

  if (data === "loading") {
    return (
      <CheckoutShell>
        <div className="px-4 py-16 text-center">
          <p className="cu-muted">Загрузка…</p>
        </div>
      </CheckoutShell>
    );
  }

  if (data === null) {
    return (
      <CheckoutShell>
        <div className="relative z-0 flex flex-col gap-3 px-4 pt-4">
          <section className="cu-checkout-block text-center">
            <p className="cu-text-body text-neutral-600">Нет данных заказа.</p>
            <button
              type="button"
              onClick={() => router.push("/checkout")}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-black py-4 text-sm font-semibold text-white"
            >
              Перейти к оформлению
            </button>
          </section>
        </div>
      </CheckoutShell>
    );
  }

  const multi = data.parts.length > 1;
  const orderedAtIso = data.orderedAtIso ?? new Date().toISOString();
  const orderPromoDiscount = data.orderPromoDiscount ?? data.parts.reduce((s, p) => s + (p.promoDiscount ?? 0), 0);
  const orderBonusUsed = data.orderBonusUsed ?? data.parts.reduce((s, p) => s + (p.bonusUsed ?? 0), 0);

  return (
    <CheckoutShell>
      <header className="sticky top-0 z-50 border-b border-neutral-100 bg-white">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/thank-you"
              className="flex h-9 w-9 shrink-0 items-center justify-center text-neutral-700"
              aria-label="Назад к подтверждению заказа"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <h1 className="cu-page-title flex-1 text-center">Ваш заказ</h1>
            <span className="h-9 w-9 shrink-0" aria-hidden />
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4">
        <section className="rounded-2xl border border-neutral-100 bg-white px-4 py-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">{multi ? `${data.parts.length} отправления` : "1 отправление"}</p>
              {data.orderNumber ? <p className="mt-1 text-sm text-neutral-700">Заказ {data.orderNumber}</p> : null}
            </div>
            {data.total > 0 ? (
              <p className="text-lg font-semibold text-neutral-900">{fmt(data.total)}</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          {data.parts.map((part, index) => (
            <ShipmentCard
              key={part.key}
              part={part}
              index={index}
              paymentMethod={data.paymentMethod}
              orderedAtIso={orderedAtIso}
              onCancel={() => updateShipmentStatus(part.key, "cancelled")}
              onPayNow={() => updateShipmentStatus(part.key, "paid_online")}
            />
          ))}
        </section>

        {orderPromoDiscount > 0 || orderBonusUsed > 0 || data.total > 0 ? (
          <section className="rounded-2xl border border-neutral-100 bg-white px-4 py-4">
            <div className="space-y-2">
              {orderPromoDiscount > 0 ? (
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-neutral-500">Скидка</span>
                  <span className="tabular-nums text-red-600">− {fmt(orderPromoDiscount)}</span>
                </div>
              ) : null}
              {orderBonusUsed > 0 ? (
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-neutral-500">Бонусы</span>
                  <span className="tabular-nums text-red-600">− {fmt(orderBonusUsed)}</span>
                </div>
              ) : null}
              {data.total > 0 ? (
                <div className="flex justify-between gap-3 text-base font-semibold text-neutral-900">
                  <span>Итого по заказу</span>
                  <span>{fmt(data.total)}</span>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </CheckoutShell>
  );
}
