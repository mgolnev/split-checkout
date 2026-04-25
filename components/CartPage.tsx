"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadCheckoutRecipient,
  saveCheckoutRecipient,
  type CheckoutRecipientPayload,
} from "@/lib/checkout-recipient-storage";
import { fullCheckoutCopy } from "@/lib/disclaimers";
import {
  loadCheckoutCart,
  saveCheckoutCart,
  type StoredCartLine,
} from "@/lib/checkout-cart-storage";
import { CartBootstrapSkeleton, CartLinesSkeleton } from "@/components/CartLoadingSkeleton";
import { fetchWithRetry } from "@/lib/fetch-retry";

type Bootstrap = {
  cities: { id: string; name: string }[];
  clientProfile?: {
    firstName: string;
    lastName: string;
    bonusBalanceRub: number;
  };
};

type ResolvedCartLine = {
  productId: string;
  quantity: number;
  maxQuantity: number;
  name: string;
  price: number;
  listPrice?: number | null;
  image: string;
  sizeLabel?: string | null;
};

type UiLine = {
  productId: string;
  quantity: number;
  /** Суммарный остаток по городу (все активные точки) — верхняя граница для + */
  maxQuantity: number;
  name: string;
  price: number;
  listPrice?: number | null;
  image: string;
  size: string;
  selected: boolean;
  favorite: boolean;
};

const SIZES = ["S", "M", "L", "XL"] as const;

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);

function pluralizeProducts(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "товар";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "товара";
  return "товаров";
}

function phoneHasMinDigits(value: string, min = 10): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= min;
}

function mapSnapshotToUi(stored: StoredCartLine[], resolved: ResolvedCartLine[]): UiLine[] {
  const resolvedById = new Map(resolved.map((r) => [r.productId, r]));
  const out: UiLine[] = [];
  for (const s of stored) {
    const r = resolvedById.get(s.productId);
    if (!r) continue;
    const maxQ = r.maxQuantity > 0 ? r.maxQuantity : r.quantity;
    /** `r.quantity` с сервера уже min(запрошено, остаток); не берём `s.quantity` из localStorage — иначе лимит обходится. */
    out.push({
      productId: s.productId,
      quantity: r.quantity,
      maxQuantity: maxQ,
      name: r.name,
      price: r.price,
      listPrice: r.listPrice ?? null,
      image: r.image,
      size: s.size ?? "S",
      selected: s.selected !== false,
      favorite: false,
    });
  }
  return out;
}

const GJ_LOYALTY_MAX_SPEND_RUB = 1000;
const DEFAULT_GJ_LOYALTY_WALLET_BALANCE_RUB = 1000;
const GJ_BONUS_MIN_ELIGIBLE_MERCH_RUB: number | null = null;
const DEFAULT_DEMO_FIRST_NAME = "Елизавета";
const DEFAULT_DEMO_LAST_NAME = "Петрова-Водкина";

function isCatalogDiscountedLine(line: { price: number; listPrice?: number | null }): boolean {
  return line.listPrice != null && line.listPrice > line.price;
}

function sumBonusEligibleMerchFromUiLines(
  lines: readonly { price: number; quantity: number; listPrice?: number | null; selected?: boolean }[],
): { merchSaleRub: number; bonusEligibleMerchRub: number; hasDiscounted: boolean } {
  let merchSaleRub = 0;
  let bonusEligibleMerchRub = 0;
  let hasDiscounted = false;
  for (const l of lines) {
    if (l.selected === false || l.quantity <= 0) continue;
    const lineSum = l.price * l.quantity;
    merchSaleRub += lineSum;
    if (isCatalogDiscountedLine(l)) hasDiscounted = true;
    else bonusEligibleMerchRub += lineSum;
  }
  return { merchSaleRub, bonusEligibleMerchRub, hasDiscounted };
}

function GjMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md bg-neutral-900 font-bold leading-none text-white ${className}`}
    >
      GJ
    </span>
  );
}

function BonusAuthBar({ onOpenPhoneGate }: { onOpenPhoneGate: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenPhoneGate}
      aria-label="Ввести телефон, чтобы копить и списывать бонусы"
      className="flex w-full items-center gap-3 rounded-xl p-3 text-left text-neutral-900 transition hover:opacity-90 active:opacity-90"
    >
      <GjMark className="h-10 min-w-[2.75rem] px-1 text-xs" />
      <span className="min-w-0 flex-1 text-sm leading-snug text-neutral-900">
        Войдите в аккаунт, чтобы копить и списывать бонусы GJ
      </span>
      <svg
        className="h-5 w-5 shrink-0 text-neutral-700"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

type BonusPointsControlProps = {
  bonusOn: boolean;
  switchDisabled: boolean;
  showSwitch?: boolean;
  labelsMuted: boolean;
  mainText: string;
  subText: string | null;
  onToggle: (next: boolean) => void;
};

function BonusPointsControl({
  bonusOn,
  switchDisabled,
  showSwitch = true,
  labelsMuted,
  mainText,
  subText,
  onToggle,
}: BonusPointsControlProps) {
  return (
    <div className="flex w-full flex-col gap-0.5">
      <div className="flex w-full items-start gap-3">
        <GjMark className="mt-0.5 h-8 min-w-[2.25rem] shrink-0 px-1 text-[10px]" />
        <div className={`min-w-0 flex-1 ${labelsMuted ? "text-neutral-500" : "text-neutral-900"}`}>
          <span className="block min-w-0 text-sm font-medium leading-snug">{mainText}</span>
          {subText ? (
            <span className="mt-0.5 block text-xs font-normal leading-snug text-neutral-500">{subText}</span>
          ) : null}
        </div>
        {showSwitch ? (
          <button
            type="button"
            role="switch"
            aria-disabled={switchDisabled}
            aria-checked={bonusOn}
            onClick={() => {
              if (switchDisabled) return;
              onToggle(!bonusOn);
            }}
            className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 ${
              switchDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            } ${bonusOn && !switchDisabled ? "bg-neutral-900" : "bg-neutral-300"}`}
          >
            <span className="sr-only">Списать бонусы с карты GJ</span>
            <span
              className={`pointer-events-none block h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
                bonusOn && !switchDisabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function CartPage() {
  const router = useRouter();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [cityId, setCityId] = useState("");
  const [lines, setLines] = useState<UiLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [bonusOn, setBonusOn] = useState(false);
  const [recipientPhone, setRecipientPhone] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneGateOpen, setPhoneGateOpen] = useState(false);
  const [phoneGateStep, setPhoneGateStep] = useState<"phone" | "code">("phone");
  const [smsCodeDraft, setSmsCodeDraft] = useState("");
  const phoneGatePhoneInputRef = useRef<HTMLInputElement | null>(null);
  const phoneGateCodeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetchWithRetry("/api/bootstrap");
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as Bootstrap;
        if (cancelled) return;
        setBoot(d);
        const snap = loadCheckoutCart();
        const first = d.cities[0];
        if (first) setCityId(snap?.cityId && d.cities.some((c) => c.id === snap.cityId) ? snap.cityId : first.id);
      } catch {
        if (!cancelled) setBoot({ cities: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cityId) return;
    let cancelled = false;
    setHydrated(false);

    async function load() {
      try {
        const snap = loadCheckoutCart();
        if (snap?.cityId === cityId && snap.lines.length > 0) {
          setPromo(snap.promoCode ?? "");
          setPromoApplied(snap.promoApplied === true);
          const r = await fetchWithRetry("/api/cart-lines", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cityId,
              lines: snap.lines.map(({ productId, quantity }) => ({ productId, quantity })),
            }),
          });
          if (!r.ok) throw new Error(String(r.status));
          const j = (await r.json()) as { lines: ResolvedCartLine[] };
          if (cancelled) return;
          setPromo(snap.promoCode ?? "");
          setPromoApplied(snap.promoApplied === true);
          setBonusOn(snap.bonusOn === true);
          setLines(mapSnapshotToUi(snap.lines, j.lines));
          setHydrated(true);
          return;
        }

        const r = await fetchWithRetry(`/api/cart-lines?cityId=${encodeURIComponent(cityId)}`);
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { lines: ResolvedCartLine[] };
        if (cancelled) return;
        setPromo("");
        setPromoApplied(false);
        setBonusOn(false);
        setLines(
          j.lines.map((l) => ({
            ...l,
            maxQuantity: l.maxQuantity > 0 ? l.maxQuantity : l.quantity,
            listPrice: l.listPrice ?? null,
            size: "S",
            selected: true,
            favorite: false,
          })),
        );
        setHydrated(true);
      } catch {
        if (!cancelled) {
          setLines([]);
          setHydrated(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  useEffect(() => {
    if (!cityId || !hydrated) return;
    const toStore: StoredCartLine[] = lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      size: l.size,
      selected: l.selected,
    }));
    saveCheckoutCart({
      cityId,
      lines: toStore,
      promoCode: promo.trim(),
      promoApplied,
      bonusOn,
    });
  }, [cityId, lines, hydrated, promo, promoApplied, bonusOn]);

  useEffect(() => {
    const rec = loadCheckoutRecipient();
    const phone = rec?.phone?.trim() ? rec.phone : null;
    setRecipientPhone(phone);
    setPhoneDraft(phone ?? "");
  }, []);

  const closePhoneGate = useCallback(() => {
    setPhoneGateOpen(false);
    setPhoneGateStep("phone");
    setSmsCodeDraft("");
  }, []);

  const openPhoneGate = useCallback(() => {
    setPhoneGateStep("phone");
    setSmsCodeDraft("");
    setPhoneGateOpen(true);
  }, []);

  useEffect(() => {
    if (!phoneGateOpen) return;
    const id = window.setTimeout(() => {
      if (phoneGateStep === "phone") {
        phoneGatePhoneInputRef.current?.focus();
      } else {
        phoneGateCodeInputRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [phoneGateOpen, phoneGateStep]);

  const buildRecipientPayload = useCallback((raw: string): CheckoutRecipientPayload | null => {
    const phone = raw.trim();
    if (!phoneHasMinDigits(phone)) return null;
    const first = boot?.clientProfile?.firstName?.trim() || DEFAULT_DEMO_FIRST_NAME;
    const last = boot?.clientProfile?.lastName?.trim() || DEFAULT_DEMO_LAST_NAME;
    return { phone, fullName: `${last} ${first}`.trim() };
  }, [boot?.clientProfile?.firstName, boot?.clientProfile?.lastName]);

  const proceedPhoneGateToSms = useCallback(() => {
    const p = buildRecipientPayload(phoneDraft);
    if (!p) return;
    setPhoneDraft(p.phone);
    setPhoneGateStep("code");
  }, [buildRecipientPayload, phoneDraft]);

  const confirmRecipientFromSms = useCallback(() => {
    if (!/^\d{4}$/.test(smsCodeDraft)) return;
    const p = buildRecipientPayload(phoneDraft);
    if (!p) return;
    saveCheckoutRecipient(p);
    setRecipientPhone(p.phone);
    closePhoneGate();
  }, [buildRecipientPayload, closePhoneGate, phoneDraft, smsCodeDraft]);

  const selectedLines = useMemo(() => lines.filter((l) => l.selected && l.quantity > 0), [lines]);
  const selectedCount = selectedLines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = selectedLines.reduce((s, l) => s + l.price * l.quantity, 0);
  /** Сумма «до скидки» по строкам: listPrice×qty если listPrice > price, иначе price×qty */
  const listSubtotal = useMemo(
    () =>
      selectedLines.reduce((s, l) => {
        const unit = l.listPrice != null && l.listPrice > l.price ? l.listPrice : l.price;
        return s + unit * l.quantity;
      }, 0),
    [selectedLines],
  );
  const showListSubtotal = subtotal > 0 && listSubtotal > subtotal;
  const allSelected = lines.length > 0 && lines.every((l) => l.selected);
  const checkoutCopy = useMemo(() => fullCheckoutCopy(), []);

  const checkoutBonusUi = useMemo(() => {
    const cap = GJ_LOYALTY_MAX_SPEND_RUB;
    const wallet = Math.max(
      0,
      Math.floor(boot?.clientProfile?.bonusBalanceRub ?? DEFAULT_GJ_LOYALTY_WALLET_BALANCE_RUB),
    );
    const agg = sumBonusEligibleMerchFromUiLines(selectedLines);
    const merchSaleRub = agg.merchSaleRub;
    const bonusEligibleMerchRub = agg.bonusEligibleMerchRub;
    const hasDiscounted = agg.hasDiscounted;
    const minRule = GJ_BONUS_MIN_ELIGIBLE_MERCH_RUB;
    const belowMinEligible = minRule != null && bonusEligibleMerchRub < minRule;

    let unavailableReason:
      | null
      | "promo_applied"
      | "wallet_empty"
      | "no_bonus_eligible_items"
      | "below_min_eligible"
      | "empty_selection" = null;
    if (selectedCount === 0) unavailableReason = "empty_selection";
    else if (promoApplied) unavailableReason = "promo_applied";
    else if (wallet <= 0) unavailableReason = "wallet_empty";
    else if (bonusEligibleMerchRub <= 0) unavailableReason = "no_bonus_eligible_items";
    else if (belowMinEligible) unavailableReason = "below_min_eligible";

    const switchDisabled = unavailableReason != null;
    const maxBonusToApply = Math.max(
      0,
      Math.min(cap, wallet, Math.floor(bonusEligibleMerchRub), Math.floor(merchSaleRub)),
    );
    const labelsMuted = switchDisabled;

    const potentialEarnRub = Math.max(0, Math.floor(bonusEligibleMerchRub * 0.2));

    let mainText = `Можно списать до ${fmt(maxBonusToApply)} бонусами`;
    let subText: string | null = hasDiscounted ? "Только на товары без скидки" : null;
    if (selectedCount === 0) {
      mainText = "Выберите товары для расчёта бонусов";
      subText = null;
    } else if (promoApplied) {
      mainText = "Списание бонусов недоступно";
      subText = "Уже применён промокод";
    } else if (wallet <= 0) {
      if (bonusEligibleMerchRub > 0) {
        mainText = "На карте нет бонусов";
        subText = `За этот заказ начислим до ${fmt(potentialEarnRub)}`;
      } else {
        mainText = "Начисление по этому заказу недоступно";
        subText = "В корзине только товары со скидкой";
      }
    } else if (bonusEligibleMerchRub <= 0) {
      mainText = "Нет товаров для списания бонусов";
      subText = hasDiscounted ? "Бонусы не списываются на товары со скидкой" : null;
    } else if (belowMinEligible) {
      mainText = `Минимум ${fmt(minRule!)} товаров без скидки`;
      subText = "Добавьте подходящие товары";
    }

    const disclaimer =
      wallet <= 0
        ? bonusEligibleMerchRub > 0
          ? "Начисляем 20% на товары без скидки."
          : "Начисление недоступно: в корзине только товары со скидкой."
        : checkoutCopy.promoBonusBody;
    return { switchDisabled, maxBonusToApply, labelsMuted, zeroBalance: wallet <= 0, mainText, subText, disclaimer };
  }, [boot?.clientProfile?.bonusBalanceRub, checkoutCopy.promoBonusBody, promoApplied, selectedCount, selectedLines]);

  useEffect(() => {
    if (checkoutBonusUi.switchDisabled || checkoutBonusUi.maxBonusToApply <= 0) {
      setBonusOn(false);
    }
  }, [checkoutBonusUi.switchDisabled, checkoutBonusUi.maxBonusToApply]);

  const appliedBonusRub = bonusOn ? checkoutBonusUi.maxBonusToApply : 0;
  const promoDiscount = promoApplied ? Math.round(subtotal * 0.2) : 0;
  const payFinal = promoApplied
    ? Math.max(0, Math.round(subtotal * 0.8))
    : Math.max(0, subtotal - appliedBonusRub);

  const toggleSelectAll = useCallback(() => {
    const next = !allSelected;
    setLines((prev) => prev.map((l) => ({ ...l, selected: next })));
  }, [allSelected]);

  const updateQty = useCallback((productId: string, delta: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const cap = l.maxQuantity > 0 ? l.maxQuantity : l.quantity;
        const q = Math.min(cap, Math.max(0, l.quantity + delta));
        return { ...l, quantity: q };
      }),
    );
  }, []);

  const removeLine = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const toggleFavorite = useCallback((productId: string) => {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, favorite: !l.favorite } : l)));
  }, []);

  const goCheckout = () => {
    if (!cityId) return;
    saveCheckoutCart({
      cityId,
      lines: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        size: l.size,
        selected: l.selected,
      })),
      promoCode: promo.trim(),
      promoApplied,
      bonusOn,
    });
    router.push("/checkout");
  };

  if (!boot) {
    return <CartBootstrapSkeleton />;
  }

  return (
    <div className="checkout-ui relative mx-auto min-h-screen max-w-md bg-white pb-32">
      <header className="sticky top-0 z-20 border-b border-neutral-100 bg-white px-3 py-3">
        <div className="flex items-center justify-center">
          <h1 className="text-center text-base font-semibold text-neutral-900">
            Корзина{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </h1>
        </div>
      </header>

      <div className="sticky top-[49px] z-10 border-b border-neutral-100 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm font-medium text-neutral-900">
            <button
              type="button"
              role="checkbox"
              aria-checked={allSelected}
              onClick={toggleSelectAll}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold leading-none ${
                allSelected ? "border-black bg-black text-white" : "border-neutral-400 bg-white text-transparent"
              }`}
            >
              ✓
            </button>
            Выбрать все
          </label>
          {boot.cities.length > 0 ? (
            <div className="relative shrink-0">
              <select
                aria-label="Выбор города"
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                className="appearance-none rounded-full border-0 bg-transparent pl-3 pr-8 py-1.5 text-sm font-semibold text-neutral-800 shadow-none outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-900/15 focus-visible:ring-offset-0"
              >
                {boot.cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-neutral-500" aria-hidden>
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 6.5 8 10l4-3.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-4 pb-40">
        {!hydrated ? (
          <div className="py-4">
            <CartLinesSkeleton />
          </div>
        ) : lines.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-500">Корзина пуста для выбранного города.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {lines.map((line) => (
              <li key={line.productId} className="flex items-start gap-3 py-4">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={line.selected}
                  aria-label={line.selected ? "Снять выбор" : "Выбрать"}
                  onClick={() =>
                    setLines((prev) =>
                      prev.map((l) => (l.productId === line.productId ? { ...l, selected: !l.selected } : l)),
                    )
                  }
                  className="flex min-h-8 min-w-8 shrink-0 items-center justify-center self-start rounded-md [-webkit-tap-highlight-color:transparent]"
                >
                  <span
                    className={`mt-px flex h-5 w-5 items-center justify-center rounded-full border-2 text-xs font-bold leading-none ${
                      line.selected
                        ? "border-black bg-black text-white"
                        : "border-neutral-400 bg-white text-transparent"
                    }`}
                    aria-hidden
                  >
                    ✓
                  </span>
                </button>
                <div className="relative h-[120px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                  <Image
                    src={line.image || "/product-placeholder.svg"}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="92px"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-neutral-900">{line.name}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <select
                        value={line.size}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.productId === line.productId ? { ...l, size: e.target.value } : l,
                            ),
                          )
                        }
                        className="appearance-none rounded-lg border border-neutral-200 bg-white py-1.5 pl-2 pr-7 text-xs font-medium text-neutral-800"
                      >
                        {SIZES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-neutral-400">
                        ▾
                      </span>
                    </div>
                    <span className="flex flex-wrap items-baseline gap-1.5">
                      <span className="text-sm font-semibold text-neutral-900 tabular-nums">
                        {fmt(line.price * line.quantity)}
                      </span>
                      {line.listPrice != null && line.listPrice > line.price ? (
                        <span className="text-sm text-neutral-400 line-through tabular-nums">
                          {fmt(line.listPrice * line.quantity)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-1 py-0.5">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center text-neutral-600"
                        aria-label="Уменьшить или удалить"
                        onClick={() => (line.quantity <= 1 ? removeLine(line.productId) : updateQty(line.productId, -1))}
                      >
                        {line.quantity <= 1 ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
                        ) : (
                          "−"
                        )}
                      </button>
                      <span className="min-w-[2.5rem] text-center text-xs font-medium text-neutral-800">
                        {line.quantity} шт
                      </span>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center text-lg text-neutral-800 disabled:opacity-35"
                        aria-label="Добавить"
                        disabled={line.quantity >= line.maxQuantity}
                        onClick={() => updateQty(line.productId, 1)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-label="Избранное"
                      onClick={() => toggleFavorite(line.productId)}
                      className="text-xl text-neutral-400"
                    >
                      {line.favorite ? "♥" : "♡"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <section className="mt-4">
          <div className="cu-checkout-block space-y-3">
            <div>
              <p className="cu-page-title text-neutral-900">Или промокод или бонусы</p>
              <div className="mt-2.5 border-l-2 border-neutral-900 pl-2.5 text-sm leading-snug text-neutral-800">
                <p>{checkoutBonusUi.disclaimer}</p>
              </div>
            </div>
            <div className="cu-inline-field-shell">
              <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
                <input
                  type="text"
                  name="promo"
                  autoComplete="off"
                  enterKeyHint="done"
                  aria-label="Промокод"
                  className="cu-promo-input min-w-0 flex-1 border-0 bg-transparent py-2.5 text-base text-neutral-900 outline-none ring-0"
                  placeholder="Промокод"
                  value={promo}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPromo(next);
                    if (!next.trim()) {
                      setPromoApplied(false);
                    } else if (promoApplied && next.trim().toUpperCase() !== "APP20") {
                      setPromoApplied(false);
                    }
                  }}
                  disabled={bonusOn}
                />
                {promo.trim().length > 0 && !bonusOn ? (
                  <button
                    type="button"
                    aria-label="Очистить промокод"
                    onClick={() => {
                      setPromo("");
                      setPromoApplied(false);
                    }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-transparent bg-neutral-300 text-[15px] font-light leading-none text-neutral-600 transition hover:border-transparent hover:bg-neutral-300/90 hover:text-neutral-800"
                  >
                    <span aria-hidden className="-mt-px block">
                      ×
                    </span>
                  </button>
                ) : null}
              </div>
              {promo.trim().length > 0 && !promoApplied ? (
                <button
                  type="button"
                  className="shrink-0 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-800"
                  onClick={() => {
                    if (promo.trim().toUpperCase() === "APP20") {
                      setPromoApplied(true);
                      setBonusOn(false);
                    } else {
                      setPromoApplied(false);
                    }
                  }}
                  disabled={bonusOn}
                >
                  Применить
                </button>
              ) : null}
            </div>
            {promoApplied ? <p className="text-xs text-emerald-700">Применён промокод APP20 (−20%)</p> : null}
            {recipientPhone ? (
              <BonusPointsControl
                bonusOn={bonusOn}
                switchDisabled={checkoutBonusUi.switchDisabled}
                showSwitch={!checkoutBonusUi.zeroBalance}
                labelsMuted={checkoutBonusUi.labelsMuted}
                mainText={checkoutBonusUi.mainText}
                subText={checkoutBonusUi.subText}
                onToggle={(next) => {
                  setBonusOn(next);
                  if (next) setPromoApplied(false);
                }}
              />
            ) : (
              <BonusAuthBar onOpenPhoneGate={openPhoneGate} />
            )}
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-neutral-200 bg-white px-4 pt-2 [padding-bottom:max(0.5rem,env(safe-area-inset-bottom,0px))]">
        <div className="mx-auto max-w-md">
          <p className="mb-2 text-center text-[11px] text-neutral-500">
            {selectedCount > 0 ? `${selectedCount} ${pluralizeProducts(selectedCount)}` : "Нет выбранных позиций"}
          </p>
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={goCheckout}
            className="flex w-full items-center justify-between gap-3 rounded-lg bg-black px-5 py-4 text-left text-sm font-semibold uppercase tracking-wide text-white disabled:pointer-events-none disabled:opacity-40"
          >
            <span>Далее</span>
            <span className="flex items-baseline gap-2">
              {subtotal > 0 ? (
                showListSubtotal ? (
                  <>
                    <span className="text-sm font-normal text-neutral-400 line-through tabular-nums">
                      {fmt(listSubtotal)}
                    </span>
                    <span className="tabular-nums">{fmt(payFinal)}</span>
                  </>
                ) : (
                  <span className="tabular-nums">{fmt(payFinal)}</span>
                )
              ) : (
                <span>—</span>
              )}
            </span>
          </button>
        </div>
      </div>

      {phoneGateOpen ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Закрыть окно телефона"
            className="absolute inset-0"
            onClick={closePhoneGate}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 max-h-[95dvh] w-full max-w-md overflow-y-auto overscroll-y-contain rounded-t-3xl bg-white shadow-2xl sm:max-h-[95vh] sm:rounded-3xl"
          >
            <div className="sticky top-0 z-20 border-b border-neutral-100 bg-white px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
              <div className="min-w-0 flex-1 pr-1">
                {phoneGateStep === "phone" ? (
                  <>
                    <h3 className="cu-sheet-title">Подтвердите телефон</h3>
                    <p className="cu-sheet-lead mt-1">Введите номер телефона, пришлём смс-код для бонусов GJ</p>
                  </>
                ) : (
                  <>
                    <h3 className="cu-sheet-title">Введите код из SMS</h3>
                    <p className="cu-sheet-lead mt-1">Отправили код на {phoneDraft.trim() || "указанный номер"}</p>
                  </>
                )}
              </div>
            </div>
            <div className="px-5 pb-5 pt-3">
              {phoneGateStep === "phone" ? (
                <>
                  <input
                    ref={phoneGatePhoneInputRef}
                    className="cu-input-surface"
                    placeholder="+7 (___) ___-__-__"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={!phoneHasMinDigits(phoneDraft)}
                    onClick={proceedPhoneGateToSms}
                    className="mt-3 w-full rounded-lg bg-black py-3 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Получить смс с кодом
                  </button>
                </>
              ) : (
                <>
                  <input
                    ref={phoneGateCodeInputRef}
                    className="cu-input-surface text-center tracking-[0.4em] [text-indent:0.35em]"
                    placeholder="0000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={4}
                    value={smsCodeDraft}
                    onChange={(e) => setSmsCodeDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <button
                    type="button"
                    disabled={!/^\d{4}$/.test(smsCodeDraft)}
                    onClick={confirmRecipientFromSms}
                    className="mt-3 w-full rounded-lg bg-black py-3 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Подтвердить
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
