"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScenarioPart, ScenarioResult } from "@/lib/types";

type Bootstrap = {
  cities: { id: string; name: string; hasClickCollect: boolean }[];
  deliveryMethods: { id: string; code: string; name: string }[];
  products: { id: string; name: string; price: number; image: string; sku: string }[];
  storesByCity: Record<string, { id: string; name: string }[]>;
  pvzByCity: Record<
    string,
    { id: string; name: string; address: string; requiresPrepayment: boolean }[]
  >;
  allowedMethodsByCity: Record<string, string[]>;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(
    n,
  );

const MOCK_DATES = ["Завтра, 9 апр.", "10 апр.", "11 апр.", "12 апр."];
const MOCK_SLOTS = ["9:00–12:00", "12:00–15:00", "15:00–18:00"];

const modeLabel = (mode: ScenarioPart["mode"]) => {
  if (mode === "click_reserve") return "самовывоз (click reserve)";
  if (mode === "click_collect") return "самовывоз (click collect)";
  if (mode === "pvz") return "ПВЗ";
  return "курьер";
};

function Stepper({ step }: { step: number }) {
  const labels = ["Доставка", "Получатель", "Оплата", "Оформление"];
  return (
    <div className="mb-6">
      <div className="flex justify-between gap-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        {labels.map((l, i) => (
          <span key={l} className={i <= step ? "text-neutral-900" : ""}>
            {l}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1">
        {labels.map((_, i) => (
          <div key={i} className="flex flex-1 items-center">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${
                i < step
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : i === step
                    ? "border-neutral-900 bg-white text-neutral-900"
                    : "border-neutral-300 bg-white text-neutral-400"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </div>
            {i < labels.length - 1 && (
              <div className={`mx-0.5 h-0.5 flex-1 ${i < step ? "bg-emerald-600" : "bg-neutral-200"}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PartCard({
  part,
  included,
  onToggle,
  totalCartUnits,
  promoFactor,
  showRemainderHint,
  remainderKeepHint,
  partPromoDiscount,
  partBonusUsed,
  showSplitMeta,
}: {
  part: ScenarioPart;
  included: boolean;
  onToggle: () => void;
  totalCartUnits: number;
  promoFactor: number;
  /** Показываем подсказку только если реально есть remainder и текст не отключён в админке. */
  showRemainderHint: boolean;
  remainderKeepHint?: string;
  partPromoDiscount: number;
  partBonusUsed: number;
  showSplitMeta: boolean;
}) {
  const visible = part.items.slice(0, 5);
  const extra = part.items.reduce((s, i) => s + i.quantity, 0) - visible.reduce((s, i) => s + i.quantity, 0);
  const sub = Math.round(part.subtotal * promoFactor);
  const ship = included ? part.deliveryPrice : 0;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          disabled={!part.canToggle}
          onClick={onToggle}
          role="checkbox"
          aria-checked={included}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border-2 text-[11px] font-bold leading-none ${
            included ? "border-black bg-black text-white" : "border-neutral-400 bg-white text-transparent"
          } ${part.canToggle ? "" : "opacity-40"}`}
        >
          ✓
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{part.sourceName}</p>
            <span className="text-[10px] uppercase text-[var(--gj-muted)]">
              {part.mode === "click_reserve"
                ? "бесплатно / примерка"
                : part.mode === "click_collect"
                  ? "бесплатно / доставка в магазин"
                  : part.mode === "pvz"
                    ? "ПВЗ"
                    : "курьер"}
            </span>
          </div>
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-between rounded-lg bg-[var(--gj-beige)] px-3 py-2 text-left text-sm font-medium"
          >
            <span>
              {showSplitMeta
                ? `${part.items.reduce((s, i) => s + i.quantity, 0)} из ${totalCartUnits} товаров — ${part.leadTimeLabel}`
                : part.leadTimeLabel}
            </span>
            <span className="text-neutral-500">›</span>
          </button>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {visible.map((it) => (
              <div key={it.productId} className="w-14 shrink-0 text-center">
                <div className="relative aspect-square overflow-hidden rounded-md bg-neutral-100">
                  <Image src={it.image} alt="" fill className="object-cover" sizes="56px" />
                  {it.quantity > 1 ? (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black px-1 text-[9px] text-white">
                      {it.quantity} шт
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-[9px] text-neutral-500">SKU</p>
              </div>
            ))}
            {extra > 0 ? (
              <div className="flex w-10 shrink-0 items-center justify-center text-sm font-semibold text-neutral-500">
                +{extra}
              </div>
            ) : null}
          </div>
          {showRemainderHint && remainderKeepHint ? (
            <p className="mt-2 text-xs text-neutral-500">{remainderKeepHint}</p>
          ) : null}
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-neutral-600">{showSplitMeta ? "Часть заказа" : "Заказ"}</span>
            <span className="font-medium">{fmt(sub + ship)}</span>
          </div>
          {partPromoDiscount > 0 ? (
            <div className="mt-1 flex justify-between text-xs text-red-600">
              <span>Скидка по части</span>
              <span>− {fmt(partPromoDiscount)}</span>
            </div>
          ) : null}
          {partBonusUsed > 0 ? (
            <div className="mt-1 flex justify-between text-xs text-red-600">
              <span>Бонусы по части</span>
              <span>− {fmt(partBonusUsed)}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function CheckoutApp() {
  const router = useRouter();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [cityId, setCityId] = useState<string>("");
  const [method, setMethod] = useState<"courier" | "pickup" | "pvz">("courier");
  const [storeId, setStoreId] = useState<string>("");
  const [pvzId, setPvzId] = useState<string>("");
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [dateIx, setDateIx] = useState(0);
  const [slotIx, setSlotIx] = useState(2);
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [bonusOn, setBonusOn] = useState(false);
  const [phone, setPhone] = useState("");

  useEffect(() => {
    fetch("/api/bootstrap")
      .then((r) => r.json())
      .then((d: Bootstrap) => {
        setBoot(d);
        const firstCity = d.cities[0];
        if (firstCity) setCityId(firstCity.id);
      });
  }, []);

  const refreshScenario = useCallback(async () => {
    if (!cityId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/checkout/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityId,
          deliveryMethodCode: method,
          selectedStoreId: method === "pickup" ? storeId || null : null,
        }),
      });
      const data = await res.json();
      const sc: ScenarioResult = data.scenario;
      setScenario(sc);
      const next: Record<string, boolean> = {};
      for (const p of sc.parts) next[p.key] = p.defaultIncluded;
      setIncluded(next);
    } finally {
      setLoading(false);
    }
  }, [cityId, method, storeId]);

  useEffect(() => {
    void refreshScenario();
  }, [refreshScenario]);

  useEffect(() => {
    if (!boot || !cityId) return;
    const stores = boot.storesByCity[cityId] ?? [];
    if (stores.length && !stores.find((s) => s.id === storeId)) {
      setStoreId(stores[0]!.id);
    }
    const pvz = (boot.pvzByCity[cityId] ?? []).filter((p) => !p.requiresPrepayment);
    if (pvz.length && !pvz.find((p) => p.id === pvzId)) {
      setPvzId(pvz[0]!.id);
    }
  }, [boot, cityId, storeId, pvzId]);

  const availableMethods = useMemo(() => {
    if (!boot || !cityId) return boot?.deliveryMethods ?? [];
    const allowed = new Set(boot.allowedMethodsByCity[cityId] ?? []);
    return boot.deliveryMethods.filter((m) => allowed.has(m.code));
  }, [boot, cityId]);

  useEffect(() => {
    if (!availableMethods.length) return;
    if (!availableMethods.some((m) => m.code === method)) {
      setMethod(availableMethods[0]!.code as typeof method);
    }
  }, [availableMethods, method]);

  const [cartDetail, setCartDetail] = useState<{
    lines: { productId: string; quantity: number; name: string; price: number; image: string }[];
    units: number;
    subtotal: number;
  } | null>(null);

  useEffect(() => {
    if (!boot || !cityId) return;
    fetch(`/api/cart-lines?cityId=${encodeURIComponent(cityId)}`)
      .then((r) => r.json())
      .then(setCartDetail)
      .catch(() => setCartDetail(null));
  }, [boot, cityId]);

  const units = cartDetail?.units ?? 0;
  const subtotal = cartDetail?.subtotal ?? 0;

  const promoFactor = promoApplied ? 0.8 : 1;
  const [distribution, setDistribution] = useState<Record<string, { promoDiscount: number; bonusUsed: number }>>({});

  const { includedMerch, partsTotal, includedParts } = useMemo(() => {
    if (!scenario) return { includedMerch: 0, partsTotal: 0, includedParts: [] as ScenarioPart[] };
    let merch = 0;
    let t = 0;
    const parts: ScenarioPart[] = [];
    for (const p of scenario.parts) {
      if (included[p.key] === false) continue;
      parts.push(p);
      merch += p.subtotal;
      t += Math.round(p.subtotal * promoFactor) + p.deliveryPrice;
    }
    return { includedMerch: merch, partsTotal: t, includedParts: parts };
  }, [scenario, included, promoFactor]);

  const promoDiscount = promoApplied ? Math.round(includedMerch * 0.2) : 0;
  const payFinal = bonusOn ? Math.max(0, partsTotal - Math.min(1000, includedMerch)) : partsTotal;

  useEffect(() => {
    const next: Record<string, { promoDiscount: number; bonusUsed: number }> = {};
    if (!includedParts.length) {
      setDistribution(next);
      return;
    }
    for (const p of includedParts) {
      next[p.key] = {
        promoDiscount: promoApplied ? p.subtotal - Math.round(p.subtotal * 0.8) : 0,
        bonusUsed: 0,
      };
    }
    if (bonusOn) {
      const maxBonus = Math.min(1000, includedMerch);
      let used = 0;
      for (let i = 0; i < includedParts.length; i += 1) {
        const p = includedParts[i]!;
        const remaining = maxBonus - used;
        if (remaining <= 0) break;
        const partShare =
          i === includedParts.length - 1
            ? remaining
            : Math.min(remaining, Math.floor((maxBonus * p.subtotal) / Math.max(1, includedMerch)));
        next[p.key] = { ...next[p.key], bonusUsed: partShare };
        used += partShare;
      }
    }
    setDistribution(next);
  }, [includedParts, bonusOn, includedMerch, promoApplied]);

  const handlePromo = () => {
    if (promo.trim().toUpperCase() === "APP20") {
      setPromoApplied(true);
      setBonusOn(false);
    }
  };

  const submit = () => {
    if (!scenario || !cartDetail) return;
    const payload = {
      parts: includedParts
        .map((p) => ({
          ...p,
          methodLabel: modeLabel(p.mode),
          items: p.items,
          subtotal: Math.round(p.subtotal * promoFactor),
          deliveryPrice: p.deliveryPrice,
          promoDiscount: distribution[p.key]?.promoDiscount ?? 0,
          bonusUsed: distribution[p.key]?.bonusUsed ?? 0,
        })),
      remainder: scenario.remainder,
      payOnDeliveryOnly: scenario.payOnDeliveryOnly,
      informers: scenario.informers,
      total: payFinal,
      method,
      pvzId: method === "pvz" ? pvzId : null,
      storeId: method === "pickup" ? storeId : null,
      date: MOCK_DATES[dateIx],
      slot: MOCK_SLOTS[slotIx],
    };
    sessionStorage.setItem("thankyou", JSON.stringify(payload));
    router.push("/thank-you");
  };

  if (!boot) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">Загрузка…</div>
    );
  }

  const pvzOptions = (boot.pvzByCity[cityId] ?? []).filter((p) => !p.requiresPrepayment);
  const stores = boot.storesByCity[cityId] ?? [];
  const hasSplit = ((scenario?.parts.length ?? 0) > 1) || ((scenario?.remainder.length ?? 0) > 0);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-28">
      <header className="sticky top-0 z-10 border-b border-neutral-100 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button type="button" className="text-xl text-neutral-700" aria-label="Назад">
            ←
          </button>
          <h1 className="flex-1 text-center text-base font-semibold">Оформление заказа</h1>
          <span className="w-6" />
        </div>
      </header>

      <div className="px-4 pt-4">
        <Stepper step={2} />

        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide">Город доставки</h2>
          </div>
          <label className="block text-xs font-medium text-neutral-500">Город</label>
          <select
            className="mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
          >
            {boot.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </section>

        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide">Способ получения</h2>
            <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] font-semibold uppercase">
              📍 {boot.cities.find((c) => c.id === cityId)?.name ?? ""}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {availableMethods.map((dm) => (
              <label
                key={dm.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 ${
                  method === dm.code ? "border-black" : "border-neutral-200"
                }`}
              >
                <input
                  type="radio"
                  className="h-4 w-4"
                  name="dm"
                  checked={method === dm.code}
                  onChange={() => setMethod(dm.code as typeof method)}
                />
                <span className="text-sm font-medium">{dm.name}</span>
              </label>
            ))}
            {availableMethods.length === 0 ? (
              <p className="text-xs text-neutral-500">
                Для выбранного города нет доступных способов получения по логистическим правилам.
              </p>
            ) : null}
          </div>
        </section>

        {method === "pickup" ? (
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-bold uppercase text-neutral-500">Магазин</h3>
            <select
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </section>
        ) : null}

        {method === "pvz" ? (
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-bold uppercase text-neutral-500">ПВЗ (мок)</h3>
            <p className="mb-2 text-xs text-neutral-500">
              Пункты с обязательной предоплатой скрыты по правилам прототипа.
            </p>
            <select
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              value={pvzId}
              onChange={(e) => setPvzId(e.target.value)}
            >
              {pvzOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </section>
        ) : null}

        {method === "courier" ? (
          <section className="mb-6">
            <h3 className="mb-1 text-sm font-semibold">Доставим — {MOCK_DATES[dateIx]}</h3>
            <div className="flex gap-2 overflow-x-auto py-2">
              {MOCK_DATES.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDateIx(i)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium ${
                    i === dateIx ? "border-black bg-black text-white" : "border-neutral-200"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {MOCK_SLOTS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlotIx(i)}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    i === slotIx ? "border-black bg-black text-white" : "border-neutral-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {loading ? <p className="text-sm text-neutral-500">Пересчёт доступных отправлений…</p> : null}

        {scenario?.informers?.length ? (
          <div className="mb-4 space-y-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-950">
            {scenario.informers.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </div>
        ) : null}

        <section className="mb-6 space-y-3">
          {scenario?.parts.map((p, partIndex) => (
            <PartCard
              key={p.key}
              part={p}
              included={included[p.key] !== false}
              onToggle={() =>
                setIncluded((prev) => {
                  const cur = prev[p.key] !== false;
                  return { ...prev, [p.key]: !cur };
                })
              }
              totalCartUnits={units}
              promoFactor={promoFactor}
              partPromoDiscount={distribution[p.key]?.promoDiscount ?? 0}
              partBonusUsed={distribution[p.key]?.bonusUsed ?? 0}
              showSplitMeta={hasSplit}
              showRemainderHint={scenario.remainder.length > 0 && partIndex === 0}
              remainderKeepHint={scenario.remainderKeepHint}
            />
          ))}
        </section>

        {scenario && scenario.remainder.length > 0 ? (
          <section className="mb-6 rounded-xl border border-dashed border-neutral-300 p-4">
            <h3 className="text-sm font-semibold">Останется в корзине</h3>
            <ul className="mt-2 text-xs text-neutral-600">
              {scenario.remainder.map((r) => {
                const pr = boot.products.find((x) => x.id === r.productId);
                return (
                  <li key={r.productId}>
                    {pr?.name ?? r.productId} × {r.quantity}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Мои данные</h2>
          <p className="text-xs text-neutral-500">Введите номер телефона, чтобы оформить заказ</p>
          <input
            className="mt-2 w-full rounded-lg bg-neutral-100 px-3 py-3 text-sm uppercase placeholder:text-neutral-400"
            placeholder="Телефон"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button
            type="button"
            className="mt-2 w-full rounded-lg bg-neutral-200 py-3 text-xs font-semibold uppercase"
          >
            Получить смс с кодом
          </button>
        </section>

        <section className="mb-6 flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
          <input
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-xs uppercase"
            placeholder="Промокод"
            value={promo}
            onChange={(e) => {
              const next = e.target.value;
              setPromo(next);
              if (promoApplied && next.trim().toUpperCase() !== "APP20") {
                setPromoApplied(false);
              }
            }}
            disabled={bonusOn}
          />
          {promoApplied && !bonusOn ? (
            <button
              type="button"
              aria-label="Убрать промокод"
              className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold uppercase"
              onClick={() => {
                setPromo("");
                setPromoApplied(false);
              }}
            >
              ×
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-neutral-900 px-4 py-2 text-xs font-semibold uppercase"
            onClick={handlePromo}
            disabled={bonusOn}
          >
            Добавить
          </button>
          <label className="flex w-full items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={bonusOn}
              onChange={(e) => {
                setBonusOn(e.target.checked);
                if (e.target.checked) setPromoApplied(false);
              }}
              disabled={promoApplied}
            />
            Списать 1000 ₽ бонусами (взаимоисключение с промокодом)
          </label>
          {promoApplied ? <p className="w-full text-xs text-emerald-700">Применён промокод APP20 (−20%)</p> : null}
        </section>

        <section className="mb-24 border-t border-neutral-100 pt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide">Ваш заказ</h2>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-600">
                {units} товар(ов)
              </span>
              <span>{fmt(subtotal)}</span>
            </div>
            {promoDiscount > 0 ? (
              <div className="flex justify-between text-red-600">
                <span>Скидка (APP20)</span>
                <span>− {fmt(promoDiscount)}</span>
              </div>
            ) : null}
            {bonusOn ? (
              <div className="flex justify-between text-red-600">
                <span>Бонусы</span>
                <span>− {fmt(Math.min(1000, includedMerch))}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-semibold">
              <span>К оплате (включённые части)</span>
              <span>{fmt(payFinal)}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white p-4">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={submit}
            disabled={
              !scenario ||
              scenario.parts.length === 0 ||
              scenario.parts.every((p) => included[p.key] === false)
            }
            className="w-full rounded-lg bg-black py-4 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-40"
          >
            Оформить заказ
          </button>
          <p className="mt-2 text-center text-[10px] text-neutral-400">split-checkout.local</p>
        </div>
      </div>
    </div>
  );
}
