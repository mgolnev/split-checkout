"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatHoldNoticeForPart } from "@/lib/hold-display";
import type { ScenarioPart } from "@/lib/types";

type CheckoutPaymentMethod = "sbp" | "card" | "on_receipt";

type Ty = {
  recipientPhone?: string;
  recipientName?: string;
  parts: {
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
    items: { name: string; quantity: number }[];
    subtotal: number;
    deliveryPrice: number;
    promoDiscount: number;
    bonusUsed: number;
  }[];
  /** Скидка по заказу целиком (раньше могла быть разнесена по частям) */
  orderPromoDiscount?: number;
  /** Списание бонусов по заказу целиком */
  orderBonusUsed?: number;
  total: number;
  payOnDeliveryOnly: boolean;
  method: string;
  courierAddress?: string | null;
  paymentMethod?: CheckoutPaymentMethod;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(
    n,
  );

function paymentMethodLabel(m: CheckoutPaymentMethod): string {
  const labels: Record<CheckoutPaymentMethod, string> = {
    sbp: "СБП",
    card: "Банковской картой онлайн",
    on_receipt: "При получении (картой или наличными)",
  };
  return labels[m];
}

function pluralizeDays(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

export default function ThankYouPage() {
  const [data, setData] = useState<Ty | null | "loading">("loading");

  useEffect(() => {
    const raw = sessionStorage.getItem("thankyou");
    if (!raw) {
      setData(null);
      return;
    }
    try {
      setData(JSON.parse(raw) as Ty);
    } catch {
      setData(null);
    }
  }, []);

  if (data === "loading") {
    return <div className="p-8 text-center text-sm text-neutral-500">Загрузка…</div>;
  }

  if (data === null) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-neutral-600">Нет данных заказа. Откройте checkout и оформите заказ.</p>
        <Link className="mt-4 inline-block text-sm font-medium underline" href="/checkout">
          Перейти к оформлению
        </Link>
      </main>
    );
  }

  const multi = data.parts.length > 1;
  const orderPromoDiscount =
    data.orderPromoDiscount ?? data.parts.reduce((s, p) => s + (p.promoDiscount ?? 0), 0);
  const orderBonusUsed = data.orderBonusUsed ?? data.parts.reduce((s, p) => s + (p.bonusUsed ?? 0), 0);

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white">
          ✓
        </div>
        <h1 className="text-xl font-semibold">Заказ оформлен</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {multi
            ? `Оформлено отправлений: ${data.parts.length}. Спасибо за покупку!`
            : "Спасибо за покупку!"}
        </p>
        {data.paymentMethod ? (
          <p className="mt-3 text-sm text-neutral-700">
            Способ оплаты: <span className="font-medium">{paymentMethodLabel(data.paymentMethod)}</span>
          </p>
        ) : null}
        {data.recipientName && data.recipientPhone ? (
          <p className="mt-3 text-sm text-neutral-700">
            Получатель:{" "}
            <span className="font-medium">
              {data.recipientName}, {data.recipientPhone}
            </span>
          </p>
        ) : null}
      </div>

      {data.payOnDeliveryOnly ? (
        <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs">
          Для этого заказа доступна только оплата при получении.
        </div>
      ) : null}

      <section className="space-y-4">
        {data.parts.map((p, i) => (
          <div key={p.key} className="rounded-xl border border-neutral-200 p-4">
            <p className="text-xs font-bold uppercase text-neutral-500">
              {multi ? `Отправление ${i + 1}` : "Ваш заказ"}
            </p>
            <p className="mt-1 text-sm font-semibold">{p.sourceName}</p>
            <p className="text-xs text-neutral-500">{p.methodLabel}</p>
            <p className="text-xs text-[var(--gj-muted)]">{p.leadTimeLabel}</p>
            {p.selectedDate && p.selectedSlot ? (
              <p className="text-xs text-neutral-500">
                Доставка: {p.selectedDate}, {p.selectedSlot}
              </p>
            ) : null}
            {data.courierAddress && p.methodLabel.toLowerCase().includes("курьер") ? (
              <p className="text-xs text-neutral-500">Адрес: {data.courierAddress}</p>
            ) : null}
            {(() => {
              const line =
                p.holdNotice ??
                (p.mode != null && p.holdDays
                  ? formatHoldNoticeForPart(p.mode, p.holdDays, new Date())
                  : p.holdDays
                    ? `Срок хранения: ${p.holdDays} ${pluralizeDays(p.holdDays)}`
                    : null);
              return line ? <p className="text-xs text-neutral-500">{line}</p> : null;
            })()}
            <ul className="mt-2 text-xs text-neutral-700">
              {p.items.map((it) => (
                <li key={it.name + it.quantity}>
                  {it.name} × {it.quantity}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-medium">{fmt(p.subtotal + p.deliveryPrice)}</p>
            <div className="mt-1 space-y-1 text-xs text-neutral-500">
              <div className="flex justify-between gap-3">
                <span>Товары</span>
                <span>{fmt(p.subtotal)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Доставка</span>
                <span>{p.deliveryPrice > 0 ? fmt(p.deliveryPrice) : "Бесплатно"}</span>
              </div>
              {p.deliveryPrice > 0 && p.freeDeliveryThreshold > 0 ? (
                <p>Бесплатная доставка от {fmt(p.freeDeliveryThreshold)}</p>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      {orderPromoDiscount > 0 ? (
        <div className="mt-4 flex justify-between text-sm text-red-600">
          <span>Скидка</span>
          <span className="tabular-nums">− {fmt(orderPromoDiscount)}</span>
        </div>
      ) : null}
      {orderBonusUsed > 0 ? (
        <div className="mt-1 flex justify-between text-sm text-red-600">
          <span>Бонусы</span>
          <span className="tabular-nums">− {fmt(orderBonusUsed)}</span>
        </div>
      ) : null}

      <div className="mt-6 flex justify-between border-t border-neutral-200 pt-4 text-base font-semibold">
        <span>Итого</span>
        <span>{fmt(data.total)}</span>
      </div>

      <Link
        className="mt-8 block w-full rounded-lg border border-neutral-300 py-3 text-center text-sm font-medium"
        href="/checkout"
      >
        Вернуться в checkout
      </Link>
    </main>
  );
}
