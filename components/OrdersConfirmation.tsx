"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PaymentMethodIcon, ShipmentPaymentOptions } from "@/components/ShipmentPaymentOptions";
import { thankYouPartCardPreview } from "@/lib/thank-you-part-preview";
import {
  completeShipmentPayment, failShipmentPayment, normalizeThankYouData, readThankYouPayload,
  shipmentOnlineDiscount, shipmentTotal, thankYouShortPaymentLabel, writeThankYouPayload,
  type CheckoutPaymentMethod, type ThankYouItem, type ThankYouPart, type ThankYouPayload,
} from "@/lib/thank-you-session";

const fmt = (value: number) => new Intl.NumberFormat("ru-RU", {
  style: "currency", currency: "RUB", maximumFractionDigits: 0,
}).format(value);

function ProductThumb({ item }: { item: ThankYouItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex w-[55px] shrink-0 flex-col items-center gap-1">
      <div className="relative h-[70px] w-[55px] rounded-[4px] bg-[#f4f4f4]">
        <Image src={failed || !item.image ? "/product-placeholder.svg" : item.image} alt={item.name}
          fill sizes="55px" className="rounded-[4px] object-cover" onError={() => setFailed(true)} />
        {item.quantity > 1 ? <span className="absolute -right-1 bottom-0 rounded-sm bg-white px-1 text-[11px] leading-4">{item.quantity}</span> : null}
      </div>
      {item.sizeLabel ? <span className="text-[11px] leading-3 text-[#535353]">{item.sizeLabel}</span> : null}
    </div>
  );
}

function remainingTime(deadline: string | undefined, now: number): string {
  const seconds = Math.max(0, Math.ceil(((deadline ? Date.parse(deadline) : now) - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function ShipmentCard({ part, orderedAt, tracking, onPay, onCancel }: {
  part: ThankYouPart; orderedAt: string; tracking: boolean;
  onPay: () => void; onCancel: () => void;
}) {
  const waiting = part.actionStatus === "awaiting_payment";
  const paymentFailed = part.actionStatus === "payment_failed";
  const payable = waiting || paymentFailed;
  const paid = part.actionStatus === "paid_online";
  const cancelled = part.actionStatus === "cancelled";
  const receipt = part.actionStatus === "active" && part.paymentMethod === "on_receipt";
  const preview = thankYouPartCardPreview(part, orderedAt, fmt);
  const discount = shipmentOnlineDiscount(part);
  return (
    <article aria-label={`Заказ ${part.orderNumber}`} className="overflow-hidden rounded-xl bg-white">
      <div className="px-4 pb-4 pt-4">
        <div className="mb-4 flex items-center gap-1 text-[14px] leading-4">
          {waiting ? <span className="bg-[#f4f4f4] px-2 py-1 text-black">Ожидает оплаты</span> : null}
          {paymentFailed ? <span className="bg-[#ea1d2d] px-2 py-1 text-white">Оплата не прошла</span> : null}
          {!payable ? <span className="bg-[#f4f4f4] px-2 py-1 text-black">{cancelled ? "Отменён" : "В сборке"}</span> : null}
          {paid ? <span className="bg-[#edf5e5] px-2 py-1 text-[#397500]">Оплачен</span> : null}
        </div>
        <h2 className="text-[17px] leading-5 tracking-[-0.17px]">№ {part.orderNumber}</h2>
        <div className="mt-4 flex items-start justify-between gap-4 text-sm leading-4">
          <div className="min-w-0">
            <p>{part.mode === "courier" ? "Доставка курьером" : part.mode === "pvz" ? "Доставка в пункт выдачи" : "Получение в магазине"}</p>
            <p>{preview.primaryHeading}{part.mode === "courier" && part.selectedSlot ? `, ${part.selectedSlot}` : ""}</p>
            {preview.secondaryHeading ? <p>{preview.secondaryHeading}</p> : null}
          </div>
          <span className="shrink-0 tabular-nums">{fmt(shipmentTotal(part))}</span>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
          {part.items.map((item, index) => <ProductThumb key={`${item.productId ?? item.name}-${index}`} item={item} />)}
        </div>
        {tracking && part.holdNotice ? <p className="mt-3 text-[11px] leading-4 text-[#535353]">{part.holdNotice}</p> : null}
      </div>
      <div className="border-t border-[#f4f4f4] px-4 pb-4 pt-4">
        {!payable ? <div className="flex items-center gap-3 text-sm leading-4">
          <PaymentMethodIcon method={part.paymentMethod ?? "sbp"} />
          <p>{thankYouShortPaymentLabel(part.paymentMethod)}</p>
        </div> : null}
        {payable ? <button onClick={onPay} className="order-payment-button">{paymentFailed ? "Повторить оплату" : "Оплатить"}</button> : null}
        {receipt ? <div className="mt-4 rounded-lg bg-[#f4f4f4] p-4">
          <p className="text-center text-sm leading-4">Оплатите заказ сейчас и получите<br />скидку 5% <span className="text-[#ea1d2d]">(−{fmt(discount)})</span></p>
          <button onClick={onPay} className="order-payment-button mt-4 gap-2"><span>Оплатить сейчас</span><span>{fmt(shipmentTotal(part) - discount)}</span></button>
        </div> : null}
        {cancelled ? <p className="mt-4 text-sm leading-4 text-[#535353]">{part.cancellationReason === "payment_expired" ? "Время на оплату истекло. Заказ отменён." : "Заказ отменён."}</p> : null}
        {tracking && !cancelled && !paid ? <button onClick={onCancel} className="mt-4 min-h-10 w-full text-sm underline underline-offset-4">Отменить заказ</button> : null}
      </div>
    </article>
  );
}

function PaymentDialog({ part, onClose, onSuccess, onFailure }: {
  part: ThankYouPart; onClose: () => void;
  onSuccess: (method: Exclude<CheckoutPaymentMethod, "on_receipt">) => void;
  onFailure: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [method, setMethod] = useState<CheckoutPaymentMethod>("sbp");
  const discount = shipmentOnlineDiscount(part);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);
  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="payment-dialog-title"
      className="checkout-ui fixed inset-0 m-auto w-[calc(100%-32px)] max-w-[400px] rounded-xl bg-white p-6 backdrop:bg-black/40">
      <div className="flex items-start justify-between gap-4">
        <h2 id="payment-dialog-title" className="text-[20px] leading-6">Оплата заказа</h2>
        <button onClick={onClose} aria-label="Закрыть оплату" className="flex h-8 w-8 shrink-0 items-center justify-center">
          <Image src="/checkout-payment/close.svg" alt="" width={16} height={16} />
        </button>
      </div>
      <p className="mt-2 text-sm text-[#535353]">№ {part.orderNumber}</p>
      <p className="my-6 text-[26px] leading-7 tabular-nums">{fmt(shipmentTotal(part) - discount)}</p>
      {discount > 0 ? <p className="mb-6 text-sm text-[#ea1d2d]">Скидка 5% на товары: −{fmt(discount)}</p> : null}
      <ShipmentPaymentOptions value={method} onChange={setMethod} onlineOnly />
      <p className="mt-5 text-xs leading-4 text-[#535353]">Демонстрационная оплата. Деньги не списываются.</p>
      {part.actionStatus === "cancelled" ? <p role="alert" className="mt-4 text-sm text-[#ea1d2d]">Время оплаты истекло. Заказ отменён.</p> : <>
        <button onClick={() => { if (method !== "on_receipt") onSuccess(method); }} className="order-payment-button mt-5">Подтвердить демооплату</button>
        <button onClick={onFailure} className="mt-3 min-h-10 w-full text-sm text-[#535353] underline underline-offset-4">Проверить неуспешную оплату</button>
      </>}
    </dialog>
  );
}

/** Shared confirmation and tracking state: each payment targets exactly one shipment. */
export default function OrdersConfirmation({ tracking = false }: { tracking?: boolean }) {
  const [data, setData] = useState<ThankYouPayload | null | "loading">("loading");
  const [now, setNow] = useState(0);
  const [payingKey, setPayingKey] = useState<string | null>(null);

  useEffect(() => {
    const raw = readThankYouPayload();
    if (raw) writeThankYouPayload(raw);
    setData(raw);
    if (raw && sessionStorage.getItem("thankyou:auto-pay") === "1") {
      sessionStorage.removeItem("thankyou:auto-pay");
      setPayingKey(raw.parts.find((part) => part.actionStatus === "awaiting_payment")?.key ?? null);
    }
    setNow(Date.now());
    const tick = () => {
      const time = Date.now();
      setNow(time);
      setData((previous) => {
        if (!previous || previous === "loading") return previous;
        const next = normalizeThankYouData(previous, time);
        if (next.parts.every((part, index) => part.actionStatus === previous.parts[index].actionStatus)) return previous;
        writeThankYouPayload(next);
        return next;
      });
    };
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); };
  }, []);

  const update = (change: (previous: ThankYouPayload) => ThankYouPayload) => {
    setData((previous) => {
      if (!previous || previous === "loading") return previous;
      const next = change(normalizeThankYouData(previous));
      writeThankYouPayload(next);
      return next;
    });
  };

  if (data === "loading") return <main className="mx-auto max-w-md px-4 py-16 text-center" role="status">Загрузка заказов…</main>;
  if (!data || !data.parts.length) return <main className="mx-auto max-w-md px-4 py-16 text-center">
    <p>Нет данных заказа.</p><Link href="/checkout" className="order-payment-button mt-6">Перейти к оформлению</Link>
  </main>;

  const waiting = data.parts.filter((part) => part.actionStatus === "awaiting_payment" || part.actionStatus === "payment_failed").length;
  const failedPayments = data.parts.filter((part) => part.actionStatus === "payment_failed");
  const allCancelled = data.parts.every((part) => part.actionStatus === "cancelled");
  const paymentsResolved = waiting === 0 && !allCancelled;
  const singleOrder = data.parts.length === 1;
  const payingPart = data.parts.find((part) => part.key === payingKey);
  const subtitle = waiting > 0
    ? `${waiting} из ${data.parts.length} ${waiting === 1 ? "ожидает" : "ожидают"} оплаты`
    : paymentsResolved ? "Спасибо за покупку! Сообщим, когда всё будет готово."
    : allCancelled ? (data.parts.length === 1 ? "Заказ отменён" : "Все заказы отменены")
    : "Оплата завершена";

  return (
    <main className="checkout-ui mx-auto min-h-screen max-w-md bg-[#f4f4f4] pb-10 text-black">
      <header className="bg-white px-4 pb-4 pt-3 text-center">
        <div className="flex justify-end">
          <Link href="/cart" aria-label="Продолжить покупки" className="flex h-10 w-10 items-center justify-center">
            <Image src="/checkout-payment/close.svg" alt="" width={16} height={16} />
          </Link>
        </div>
        {paymentsResolved ? (
          <div className="relative mx-auto h-[110px] w-[312px]" aria-hidden>
            <Image src={singleOrder ? "/thank-you-assets/single-order-bag.png" : "/thank-you-assets/gj-bag.png"} alt="" width={116} height={110} className="absolute left-[98px] top-0 h-[110px] w-[116px] object-cover" />
            <Image src={singleOrder ? "/thank-you-assets/single-confetti-left.svg" : "/thank-you-assets/confetti-left.svg"} alt="" width={90} height={103} className="absolute left-0 top-[7px] h-[103px] w-[90px] object-contain" />
            <Image src={singleOrder ? "/thank-you-assets/single-confetti-right.svg" : "/thank-you-assets/confetti-right.svg"} alt="" width={117} height={117} className="absolute right-0 top-[-18px] h-[117px] w-[117px] object-contain" />
          </div>
        ) : <Image src="/thank-you-assets/orders-created.svg" alt="" width={60} height={60} className="mx-auto mt-1 h-[60px] w-[60px]" />}
        <h1 className="mt-4 text-[26px] leading-7 tracking-[-0.52px]">{singleOrder ? "Заказ оформлен" : "Заказы оформлены"}</h1>
        <p role="status" className="mx-auto mt-3 max-w-[328px] text-sm leading-4 tracking-[-0.14px]">{subtitle}</p>
        {failedPayments.length > 0 ? (
          <div className="mt-4 flex items-start justify-between gap-4 rounded-lg bg-[rgba(234,29,45,0.08)] p-4 text-left text-sm leading-4">
            <span>Оплатите до окончания таймера, иначе заказы будут отменены</span>
            <span role="timer" aria-label="Осталось на оплату" className="shrink-0 tabular-nums text-[#ea1d2d]">
              {remainingTime(failedPayments[0]?.paymentDeadlineIso, now)}
            </span>
          </div>
        ) : null}
      </header>
      <div className="flex flex-col gap-2 px-2 pt-2">
        {data.parts.map((part) => <ShipmentCard key={part.key} part={part} orderedAt={data.orderedAtIso!} tracking={tracking}
          onPay={() => setPayingKey(part.key)}
          onCancel={() => update((previous) => ({ ...previous, parts: previous.parts.map((item) => item.key === part.key && item.actionStatus !== "paid_online"
            ? { ...item, actionStatus: "cancelled", cancellationReason: "customer" } : item) }))} />)}
      </div>
      <nav className="mt-6 flex flex-col items-center gap-3 px-4 text-sm">
        <Link href={tracking ? "/thank-you" : "/thank-you/status"} className="min-h-10 content-center underline underline-offset-4">{tracking ? "К подтверждению заказа" : "Отслеживать заказы"}</Link>
        <Link href="/cart" className="min-h-10 content-center text-[#535353] underline underline-offset-4">Продолжить покупки</Link>
      </nav>
      {payingPart ? <PaymentDialog key={payingPart.key} part={payingPart} onClose={() => setPayingKey(null)}
        onFailure={() => {
          update((previous) => failShipmentPayment(previous, payingPart.key));
          setPayingKey(null);
        }}
        onSuccess={(method) => {
          const nextPaymentKey = data.parts.find((part) => part.key !== payingPart.key && (part.actionStatus === "awaiting_payment" || part.actionStatus === "payment_failed"))?.key ?? null;
          update((previous) => completeShipmentPayment(previous, payingPart.key, method));
          setPayingKey(nextPaymentKey);
        }} /> : null}
    </main>
  );
}
