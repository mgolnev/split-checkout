"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadCheckoutCart,
  saveCheckoutCart,
  type StoredCartLine,
} from "@/lib/checkout-cart-storage";

type Bootstrap = {
  cities: { id: string; name: string }[];
};

type UiLine = {
  productId: string;
  quantity: number;
  name: string;
  price: number;
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

function mapSnapshotToUi(
  stored: StoredCartLine[],
  resolved: { productId: string; quantity: number; name: string; price: number; image: string }[],
): UiLine[] {
  const resolvedById = new Map(resolved.map((r) => [r.productId, r]));
  const out: UiLine[] = [];
  for (const s of stored) {
    const r = resolvedById.get(s.productId);
    if (!r) continue;
    out.push({
      productId: s.productId,
      quantity: s.quantity,
      name: r.name,
      price: r.price,
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
    fetch("/api/bootstrap")
      .then((r) => r.json())
      .then((d: Bootstrap) => {
        if (cancelled) return;
        setBoot(d);
        const snap = loadCheckoutCart();
        const first = d.cities[0];
        if (first) setCityId(snap?.cityId && d.cities.some((c) => c.id === snap.cityId) ? snap.cityId : first.id);
      })
      .catch(() => {
        if (!cancelled) setBoot({ cities: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cityId) return;
    let cancelled = false;
    setHydrated(false);

    async function load() {
      const snap = loadCheckoutCart();
      if (snap?.cityId === cityId && snap.lines.length > 0) {
        const r = await fetch("/api/cart-lines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cityId,
            lines: snap.lines.map(({ productId, quantity }) => ({ productId, quantity })),
          }),
        });
        const j = (await r.json()) as {
          lines: { productId: string; quantity: number; name: string; price: number; image: string }[];
        };
        if (cancelled) return;
        const resolved: UiLine[] = j.lines.map((l) => ({
          ...l,
          size: "S",
          selected: true,
          favorite: false,
        }));
        setLines(mapSnapshotToUi(snap.lines, resolved));
        setHydrated(true);
        return;
      }

      const r = await fetch(`/api/cart-lines?cityId=${encodeURIComponent(cityId)}`);
      const j = (await r.json()) as {
        lines: { productId: string; quantity: number; name: string; price: number; image: string }[];
      };
      if (cancelled) return;
      setLines(
        j.lines.map((l) => ({
          ...l,
          size: "S",
          selected: true,
          favorite: false,
        })),
      );
      setHydrated(true);
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
  const allSelected = lines.length > 0 && lines.every((l) => l.selected);

  const toggleSelectAll = useCallback(() => {
    const next = !allSelected;
    setLines((prev) => prev.map((l) => ({ ...l, selected: next })));
  }, [allSelected]);

  const updateQty = useCallback((productId: string, delta: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const q = Math.max(0, l.quantity + delta);
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

  const crossedSubtotal = subtotal > 0 ? Math.round(subtotal * 1.33) : 0;

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-neutral-500">Загрузка…</div>
    );
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-white pb-36">
      <header className="sticky top-0 z-20 border-b border-neutral-100 bg-white px-3 py-3">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex h-10 w-10 items-center justify-center text-xl text-neutral-800" aria-label="На главную">
            ←
          </Link>
          <h1 className="flex-1 text-center text-base font-semibold text-neutral-900">
            Корзина{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </h1>
          <div className="w-10" />
        </div>
      </header>

      {boot.cities.length > 0 ? (
        <div className="border-b border-neutral-100 px-4 py-2">
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="shrink-0">Город</span>
            <select
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs font-medium text-neutral-900"
            >
              {boot.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="border-b border-neutral-100 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-neutral-900">
          <button
            type="button"
            role="checkbox"
            aria-checked={allSelected}
            onClick={toggleSelectAll}
            className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition ${
              allSelected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"
            }`}
          >
            {allSelected ? "✓" : null}
          </button>
          Выбрать все
        </label>
      </div>

      <div className="px-4 pb-40">
        {!hydrated ? (
          <p className="py-12 text-center text-sm text-neutral-500">Загрузка корзины…</p>
        ) : lines.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-500">Корзина пуста для выбранного города.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {lines.map((line) => (
              <li key={line.productId} className="flex gap-3 py-4">
                <button
                  type="button"
                  aria-label={line.selected ? "Снять выбор" : "Выбрать"}
                  onClick={() =>
                    setLines((prev) =>
                      prev.map((l) => (l.productId === line.productId ? { ...l, selected: !l.selected } : l)),
                    )
                  }
                  className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    line.selected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"
                  }`}
                >
                  {line.selected ? "✓" : null}
                </button>
                <div className="relative h-[104px] w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                  <Image
                    src={line.image || "/product-placeholder.svg"}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="80px"
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
                    <p className="text-sm font-semibold text-neutral-900">{fmt(line.price)}</p>
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
                        className="flex h-8 w-8 items-center justify-center text-lg text-neutral-800"
                        aria-label="Добавить"
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

      <div className="fixed bottom-14 left-0 right-0 z-10 border-t border-neutral-200 bg-white px-4 py-2">
        <div className="mx-auto max-w-md">
          <p className="mb-2 text-center text-[11px] text-neutral-500">
            {selectedCount > 0 ? `${selectedCount} ${pluralizeProducts(selectedCount)}` : "Нет выбранных позиций"}
          </p>
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={goCheckout}
            className="flex w-full items-center justify-between gap-3 rounded-full bg-neutral-900 px-5 py-3.5 text-left text-sm font-semibold text-white disabled:opacity-40"
          >
            <span>Далее</span>
            <span className="flex items-baseline gap-2">
              {subtotal > 0 ? (
                <>
                  <span className="text-sm font-normal text-red-300 line-through">{fmt(crossedSubtotal)}</span>
                  <span>{fmt(subtotal)}</span>
                </>
              ) : (
                <span>—</span>
              )}
            </span>
          </button>
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-neutral-200 bg-white px-2 pb-safe pt-2">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 text-[10px] text-neutral-500">
          <Link href="/" className="flex flex-col items-center gap-0.5 py-1 text-neutral-400">
            <span className="text-lg">⌂</span>
            <span>Главная</span>
          </Link>
          <span className="flex flex-col items-center gap-0.5 py-1 opacity-40">
            <span className="text-lg">☰</span>
            <span>Каталог</span>
          </span>
          <Link href="/cart" className="flex flex-col items-center gap-0.5 py-1 font-medium text-neutral-900">
            <span className="relative text-lg">
              🛍
              {selectedCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-0.5 text-[9px] font-bold text-white">
                  {selectedCount > 99 ? "99+" : selectedCount}
                </span>
              ) : null}
            </span>
            <span>Корзина</span>
          </Link>
          <span className="flex flex-col items-center gap-0.5 py-1 opacity-40">
            <span className="relative text-lg">
              ♡
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-0.5 text-[9px] font-bold text-white">
                20
              </span>
            </span>
            <span>Избранное</span>
          </span>
          <span className="flex flex-col items-center gap-0.5 py-1 opacity-40">
            <span className="text-lg">👤</span>
            <span>Профиль</span>
          </span>
        </div>
      </nav>
    </div>
  );
}
