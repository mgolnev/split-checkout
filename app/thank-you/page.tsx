"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { thankYouPartCardPreview } from "@/lib/thank-you-part-preview";
import {
  type ThankYouItem,
  type ThankYouPart,
  type ThankYouPayload,
  buildSupportMailHref,
  readThankYouPayload,
  thankYouShortPaymentLabel,
  writeThankYouPayload,
} from "@/lib/thank-you-session";

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);

const PRODUCT_PLACEHOLDER = "/product-placeholder.svg";
const THUMB_PREVIEW = 4;

function CheckoutShell({ children }: { children: ReactNode }) {
  return (
    <div className="checkout-ui relative isolate mx-auto min-h-screen max-w-md bg-neutral-100 pb-36">{children}</div>
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

function ShipmentThumbStrip({ items }: { items: ThankYouItem[] }) {
  const visible = items.slice(0, THUMB_PREVIEW);
  const extraUnits = items.reduce((s, i) => s + i.quantity, 0) - visible.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="mt-5 flex flex-wrap gap-x-3 gap-y-2.5">
      {visible.map((item, index) => (
        <div key={`${item.productId ?? item.name}-${index}`} className="flex w-12 shrink-0 flex-col items-center gap-0.5">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-neutral-100">
            <SafeProductImage src={item.image} alt={item.name} className="object-cover" />
            {item.quantity >= 2 ? (
              <span
                className="cu-text-counter absolute right-0.5 top-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-neutral-900/90 px-[3px] text-white ring-1 ring-white/35"
                aria-label={`${item.quantity} шт.`}
              >
                {item.quantity}
              </span>
            ) : null}
          </div>
          {item.sizeLabel ? (
            <span className="cu-text-caption-medium w-full text-center leading-none">{item.sizeLabel}</span>
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

function ThankYouPartCheckoutRow({
  part,
  orderedAtIso,
  shipmentIndex,
}: {
  part: ThankYouPart;
  orderedAtIso: string;
  shipmentIndex: number;
}) {
  const preview = thankYouPartCardPreview(part, orderedAtIso, fmt);
  const ship = part.deliveryPrice;
  const showBenefitRow = Boolean(preview.benefitOrFee) || ship > 0;
  return (
    <div className="flex items-start gap-3 text-left">
      <span
        className={`mt-px flex shrink-0 items-center justify-center rounded-full border-2 border-black bg-white text-xs font-bold leading-none text-black tabular-nums ${
          shipmentIndex > 9 ? "h-5 min-w-5 px-0.5" : "h-5 w-5"
        }`}
        aria-label={`Отправление ${shipmentIndex}`}
      >
        {shipmentIndex}
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
            {ship > 0 ? (
              <span className="cu-text-caption shrink-0 text-right">включая доставку</span>
            ) : null}
          </div>
        ) : null}
        <ShipmentThumbStrip items={part.items} />
      </div>
    </div>
  );
}

export default function ThankYouPage() {
  const [data, setData] = useState<ThankYouPayload | null | "loading">("loading");

  useEffect(() => {
    const raw = readThankYouPayload();
    if (!raw) {
      setData(null);
      return;
    }
    writeThankYouPayload(raw);
    setData(raw);
  }, []);

  const supportMailHref = useMemo(() => {
    if (!data || data === "loading") return "mailto:support@example.com";
    return buildSupportMailHref(data);
  }, [data]);

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
            <p className="cu-text-body text-neutral-600">Нет данных заказа. Откройте checkout и оформите заказ.</p>
            <Link
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-black py-4 text-sm font-semibold text-white"
              href="/checkout"
            >
              Перейти к оформлению
            </Link>
          </section>
        </div>
      </CheckoutShell>
    );
  }

  const orderNumber = data.orderNumber ?? "";
  const paymentLine = thankYouShortPaymentLabel(data.paymentMethod);
  const orderedAtIso = data.orderedAtIso ?? new Date().toISOString();

  return (
    <CheckoutShell>
      <div className="relative z-0 flex flex-col gap-4 px-4 pt-6">
        <section className="overflow-hidden rounded-2xl border border-neutral-100 bg-white p-6">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 text-3xl text-white">
              ✓
            </div>
            <h1 className="cu-text-display mt-5 text-balance">Спасибо, заказ оформлен</h1>
            {orderNumber ? (
              <p className="mt-3 text-sm font-medium text-neutral-800">
                Номер заказа: <span className="tabular-nums">{orderNumber}</span>
              </p>
            ) : null}
            <p className="cu-text-headline mt-6 tabular-nums text-neutral-900">{fmt(data.total)}</p>
            <p className="cu-muted mt-1 text-sm">{paymentLine}</p>
          </div>

          <div className="mt-6 border-t border-neutral-100 pt-4">
            <div className="flex flex-col gap-10">
              {data.parts.map((part, ix) => (
                <ThankYouPartCheckoutRow
                  key={part.key}
                  part={part}
                  orderedAtIso={orderedAtIso}
                  shipmentIndex={ix + 1}
                />
              ))}
            </div>
          </div>
        </section>

        <p className="text-center">
          <Link href={supportMailHref} className="text-sm font-medium text-neutral-600 underline-offset-2 hover:underline">
            Нужна помощь?
          </Link>
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white p-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom,0px))]">
        <div className="mx-auto max-w-md space-y-2">
          <Link
            href="/thank-you/status"
            className="inline-flex w-full items-center justify-center rounded-lg bg-black py-4 text-sm font-semibold text-white"
          >
            Отслеживать заказ
          </Link>
          <Link
            href="/cart"
            className="block text-center text-sm font-medium text-neutral-700 underline-offset-2 hover:underline"
          >
            Продолжить покупки
          </Link>
        </div>
      </div>
    </CheckoutShell>
  );
}
