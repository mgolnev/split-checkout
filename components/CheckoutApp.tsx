"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AlternativeLineOption, AlternativeMethodOption, ScenarioPart, ScenarioResult } from "@/lib/types";

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
  methodSummaryByCity: Record<
    string,
    Record<
      "courier" | "pickup" | "pvz",
      { totalUnits: number; availableUnits: number; fullStoreCount: number; hasSplit: boolean }
    >
  >;
  pickupSummaryByStore: Record<
    string,
    Record<
      string,
      {
        totalUnits: number;
        availableUnits: number;
        reserveUnits: number;
        collectUnits: number;
        remainderUnits: number;
        hasFullCoverage: boolean;
        hasSplit: boolean;
      }
    >
  >;
};

type MethodSummary = Bootstrap["methodSummaryByCity"][string]["courier"];
type PickupStoreSummary = Bootstrap["pickupSummaryByStore"][string][string];
type PickupStoreOption = {
  id: string;
  name: string;
  summary?: PickupStoreSummary;
};

type PvzPointOption = Bootstrap["pvzByCity"][string][number];

type PartDeliverySchedule = {
  dateIx: number;
  slotIx: number;
};

type SelectedAlternativeOption = {
  productId: string;
  option: AlternativeMethodOption;
};

type CourierAddressModalTarget =
  | { kind: "primary" }
  | { kind: "alternative"; productId: string; option: AlternativeMethodOption };

const fmt = (n: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(
    n,
  );

function pluralizeDays(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

function pluralizeShipments(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "отправление";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "отправления";
  return "отправлений";
}

const MOCK_DATES = ["Завтра, 9 апр.", "10 апр.", "11 апр.", "12 апр."];
const MOCK_SLOTS = ["9:00–12:00", "12:00–15:00", "15:00–18:00"];
const PICKUP_MAP_POSITIONS = [
  { left: "14%", top: "22%" },
  { left: "72%", top: "18%" },
  { left: "48%", top: "38%" },
  { left: "24%", top: "66%" },
  { left: "74%", top: "68%" },
  { left: "52%", top: "82%" },
] as const;

const modeLabel = (mode: ScenarioPart["mode"]) => {
  if (mode === "click_reserve") return "самовывоз (click reserve)";
  if (mode === "click_collect") return "самовывоз (click collect)";
  if (mode === "pvz") return "ПВЗ";
  return "курьер";
};

const methodOrder = { courier: 0, pickup: 1, pvz: 2 } as const;

function methodSummaryLabel(
  code: "courier" | "pickup" | "pvz",
  summary: MethodSummary | undefined,
  enabled: boolean,
) {
  if (!enabled) return "Недоступно для выбранного города";
  if (!summary) return "";
  if (summary.totalUnits <= 0) return "";
  if (code === "pickup") {
    if (summary.fullStoreCount > 0) {
      return `Все ${summary.totalUnits} товаров доступны не во всех магазинах`;
    }
    if (!summary.hasSplit) return "";
    if (summary.availableUnits <= 0) return `0 из ${summary.totalUnits} товаров`;
    return `До ${summary.availableUnits} из ${summary.totalUnits} товаров зависит от магазина`;
  }
  if (!summary.hasSplit) return "";
  if (summary.availableUnits <= 0) return `0 из ${summary.totalUnits} товаров`;
  return `${summary.availableUnits} из ${summary.totalUnits} товаров`;
}

function pickupStoreRank(summary?: PickupStoreSummary) {
  if (!summary || summary.availableUnits <= 0) return 0;
  if (summary.hasFullCoverage && summary.collectUnits === 0) return 4;
  if (summary.hasFullCoverage) return 3;
  return 2;
}

function pickupStoreCountLabel(summary?: PickupStoreSummary) {
  if (!summary || summary.totalUnits <= 0) return "Нет данных";
  if (summary.availableUnits <= 0) return `0 из ${summary.totalUnits} товаров`;
  return `${summary.availableUnits} из ${summary.totalUnits} товаров`;
}

function pickupStoreStatusTitle(summary?: PickupStoreSummary) {
  if (!summary || summary.availableUnits <= 0) return "Нет доступных товаров";
  if (summary.hasFullCoverage && summary.collectUnits === 0) return "Все товары доступны сразу";
  if (summary.hasFullCoverage) return "Все товары доступны";
  return "Доступна только часть заказа";
}

function pickupStoreStatusDetail(summary?: PickupStoreSummary) {
  if (!summary || summary.availableUnits <= 0) return "Для этого магазина корзина недоступна.";
  if (summary.hasFullCoverage && summary.collectUnits === 0) {
    return `Все ${summary.totalUnits} товаров готовы к выдаче в магазине.`;
  }
  const parts: string[] = [];
  if (summary.reserveUnits > 0) parts.push(`${summary.reserveUnits} доступны сразу`);
  if (summary.collectUnits > 0) parts.push(`${summary.collectUnits} привезем в магазин`);
  if (summary.remainderUnits > 0) parts.push(`${summary.remainderUnits} пока недоступны`);
  return parts.join(", ") + ".";
}

function pickupStoreTone(summary?: PickupStoreSummary) {
  if (!summary || summary.availableUnits <= 0) {
    return {
      marker: "border-neutral-300 bg-white text-neutral-500",
      accent: "bg-neutral-100 text-neutral-700",
      card: "border-neutral-200 bg-white",
    };
  }
  if (summary.hasFullCoverage && summary.collectUnits === 0) {
    return {
      marker: "border-emerald-600 bg-emerald-600 text-white",
      accent: "bg-emerald-100 text-emerald-800",
      card: "border-emerald-200 bg-emerald-50/60",
    };
  }
  if (summary.hasFullCoverage) {
    return {
      marker: "border-blue-600 bg-blue-600 text-white",
      accent: "bg-blue-100 text-blue-800",
      card: "border-blue-200 bg-blue-50/60",
    };
  }
  return {
    marker: "border-amber-500 bg-amber-500 text-white",
    accent: "bg-amber-100 text-amber-800",
    card: "border-amber-200 bg-amber-50/60",
  };
}

function pvzPointCountLabel(summary?: MethodSummary) {
  if (!summary || summary.totalUnits <= 0) return "Нет данных";
  if (summary.availableUnits <= 0) return `0 из ${summary.totalUnits} товаров`;
  return `${summary.availableUnits} из ${summary.totalUnits} товаров`;
}

function pvzPointStatusTitle(summary?: MethodSummary) {
  if (!summary || summary.totalUnits <= 0) return "Нет данных";
  if (summary.availableUnits <= 0) return "Недоступно";
  if (summary.availableUnits >= summary.totalUnits) return "Все товары доступны";
  return "Доступна часть заказа";
}

function pvzPointStatusDetail(summary?: MethodSummary) {
  if (!summary || summary.totalUnits <= 0) return "Нет данных по текущей корзине.";
  if (summary.availableUnits <= 0) return "Для этой корзины получение в ПВЗ недоступно.";
  if (summary.availableUnits >= summary.totalUnits) {
    return `Все ${summary.totalUnits} товаров можно получить через пункт выдачи заказа.`;
  }
  return `Через ПВЗ можно оформить ${summary.availableUnits} из ${summary.totalUnits} товаров. Остальные потребуется оформить другим способом.`;
}

function pvzPointTone(summary?: MethodSummary) {
  if (!summary || summary.availableUnits <= 0) {
    return {
      marker: "border-neutral-300 bg-white text-neutral-500",
      accent: "bg-neutral-100 text-neutral-700",
      card: "border-neutral-200 bg-white",
    };
  }
  if (summary.availableUnits >= summary.totalUnits) {
    return {
      marker: "border-emerald-600 bg-emerald-600 text-white",
      accent: "bg-emerald-100 text-emerald-800",
      card: "border-emerald-200 bg-emerald-50/60",
    };
  }
  return {
    marker: "border-amber-500 bg-amber-500 text-white",
    accent: "bg-amber-100 text-amber-800",
    card: "border-amber-200 bg-amber-50/60",
  };
}

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

function PickupStoreSelector({
  stores,
  selectedStoreId,
  onSelect,
}: {
  stores: PickupStoreOption[];
  selectedStoreId: string;
  onSelect: (storeId: string) => void;
}) {
  if (stores.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        В этом городе пока нет активных магазинов для самовывоза.
      </div>
    );
  }

  const selectedStore = stores.find((store) => store.id === selectedStoreId) ?? stores[0]!;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-neutral-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Карта магазинов</p>
            <p className="text-xs text-neutral-500">Схема доступности без точной географии.</p>
          </div>
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase text-neutral-500 shadow-sm">
            {selectedStore.name}
          </span>
        </div>
        <div className="relative h-52 overflow-hidden rounded-xl border border-white/80 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(226,232,240,0.92))]">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%),linear-gradient(transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%)]" />
          {stores.map((store, index) => {
            const tone = pickupStoreTone(store.summary);
            const pos = PICKUP_MAP_POSITIONS[index % PICKUP_MAP_POSITIONS.length]!;
            const selected = selectedStoreId === store.id;
            return (
              <button
                key={store.id}
                type="button"
                onClick={() => onSelect(store.id)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2 py-1 text-[11px] font-semibold shadow-sm transition ${tone.marker} ${selected ? "scale-110 ring-4 ring-black/10" : ""}`}
                style={{ left: pos.left, top: pos.top }}
                aria-pressed={selected}
                aria-label={`${store.name}. ${pickupStoreCountLabel(store.summary)}. ${pickupStoreStatusTitle(store.summary)}.`}
              >
                {store.summary?.availableUnits ?? 0}/{store.summary?.totalUnits ?? 0}
              </button>
            );
          })}
        </div>
        <div className="mt-3 rounded-xl bg-white/90 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{selectedStore.name}</p>
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${pickupStoreTone(selectedStore.summary).accent}`}>
              {pickupStoreStatusTitle(selectedStore.summary)}
            </span>
          </div>
          <p className="mt-2 text-sm text-neutral-900">{pickupStoreCountLabel(selectedStore.summary)}</p>
          <p className="mt-1 text-xs text-neutral-500">{pickupStoreStatusDetail(selectedStore.summary)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {stores.map((store) => {
          const tone = pickupStoreTone(store.summary);
          const selected = selectedStoreId === store.id;
          return (
            <button
              key={store.id}
              type="button"
              onClick={() => onSelect(store.id)}
              className={`w-full rounded-xl border p-3 text-left transition ${selected ? `${tone.card} border-black` : "border-neutral-200 bg-white hover:border-neutral-300"}`}
              aria-pressed={selected}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{store.name}</div>
                  <div className="mt-1 text-sm text-neutral-900">{pickupStoreCountLabel(store.summary)}</div>
                  <div className="mt-1 text-xs text-neutral-500">{pickupStoreStatusDetail(store.summary)}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${tone.accent}`}>
                  {pickupStoreStatusTitle(store.summary)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-600">
                <span className="rounded-full bg-neutral-100 px-2 py-1">
                  Сразу: {store.summary?.reserveUnits ?? 0}
                </span>
                <span className="rounded-full bg-neutral-100 px-2 py-1">
                  Привезем: {store.summary?.collectUnits ?? 0}
                </span>
                <span className="rounded-full bg-neutral-100 px-2 py-1">
                  Недоступно: {store.summary?.remainderUnits ?? 0}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PickupSelectedStoreCard({
  store,
  onChange,
  embedded = false,
}: {
  store?: PickupStoreOption;
  onChange: () => void;
  embedded?: boolean;
}) {
  if (!store) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        Магазин пока не выбран.
      </div>
    );
  }

  const tone = pickupStoreTone(store.summary);
  return (
    <div className={embedded ? "mt-3" : `rounded-xl border p-4 ${tone.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{store.name}</p>
          <p className="mt-1 text-sm text-neutral-900">{pickupStoreCountLabel(store.summary)}</p>
          <p className="mt-1 text-xs text-neutral-500">{pickupStoreStatusDetail(store.summary)}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange();
          }}
          className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium ${
            embedded ? "border-neutral-300 bg-white" : "border-neutral-300 bg-white"
          }`}
        >
          Изменить
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-600">
        <span className={`rounded-full px-2 py-1 ${embedded ? "bg-neutral-100" : "bg-white/80"}`}>
          Сразу: {store.summary?.reserveUnits ?? 0}
        </span>
        <span className={`rounded-full px-2 py-1 ${embedded ? "bg-neutral-100" : "bg-white/80"}`}>
          Привезем: {store.summary?.collectUnits ?? 0}
        </span>
        <span className={`rounded-full px-2 py-1 ${embedded ? "bg-neutral-100" : "bg-white/80"}`}>
          Недоступно: {store.summary?.remainderUnits ?? 0}
        </span>
      </div>
    </div>
  );
}

function PvzPointSelector({
  points,
  selectedPointId,
  summary,
  onSelect,
}: {
  points: PvzPointOption[];
  selectedPointId: string;
  summary?: MethodSummary;
  onSelect: (pointId: string) => void;
}) {
  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        В этом городе пока нет доступных ПВЗ.
      </div>
    );
  }

  const selectedPoint = points.find((point) => point.id === selectedPointId) ?? points[0]!;
  const tone = pvzPointTone(summary);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-neutral-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Карта ПВЗ</p>
            <p className="text-xs text-neutral-500">Схема пунктов выдачи без точной географии.</p>
          </div>
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase text-neutral-500 shadow-sm">
            {selectedPoint.name}
          </span>
        </div>
        <div className="relative h-52 overflow-hidden rounded-xl border border-white/80 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(226,232,240,0.92))]">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%),linear-gradient(transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%)]" />
          {points.map((point, index) => {
            const pos = PICKUP_MAP_POSITIONS[index % PICKUP_MAP_POSITIONS.length]!;
            const selected = selectedPointId === point.id;
            return (
              <button
                key={point.id}
                type="button"
                onClick={() => onSelect(point.id)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2 py-1 text-[11px] font-semibold shadow-sm transition ${tone.marker} ${selected ? "scale-110 ring-4 ring-black/10" : ""}`}
                style={{ left: pos.left, top: pos.top }}
                aria-pressed={selected}
                aria-label={`${point.name}. ${pvzPointCountLabel(summary)}. ${pvzPointStatusTitle(summary)}.`}
              >
                {summary?.availableUnits ?? 0}/{summary?.totalUnits ?? 0}
              </button>
            );
          })}
        </div>
        <div className="mt-3 rounded-xl bg-white/90 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{selectedPoint.name}</p>
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${tone.accent}`}>
              {pvzPointStatusTitle(summary)}
            </span>
          </div>
          <p className="mt-2 text-sm text-neutral-900">{selectedPoint.address}</p>
          <p className="mt-2 text-sm text-neutral-900">{pvzPointCountLabel(summary)}</p>
          <p className="mt-1 text-xs text-neutral-500">{pvzPointStatusDetail(summary)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {points.map((point) => {
          const selected = selectedPointId === point.id;
          return (
            <button
              key={point.id}
              type="button"
              onClick={() => onSelect(point.id)}
              className={`w-full rounded-xl border p-3 text-left transition ${selected ? `${tone.card} border-black` : "border-neutral-200 bg-white hover:border-neutral-300"}`}
              aria-pressed={selected}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{point.name}</div>
                  <div className="mt-1 text-sm text-neutral-900">{point.address}</div>
                  <div className="mt-1 text-xs text-neutral-500">{pvzPointStatusDetail(summary)}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${tone.accent}`}>
                  {pvzPointCountLabel(summary)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-600">
                <span className="rounded-full bg-neutral-100 px-2 py-1">Доступно: {summary?.availableUnits ?? 0}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-1">
                  Недоступно: {Math.max(0, (summary?.totalUnits ?? 0) - (summary?.availableUnits ?? 0))}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PvzSelectedPointCard({
  point,
  summary,
  onChange,
}: {
  point?: PvzPointOption;
  summary?: MethodSummary;
  onChange: () => void;
}) {
  if (!point) {
    return (
      <div className="mt-3 text-sm text-neutral-500">
        Пункт выдачи пока не выбран.
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{point.name}</p>
          <p className="mt-1 text-sm text-neutral-900">{pvzPointCountLabel(summary)}</p>
          <p className="mt-1 text-xs text-neutral-500">{point.address}</p>
          <p className="mt-1 text-xs text-neutral-500">{pvzPointStatusDetail(summary)}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange();
          }}
          className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium"
        >
          Изменить
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-600">
        <span className="rounded-full bg-neutral-100 px-2 py-1">Доступно: {summary?.availableUnits ?? 0}</span>
        <span className="rounded-full bg-neutral-100 px-2 py-1">
          Недоступно: {Math.max(0, (summary?.totalUnits ?? 0) - (summary?.availableUnits ?? 0))}
        </span>
      </div>
    </div>
  );
}

function CourierAddressCard({
  address,
  onChange,
}: {
  address?: string;
  onChange: () => void;
}) {
  if (!address) {
    return (
      <div className="mt-3 text-sm text-neutral-500">
        Укажите адрес, чтобы увидеть доступные курьерские отправления.
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Адрес доставки</p>
          <p className="mt-1 text-sm text-neutral-900">{address}</p>
          <p className="mt-1 text-xs text-neutral-500">Курьер привезет заказ по указанному адресу.</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange();
          }}
          className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium"
        >
          Изменить
        </button>
      </div>
    </div>
  );
}

function AlternativePickupStorePicker({
  product,
  quantity,
  options,
  onSelect,
  onClose,
}: {
  product?: Bootstrap["products"][number];
  quantity: number;
  options: AlternativeMethodOption[];
  onSelect: (option: AlternativeMethodOption) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <button type="button" aria-label="Закрыть выбор магазина" className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Выберите другой магазин</h3>
            <p className="mt-1 text-sm text-neutral-500">
              {product?.name ?? "Товар"} недоступен в текущем магазине. Покажем магазины, где его можно оформить самовывозом.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-200 px-3 py-1 text-sm"
          >
            Закрыть
          </button>
        </div>
        <div className="space-y-2">
          {options.map((option) => (
            <button
              key={`${option.methodCode}_${option.storeId ?? "default"}`}
              type="button"
              onClick={() => onSelect(option)}
              className="w-full rounded-xl border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{option.storeName}</p>
                  <p className="mt-1 text-sm text-neutral-900">Доступно: {option.availableUnits} из {quantity}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {option.scenario.parts.length > 1
                      ? "Часть товара доступна сразу, часть привезем в магазин."
                      : "Товар можно оформить самовывозом в этом магазине."}
                  </p>
                </div>
                <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold uppercase text-neutral-600">
                  Самовывоз
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CourierAddressModal({
  initialValue,
  target,
  onClose,
  onSave,
}: {
  initialValue: string;
  target: CourierAddressModalTarget;
  onClose: () => void;
  onSave: (address: string, target: CourierAddressModalTarget) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <button type="button" aria-label="Закрыть ввод адреса" className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Куда доставить?</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Укажите адрес, чтобы мы могли показать и оформить курьерскую доставку.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-200 px-3 py-1 text-sm"
          >
            Закрыть
          </button>
        </div>
        <label className="block text-xs font-medium text-neutral-500">Адрес</label>
        <textarea
          className="mt-2 min-h-24 w-full rounded-xl border border-neutral-200 px-3 py-3 text-sm"
          placeholder="Москва, улица, дом, подъезд, квартира"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onSave(value.trim(), target)}
            disabled={!value.trim()}
            className="flex-1 rounded-xl bg-black py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Подтвердить адрес
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function AlternativeMethodChooser({
  line,
  product,
  currentMethod,
  selectedOption,
  children,
  onSelect,
}: {
  line: AlternativeLineOption;
  product?: Bootstrap["products"][number];
  currentMethod: "courier" | "pickup" | "pvz" | null;
  selectedOption?: AlternativeMethodOption;
  children?: ReactNode;
  onSelect: (option: AlternativeMethodOption) => void;
}) {
  const pickupOptions = line.options.filter((option) => option.methodCode === "pickup");
  const courierOption = line.options.find((option) => option.methodCode === "courier");
  const pvzOption = line.options.find((option) => option.methodCode === "pvz");
  const preferredLabel =
    currentMethod === "pickup"
      ? "Товар недоступен в выбранном магазине. Можно выбрать другой магазин или оформить доставку."
      : "Для выбранного способа товар недоступен. Выберите другой способ получения.";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{product?.name ?? line.productId}</p>
          <p className="mt-1 text-xs text-neutral-500">{preferredLabel}</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold uppercase text-neutral-600">
          × {line.quantity}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {pickupOptions.length > 0 ? (
          <button
            type="button"
            onClick={() => onSelect(pickupOptions[0]!)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              selectedOption?.methodCode === "pickup" ? "border-black bg-black text-white" : "border-neutral-200 bg-white"
            }`}
          >
            {pickupOptions.length > 1 ? "Выбрать другой магазин" : `Самовывоз · ${pickupOptions[0]?.storeName ?? "магазин"}`}
          </button>
        ) : null}
        {courierOption ? (
          <button
            type="button"
            onClick={() => onSelect(courierOption)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              selectedOption?.methodCode === "courier" ? "border-black bg-black text-white" : "border-neutral-200 bg-white"
            }`}
          >
            Доставить курьером
          </button>
        ) : null}
        {pvzOption ? (
          <button
            type="button"
            onClick={() => onSelect(pvzOption)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              selectedOption?.methodCode === "pvz" ? "border-black bg-black text-white" : "border-neutral-200 bg-white"
            }`}
          >
            В ПВЗ
          </button>
        ) : null}
      </div>

      {selectedOption && children ? (
        <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
          <p className="text-xs text-neutral-500">Оформим этот товар выбранным способом:</p>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function PartCard({
  part,
  included,
  onToggle,
  showSelectionControl = true,
  expanded,
  collapsible,
  onToggleExpand,
  totalCartUnits,
  promoFactor,
  showRemainderHint,
  remainderKeepHint,
  partPromoDiscount,
  partBonusUsed,
  showSplitMeta,
  selectedDateIx,
  selectedSlotIx,
  onDateChange,
  onSlotChange,
}: {
  part: ScenarioPart;
  included: boolean;
  onToggle: () => void;
  showSelectionControl?: boolean;
  expanded: boolean;
  collapsible: boolean;
  onToggleExpand: () => void;
  totalCartUnits: number;
  promoFactor: number;
  /** Показываем подсказку только если реально есть remainder и текст не отключён в админке. */
  showRemainderHint: boolean;
  remainderKeepHint?: string;
  partPromoDiscount: number;
  partBonusUsed: number;
  showSplitMeta: boolean;
  selectedDateIx?: number;
  selectedSlotIx?: number;
  onDateChange?: (dateIx: number) => void;
  onSlotChange?: (slotIx: number) => void;
}) {
  const visible = part.items.slice(0, 5);
  const extra = part.items.reduce((s, i) => s + i.quantity, 0) - visible.reduce((s, i) => s + i.quantity, 0);
  const sub = Math.round(part.subtotal * promoFactor);
  const ship = included ? part.deliveryPrice : 0;
  const isCourier = part.mode === "courier";
  const deliveryDate = isCourier ? MOCK_DATES[selectedDateIx ?? 0] : null;
  const deliverySlot = isCourier ? MOCK_SLOTS[selectedSlotIx ?? 0] : null;
  const leadLabel = isCourier && deliveryDate && deliverySlot ? `${deliveryDate}, ${deliverySlot}` : part.leadTimeLabel;
  const itemsCount = part.items.reduce((s, i) => s + i.quantity, 0);
  const collapsedSummary = showSplitMeta ? `${itemsCount} из ${totalCartUnits} товаров` : `${itemsCount} товар(ов)`;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className={`flex items-start ${showSelectionControl ? "gap-3" : ""}`}>
        {showSelectionControl ? (
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
        ) : null}
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
            onClick={collapsible ? onToggleExpand : undefined}
            className="mt-2 flex w-full items-center justify-between rounded-lg bg-[var(--gj-beige)] px-3 py-2 text-left text-sm font-medium"
          >
            <div className="min-w-0">
              <p>{collapsedSummary}</p>
              <p className="mt-0.5 text-xs font-normal text-neutral-500">{leadLabel}</p>
            </div>
            <div className="ml-3 flex items-center gap-3">
              <span className="text-sm font-semibold">{fmt(sub + ship)}</span>
              {collapsible ? <span className="text-neutral-500">{expanded ? "⌃" : "⌄"}</span> : null}
            </div>
          </button>
          {expanded && isCourier ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold">Доставим — {deliveryDate}</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {MOCK_DATES.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onDateChange?.(i)}
                    className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium ${
                      i === (selectedDateIx ?? 0) ? "border-black bg-black text-white" : "border-neutral-200"
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
                    onClick={() => onSlotChange?.(i)}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      i === (selectedSlotIx ?? 0) ? "border-black bg-black text-white" : "border-neutral-200"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {expanded && part.holdDays ? (
            <p className="mt-2 text-xs text-neutral-500">
              Срок хранения: {part.holdDays} {pluralizeDays(part.holdDays)}
            </p>
          ) : null}
          {expanded ? (
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
          ) : null}
          {expanded && showRemainderHint && remainderKeepHint ? (
            <p className="mt-2 text-xs text-neutral-500">{remainderKeepHint}</p>
          ) : null}
          {expanded ? (
            <>
              <div className="mt-3 flex justify-between text-sm">
                <span className="text-neutral-600">{showSplitMeta ? "Часть заказа" : "Заказ"}</span>
                <span className="font-medium">{fmt(sub + ship)}</span>
              </div>
              <div className="mt-1 space-y-1 text-xs text-neutral-500">
                <div className="flex justify-between gap-3">
                  <span>Товары</span>
                  <span>{fmt(sub)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Доставка</span>
                  <span>{ship > 0 ? fmt(ship) : "Бесплатно"}</span>
                </div>
                {ship > 0 && part.freeDeliveryThreshold > 0 ? (
                  <p>Бесплатная доставка от {fmt(part.freeDeliveryThreshold)}</p>
                ) : null}
              </div>
            </>
          ) : null}
          {expanded && partPromoDiscount > 0 ? (
            <div className="mt-1 flex justify-between text-xs text-red-600">
              <span>Скидка по части</span>
              <span>− {fmt(partPromoDiscount)}</span>
            </div>
          ) : null}
          {expanded && partBonusUsed > 0 ? (
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
  const [method, setMethod] = useState<"courier" | "pickup" | "pvz" | null>(null);
  const [pickupSelectorOpen, setPickupSelectorOpen] = useState(false);
  const [pvzSelectorOpen, setPvzSelectorOpen] = useState(false);
  const [storeId, setStoreId] = useState<string>("");
  const [pvzId, setPvzId] = useState<string>("");
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [alternativeLines, setAlternativeLines] = useState<AlternativeLineOption[]>([]);
  const [selectedAlternatives, setSelectedAlternatives] = useState<Record<string, SelectedAlternativeOption>>({});
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [partSchedules, setPartSchedules] = useState<Record<string, PartDeliverySchedule>>({});
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [bonusOn, setBonusOn] = useState(false);
  const [phone, setPhone] = useState("");
  const [courierAddress, setCourierAddress] = useState("");
  const [courierAddressModalTarget, setCourierAddressModalTarget] = useState<CourierAddressModalTarget | null>(null);
  const [alternativePickupLineId, setAlternativePickupLineId] = useState<string | null>(null);
  const [expandedParts, setExpandedParts] = useState<Record<string, boolean>>({});

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
    if (!cityId || !method || (method === "courier" && !courierAddress.trim())) {
      setScenario(null);
      setAlternativeLines([]);
      setSelectedAlternatives({});
      setIncluded({});
      setLoading(false);
      return;
    }
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
      setAlternativeLines((data.alternativeLines ?? []) as AlternativeLineOption[]);
      setSelectedAlternatives({});
      const next: Record<string, boolean> = {};
      for (const p of sc.parts) next[p.key] = p.defaultIncluded;
      setIncluded(next);
    } finally {
      setLoading(false);
    }
  }, [cityId, method, storeId, courierAddress]);

  useEffect(() => {
    void refreshScenario();
  }, [refreshScenario]);

  useEffect(() => {
    if (!boot || !cityId) return;
    const pvz = (boot.pvzByCity[cityId] ?? []).filter((p) => !p.requiresPrepayment);
    if (pvz.length && !pvz.find((p) => p.id === pvzId)) {
      setPvzId(pvz[0]!.id);
    }
  }, [boot, cityId, pvzId]);

  const availableMethods = useMemo(() => {
    if (!boot || !cityId) return boot?.deliveryMethods ?? [];
    const allowed = new Set(boot.allowedMethodsByCity[cityId] ?? []);
    return boot.deliveryMethods.filter((m) => allowed.has(m.code));
  }, [boot, cityId]);

  const deliveryOptions = useMemo(() => {
    if (!boot) return [];
    const allowed = new Set(boot.allowedMethodsByCity[cityId] ?? []);
    return [...boot.deliveryMethods].sort(
      (a, b) =>
        methodOrder[a.code as keyof typeof methodOrder] - methodOrder[b.code as keyof typeof methodOrder],
    ).map((m) => ({
      ...m,
      enabled: allowed.has(m.code),
      summary: boot.methodSummaryByCity[cityId]?.[m.code as "courier" | "pickup" | "pvz"],
    }));
  }, [boot, cityId]);

  const pickupStores = useMemo(() => {
    if (!boot) return [] as PickupStoreOption[];
    const rawStores = boot.storesByCity[cityId] ?? [];
    const summaries = boot.pickupSummaryByStore[cityId] ?? {};

    return rawStores
      .map((store) => ({
        ...store,
        summary: summaries[store.id],
      }))
      .sort((a, b) => {
        const rankDiff = pickupStoreRank(b.summary) - pickupStoreRank(a.summary);
        if (rankDiff !== 0) return rankDiff;
        const unitsDiff = (b.summary?.availableUnits ?? 0) - (a.summary?.availableUnits ?? 0);
        if (unitsDiff !== 0) return unitsDiff;
        const collectDiff = (a.summary?.collectUnits ?? 0) - (b.summary?.collectUnits ?? 0);
        if (collectDiff !== 0) return collectDiff;
        return a.name.localeCompare(b.name, "ru");
      });
  }, [boot, cityId]);
  const selectedPickupStore = pickupStores.find((store) => store.id === storeId);
  const pvzOptions = (boot?.pvzByCity[cityId] ?? []).filter((p) => !p.requiresPrepayment);
  const selectedPvzPoint = pvzOptions.find((point) => point.id === pvzId);
  const pvzSummary = boot?.methodSummaryByCity[cityId]?.pvz;
  const activeAlternativePickupLine = alternativePickupLineId
    ? alternativeLines.find((line) => line.productId === alternativePickupLineId)
    : null;
  const alternativePickupOptions = (activeAlternativePickupLine?.options ?? []).filter((option) => option.methodCode === "pickup");

  useEffect(() => {
    if (method && !availableMethods.some((m) => m.code === method)) {
      setMethod(null);
    }
  }, [availableMethods, method]);

  useEffect(() => {
    if (method !== "pickup") return;
    if (!pickupStores.length) {
      if (storeId) setStoreId("");
      return;
    }
    if (!pickupStores.some((store) => store.id === storeId)) {
      setStoreId(pickupStores[0]!.id);
    }
  }, [method, pickupStores, storeId]);

  useEffect(() => {
    if (method !== "pickup") {
      setPickupSelectorOpen(false);
    }
  }, [method]);

  useEffect(() => {
    if (method !== "pvz") {
      setPvzSelectorOpen(false);
    }
  }, [method]);

  useEffect(() => {
    setScenario(null);
    setAlternativeLines([]);
    setSelectedAlternatives({});
    setIncluded({});
  }, [cityId]);

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
  const promoFactor = promoApplied ? 0.8 : 1;
  const [distribution, setDistribution] = useState<Record<string, { promoDiscount: number; bonusUsed: number }>>({});

  const { selectedAlternativeParts, selectedAlternativePartsByProductId } = useMemo(() => {
    const byProductId: Record<string, ScenarioPart[]> = {};

    for (const { productId, option } of Object.values(selectedAlternatives)) {
      byProductId[productId] = option.scenario.parts.map((part, index) => ({
        ...part,
        key: `alt_${productId}_${option.methodCode}_${option.storeId ?? "default"}_${index}_${part.key}`,
        canToggle: false,
        defaultIncluded: true,
      }));
    }

    return {
      selectedAlternativeParts: Object.values(byProductId).flat(),
      selectedAlternativePartsByProductId: byProductId,
    };
  }, [selectedAlternatives]);

  const { includedMerch, partsTotal, includedParts } = useMemo(() => {
    if (!scenario) {
      return {
        includedMerch: 0,
        partsTotal: 0,
        includedParts: selectedAlternativeParts,
      };
    }
    let merch = 0;
    let t = 0;
    const parts: ScenarioPart[] = [];
    for (const p of scenario.parts) {
      if (included[p.key] === false) continue;
      parts.push(p);
      merch += p.subtotal;
      t += Math.round(p.subtotal * promoFactor) + p.deliveryPrice;
    }
    for (const part of selectedAlternativeParts) {
      parts.push(part);
      merch += part.subtotal;
      t += Math.round(part.subtotal * promoFactor) + part.deliveryPrice;
    }
    return { includedMerch: merch, partsTotal: t, includedParts: parts };
  }, [scenario, included, promoFactor, selectedAlternativeParts]);

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

  useEffect(() => {
    if (!scenario && selectedAlternativeParts.length === 0) {
      setPartSchedules({});
      return;
    }
    setPartSchedules((prev) => {
      const next: Record<string, PartDeliverySchedule> = {};
      for (const part of [...(scenario?.parts ?? []), ...selectedAlternativeParts]) {
        if (part.mode !== "courier") continue;
        next[part.key] = prev[part.key] ?? { dateIx: 0, slotIx: 0 };
      }
      return next;
    });
  }, [scenario, selectedAlternativeParts]);

  useEffect(() => {
    if (!scenario && selectedAlternativeParts.length === 0) {
      setExpandedParts({});
      return;
    }
    setExpandedParts((prev) => {
      const next: Record<string, boolean> = {};
      for (const part of [...(scenario?.parts ?? []), ...selectedAlternativeParts]) {
        next[part.key] = prev[part.key] ?? part.key.startsWith("alt_");
      }
      return next;
    });
  }, [scenario, selectedAlternativeParts]);

  const manualExcludedLines = useMemo(() => {
    const map = new Map<string, { productId: string; quantity: number; name: string }>();
    for (const part of scenario?.parts ?? []) {
      if (included[part.key] !== false) continue;
      for (const item of part.items) {
        const current = map.get(item.productId);
        if (current) {
          current.quantity += item.quantity;
        } else {
          map.set(item.productId, {
            productId: item.productId,
            quantity: item.quantity,
            name: item.name,
          });
        }
      }
    }
    return [...map.values()];
  }, [scenario, included]);

  const handlePromo = () => {
    if (promo.trim().toUpperCase() === "APP20") {
      setPromoApplied(true);
      setBonusOn(false);
    }
  };

  const selectPrimaryMethod = (nextMethod: "courier" | "pickup" | "pvz") => {
    if (nextMethod === "courier") {
      if (courierAddress.trim()) {
        setMethod("courier");
      } else {
        setCourierAddressModalTarget({ kind: "primary" });
      }
      return;
    }
    setMethod(nextMethod);
  };

  const selectAlternativeOption = (line: AlternativeLineOption, option: AlternativeMethodOption) => {
    if (option.methodCode === "courier" && !courierAddress.trim()) {
      setCourierAddressModalTarget({ kind: "alternative", productId: line.productId, option });
      return;
    }
    if (option.methodCode === "pickup") {
      const pickupOptions = line.options.filter((candidate) => candidate.methodCode === "pickup");
      if (pickupOptions.length > 1) {
        setAlternativePickupLineId(line.productId);
        return;
      }
    }
    setSelectedAlternatives((prev) => ({
      ...prev,
      [line.productId]: { productId: line.productId, option },
    }));
  };

  const handleCourierAddressSave = (address: string, target: CourierAddressModalTarget) => {
    setCourierAddress(address);
    setCourierAddressModalTarget(null);
    if (target.kind === "primary") {
      setMethod("courier");
      return;
    }
    setSelectedAlternatives((prev) => ({
      ...prev,
      [target.productId]: { productId: target.productId, option: target.option },
    }));
  };

  const submit = () => {
    if (!scenario || !cartDetail || !method) return;
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
          selectedDate: p.mode === "courier" ? MOCK_DATES[partSchedules[p.key]?.dateIx ?? 0] : undefined,
          selectedSlot: p.mode === "courier" ? MOCK_SLOTS[partSchedules[p.key]?.slotIx ?? 0] : undefined,
        })),
      remainder: manualExcludedLines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      payOnDeliveryOnly: scenario.payOnDeliveryOnly,
      informers: scenario.informers,
      total: payFinal,
      method,
      pvzId: method === "pvz" ? pvzId : null,
      storeId: method === "pickup" ? storeId : null,
      courierAddress: method === "courier" ? courierAddress : null,
    };
    sessionStorage.setItem("thankyou", JSON.stringify(payload));
    router.push("/thank-you");
  };

  if (!boot) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">Загрузка…</div>
    );
  }

  const hasSplit = ((scenario?.parts.length ?? 0) > 1) || ((scenario?.remainder.length ?? 0) > 0);
  const unresolvedAlternativeLines = alternativeLines.filter((line) => !selectedAlternatives[line.productId]);
  const includedDeliveryTotal = includedParts.reduce((sum, part) => sum + part.deliveryPrice, 0);
  const includedSubtotalTotal = includedParts.reduce((sum, part) => sum + Math.round(part.subtotal * promoFactor), 0);
  const keepSinglePartExpanded = !hasSplit && (scenario?.parts.length ?? 0) === 1;

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
            {deliveryOptions.map((dm) => (
              <label
                key={dm.id}
                onClick={() => {
                  if (!dm.enabled) return;
                  selectPrimaryMethod(dm.code as "courier" | "pickup" | "pvz");
                  if (dm.code === "pickup") {
                    setPickupSelectorOpen(true);
                  }
                  if (dm.code === "pvz") {
                    setPvzSelectorOpen(true);
                  }
                }}
                className={`rounded-xl border px-3 py-3 transition ${
                  dm.enabled
                    ? method === dm.code
                      ? "cursor-pointer border-black bg-neutral-50"
                      : "cursor-pointer border-neutral-200 bg-white"
                    : "cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    className="mt-0.5 h-4 w-4"
                    name="dm"
                    checked={method === dm.code}
                    disabled={!dm.enabled}
                    onChange={() => {
                      selectPrimaryMethod(dm.code as "courier" | "pickup" | "pvz");
                      if (dm.code === "pickup") {
                        setPickupSelectorOpen(true);
                      }
                      if (dm.code === "pvz") {
                        setPvzSelectorOpen(true);
                      }
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{dm.name}</div>
                    {methodSummaryLabel(dm.code as "courier" | "pickup" | "pvz", dm.summary, dm.enabled) ? (
                      <div className="mt-1 text-xs text-neutral-500">
                        {methodSummaryLabel(dm.code as "courier" | "pickup" | "pvz", dm.summary, dm.enabled)}
                      </div>
                    ) : null}
                    {dm.code === "pickup" && method === "pickup" && selectedPickupStore ? (
                      <PickupSelectedStoreCard
                        store={selectedPickupStore}
                        onChange={() => setPickupSelectorOpen(true)}
                        embedded
                      />
                    ) : null}
                    {dm.code === "courier" && method === "courier" ? (
                      <CourierAddressCard
                        address={courierAddress}
                        onChange={() => setCourierAddressModalTarget({ kind: "primary" })}
                      />
                    ) : null}
                    {dm.code === "pvz" && method === "pvz" && selectedPvzPoint ? (
                      <PvzSelectedPointCard
                        point={selectedPvzPoint}
                        summary={pvzSummary}
                        onChange={() => setPvzSelectorOpen(true)}
                      />
                    ) : null}
                  </div>
                </div>
              </label>
            ))}
            {deliveryOptions.length === 0 ? (
              <p className="text-xs text-neutral-500">
                Для выбранного города нет доступных способов получения по логистическим правилам.
              </p>
            ) : null}
          </div>
        </section>

        {!method ? (
          <div className="mb-6 rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
            Выберите способ получения, чтобы увидеть доступные отправления и сроки.
          </div>
        ) : null}

        {method === "courier" && !courierAddress.trim() ? (
          <div className="mb-6 rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
            Для курьерской доставки нужен адрес. После ввода покажем доступные отправления.
          </div>
        ) : null}

        {loading ? <p className="text-sm text-neutral-500">Пересчёт доступных отправлений…</p> : null}

        {scenario?.informers?.length ? (
          <div className="mb-4 space-y-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-950">
            {scenario.informers.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </div>
        ) : null}

        {scenario && hasSplit ? (
          <section className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-sm font-semibold">
              {scenario.parts.length > 1
                ? `Заказ будет оформлен в ${scenario.parts.length} ${pluralizeShipments(scenario.parts.length)}`
                : "Заказ будет оформлен одним отправлением"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Откройте отправление, если хотите посмотреть товары, стоимость и срок получения подробнее.
            </p>
          </section>
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
              showSelectionControl={!keepSinglePartExpanded}
              expanded={keepSinglePartExpanded || expandedParts[p.key] === true}
              collapsible={!keepSinglePartExpanded}
              onToggleExpand={() =>
                setExpandedParts((prev) => ({
                  ...prev,
                  [p.key]: !prev[p.key],
                }))
              }
              totalCartUnits={units}
              promoFactor={promoFactor}
              partPromoDiscount={distribution[p.key]?.promoDiscount ?? 0}
              partBonusUsed={distribution[p.key]?.bonusUsed ?? 0}
              showSplitMeta={hasSplit}
              showRemainderHint={manualExcludedLines.length > 0 && partIndex === 0}
              remainderKeepHint={scenario.remainderKeepHint}
              selectedDateIx={partSchedules[p.key]?.dateIx ?? 0}
              selectedSlotIx={partSchedules[p.key]?.slotIx ?? 0}
              onDateChange={(dateIx) =>
                setPartSchedules((prev) => ({
                  ...prev,
                  [p.key]: { dateIx, slotIx: prev[p.key]?.slotIx ?? 0 },
                }))
              }
              onSlotChange={(slotIx) =>
                setPartSchedules((prev) => ({
                  ...prev,
                  [p.key]: { dateIx: prev[p.key]?.dateIx ?? 0, slotIx },
                }))
              }
            />
          ))}
        </section>

        {alternativeLines.length > 0 ? (
          <section className="mb-6 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Оформим другим способом</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Эти товары недоступны выбранным способом. Выберите альтернативный способ и оформите всё одной кнопкой.
              </p>
            </div>
            {alternativeLines.map((line) => (
              <AlternativeMethodChooser
                key={line.productId}
                line={line}
                product={boot.products.find((item) => item.id === line.productId)}
                currentMethod={method}
                selectedOption={selectedAlternatives[line.productId]?.option}
                onSelect={(option) => selectAlternativeOption(line, option)}
              >
                {(selectedAlternativePartsByProductId[line.productId] ?? []).map((part) => (
                  <PartCard
                    key={part.key}
                    part={part}
                    included
                    onToggle={() => {}}
                    showSelectionControl={false}
                    expanded={expandedParts[part.key] !== false}
                    collapsible
                    onToggleExpand={() =>
                      setExpandedParts((prev) => ({
                        ...prev,
                        [part.key]: !prev[part.key],
                      }))
                    }
                    totalCartUnits={units}
                    promoFactor={promoFactor}
                    partPromoDiscount={distribution[part.key]?.promoDiscount ?? 0}
                    partBonusUsed={distribution[part.key]?.bonusUsed ?? 0}
                    showSplitMeta={false}
                    showRemainderHint={false}
                    remainderKeepHint={undefined}
                    selectedDateIx={partSchedules[part.key]?.dateIx ?? 0}
                    selectedSlotIx={partSchedules[part.key]?.slotIx ?? 0}
                    onDateChange={(dateIx) =>
                      setPartSchedules((prev) => ({
                        ...prev,
                        [part.key]: { dateIx, slotIx: prev[part.key]?.slotIx ?? 0 },
                      }))
                    }
                    onSlotChange={(slotIx) =>
                      setPartSchedules((prev) => ({
                        ...prev,
                        [part.key]: { dateIx: prev[part.key]?.dateIx ?? 0, slotIx },
                      }))
                    }
                  />
                ))}
              </AlternativeMethodChooser>
            ))}
          </section>
        ) : null}

        {manualExcludedLines.length > 0 ? (
          <section className="mb-6 rounded-xl border border-dashed border-neutral-300 p-4">
            <h3 className="text-sm font-semibold">Останется в корзине</h3>
            <ul className="mt-2 text-xs text-neutral-600">
              {manualExcludedLines.map((r) => {
                return (
                  <li key={r.productId}>
                    {r.name} × {r.quantity}
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
          <h2 className="text-sm font-bold uppercase tracking-wide">Итого</h2>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-600">Товары</span>
              <span>{fmt(includedSubtotalTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">Доставка</span>
              <span>{includedDeliveryTotal > 0 ? fmt(includedDeliveryTotal) : "Бесплатно"}</span>
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
              <span>Итого</span>
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
              includedParts.length === 0 ||
              unresolvedAlternativeLines.length > 0
            }
            className="w-full rounded-lg bg-black py-4 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-40"
          >
            Оформить заказ
          </button>
          <p className="mt-2 text-center text-[10px] text-neutral-400">split-checkout.local</p>
        </div>
      </div>

      {pickupSelectorOpen && method === "pickup" ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Закрыть выбор магазина"
            className="absolute inset-0"
            onClick={() => setPickupSelectorOpen(false)}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Самовывоз из магазина</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Выберите магазин и посмотрите, сколько товаров доступны сразу, а сколько привезем позже.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickupSelectorOpen(false)}
                className="rounded-full border border-neutral-200 px-3 py-1 text-sm"
              >
                Закрыть
              </button>
            </div>
            <PickupStoreSelector
              stores={pickupStores}
              selectedStoreId={storeId}
              onSelect={(nextStoreId) => {
                setStoreId(nextStoreId);
                setPickupSelectorOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}
      {pvzSelectorOpen && method === "pvz" ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Закрыть выбор ПВЗ"
            className="absolute inset-0"
            onClick={() => setPvzSelectorOpen(false)}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Пункт выдачи заказа</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Выберите удобный ПВЗ на карте и сразу увидите его данные в карточке способа получения.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPvzSelectorOpen(false)}
                className="rounded-full border border-neutral-200 px-3 py-1 text-sm"
              >
                Закрыть
              </button>
            </div>
            <PvzPointSelector
              points={pvzOptions}
              selectedPointId={pvzId}
              summary={pvzSummary}
              onSelect={(nextPointId) => {
                setPvzId(nextPointId);
                setPvzSelectorOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}
      {alternativePickupLineId && alternativePickupOptions.length > 0 ? (
        <AlternativePickupStorePicker
          product={boot.products.find((item) => item.id === alternativePickupLineId)}
          quantity={activeAlternativePickupLine?.quantity ?? 0}
          options={alternativePickupOptions}
          onClose={() => setAlternativePickupLineId(null)}
          onSelect={(option) => {
            setSelectedAlternatives((prev) => ({
              ...prev,
              [alternativePickupLineId]: { productId: alternativePickupLineId, option },
            }));
            setAlternativePickupLineId(null);
          }}
        />
      ) : null}
      {courierAddressModalTarget ? (
        <CourierAddressModal
          initialValue={courierAddress}
          target={courierAddressModalTarget}
          onClose={() => setCourierAddressModalTarget(null)}
          onSave={handleCourierAddressSave}
        />
      ) : null}
    </div>
  );
}
