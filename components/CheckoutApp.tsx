"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadCourierAddress, saveCourierAddress } from "@/lib/courier-address-storage";
import { loadCheckoutCart } from "@/lib/checkout-cart-storage";
import { loadLastPickupStoreId, saveLastPickupStore } from "@/lib/pickup-store-storage";
import { loadLastPvzPointId, saveLastPvzPoint } from "@/lib/pvz-point-storage";
import {
  clearCheckoutRecipient,
  loadCheckoutRecipient,
  saveCheckoutRecipient,
  type CheckoutRecipientPayload,
} from "@/lib/checkout-recipient-storage";
import { commonDisclaimer } from "@/lib/disclaimers";
import type { AlternativeMethodOption, CartLine, RemainderResolution, ScenarioPart, ScenarioResult } from "@/lib/types";

const DEMO_RECIPIENT_FULL_NAME = "Петрова-Водкина Елизавета Валерьяновна";

function phoneHasMinDigits(value: string, min = 10): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= min;
}

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

type DeliveryMethodCode = "courier" | "pickup" | "pvz";

/** Выбранный способ оплаты на чекауте (макет). */
type CheckoutPaymentMethod = "sbp" | "card" | "on_receipt";

type SecondarySelection = {
  id: string;
  inputLines: CartLine[];
  option: AlternativeMethodOption;
  scenario: ScenarioResult;
  nextResolution: RemainderResolution | null;
};

type DisplaySecondarySelection = SecondarySelection & {
  parts: ScenarioPart[];
};

type SplitModalState = {
  mode: "add" | "edit";
  editIndex: number | null;
  resolution: RemainderResolution;
};

type CourierAddressModalTarget =
  | { kind: "primary" }
  | { kind: "split"; option: AlternativeMethodOption };

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

function pluralizeProducts(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "товар";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "товара";
  return "товаров";
}

function checkoutPaymentMethodLabel(method: CheckoutPaymentMethod): string {
  const labels: Record<CheckoutPaymentMethod, string> = {
    sbp: "СБП",
    card: "Банковской картой онлайн",
    on_receipt: "При получении (картой или наличными)",
  };
  return labels[method];
}

const MOCK_DATES = ["Завтра, 9 апр.", "10 апр.", "11 апр.", "12 апр."];
const MOCK_SLOTS = ["9:00–12:00", "12:00–15:00", "15:00–18:00"];
/** В шапке карточки курьерской доставки — перевозчик, а не склад/магазин отгрузки */
const COURIER_CARRIER_LABEL = "СДЭК";

function stripStoreNameForCaption(name: string) {
  return name.replace(/^\s*Магазин\s+/i, "").trim() || name;
}

function stripWarehouseNameForCaption(name: string) {
  return name.replace(/^\s*Склад\s+/i, "").trim() || name;
}

/** Откуда едет курьерская посылка — чтобы различать два одинаковых «СДЭК» при сплите. */
function courierOriginCaption(part: ScenarioPart): string {
  if (part.mode !== "courier") return "";
  const raw = part.sourceName.trim();
  if (part.sourceType === "warehouse") {
    return raw ? `Со склада · ${stripWarehouseNameForCaption(raw)}` : "Со склада";
  }
  const place = raw ? stripStoreNameForCaption(raw) : "магазина";
  return `Из магазина «${place}»`;
}
/** Самовывоз GJ: в заголовке — срок готовности, а не название точки отгрузки */
const PICKUP_RESERVE_TITLE = "Соберём за 30 минут";
const PICKUP_COLLECT_TITLE = "Доставим в магазин";
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

function countUnits(lines: { quantity: number }[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

function withSecondaryPartKeys(parts: ScenarioPart[], selectionId: string) {
  return parts.map((part, index) => ({
    ...part,
    key: `${selectionId}_${index}_${part.key}`,
    canToggle: true,
    defaultIncluded: true,
  }));
}

function optionSummaryTitle(option: AlternativeMethodOption) {
  if (option.unresolvedUnits === 0) {
    return `Оформим все ${option.totalUnits} ${pluralizeProducts(option.totalUnits)}`;
  }
  return `Оформим ${option.availableUnits} из ${option.totalUnits}, ${option.unresolvedUnits} остан${option.unresolvedUnits === 1 ? "ется" : "утся"} в корзине`;
}

function optionMethodLabel(option: AlternativeMethodOption) {
  if (option.methodCode === "pickup") {
    return option.storeName ? `Самовывоз · ${option.storeName}` : "Самовывоз";
  }
  if (option.methodCode === "courier") return "Доставка курьером";
  return "ПВЗ";
}

function methodGroupLabel(methodCode: AlternativeMethodOption["methodCode"]) {
  if (methodCode === "pickup") return "Самовывоз";
  if (methodCode === "courier") return "Доставка курьером";
  return "ПВЗ";
}

function methodGroupSummary(
  methodCode: AlternativeMethodOption["methodCode"],
  option: AlternativeMethodOption,
  pickupOptionsCount = 0,
) {
  if (methodCode === "pickup") {
    if (option.availableUnits >= option.totalUnits) {
      return pickupOptionsCount > 1
        ? `${option.totalUnits} из ${option.totalUnits} товаров в других магазинах`
        : `${option.totalUnits} из ${option.totalUnits} товаров в магазине`;
    }
    return `${option.availableUnits} из ${option.totalUnits} товаров в одном магазине`;
  }
  return `${option.availableUnits} из ${option.totalUnits} ${pluralizeProducts(option.totalUnits)}`;
}

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
      return "Доступность по магазинам разная — выберите точку ниже.";
    }
    if (!summary.hasSplit) return "";
    if (summary.availableUnits <= 0) return `0 из ${summary.totalUnits} товаров`;
    return `До ${summary.availableUnits} из ${summary.totalUnits} товаров зависит от магазина`;
  }
  if (!summary.hasSplit) return "";
  if (summary.availableUnits <= 0) return `0 из ${summary.totalUnits} товаров`;
  return `${summary.availableUnits} из ${summary.totalUnits} товаров`;
}

function optionCoverageLabel(summary?: MethodSummary) {
  if (!summary || summary.totalUnits <= 0) return "Нет данных";
  return `${summary.availableUnits} из ${summary.totalUnits} ${pluralizeProducts(summary.totalUnits)}`;
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
  if (!summary || summary.availableUnits <= 0)
    return "В этом магазине нельзя собрать выбранные позиции под самовывоз (нет остатка или только другой способ). Выберите другой магазин или способ доставки.";
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
  if (summary.availableUnits <= 0)
    return "ПВЗ обслуживается со склада: для выбранных позиций нет остатка с отгрузкой в пункт (или товар есть только в магазинах — их ПВЗ не использует). Попробуйте курьера или самовывоз.";
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

const PRODUCT_PLACEHOLDER = "/product-placeholder.svg";

function SafeProductImage({
  src,
  alt,
  className,
  fill,
  sizes,
}: {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = !src.trim() || failed ? PRODUCT_PLACEHOLDER : src;
  return (
    <Image
      src={url}
      alt={alt}
      fill={fill}
      className={className}
      sizes={sizes}
      onError={() => setFailed(true)}
    />
  );
}

function StepperCheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="text-white">
      <path
        d="M3 7L6 10L11 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Нелинейный прогресс: у каждого этапа свой статус — выполнено (зелёная галочка) или ещё нет (чёрная обводка, белый круг, без цифр). */
function Stepper({
  deliveryDone,
  recipientDone,
  paymentDone,
  finalizeReady,
}: {
  deliveryDone: boolean;
  recipientDone: boolean;
  paymentDone: boolean;
  finalizeReady: boolean;
}) {
  const items: { label: string; done: boolean }[] = [
    { label: "Доставка", done: deliveryDone },
    { label: "Получатель", done: recipientDone },
    { label: "Способ оплаты", done: paymentDone },
    { label: "Оформление", done: finalizeReady },
  ];
  return (
    <nav className="mb-6" aria-label="Этапы оформления заказа">
      <div className="relative grid grid-cols-4">
        <div
          className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-3 z-0 h-px bg-neutral-950"
          aria-hidden
        />
        {items.map(({ label, done }) => (
          <div key={label} className="relative z-10 flex flex-col items-center gap-2">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                done ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-900 bg-white"
              }`}
            >
              {done ? <StepperCheckIcon /> : null}
            </div>
            <span className="max-w-[5.5rem] text-center text-[10px] font-medium leading-tight text-neutral-950 sm:max-w-none sm:text-[11px]">
              {label}
            </span>
          </div>
        ))}
      </div>
    </nav>
  );
}

function PickupStoreSelector({
  stores,
  selectedStoreId,
  lastChosenStoreId,
  onSelect,
}: {
  stores: PickupStoreOption[];
  selectedStoreId: string;
  /** Подсказка «выбирали в прошлый раз» — без автоподстановки выбора */
  lastChosenStoreId?: string | null;
  onSelect: (storeId: string) => void;
}) {
  if (stores.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        В этом городе пока нет активных магазинов для самовывоза.
      </div>
    );
  }

  const selectedStore = selectedStoreId ? stores.find((store) => store.id === selectedStoreId) : undefined;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-neutral-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Карта магазинов</p>
            <p className="text-xs text-neutral-500">
              Число на маркере — сколько единиц <span className="font-medium text-neutral-700">текущего заказа</span>{" "}
              можно выдать из этой точки; 0 — в этом магазине выбранные позиции не собрать. Схема без точной
              географии.
            </p>
          </div>
          <span className="max-w-[55%] truncate rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase text-neutral-500 shadow-sm">
            {selectedStore?.name ?? "Не выбран"}
          </span>
        </div>
        <div className="relative h-52 overflow-hidden rounded-xl border border-white/80 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(226,232,240,0.92))]">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%),linear-gradient(transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%)]" />
          {stores.map((store, index) => {
            const tone = pickupStoreTone(store.summary);
            const pos = PICKUP_MAP_POSITIONS[index % PICKUP_MAP_POSITIONS.length]!;
            const selected = selectedStoreId === store.id;
            const wasLastChoice = lastChosenStoreId === store.id;
            return (
              <button
                key={store.id}
                type="button"
                onClick={() => onSelect(store.id)}
                className={`relative absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2 py-1 text-[11px] font-semibold shadow-sm transition ${tone.marker} ${selected ? "scale-110 ring-4 ring-black/10" : ""}`}
                style={{ left: pos.left, top: pos.top }}
                aria-pressed={selected}
                aria-label={`${store.name}. ${pickupStoreCountLabel(store.summary)}. ${pickupStoreStatusTitle(store.summary)}.`}
              >
                {wasLastChoice ? (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-800 text-[9px] text-white" title="Выбирали в прошлый раз">
                    ↻
                  </span>
                ) : null}
                {store.summary?.availableUnits ?? 0}/{store.summary?.totalUnits ?? 0}
              </button>
            );
          })}
        </div>
        {selectedStore ? (
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
        ) : (
          <div className="mt-3 rounded-xl bg-white/90 p-3 text-sm text-neutral-600 shadow-sm">
            Выберите магазин на карте или в списке ниже.
          </div>
        )}
      </div>

      <div className="space-y-2">
        {stores.map((store) => {
          const tone = pickupStoreTone(store.summary);
          const selected = selectedStoreId === store.id;
          const wasLastChoice = lastChosenStoreId === store.id;
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{store.name}</span>
                    {wasLastChoice ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600">
                        Выбирали в прошлый раз
                      </span>
                    ) : null}
                  </div>
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
                {(store.summary?.remainderUnits ?? 0) > 0 ? (
                  <span className="rounded-full bg-neutral-100 px-2 py-1">
                    Недоступно: {store.summary?.remainderUnits ?? 0}
                  </span>
                ) : null}
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
        {(store.summary?.remainderUnits ?? 0) > 0 ? (
          <span className={`rounded-full px-2 py-1 ${embedded ? "bg-neutral-100" : "bg-white/80"}`}>
            Недоступно: {store.summary?.remainderUnits ?? 0}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PvzPointSelector({
  points,
  selectedPointId,
  lastChosenPointId,
  summary,
  onSelect,
}: {
  points: PvzPointOption[];
  selectedPointId: string;
  lastChosenPointId?: string | null;
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

  const selectedPoint = selectedPointId ? points.find((point) => point.id === selectedPointId) : undefined;
  const tone = pvzPointTone(summary);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-neutral-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Карта ПВЗ</p>
            <p className="text-xs text-neutral-500">
              У всех пунктов одно число: в ПВЗ отгружаем со склада города (не из магазинов). 0 — для вашего
              заказа нет подходящего остатка на складе под эту схему. Схема без точной географии.
            </p>
          </div>
          <span className="max-w-[55%] truncate rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase text-neutral-500 shadow-sm">
            {selectedPoint?.name ?? "Не выбран"}
          </span>
        </div>
        <div className="relative h-52 overflow-hidden rounded-xl border border-white/80 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(226,232,240,0.92))]">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%),linear-gradient(transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%)]" />
          {points.map((point, index) => {
            const pos = PICKUP_MAP_POSITIONS[index % PICKUP_MAP_POSITIONS.length]!;
            const selected = selectedPointId === point.id;
            const wasLastChoice = lastChosenPointId === point.id;
            return (
              <button
                key={point.id}
                type="button"
                onClick={() => onSelect(point.id)}
                className={`relative absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2 py-1 text-[11px] font-semibold shadow-sm transition ${tone.marker} ${selected ? "scale-110 ring-4 ring-black/10" : ""}`}
                style={{ left: pos.left, top: pos.top }}
                aria-pressed={selected}
                aria-label={`${point.name}. ${pvzPointCountLabel(summary)}. ${pvzPointStatusTitle(summary)}.`}
              >
                {wasLastChoice ? (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-800 text-[9px] text-white" title="Выбирали в прошлый раз">
                    ↻
                  </span>
                ) : null}
                {summary?.availableUnits ?? 0}/{summary?.totalUnits ?? 0}
              </button>
            );
          })}
        </div>
        {selectedPoint ? (
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
        ) : (
          <div className="mt-3 rounded-xl bg-white/90 p-3 text-sm text-neutral-600 shadow-sm">
            Выберите ПВЗ на карте или в списке ниже.
          </div>
        )}
      </div>

      <div className="space-y-2">
        {points.map((point) => {
          const selected = selectedPointId === point.id;
          const wasLastChoice = lastChosenPointId === point.id;
          const pvzUnavailableUnits = Math.max(0, (summary?.totalUnits ?? 0) - (summary?.availableUnits ?? 0));
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{point.name}</span>
                    {wasLastChoice ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600">
                        Выбирали в прошлый раз
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-neutral-900">{point.address}</div>
                  <div className="mt-1 text-xs text-neutral-500">{pvzPointStatusDetail(summary)}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${tone.accent}`}>
                  {pvzPointCountLabel(summary)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-600">
                <span className="rounded-full bg-neutral-100 px-2 py-1">Доступно: {summary?.availableUnits ?? 0}</span>
                {pvzUnavailableUnits > 0 ? (
                  <span className="rounded-full bg-neutral-100 px-2 py-1">Недоступно: {pvzUnavailableUnits}</span>
                ) : null}
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

  const pvzUnavailableUnits = Math.max(0, (summary?.totalUnits ?? 0) - (summary?.availableUnits ?? 0));

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
        {pvzUnavailableUnits > 0 ? (
          <span className="rounded-full bg-neutral-100 px-2 py-1">Недоступно: {pvzUnavailableUnits}</span>
        ) : null}
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
          <p className="mt-1 break-words text-sm leading-snug text-neutral-900">{address}</p>
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
          className="mt-2 min-h-24 w-full rounded-xl border border-neutral-200 px-3 py-3 text-base text-neutral-900 placeholder:text-neutral-400"
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

function UnresolvedItemsBlock({
  resolution,
  productsById,
  onChoose,
}: {
  resolution: RemainderResolution;
  productsById: Record<string, Bootstrap["products"][number]>;
  onChoose: () => void;
}) {
  const totalUnits = countUnits(resolution.lines);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Как получить остальные товары</p>
          <p className="mt-1 text-xs text-neutral-500">
            Можно выбрать удобный вариант для этих товаров сейчас или оставить их в корзине.
          </p>
        </div>
        <span className="inline-flex min-w-[2.75rem] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold tabular-nums uppercase text-neutral-600">
          {totalUnits} шт
        </span>
      </div>

      <div className="mt-4 rounded-xl bg-neutral-50 p-3">
        <p className="text-sm font-semibold">Эти товары пока не вошли в заказ</p>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {resolution.lines.map((line) => (
            <div
              key={line.productId}
              className="flex min-w-[108px] shrink-0 items-center gap-2 rounded-lg bg-white px-2 py-1.5"
            >
              <div className="relative h-10 w-10 overflow-hidden rounded-md bg-neutral-100">
                <SafeProductImage
                  src={productsById[line.productId]?.image ?? ""}
                  alt={productsById[line.productId]?.name ?? line.productId}
                  fill
                  className="object-cover"
                  sizes="40px"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-neutral-800">
                  {productsById[line.productId]?.name ?? line.productId}
                </p>
                <p className="text-[10px] text-neutral-500">× {line.quantity}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onChoose}
          className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
        >
          Выбрать способ получения
        </button>
      </div>

      {resolution.options.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-neutral-300 p-3 text-xs text-neutral-500">
          Для этих товаров сейчас не нашли других способов оформления.
        </div>
      ) : null}
    </div>
  );
}

function SecondarySelectionCard({
  option,
  pickupStore,
  pvzPoint,
  courierAddress,
  onEdit,
  variant = "card",
}: {
  option: AlternativeMethodOption;
  pickupStore?: PickupStoreOption;
  pvzPoint?: PvzPointOption;
  courierAddress?: string;
  onEdit: () => void;
  /** `stacked` — без отдельной рамки, как верхняя часть единого блока с PartCard */
  variant?: "card" | "stacked";
}) {
  if (variant === "stacked") {
    return (
      <>
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900">{methodGroupLabel(option.methodCode)}</p>
          <p className="mt-1 text-xs text-neutral-500">{optionSummaryTitle(option)}</p>
        </div>
        {option.methodCode === "pickup" && pickupStore ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-neutral-800">{pickupStore.name}</p>
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium"
            >
              Изменить
            </button>
          </div>
        ) : null}
        {option.methodCode === "courier" ? (
          <div className="mt-2 flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 break-words text-sm leading-snug text-neutral-800">
              {courierAddress?.trim() ? courierAddress : "Укажите адрес доставки"}
            </p>
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium"
            >
              Изменить
            </button>
          </div>
        ) : null}
        {option.methodCode === "pvz" && pvzPoint ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-800">{pvzPoint.name}</p>
              <p className="mt-0.5 truncate text-xs text-neutral-500">{pvzPoint.address}</p>
            </div>
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium"
            >
              Изменить
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-4 w-4 rounded-full border border-neutral-400 bg-white">
          <div className="m-[3px] h-2 w-2 rounded-full bg-neutral-900" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{methodGroupLabel(option.methodCode)}</div>
              <div className="mt-1 text-xs text-neutral-500">{optionSummaryTitle(option)}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium"
              >
                Изменить
              </button>
            </div>
          </div>
          {option.methodCode === "pickup" ? (
            <PickupSelectedStoreCard store={pickupStore} onChange={onEdit} embedded />
          ) : option.methodCode === "pvz" ? (
            <PvzSelectedPointCard point={pvzPoint} summary={undefined} onChange={onEdit} />
          ) : (
            <CourierAddressCard address={courierAddress} onChange={onEdit} />
          )}
        </div>
      </div>
    </div>
  );
}

function SplitSelectionModal({
  resolution,
  productsById,
  pvzPoints,
  selectedPvzId,
  onSelectPvz,
  courierAddress,
  onEditCourierAddress,
  onClose,
  onConfirm,
  saving,
}: {
  resolution: RemainderResolution;
  productsById: Record<string, Bootstrap["products"][number]>;
  pvzPoints: PvzPointOption[];
  selectedPvzId: string;
  onSelectPvz: (pointId: string) => void;
  courierAddress: string;
  onEditCourierAddress: (option: AlternativeMethodOption) => void;
  onClose: () => void;
  onConfirm: (option: AlternativeMethodOption) => void;
  saving: boolean;
}) {
  const courierOption = resolution.options.find((option) => option.methodCode === "courier") ?? null;
  const pickupOptions = resolution.options.filter((option) => option.methodCode === "pickup");
  const pvzOption = resolution.options.find((option) => option.methodCode === "pvz") ?? null;
  const methodChoices = [
    courierOption
      ? {
          key: "courier" as const,
          label: methodGroupLabel("courier"),
          summary: methodGroupSummary("courier", courierOption),
        }
      : null,
    pickupOptions[0]
      ? {
          key: "pickup" as const,
          label: methodGroupLabel("pickup"),
          summary: methodGroupSummary("pickup", pickupOptions[0], pickupOptions.length),
        }
      : null,
    pvzOption
      ? {
          key: "pvz" as const,
          label: methodGroupLabel("pvz"),
          summary: methodGroupSummary("pvz", pvzOption),
        }
      : null,
  ].filter((item): item is { key: DeliveryMethodCode; label: string; summary: string } => Boolean(item));
  const [selectedMethod, setSelectedMethod] = useState<DeliveryMethodCode | null>(null);
  const [selectedPickupStoreId, setSelectedPickupStoreId] = useState<string>("");
  const [pickupSelectorOpen, setPickupSelectorOpen] = useState(false);
  const [pickupSearch, setPickupSearch] = useState("");
  const selectedPickupOption =
    pickupOptions.find((option) => option.storeId === selectedPickupStoreId) ?? null;
  const selectedPvzPoint = pvzPoints.find((point) => point.id === selectedPvzId) ?? pvzPoints[0];
  const filteredPickupOptions = pickupOptions.filter((option) =>
    (option.storeName ?? "").toLocaleLowerCase("ru").includes(pickupSearch.trim().toLocaleLowerCase("ru")),
  );
  const selectedOption =
    selectedMethod === "courier"
      ? courierOption
      : selectedMethod === "pickup"
        ? selectedPickupOption
        : selectedMethod === "pvz"
          ? pvzOption
          : null;
  const confirmDisabled =
    saving ||
    !selectedOption ||
    (selectedMethod === "courier" && !courierAddress.trim()) ||
    (selectedMethod === "pvz" && !selectedPvzPoint);

  const handleMethodSelect = (methodCode: DeliveryMethodCode) => {
    if (methodCode === "courier") {
      setSelectedMethod("courier");
      if (!courierAddress.trim() && courierOption) {
        onEditCourierAddress(courierOption);
      }
      return;
    }
    if (methodCode === "pickup") {
      setSelectedMethod("pickup");
      setPickupSelectorOpen(true);
      return;
    }
    setSelectedMethod("pvz");
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <button type="button" aria-label="Закрыть выбор способа получения" className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Выберите способ получения</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-200 px-3 py-1 text-sm"
          >
            Закрыть
          </button>
        </div>

        <div className="rounded-xl bg-neutral-50 p-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {resolution.lines.map((line) => (
              <div
                key={line.productId}
                className="flex min-w-[108px] shrink-0 items-center gap-2 rounded-lg bg-white px-2 py-1.5"
              >
                <div className="relative h-10 w-10 overflow-hidden rounded-md bg-neutral-100">
                  <SafeProductImage
                    src={productsById[line.productId]?.image ?? ""}
                    alt={productsById[line.productId]?.name ?? line.productId}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium text-neutral-800">
                    {productsById[line.productId]?.name ?? line.productId}
                  </p>
                  <p className="text-[10px] text-neutral-500">× {line.quantity}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {methodChoices.map((choice) => {
            const isSelected = selectedMethod === choice.key;
            return (
              <button
                key={choice.key}
                type="button"
                onClick={() => handleMethodSelect(choice.key)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  isSelected ? "border-black bg-neutral-50" : "border-neutral-200 bg-white hover:border-neutral-300"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{choice.label}</p>
                    <p className="mt-1 text-xs text-neutral-500">{choice.summary}</p>
                  </div>
                  {isSelected ? (
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold uppercase text-neutral-700">
                      Активно
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        {selectedMethod === "pickup" ? (
          <div className="mt-4 rounded-xl border border-neutral-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Магазин для этой части заказа</p>
                {selectedPickupOption ? (
                  <>
                    <p className="mt-2 text-sm text-neutral-900">{optionMethodLabel(selectedPickupOption)}</p>
                    <p className="mt-1 text-xs text-neutral-500">{optionSummaryTitle(selectedPickupOption)}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-neutral-500">Выберите магазин в отдельном окне выбора.</p>
                )}
              </div>
              {selectedPickupOption ? (
                <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold uppercase text-neutral-600">
                  {selectedPickupOption.availableUnits}/{selectedPickupOption.totalUnits}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setPickupSelectorOpen(true)}
              className="mt-3 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium"
            >
              {selectedPickupOption ? "Изменить магазин" : "Выбрать магазин"}
            </button>
          </div>
        ) : null}

        {selectedMethod === "courier" ? (
          <div className="mt-4 rounded-xl border border-neutral-200 p-4">
            <p className="text-sm font-semibold">Адрес для этой доставки</p>
            {courierAddress.trim() ? (
              <p className="mt-2 break-words text-sm leading-snug text-neutral-900">{courierAddress}</p>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">Укажите адрес, чтобы добавить курьерское отправление.</p>
            )}
            <button
              type="button"
              onClick={() => courierOption && onEditCourierAddress(courierOption)}
              className="mt-3 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium"
            >
              {courierAddress.trim() ? "Изменить адрес" : "Указать адрес"}
            </button>
          </div>
        ) : null}

        {selectedMethod === "pvz" ? (
          <div className="mt-4 space-y-2 border-t border-neutral-100 pt-4">
            <p className="text-xs text-neutral-500">Выберите ПВЗ для этой части заказа.</p>
            {pvzPoints.map((point) => {
              const isSelected = point.id === (selectedPvzPoint?.id ?? "");
              return (
                <button
                  key={point.id}
                  type="button"
                  onClick={() => onSelectPvz(point.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isSelected ? "border-black bg-neutral-50" : "border-neutral-200 bg-white hover:border-neutral-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{point.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">{point.address}</p>
                    </div>
                    {isSelected ? (
                      <span className="rounded-full bg-black px-2 py-1 text-[10px] font-semibold uppercase text-white">
                        Выбран
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => selectedOption && onConfirm(selectedOption)}
            disabled={confirmDisabled}
            className="flex-1 rounded-xl bg-black py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Добавляем…" : "Добавить отправление"}
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
      {pickupSelectorOpen ? (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Закрыть выбор магазина"
            className="absolute inset-0"
            onClick={() => setPickupSelectorOpen(false)}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold">Выберите магазин</h4>
                <p className="mt-1 text-sm text-neutral-500">
                  Для большого списка удобнее искать магазин по названию и сразу видеть покрытие товаров.
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

            <input
              type="text"
              value={pickupSearch}
              onChange={(e) => setPickupSearch(e.target.value)}
              placeholder="Найти магазин"
              className="mb-4 w-full rounded-xl border border-neutral-200 px-3 py-3 text-base outline-none focus:border-neutral-400"
            />

            <div className="space-y-2">
              {filteredPickupOptions.map((option) => {
                const isSelected = option.storeId === selectedPickupStoreId;
                return (
                  <button
                    key={`${option.methodCode}_${option.storeId ?? "default"}`}
                    type="button"
                    onClick={() => {
                      setSelectedPickupStoreId(option.storeId ?? "");
                      setPickupSelectorOpen(false);
                    }}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isSelected ? "border-black bg-neutral-50" : "border-neutral-200 bg-white hover:border-neutral-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{optionMethodLabel(option)}</p>
                        <p className="mt-1 text-xs text-neutral-500">{optionSummaryTitle(option)}</p>
                      </div>
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold uppercase text-neutral-600">
                        {option.availableUnits}/{option.totalUnits}
                      </span>
                    </div>
                  </button>
                );
              })}
              {filteredPickupOptions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
                  По этому запросу магазины не найдены.
                </div>
              ) : null}
            </div>
          </div>
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
  promoFactor,
  showRemainderHint,
  remainderKeepHint,
  partPromoDiscount,
  partBonusUsed,
  selectedDateIx,
  selectedSlotIx,
  onDateChange,
  onSlotChange,
  badgeLabel,
  inGroup = false,
}: {
  part: ScenarioPart;
  included: boolean;
  onToggle: () => void;
  showSelectionControl?: boolean;
  expanded: boolean;
  collapsible: boolean;
  onToggleExpand: () => void;
  promoFactor: number;
  /** Показываем подсказку только если реально есть remainder и текст не отключён в админке. */
  showRemainderHint: boolean;
  remainderKeepHint?: string;
  partPromoDiscount: number;
  partBonusUsed: number;
  selectedDateIx?: number;
  selectedSlotIx?: number;
  onDateChange?: (dateIx: number) => void;
  onSlotChange?: (slotIx: number) => void;
  badgeLabel?: string;
  /** Без отдельной рамки — внутри общего блока заказа */
  inGroup?: boolean;
}) {
  const visible = part.items.slice(0, 5);
  const extra = part.items.reduce((s, i) => s + i.quantity, 0) - visible.reduce((s, i) => s + i.quantity, 0);
  const sub = Math.round(part.subtotal * promoFactor);
  const ship = included ? part.deliveryPrice : 0;
  const isCourier = part.mode === "courier";
  const deliveryDate = isCourier ? MOCK_DATES[selectedDateIx ?? 0] : null;
  const deliverySlot = isCourier ? MOCK_SLOTS[selectedSlotIx ?? 0] : null;
  const leadLabel = isCourier && deliveryDate && deliverySlot ? `${deliveryDate}, ${deliverySlot}` : part.leadTimeLabel;
  const isGjStorePickup = part.mode === "click_reserve" || part.mode === "click_collect";
  const isPvz = part.mode === "pvz";
  const gjPickupHeadline =
    part.leadTimeLabel?.trim() ||
    (part.mode === "click_reserve" ? PICKUP_RESERVE_TITLE : PICKUP_COLLECT_TITLE);
  const pvzHeadline = part.leadTimeLabel?.trim() || part.sourceName;
  const partTitle = isCourier
    ? COURIER_CARRIER_LABEL
    : part.mode === "click_reserve"
      ? PICKUP_RESERVE_TITLE
      : part.mode === "click_collect"
        ? PICKUP_COLLECT_TITLE
        : part.sourceName;
  /** Под миниатюрами: окно доставки только в свёртке; в развёрнутом виде даты в чипах */
  const showCourierSlotInHeader = isCourier && !expanded && Boolean(leadLabel);

  return (
    <div
      className={`transition ${
        inGroup ? "px-4 py-6" : "p-4"
      } ${
        inGroup
          ? included
            ? ""
            : "opacity-60"
          : `rounded-xl border bg-white ${included ? "border-neutral-200" : "border-neutral-200 opacity-60"}`
      }`}
    >
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
          {isGjStorePickup ? (
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug text-neutral-900">{gjPickupHeadline}</p>
              {part.holdDays ? (
                <p className="mt-1 text-sm font-semibold leading-snug text-neutral-900">
                  Срок хранения: {part.holdDays} {pluralizeDays(part.holdDays)}
                </p>
              ) : null}
              <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--gj-muted)]">
                {part.mode === "click_reserve"
                  ? "бесплатно / примерка"
                  : "бесплатно / доставка в магазин"}
              </p>
            </div>
          ) : isCourier ? (
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug text-neutral-900">{COURIER_CARRIER_LABEL}</p>
              <p className="mt-0.5 text-xs font-normal leading-snug text-neutral-600">{courierOriginCaption(part)}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--gj-muted)]">курьер</p>
            </div>
          ) : isPvz ? (
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug text-neutral-900">{pvzHeadline}</p>
              {part.holdDays ? (
                <p className="mt-1 text-sm font-semibold leading-snug text-neutral-900">
                  Срок хранения: {part.holdDays} {pluralizeDays(part.holdDays)}
                </p>
              ) : null}
              <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--gj-muted)]">бесплатно / ПВЗ</p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-semibold">{partTitle}</p>
                {badgeLabel ? (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold uppercase text-neutral-700">
                    {badgeLabel}
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {/* Always-visible thumbnails row */}
          <div className="mt-3 flex gap-1.5">
            {visible.map((it) => (
              <div key={it.productId} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                <SafeProductImage src={it.image} alt="" fill className="object-cover" sizes="48px" />
                {it.quantity > 1 ? (
                  <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[8px] text-white">
                    {it.quantity}
                  </span>
                ) : null}
              </div>
            ))}
            {extra > 0 ? (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-500">
                +{extra}
              </div>
            ) : null}
          </div>

          {showCourierSlotInHeader ? (
            collapsible ? (
              <button
                type="button"
                onClick={onToggleExpand}
                aria-expanded={expanded}
                title="Выбрать дату и время доставки"
                className="mt-3 flex w-full max-w-full items-center justify-between gap-2 py-1 text-left text-sm font-semibold leading-snug text-neutral-900 transition active:opacity-90 hover:opacity-90"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0">{leadLabel}</span>
                  <svg
                    className="h-4 w-4 shrink-0 text-neutral-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
                <span className="shrink-0 text-xs font-medium text-neutral-600">Изменить</span>
              </button>
            ) : (
              <p className="mt-3 text-sm font-semibold leading-snug text-neutral-900">{leadLabel}</p>
            )
          ) : null}

          <div className="mt-3 flex w-full items-baseline justify-between gap-3">
            <span className="text-base font-semibold tabular-nums text-neutral-900">{fmt(sub + ship)}</span>
            {collapsible && !(isCourier && showCourierSlotInHeader) ? (
              <button
                type="button"
                onClick={onToggleExpand}
                className="shrink-0 text-xs font-medium text-neutral-500 underline decoration-neutral-300 underline-offset-2"
              >
                {expanded ? "Свернуть" : "Подробнее"}
              </button>
            ) : null}
          </div>
          {expanded && isCourier ? (
            <div className="mt-3 space-y-2">
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
          {expanded && showRemainderHint && remainderKeepHint ? (
            <p className="mt-2 text-xs text-neutral-500">{remainderKeepHint}</p>
          ) : null}
          {expanded ? (
            <>
              <div className="mt-3 space-y-1 text-xs text-neutral-500">
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

function ScenarioPartCardSkeleton({ inGroup }: { inGroup?: boolean }) {
  const inner = (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 h-5 w-5 shrink-0 rounded-[4px] bg-neutral-200" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-2">
          <div className="h-4 w-[72%] max-w-[260px] rounded-md bg-neutral-200" />
          <div className="h-3 w-[40%] max-w-[140px] rounded-md bg-neutral-100" />
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 w-12 shrink-0 rounded-lg bg-neutral-200/90" />
          ))}
        </div>
        <div className="flex items-baseline justify-between gap-3 pt-0.5">
          <div className="h-5 w-28 rounded-md bg-neutral-200" />
          <div className="h-4 w-20 rounded-md bg-neutral-100" />
        </div>
      </div>
    </div>
  );
  if (inGroup) {
    return <div className="px-4 py-6">{inner}</div>;
  }
  return <div className="rounded-xl border border-neutral-200 bg-white p-4">{inner}</div>;
}

function ScenarioOrderSkeleton({ variant }: { variant: "unified" | "stacked" }) {
  if (variant === "stacked") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="pointer-events-none mb-6 space-y-3 select-none"
      >
        <span className="sr-only">Считаем доступные отправления и сроки.</span>
        <div className="animate-pulse">
          <ScenarioPartCardSkeleton />
        </div>
        <div className="animate-pulse">
          <ScenarioPartCardSkeleton />
        </div>
      </div>
    );
  }
  return (
    <section
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="pointer-events-none mb-6 select-none overflow-hidden rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100"
    >
      <span className="sr-only">Считаем доступные отправления и сроки.</span>
      <div className="animate-pulse space-y-2 px-3 py-3">
        <div className="h-3 w-36 rounded bg-neutral-200/90" />
        <div className="h-3 w-full max-w-sm rounded bg-neutral-100" />
        <div className="h-4 w-[85%] max-w-xs rounded bg-neutral-200/80" />
      </div>
      <div className="animate-pulse flex items-center justify-between px-3 py-3">
        <div className="h-3.5 w-44 rounded bg-neutral-200/90" />
        <div className="h-7 w-[7.5rem] rounded-full bg-neutral-200/80" />
      </div>
      <div className="animate-pulse">
        <ScenarioPartCardSkeleton inGroup />
      </div>
      <div className="animate-pulse">
        <ScenarioPartCardSkeleton inGroup />
      </div>
    </section>
  );
}

function SbpBrandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path fill="#21A038" d="M16 4 28 16H16V4Z" />
      <path fill="#2B59FF" d="M28 16 16 28V16h12Z" />
      <path fill="#FF5F40" d="M16 28 4 16h12v12Z" />
      <path fill="#FFCB00" d="M4 16 16 4v12H4Z" />
    </svg>
  );
}

function PaymentCardOutlineIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19" strokeLinecap="round" />
    </svg>
  );
}

function PaymentBagOutlineIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M6 9h12l-1 11H7L6 9Z" strokeLinejoin="round" />
      <path d="M9 9V7a3 3 0 0 1 6 0v2" strokeLinecap="round" />
    </svg>
  );
}

export default function CheckoutApp(props: { variant?: "classic" | "redesign" } = {}) {
  void props.variant;
  const router = useRouter();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string>("");
  const [method, setMethod] = useState<DeliveryMethodCode | null>(null);
  const [pickupSelectorOpen, setPickupSelectorOpen] = useState(false);
  const [pvzSelectorOpen, setPvzSelectorOpen] = useState(false);
  const [storeId, setStoreId] = useState<string>("");
  const [lastPickupMemoryId, setLastPickupMemoryId] = useState<string | null>(null);
  const [pvzId, setPvzId] = useState<string>("");
  const [lastPvzMemoryId, setLastPvzMemoryId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [remainderResolution, setRemainderResolution] = useState<RemainderResolution | null>(null);
  const [secondarySelections, setSecondarySelections] = useState<SecondarySelection[]>([]);
  const [splitModalState, setSplitModalState] = useState<SplitModalState | null>(null);
  const [splitSubmitting, setSplitSubmitting] = useState(false);
  const [selectionSeq, setSelectionSeq] = useState(0);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [partSchedules, setPartSchedules] = useState<Record<string, PartDeliverySchedule>>({});
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [bonusOn, setBonusOn] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>("sbp");
  const [recipient, setRecipient] = useState<CheckoutRecipientPayload | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneGateOpen, setPhoneGateOpen] = useState(false);
  const [courierAddress, setCourierAddress] = useState("");
  const [courierAddressModalTarget, setCourierAddressModalTarget] = useState<CourierAddressModalTarget | null>(null);
  const [expandedParts, setExpandedParts] = useState<Record<string, boolean>>({});
  const latestScenarioRequestRef = useRef(0);
  const skipPersistCourierAddress = useRef(true);

  useEffect(() => {
    const saved = loadCourierAddress();
    if (saved) setCourierAddress(saved);
    skipPersistCourierAddress.current = true;
  }, []);

  useEffect(() => {
    const r = loadCheckoutRecipient();
    if (r) {
      setRecipient(r);
      setPhoneDraft(r.phone);
    }
  }, []);

  useEffect(() => {
    if (skipPersistCourierAddress.current) {
      skipPersistCourierAddress.current = false;
      return;
    }
    saveCourierAddress(courierAddress);
  }, [courierAddress]);
  const primaryCourierAddress = method === "courier" ? courierAddress : "";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bootstrap")
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) {
          let msg = `Ошибка загрузки (${r.status})`;
          try {
            const j = JSON.parse(text) as { message?: string };
            if (j.message) msg = j.message;
          } catch {
            if (text.trim()) msg = text.slice(0, 200);
          }
          throw new Error(msg);
        }
        return JSON.parse(text) as Bootstrap;
      })
      .then((d: Bootstrap) => {
        if (cancelled) return;
        setBootError(null);
        setBoot(d);
        const firstCity = d.cities[0];
        if (firstCity) setCityId(firstCity.id);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setBootError(e instanceof Error ? e.message : "Не удалось загрузить данные");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [cartDetail, setCartDetail] = useState<{
    lines: { productId: string; quantity: number; name: string; price: number; image: string }[];
    units: number;
    subtotal: number;
  } | null>(null);

  useEffect(() => {
    if (!boot || !cityId) return;
    let cancelled = false;

    async function loadCart() {
      const snap = loadCheckoutCart();
      const fromStorage =
        snap?.cityId === cityId && snap.lines.length > 0
          ? snap.lines.filter((l) => l.selected !== false && l.quantity > 0)
          : null;

      try {
        if (fromStorage && fromStorage.length === 0) {
          if (!cancelled) setCartDetail({ lines: [], units: 0, subtotal: 0 });
          return;
        }
        if (fromStorage && fromStorage.length > 0) {
          const r = await fetch("/api/cart-lines", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cityId,
              lines: fromStorage.map(({ productId, quantity }) => ({ productId, quantity })),
            }),
          });
          const json = (await r.json()) as {
            lines: { productId: string; quantity: number; name: string; price: number; image: string }[];
            units: number;
            subtotal: number;
          };
          if (!cancelled) setCartDetail(json);
          return;
        }
        const r = await fetch(`/api/cart-lines?cityId=${encodeURIComponent(cityId)}`);
        const json = (await r.json()) as {
          lines: { productId: string; quantity: number; name: string; price: number; image: string }[];
          units: number;
          subtotal: number;
        };
        if (!cancelled) setCartDetail(json);
      } catch {
        if (!cancelled) setCartDetail(null);
      }
    }

    void loadCart();
    return () => {
      cancelled = true;
    };
  }, [boot, cityId]);

  const cartLinesSignature = useMemo(
    () =>
      cartDetail?.lines
        ?.map((l) => `${l.productId}:${l.quantity}`)
        .sort()
        .join("|") ?? "",
    [cartDetail?.lines],
  );

  const [cartScopedSummaries, setCartScopedSummaries] = useState<{
    methodSummaries: Bootstrap["methodSummaryByCity"][string];
    pickupSummaryByStore: Record<string, PickupStoreSummary>;
  } | null>(null);

  useEffect(() => {
    setCartScopedSummaries(null);
  }, [cityId]);

  useEffect(() => {
    if (!cityId || !cartDetail?.lines?.length) {
      setCartScopedSummaries(null);
      return;
    }
    setCartScopedSummaries(null);
    let cancelled = false;
    const lines = cartDetail.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));

    void (async () => {
      try {
        const r = await fetch("/api/cart-summaries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cityId, lines }),
        });
        const json = (await r.json()) as {
          methodSummaries?: Bootstrap["methodSummaryByCity"][string];
          pickupSummaryByStore?: Record<string, PickupStoreSummary>;
        };
        if (cancelled || !r.ok || !json.methodSummaries || !json.pickupSummaryByStore) return;
        setCartScopedSummaries({
          methodSummaries: json.methodSummaries,
          pickupSummaryByStore: json.pickupSummaryByStore,
        });
      } catch {
        if (!cancelled) setCartScopedSummaries(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cityId, cartLinesSignature, cartDetail?.lines]);

  const methodSummariesForUi = useMemo(() => {
    if (!boot || !cityId) return undefined;
    if (cartDetail?.lines?.length) {
      return cartScopedSummaries?.methodSummaries;
    }
    return boot.methodSummaryByCity[cityId];
  }, [boot, cityId, cartDetail?.lines?.length, cartScopedSummaries?.methodSummaries]);

  /** По сводке корзины: в ПВЗ нечего отгрузить (напр. только склад под ПВЗ, остатка нет). Вкладку не скрываем — приглушаем и поясняем. */
  const isPvzUnavailableForCurrentOrder = useMemo(() => {
    if (!cartDetail?.lines?.length || !methodSummariesForUi?.pvz) return false;
    const s = methodSummariesForUi.pvz;
    return s.totalUnits > 0 && s.availableUnits <= 0;
  }, [cartDetail?.lines?.length, methodSummariesForUi]);

  const requestScenario = useCallback(
    async (params: {
      deliveryMethodCode: DeliveryMethodCode;
      selectedStoreId?: string | null;
      lines?: CartLine[];
    }) => {
      const res = await fetch("/api/checkout/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityId,
          deliveryMethodCode: params.deliveryMethodCode,
          selectedStoreId: params.selectedStoreId ?? null,
          lines: params.lines,
        }),
      });
      return (await res.json()) as {
        scenario: ScenarioResult;
        remainderResolution: RemainderResolution | null;
      };
    },
    [cityId],
  );

  const refreshScenario = useCallback(async () => {
    const requestId = latestScenarioRequestRef.current + 1;
    latestScenarioRequestRef.current = requestId;

    if (!cityId || !method || (method === "courier" && !primaryCourierAddress.trim())) {
      setScenario(null);
      setRemainderResolution(null);
      setSecondarySelections([]);
      setSplitModalState(null);
      setIncluded({});
      setLoading(false);
      return;
    }
    if (!cartDetail?.lines?.length) {
      setScenario(null);
      setRemainderResolution(null);
      setSecondarySelections([]);
      setSplitModalState(null);
      setIncluded({});
      setLoading(false);
      return;
    }
    if (method === "pickup" && !storeId.trim()) {
      setScenario(null);
      setRemainderResolution(null);
      setSecondarySelections([]);
      setSplitModalState(null);
      setIncluded({});
      setLoading(false);
      return;
    }
    if (method === "pvz" && !pvzId.trim()) {
      setScenario(null);
      setRemainderResolution(null);
      setSecondarySelections([]);
      setSplitModalState(null);
      setIncluded({});
      setLoading(false);
      return;
    }
    const cartLinesPayload = cartDetail.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
    setLoading(true);
    try {
      const data = await requestScenario({
        deliveryMethodCode: method,
        selectedStoreId: method === "pickup" ? storeId || null : null,
        lines: cartLinesPayload,
      });
      if (latestScenarioRequestRef.current !== requestId) return;
      const sc: ScenarioResult = data.scenario;
      setScenario(sc);
      setRemainderResolution((data.remainderResolution ?? null) as RemainderResolution | null);
      setSecondarySelections([]);
      setSplitModalState(null);
    } finally {
      if (latestScenarioRequestRef.current !== requestId) return;
      setLoading(false);
    }
  }, [cityId, method, storeId, pvzId, primaryCourierAddress, requestScenario, cartDetail]);

  useEffect(() => {
    void refreshScenario();
  }, [refreshScenario]);

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
    ).map((m) => {
      const allowedInCity = allowed.has(m.code);
      const blockPvzByCart = m.code === "pvz" && isPvzUnavailableForCurrentOrder;
      return {
        ...m,
        enabled: allowedInCity && !blockPvzByCart,
        /** В городе ПВЗ разрешён правилами, но текущий заказ через ПВЗ не оформить */
        pvzUnavailableForOrder: m.code === "pvz" && isPvzUnavailableForCurrentOrder && allowedInCity,
        summary:
          cartDetail?.lines?.length && methodSummariesForUi
            ? methodSummariesForUi[m.code as "courier" | "pickup" | "pvz"]
            : !cartDetail?.lines?.length
              ? boot.methodSummaryByCity[cityId]?.[m.code as "courier" | "pickup" | "pvz"]
              : undefined,
      };
    });
  }, [boot, cityId, cartDetail?.lines?.length, methodSummariesForUi, isPvzUnavailableForCurrentOrder]);

  const pickupStores = useMemo(() => {
    if (!boot) return [] as PickupStoreOption[];
    const rawStores = boot.storesByCity[cityId] ?? [];
    const summaries = cartDetail?.lines?.length
      ? cartScopedSummaries?.pickupSummaryByStore ?? {}
      : boot.pickupSummaryByStore[cityId] ?? {};

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
  }, [boot, cityId, cartDetail?.lines?.length, cartScopedSummaries?.pickupSummaryByStore]);

  useEffect(() => {
    setLastPickupMemoryId(loadLastPickupStoreId(cityId));
  }, [cityId]);

  useEffect(() => {
    if (method !== "pickup" || !cityId || !storeId.trim()) return;
    if (!pickupStores.some((s) => s.id === storeId)) return;
    saveLastPickupStore(cityId, storeId);
    setLastPickupMemoryId(storeId);
  }, [method, cityId, storeId, pickupStores]);

  const pickupStoresOrdered = useMemo(() => {
    const hint = lastPickupMemoryId;
    if (!hint) return pickupStores;
    const ix = pickupStores.findIndex((s) => s.id === hint);
    if (ix < 1) return pickupStores;
    const chosen = pickupStores[ix]!;
    return [chosen, ...pickupStores.filter((_, i) => i !== ix)];
  }, [pickupStores, lastPickupMemoryId]);

  const selectedPickupStore = pickupStores.find((store) => store.id === storeId);
  const pvzOptions = (boot?.pvzByCity[cityId] ?? []).filter((p) => !p.requiresPrepayment);

  useEffect(() => {
    setLastPvzMemoryId(loadLastPvzPointId(cityId));
  }, [cityId]);

  useEffect(() => {
    if (method !== "pvz" || !cityId || !pvzId.trim()) return;
    if (!pvzOptions.some((p) => p.id === pvzId)) return;
    saveLastPvzPoint(cityId, pvzId);
    setLastPvzMemoryId(pvzId);
  }, [method, cityId, pvzId, pvzOptions]);

  const pvzOptionsOrdered = useMemo(() => {
    const hint = lastPvzMemoryId;
    if (!hint) return pvzOptions;
    const ix = pvzOptions.findIndex((p) => p.id === hint);
    if (ix < 1) return pvzOptions;
    const chosen = pvzOptions[ix]!;
    return [chosen, ...pvzOptions.filter((_, i) => i !== ix)];
  }, [pvzOptions, lastPvzMemoryId]);

  useEffect(() => {
    if (method !== "pvz") return;
    if (!pvzOptions.length) {
      if (pvzId) setPvzId("");
      return;
    }
    if (pvzId && !pvzOptions.some((p) => p.id === pvzId)) {
      setPvzId("");
    }
  }, [method, pvzOptions, pvzId]);

  const selectedPvzPoint = pvzOptions.find((point) => point.id === pvzId);
  const pvzSummary = cartDetail?.lines?.length
    ? methodSummariesForUi?.pvz
    : boot?.methodSummaryByCity[cityId]?.pvz;

  const recommendedMethodCode = useMemo<DeliveryMethodCode | null>(() => {
    const full = deliveryOptions.filter((option) => {
      if (!option.enabled || !option.summary || option.summary.totalUnits <= 0) return false;
      return option.summary.availableUnits >= option.summary.totalUnits;
    });
    if (full.length !== 1) return null;
    return full[0]!.code as DeliveryMethodCode;
  }, [deliveryOptions]);

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
    if (storeId && !pickupStores.some((store) => store.id === storeId)) {
      setStoreId("");
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
    setRemainderResolution(null);
    setSecondarySelections([]);
    setSplitModalState(null);
    setIncluded({});
  }, [cityId]);

  const units = cartDetail?.units ?? 0;
  const promoFactor = promoApplied ? 0.8 : 1;
  const [distribution, setDistribution] = useState<Record<string, { promoDiscount: number; bonusUsed: number }>>({});

  const secondaryDisplaySelections = useMemo<DisplaySecondarySelection[]>(
    () =>
      secondarySelections.map((selection) => ({
        ...selection,
        parts: withSecondaryPartKeys(selection.scenario.parts, selection.id),
      })),
    [secondarySelections],
  );

  const secondaryDisplayParts = useMemo(
    () => secondaryDisplaySelections.flatMap((selection) => selection.parts),
    [secondaryDisplaySelections],
  );

  const allDisplayParts = useMemo(
    () => [...(scenario?.parts ?? []), ...secondaryDisplayParts],
    [scenario, secondaryDisplayParts],
  );

  const activeRemainderResolution = useMemo(
    () =>
      secondarySelections.length > 0
        ? (secondarySelections[secondarySelections.length - 1]?.nextResolution ?? null)
        : remainderResolution,
    [secondarySelections, remainderResolution],
  );

  const unresolvedLines = useMemo(
    () => activeRemainderResolution?.lines ?? [],
    [activeRemainderResolution],
  );

  const { includedMerch, partsTotal, includedParts } = useMemo(() => {
    let merch = 0;
    let t = 0;
    const parts: ScenarioPart[] = [];
    for (const part of allDisplayParts) {
      if (included[part.key] === false) continue;
      parts.push(part);
      merch += part.subtotal;
      t += Math.round(part.subtotal * promoFactor) + part.deliveryPrice;
    }
    return { includedMerch: merch, partsTotal: t, includedParts: parts };
  }, [allDisplayParts, included, promoFactor]);

  const payOnDeliveryOnlyEffective = includedParts.length > 1;

  const payOnDeliveryDisclaimerText = useMemo(() => commonDisclaimer("payOnDeliveryOnly"), []);

  const scenarioInformersForBanner = useMemo(() => {
    if (!scenario?.informers?.length) return [];
    if (!payOnDeliveryOnlyEffective) return scenario.informers;
    return scenario.informers.filter((t) => t.trim() !== payOnDeliveryDisclaimerText.trim());
  }, [scenario?.informers, payOnDeliveryOnlyEffective, payOnDeliveryDisclaimerText]);

  useEffect(() => {
    if (payOnDeliveryOnlyEffective) {
      setPaymentMethod("on_receipt");
    }
  }, [payOnDeliveryOnlyEffective]);

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
    setIncluded((prev) => {
      const next: Record<string, boolean> = {};
      for (const part of allDisplayParts) {
        next[part.key] = prev[part.key] ?? part.defaultIncluded;
      }
      return next;
    });
  }, [allDisplayParts]);

  useEffect(() => {
    if (!allDisplayParts.length) {
      setPartSchedules({});
      return;
    }
    setPartSchedules((prev) => {
      const next: Record<string, PartDeliverySchedule> = {};
      for (const part of allDisplayParts) {
        if (part.mode !== "courier") continue;
        next[part.key] = prev[part.key] ?? { dateIx: 0, slotIx: 0 };
      }
      return next;
    });
  }, [allDisplayParts]);

  useEffect(() => {
    if (!allDisplayParts.length) {
      setExpandedParts({});
      return;
    }
    setExpandedParts((prev) => {
      const next: Record<string, boolean> = {};
      for (const part of allDisplayParts) {
        next[part.key] = prev[part.key] ?? part.key.startsWith("secondary_");
      }
      return next;
    });
  }, [allDisplayParts]);

  const manualExcludedLines = useMemo(() => {
    const map = new Map<string, { productId: string; quantity: number; name: string }>();
    for (const part of allDisplayParts) {
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
  }, [allDisplayParts, included]);

  const handlePromo = () => {
    if (promo.trim().toUpperCase() === "APP20") {
      setPromoApplied(true);
      setBonusOn(false);
    }
  };

  const selectPrimaryMethod = (nextMethod: DeliveryMethodCode) => {
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

  useEffect(() => {
    if (method !== "pvz" || !isPvzUnavailableForCurrentOrder) return;
    setPvzId("");
    setPvzSelectorOpen(false);
    const next = deliveryOptions.find((d) => d.enabled);
    if (!next) {
      setMethod(null);
      return;
    }
    if (next.code === "courier") {
      if (courierAddress.trim()) {
        setMethod("courier");
      } else {
        setCourierAddressModalTarget({ kind: "primary" });
      }
    } else {
      setMethod(next.code as DeliveryMethodCode);
    }
  }, [method, isPvzUnavailableForCurrentOrder, deliveryOptions, courierAddress]);

  const openCurrentSplitModal = () => {
    if (!activeRemainderResolution || activeRemainderResolution.lines.length === 0) return;
    setSplitModalState({ mode: "add", editIndex: null, resolution: activeRemainderResolution });
  };

  const openSplitEditModal = (selectionIndex: number) => {
    const baseResolution = selectionIndex === 0 ? remainderResolution : secondarySelections[selectionIndex - 1]?.nextResolution;
    if (!baseResolution || baseResolution.lines.length === 0) return;
    setSplitModalState({ mode: "edit", editIndex: selectionIndex, resolution: baseResolution });
  };

  const applySplitSelection = async (option: AlternativeMethodOption) => {
    if (!splitModalState) return;
    setSplitSubmitting(true);
    try {
      const data = await requestScenario({
        deliveryMethodCode: option.methodCode,
        selectedStoreId: option.methodCode === "pickup" ? option.storeId ?? null : null,
        lines: splitModalState.resolution.lines,
      });
      const nextSelectionId = `secondary_${selectionSeq + 1}`;
      setSelectionSeq((prev) => prev + 1);
      const nextSelection: SecondarySelection = {
        id: nextSelectionId,
        inputLines: splitModalState.resolution.lines,
        option,
        scenario: data.scenario,
        nextResolution: data.remainderResolution ?? null,
      };
      setSecondarySelections((prev) => {
        const base = splitModalState.editIndex == null ? prev : prev.slice(0, splitModalState.editIndex);
        return [...base, nextSelection];
      });
      setSplitModalState(null);
    } finally {
      setSplitSubmitting(false);
    }
  };

  const confirmSplitSelection = async (option: AlternativeMethodOption) => {
    if (!splitModalState) return;
    if (option.methodCode === "courier" && !courierAddress.trim()) {
      setCourierAddressModalTarget({ kind: "split", option });
      return;
    }
    await applySplitSelection(option);
  };

  const handleCourierAddressSave = async (address: string, target: CourierAddressModalTarget) => {
    setCourierAddress(address);
    setCourierAddressModalTarget(null);
    if (target.kind === "primary") {
      setMethod("courier");
      return;
    }
    setSplitModalState(null);
    await applySplitSelection(target.option);
  };

  const productsById = useMemo(
    () => Object.fromEntries((boot?.products ?? []).map((product) => [product.id, product] as const)),
    [boot],
  );

  const currentRemainderLines = useMemo(
    () =>
      unresolvedLines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        name: productsById[line.productId]?.name ?? line.productId,
      })),
    [unresolvedLines, productsById],
  );

  const completeCheckoutSubmit = (recOverride?: CheckoutRecipientPayload | null) => {
    const rec = recOverride ?? recipient;
    if (!boot || !scenario || !cartDetail || !method || !rec) return;
    const finalRemainderLines = [...manualExcludedLines];
    for (const line of currentRemainderLines) {
      const existing = finalRemainderLines.find((item) => item.productId === line.productId);
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        const product = boot.products.find((item) => item.id === line.productId);
        finalRemainderLines.push({
          productId: line.productId,
          quantity: line.quantity,
          name: product?.name ?? line.productId,
        });
      }
    }
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
      remainder: finalRemainderLines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      payOnDeliveryOnly: payOnDeliveryOnlyEffective,
      informers: scenario.informers,
      total: payFinal,
      method,
      pvzId: method === "pvz" ? pvzId : null,
      storeId: method === "pickup" ? storeId : null,
      courierAddress: courierAddress.trim() ? courierAddress : null,
      paymentMethod,
      recipientPhone: rec.phone,
      recipientName: rec.fullName,
    };
    sessionStorage.setItem("thankyou", JSON.stringify(payload));
    router.push("/thank-you");
  };

  const submit = () => {
    if (!boot || !scenario || !cartDetail || !method) return;
    if (!recipient) {
      setPhoneGateOpen(true);
      return;
    }
    completeCheckoutSubmit();
  };

  const buildRecipientPayload = (raw: string): CheckoutRecipientPayload | null => {
    const phone = raw.trim();
    if (!phoneHasMinDigits(phone)) return null;
    return { phone, fullName: DEMO_RECIPIENT_FULL_NAME };
  };

  const applyRecipientPayload = (p: CheckoutRecipientPayload) => {
    saveCheckoutRecipient(p);
    setRecipient(p);
    setPhoneDraft(p.phone);
  };

  const confirmRecipientInline = () => {
    const p = buildRecipientPayload(phoneDraft);
    if (!p) return;
    applyRecipientPayload(p);
  };

  const confirmRecipientFromGate = () => {
    const p = buildRecipientPayload(phoneDraft);
    if (!p) return;
    applyRecipientPayload(p);
    setPhoneGateOpen(false);
    queueMicrotask(() => completeCheckoutSubmit(p));
  };

  const clearRecipient = () => {
    clearCheckoutRecipient();
    setRecipient(null);
    setPhoneDraft("");
  };

  if (bootError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-white px-4 py-8 text-sm text-neutral-800">
        <p className="font-semibold text-red-600">Не удалось загрузить оформление заказа</p>
        <p className="text-neutral-600">{bootError}</p>
        <p className="text-xs text-neutral-500">
          Проверьте <code className="rounded bg-neutral-100 px-1">DATABASE_URL</code> в Vercel: для Supabase на
          сборке часто нужен Session pooler (<code className="rounded bg-neutral-100 px-1">pooler…:5432</code>,
          пользователь <code className="rounded bg-neutral-100 px-1">postgres.&lt;ref&gt;</code>), не только
          прямой <code className="rounded bg-neutral-100 px-1">db…supabase.co</code>. Строка:{" "}
          <code className="rounded bg-neutral-100 px-1">npm run supabase:urls</code>. Проверка:{" "}
          <code className="rounded bg-neutral-100 px-1">/api/health</code>.
        </p>
      </div>
    );
  }

  if (!boot) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">Загрузка…</div>
    );
  }

  const hasSplit = allDisplayParts.length > 1 || unresolvedLines.length > 0;
  const includedDeliveryTotal = includedParts.reduce((sum, part) => sum + part.deliveryPrice, 0);
  const includedSubtotalTotal = includedParts.reduce((sum, part) => sum + Math.round(part.subtotal * promoFactor), 0);
  const keepSinglePartExpanded = !hasSplit && allDisplayParts.length === 1;

  const unifiedOrderBlock = !!method && !!scenario && scenario.parts.length > 0;
  const stepperFinalizeReady = !!scenario && includedParts.length > 0;

  const awaitingScenario =
    !!cityId &&
    !!method &&
    (method !== "courier" || primaryCourierAddress.trim().length > 0) &&
    (method !== "pickup" || storeId.trim().length > 0) &&
    (method !== "pvz" || pvzId.trim().length > 0);
  const showScenarioSkeleton = loading && awaitingScenario;

  const renderScenarioMethodSummary = () => {
    if (!method || !scenario) return null;
    const dm = deliveryOptions.find((d) => d.code === method);
    if (!dm) return null;
    const summaryText = methodSummaryLabel(dm.code as "courier" | "pickup" | "pvz", dm.summary, dm.enabled);
    return (
      <>
        {summaryText ? <p className="mb-2 text-xs text-neutral-400">{summaryText}</p> : null}
        {method === "pickup" && selectedPickupStore ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-neutral-800">{selectedPickupStore.name}</p>
            <button
              type="button"
              onClick={() => setPickupSelectorOpen(true)}
              className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium"
            >
              Изменить
            </button>
          </div>
        ) : null}
        {method === "courier" ? (
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 break-words text-sm leading-snug text-neutral-800">
              {courierAddress.trim() ? courierAddress : "Укажите адрес доставки"}
            </p>
            <button
              type="button"
              onClick={() => setCourierAddressModalTarget({ kind: "primary" })}
              className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium"
            >
              Изменить
            </button>
          </div>
        ) : null}
        {method === "pvz" && selectedPvzPoint ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-800">{selectedPvzPoint.name}</p>
              <p className="mt-0.5 truncate text-xs text-neutral-500">{selectedPvzPoint.address}</p>
            </div>
            <button
              type="button"
              onClick={() => setPvzSelectorOpen(true)}
              className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium"
            >
              Изменить
            </button>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <div className="relative isolate mx-auto min-h-screen max-w-md bg-white pb-28">
      <header className="sticky top-0 z-50 border-b border-neutral-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/cart" className="text-xl text-neutral-700" aria-label="Назад в корзину">
            ←
          </Link>
          <h1 className="flex-1 text-center text-base font-semibold">Оформление заказа</h1>
          <span className="w-6" />
        </div>
      </header>

      <div className="relative z-0 px-4 pt-4">
        <Stepper
          deliveryDone={unifiedOrderBlock}
          recipientDone={!!recipient}
          paymentDone
          finalizeReady={stepperFinalizeReady}
        />

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide">Способ получения</h2>
            <div className="relative">
              <select
                aria-label="Выбор города"
                className="appearance-none rounded-full border border-neutral-200 bg-white pl-3 pr-8 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-800 shadow-sm outline-none transition focus:border-neutral-400"
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
              >
                {boot.cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-neutral-500">
                ▾
              </span>
            </div>
          </div>
          {/* Горизонтальные вкладки */}
          <div className="flex items-stretch gap-3">
            {deliveryOptions.map((dm) => {
              const tabName = dm.code === "pickup" ? "Магазины GJ" : dm.name;
              const isSelected = method === dm.code;
              const isRecommended = recommendedMethodCode === dm.code;
              const coverage = optionCoverageLabel(dm.summary);
              const mutedPvz =
                dm.code === "pvz" &&
                "pvzUnavailableForOrder" in dm &&
                (dm as { pvzUnavailableForOrder?: boolean }).pvzUnavailableForOrder;
              return (
                <button
                  key={dm.id}
                  type="button"
                  disabled={!dm.enabled}
                  title={
                    mutedPvz
                      ? "Этот заказ через ПВЗ не оформить: для выбранных позиций нет остатка на складе под отгрузку в пункт. Выберите курьера или магазин."
                      : undefined
                  }
                  onClick={() => {
                    if (!dm.enabled) return;
                    selectPrimaryMethod(dm.code as "courier" | "pickup" | "pvz");
                    if (dm.code === "pickup") setPickupSelectorOpen(true);
                    if (dm.code === "pvz") setPvzSelectorOpen(true);
                  }}
                  className={`flex min-h-[75px] flex-1 flex-col items-start justify-center gap-1 rounded-xl border px-3 py-3 text-left transition ${
                    isSelected
                      ? "border-black bg-black text-white"
                      : dm.enabled
                        ? "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300"
                        : mutedPvz
                          ? "cursor-not-allowed border-amber-200/90 bg-amber-50/80 text-amber-900/80 opacity-95"
                          : "cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400 opacity-60"
                  }`}
                >
                  <span className="text-xs font-semibold leading-tight">{tabName}</span>
                  <p className={`text-[11px] leading-tight ${isSelected ? "text-white/95" : "text-neutral-800"}`}>
                    {coverage}
                  </p>
                  {isRecommended ? (
                    <span
                      className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                        isSelected ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      Рекомендуем
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {deliveryOptions.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">
              Для выбранного города нет доступных способов получения по логистическим правилам.
            </p>
          ) : null}

          {/* Детали способа: отдельная «кирпичная» карточка только если заказ ниже ещё не собран в единый блок */}
          {method && !unifiedOrderBlock ? (
            <div className="mt-3 rounded-xl border border-neutral-200 bg-white px-3 py-3">
              {!scenario ? (
                (() => {
                  const dm = deliveryOptions.find((d) => d.code === method);
                  if (!dm) return null;
                  const summaryText = methodSummaryLabel(
                    dm.code as "courier" | "pickup" | "pvz",
                    dm.summary,
                    dm.enabled,
                  );
                  return (
                    <>
                      {summaryText ? (
                        <p className="mb-2 text-sm text-neutral-400">{summaryText}</p>
                      ) : null}
                      {method === "pickup" && selectedPickupStore ? (
                        <PickupSelectedStoreCard
                          store={selectedPickupStore}
                          onChange={() => setPickupSelectorOpen(true)}
                          embedded
                        />
                      ) : method === "pickup" ? (
                        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/80 p-3 text-sm text-neutral-700">
                          <p className="font-medium text-neutral-900">Выберите магазин</p>
                          <p className="mt-1 text-xs text-neutral-600">
                            {lastPickupMemoryId && pickupStores.find((s) => s.id === lastPickupMemoryId) ? (
                              <>
                                В прошлый раз вы выбирали «
                                {pickupStores.find((s) => s.id === lastPickupMemoryId)!.name}» — он показан первым в
                                списке.
                              </>
                            ) : (
                              "Укажите точку самовывоза на карте или в списке."
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => setPickupSelectorOpen(true)}
                            className="mt-3 w-full rounded-lg bg-black py-2.5 text-xs font-semibold uppercase tracking-wide text-white"
                          >
                            Открыть выбор магазина
                          </button>
                        </div>
                      ) : null}
                      {method === "courier" ? (
                        <CourierAddressCard
                          address={courierAddress}
                          onChange={() => setCourierAddressModalTarget({ kind: "primary" })}
                        />
                      ) : null}
                      {method === "pvz" && selectedPvzPoint ? (
                        <PvzSelectedPointCard
                          point={selectedPvzPoint}
                          summary={pvzSummary}
                          onChange={() => setPvzSelectorOpen(true)}
                        />
                      ) : method === "pvz" ? (
                        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/80 p-3 text-sm text-neutral-700">
                          <p className="font-medium text-neutral-900">Выберите ПВЗ</p>
                          <p className="mt-1 text-xs text-neutral-600">
                            {lastPvzMemoryId && pvzOptions.find((p) => p.id === lastPvzMemoryId) ? (
                              <>
                                В прошлый раз вы выбирали «{pvzOptions.find((p) => p.id === lastPvzMemoryId)!.name}» — он
                                показан первым в списке.
                              </>
                            ) : (
                              "Укажите пункт выдачи на карте или в списке."
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => setPvzSelectorOpen(true)}
                            className="mt-3 w-full rounded-lg bg-black py-2.5 text-xs font-semibold uppercase tracking-wide text-white"
                          >
                            Открыть выбор ПВЗ
                          </button>
                        </div>
                      ) : null}
                    </>
                  );
                })()
              ) : (
                renderScenarioMethodSummary()
              )}
            </div>
          ) : null}
        </section>

        {method === "courier" && !courierAddress.trim() ? (
          <div className="mb-6 rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
            Для курьерской доставки нужен адрес. После ввода покажем доступные отправления.
          </div>
        ) : null}

        {!showScenarioSkeleton && scenarioInformersForBanner.length ? (
          <div className="mb-4 space-y-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-950">
            {scenarioInformersForBanner.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </div>
        ) : null}

        {showScenarioSkeleton ? (
          <ScenarioOrderSkeleton variant={unifiedOrderBlock ? "unified" : "stacked"} />
        ) : unifiedOrderBlock ? (
          <section className="mb-6 overflow-hidden rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
            <div className="px-3 py-3">{renderScenarioMethodSummary()}</div>
            {hasSplit ? (
              <div className="flex items-center justify-between px-3 py-3">
                <p className="text-sm font-bold uppercase tracking-wide">
                  {allDisplayParts.length > 1
                    ? `Ваш заказ · ${allDisplayParts.length} ${pluralizeShipments(allDisplayParts.length)}`
                    : "Ваш заказ"}
                </p>
                {units > 0 ? (
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-neutral-600">
                    В заказе {includedParts.reduce((s, p) => s + p.items.reduce((ps, i) => ps + i.quantity, 0), 0)} из{" "}
                    {units} шт
                  </span>
                ) : null}
              </div>
            ) : null}
            {scenario?.parts.map((p, partIndex) => (
              <PartCard
                key={p.key}
                inGroup
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
                promoFactor={promoFactor}
                partPromoDiscount={distribution[p.key]?.promoDiscount ?? 0}
                partBonusUsed={distribution[p.key]?.bonusUsed ?? 0}
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
        ) : (
          <>
            {scenario && hasSplit ? (
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-bold uppercase tracking-wide">
                  {allDisplayParts.length > 1
                    ? `Ваш заказ · ${allDisplayParts.length} ${pluralizeShipments(allDisplayParts.length)}`
                    : "Ваш заказ"}
                </p>
                {units > 0 ? (
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-neutral-600">
                    В заказе {includedParts.reduce((s, p) => s + p.items.reduce((ps, i) => ps + i.quantity, 0), 0)} из{" "}
                    {units} шт
                  </span>
                ) : null}
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
                  showSelectionControl={!keepSinglePartExpanded}
                  expanded={keepSinglePartExpanded || expandedParts[p.key] === true}
                  collapsible={!keepSinglePartExpanded}
                  onToggleExpand={() =>
                    setExpandedParts((prev) => ({
                      ...prev,
                      [p.key]: !prev[p.key],
                    }))
                  }
                  promoFactor={promoFactor}
                  partPromoDiscount={distribution[p.key]?.promoDiscount ?? 0}
                  partBonusUsed={distribution[p.key]?.bonusUsed ?? 0}
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
          </>
        )}

        {secondaryDisplaySelections.map((selection, selectionIndex) => (
          <section
            key={selection.id}
            className="mb-6 overflow-hidden rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100"
          >
            <div className="px-3 py-3">
              <SecondarySelectionCard
                variant="stacked"
                option={selection.option}
                pickupStore={pickupStores.find((store) => store.id === selection.option.storeId)}
                pvzPoint={pvzOptions.find((point) => point.id === pvzId)}
                courierAddress={courierAddress}
                onEdit={() => openSplitEditModal(selectionIndex)}
              />
            </div>
            {selection.parts.map((part) => (
              <PartCard
                key={part.key}
                inGroup
                part={part}
                included={included[part.key] !== false}
                onToggle={() =>
                  setIncluded((prev) => {
                    const cur = prev[part.key] !== false;
                    return { ...prev, [part.key]: !cur };
                  })
                }
                showSelectionControl
                expanded={expandedParts[part.key] !== false}
                collapsible
                onToggleExpand={() =>
                  setExpandedParts((prev) => ({
                    ...prev,
                    [part.key]: !prev[part.key],
                  }))
                }
                promoFactor={promoFactor}
                partPromoDiscount={distribution[part.key]?.promoDiscount ?? 0}
                partBonusUsed={distribution[part.key]?.bonusUsed ?? 0}
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
          </section>
        ))}

        {activeRemainderResolution && activeRemainderResolution.lines.length > 0 ? (
          <section className="mb-6">
            <UnresolvedItemsBlock
              resolution={activeRemainderResolution}
              productsById={productsById}
              onChoose={openCurrentSplitModal}
            />
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

        <section className="mb-6" aria-labelledby="checkout-recipient-heading">
          <h2 id="checkout-recipient-heading" className="mb-2 text-sm font-bold uppercase tracking-wide">
            Мои данные
          </h2>
          {!recipient ? (
            <>
              <p className="text-xs text-neutral-500">Введите номер телефона, чтобы оформить заказ</p>
              <input
                className="mt-2 w-full rounded-lg bg-neutral-100 px-3 py-3 text-base placeholder:text-neutral-400"
                placeholder="+7 (___) ___-__-__"
                inputMode="tel"
                autoComplete="tel"
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value)}
              />
              <button
                type="button"
                disabled={!phoneHasMinDigits(phoneDraft)}
                onClick={confirmRecipientInline}
                className="mt-2 w-full rounded-lg bg-neutral-900 py-3 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Получить смс с кодом
              </button>
              <p className="mt-2 text-[10px] text-neutral-400">
                Для демо код не запрашиваем — после нажатия вы будете «авторизованы» с тестовым именем.
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 px-3 py-3">
              <p className="text-sm font-semibold leading-snug text-neutral-900">{recipient.fullName}</p>
              <p className="mt-1 text-sm text-neutral-600">{recipient.phone}</p>
              <button
                type="button"
                onClick={clearRecipient}
                className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 underline underline-offset-2"
              >
                Сменить номер
              </button>
            </div>
          )}
        </section>

        <section className="mb-6" aria-labelledby="checkout-payment-heading">
          <h2 id="checkout-payment-heading" className="mb-3 text-base font-bold text-neutral-900">
            Способ оплаты
          </h2>
          <div role="radiogroup" aria-labelledby="checkout-payment-heading" className="space-y-2">
            {(
              [
                { id: "sbp" as const, Icon: SbpBrandIcon, iconClass: "h-7 w-7" },
                {
                  id: "card" as const,
                  Icon: PaymentCardOutlineIcon,
                  iconClass: "h-7 w-7 text-neutral-900",
                },
                {
                  id: "on_receipt" as const,
                  Icon: PaymentBagOutlineIcon,
                  iconClass: "h-7 w-7 text-neutral-900",
                },
              ] as const
            ).map(({ id, Icon, iconClass }) => {
              const label = checkoutPaymentMethodLabel(id);
              const selected = paymentMethod === id;
              const onlyReceipt = payOnDeliveryOnlyEffective;
              const disabled = onlyReceipt && id !== "on_receipt";
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => {
                    if (!disabled) setPaymentMethod(id);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border bg-white p-4 text-left transition ${
                    disabled
                      ? "cursor-not-allowed border-neutral-100 opacity-45"
                      : selected
                        ? "border-neutral-900 ring-1 ring-neutral-900"
                        : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      selected ? "border-neutral-900" : "border-neutral-300"
                    }`}
                    aria-hidden
                  >
                    {selected ? <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" /> : null}
                  </span>
                  <Icon className={`shrink-0 ${iconClass}`} />
                  <span className="min-w-0 flex-1 text-sm font-medium text-neutral-900">{label}</span>
                </button>
              );
            })}
          </div>
          {payOnDeliveryOnlyEffective ? (
            <p className="mt-3 text-xs leading-snug text-neutral-600">{payOnDeliveryDisclaimerText}</p>
          ) : null}
        </section>

        <section className="mb-6 flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
          <input
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-base uppercase"
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
            disabled={!scenario || includedParts.length === 0}
            className="w-full rounded-lg bg-black py-4 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-40"
          >
            {(() => {
              const orderedUnits = includedParts.reduce((s, p) => s + p.items.reduce((ps, i) => ps + i.quantity, 0), 0);
              if (units > 0 && orderedUnits < units) {
                return `Оформить ${orderedUnits} из ${units} товаров`;
              }
              if (units > 0 && orderedUnits > 0) {
                return `Оформить ${orderedUnits} ${pluralizeProducts(orderedUnits)}`;
              }
              return "Оформить заказ";
            })()}
          </button>
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
              stores={pickupStoresOrdered}
              selectedStoreId={storeId}
              lastChosenStoreId={lastPickupMemoryId}
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
              points={pvzOptionsOrdered}
              selectedPointId={pvzId}
              lastChosenPointId={lastPvzMemoryId}
              summary={pvzSummary}
              onSelect={(nextPointId) => {
                setPvzId(nextPointId);
                setPvzSelectorOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}
      {splitModalState ? (
        <SplitSelectionModal
          resolution={splitModalState.resolution}
          productsById={productsById}
          pvzPoints={pvzOptionsOrdered}
          selectedPvzId={pvzId}
          onSelectPvz={setPvzId}
          courierAddress={courierAddress}
          onEditCourierAddress={(option) => setCourierAddressModalTarget({ kind: "split", option })}
          onClose={() => {
            if (!splitSubmitting) setSplitModalState(null);
          }}
          onConfirm={confirmSplitSelection}
          saving={splitSubmitting}
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
      {phoneGateOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Закрыть окно телефона"
            className="absolute inset-0"
            onClick={() => setPhoneGateOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <h3 className="text-lg font-semibold text-neutral-900">Подтвердите телефон</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Чтобы оформить заказ, укажите номер и нажмите «Получить смс с кодом» — в демо переходим без ввода кода.
            </p>
            <input
              className="mt-4 w-full rounded-lg border border-neutral-200 px-3 py-3 text-base"
              placeholder="+7 (___) ___-__-__"
              inputMode="tel"
              autoComplete="tel"
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
            />
            <button
              type="button"
              disabled={!phoneHasMinDigits(phoneDraft)}
              onClick={confirmRecipientFromGate}
              className="mt-3 w-full rounded-lg bg-black py-3 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-40"
            >
              Получить смс с кодом
            </button>
            <button
              type="button"
              onClick={() => setPhoneGateOpen(false)}
              className="mt-2 w-full rounded-lg border border-neutral-200 py-2.5 text-sm text-neutral-700"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
