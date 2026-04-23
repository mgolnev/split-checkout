"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadCheckoutCart,
  saveCheckoutCart,
  type StoredCartLine,
} from "@/lib/checkout-cart-storage";
import { CartBootstrapSkeleton, CartLinesSkeleton } from "@/components/CartLoadingSkeleton";
import { fetchWithRetry } from "@/lib/fetch-retry";

type Bootstrap = {
  cities: { id: string; name: string }[];
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

export default function CartPage() {
  const router = useRouter();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [cityId, setCityId] = useState("");
  const [lines, setLines] = useState<UiLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

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
          setLines(mapSnapshotToUi(snap.lines, j.lines));
          setHydrated(true);
          return;
        }

        const r = await fetchWithRetry(`/api/cart-lines?cityId=${encodeURIComponent(cityId)}`);
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { lines: ResolvedCartLine[] };
        if (cancelled) return;
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
    saveCheckoutCart({ cityId, lines: toStore });
  }, [cityId, lines, hydrated]);

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
    });
    router.push("/checkout");
  };

  if (!boot) {
    return <CartBootstrapSkeleton />;
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-white pb-32">
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
                    <span className="tabular-nums">{fmt(subtotal)}</span>
                  </>
                ) : (
                  <span className="tabular-nums">{fmt(subtotal)}</span>
                )
              ) : (
                <span>—</span>
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
