"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Ty = {
  parts: {
    key: string;
    sourceName: string;
    methodLabel: string;
    leadTimeLabel: string;
    items: { name: string; quantity: number }[];
    subtotal: number;
    deliveryPrice: number;
    promoDiscount: number;
    bonusUsed: number;
  }[];
  total: number;
  payOnDeliveryOnly: boolean;
  method: string;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(
    n,
  );

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
            <ul className="mt-2 text-xs text-neutral-700">
              {p.items.map((it) => (
                <li key={it.name + it.quantity}>
                  {it.name} × {it.quantity}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-medium">
              {fmt(p.subtotal + p.deliveryPrice - p.bonusUsed)}
            </p>
            {p.promoDiscount > 0 ? <p className="text-xs text-red-600">Скидка: − {fmt(p.promoDiscount)}</p> : null}
            {p.bonusUsed > 0 ? <p className="text-xs text-red-600">Бонусы: − {fmt(p.bonusUsed)}</p> : null}
          </div>
        ))}
      </section>

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
