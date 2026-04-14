"use client";

import { useState } from "react";

/** Интерактивная копия полосы промокода из CheckoutApp для UI kit. */
export function PromoStripDemo() {
  const [promo, setPromo] = useState("");
  const [applied, setApplied] = useState(false);

  const apply = () => {
    if (promo.trim().toUpperCase() === "APP20") {
      setApplied(true);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex w-full items-stretch gap-2 rounded-xl bg-neutral-100 p-1.5 pl-3">
        <input
          type="search"
          name="promo-demo"
          autoComplete="off"
          enterKeyHint="done"
          aria-label="Промокод (демо)"
          className="cu-promo-input min-w-0 flex-1 border-0 bg-transparent py-2 text-sm uppercase tracking-wide text-neutral-900 outline-none placeholder:text-neutral-500"
          placeholder="Промокод"
          value={promo}
          onChange={(e) => {
            const next = e.target.value;
            setPromo(next);
            if (!next.trim()) setApplied(false);
            else if (applied && next.trim().toUpperCase() !== "APP20") setApplied(false);
          }}
        />
        {promo.trim().length > 0 && !applied ? (
          <button
            type="button"
            className="shrink-0 rounded-lg bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-800 shadow-sm"
            onClick={apply}
          >
            Применить
          </button>
        ) : null}
      </div>
      {applied ? <p className="text-xs text-emerald-700">Применён промокод APP20 (−20%)</p> : null}
      <p className="cu-muted">Демо: введите APP20 и нажмите «Применить»; очистка — нативный крестик у поля поиска.</p>
    </div>
  );
}
