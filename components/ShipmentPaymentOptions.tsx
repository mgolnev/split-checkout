"use client";

import Image from "next/image";
import { useId } from "react";
import type { CheckoutPaymentMethod } from "@/lib/thank-you-session";

const paymentIcons = { card: "card", sbp: "sbp", on_receipt: "bag" } as const;

export function PaymentMethodIcon({ method, selected = false }: { method: CheckoutPaymentMethod; selected?: boolean }) {
  return <Image src={`/checkout-payment/${paymentIcons[method]}.svg`} alt="" width={24} height={24}
    className={`h-6 w-6 shrink-0 object-contain ${selected && method !== "sbp" ? "invert" : ""}`} />;
}

/** Independent payment choice for a single shipment. */
export function ShipmentPaymentOptions({ value, onChange, onlineOnly = false }: {
  value: CheckoutPaymentMethod;
  onChange: (method: CheckoutPaymentMethod) => void;
  onlineOnly?: boolean;
}) {
  const id = useId();
  const options: { method: CheckoutPaymentMethod; label: string }[] = [
    { method: "sbp", label: "СБП" },
    { method: "card", label: "Картой" },
    ...(!onlineOnly ? [{ method: "on_receipt" as const, label: "При получении" }] : []),
  ];
  return (
    <fieldset className="min-w-0">
      <legend className="mb-4 text-[17px] leading-5 tracking-[-0.17px]">Способ оплаты</legend>
      <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map(({ method, label }) => (
          <label key={method} className="relative flex shrink-0 cursor-pointer">
            <input type="radio" name={id} value={method} checked={value === method}
              onChange={() => onChange(method)} className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" />
            <span className={`flex min-h-[58px] items-center gap-3 rounded-lg border px-3 py-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${
              value === method ? "border-black bg-black text-white" : "border-[#e6e6e6] bg-white text-black"
            }`}>
              <PaymentMethodIcon method={method} selected={value === method} />
              <span className="text-sm leading-4 tracking-[-0.14px]">
                {label}
                {method === "on_receipt" ? <span className={`mt-1 block text-[11px] leading-3 ${value === method ? "text-white/75" : "text-[#535353]"}`}>картой или наличными</span> : null}
              </span>
            </span>
          </label>
        ))}
      </div>
      {value === "on_receipt" ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg bg-[#f8f7f2] p-4">
          <Image
            src="/checkout-payment/pay-now-info.svg"
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 object-contain"
          />
          <p className="text-sm font-normal leading-4 tracking-[-0.14px] text-black">
            Оплатите сразу — останется только забрать товары. Если что-то не подойдёт, вернём деньги.
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
