"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { commonDisclaimer, unresolvedBlockCopy } from "@/lib/disclaimers";
import {
  buildPvzSheetThumbMeta,
  pickupSummaryFromScenario,
  type CartMethodSummariesResult,
  type PickupStoreSummary,
} from "@/lib/cart-method-summaries";
import { formatHoldNoticeForPart } from "@/lib/hold-display";
import type {
  AlternativeMethodOption,
  CartLine,
  RemainderLine,
  RemainderResolution,
  ScenarioPart,
  ScenarioResult,
} from "@/lib/types";

const DEMO_RECIPIENT_FULL_NAME = "Петрова-Водкина Елизавета Валерьяновна";

function phoneHasMinDigits(value: string, min = 10): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= min;
}

type CheckoutCopy = ReturnType<typeof unresolvedBlockCopy>;

type Bootstrap = {
  cities: { id: string; name: string; hasClickCollect: boolean }[];
  deliveryMethods: { id: string; code: string; name: string }[];
  products: { id: string; name: string; price: number; image: string; sku: string; sizeLabel?: string | null }[];
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
  pickupSummaryByStore: Record<string, Record<string, PickupStoreSummary>>;
  /** Тексты UI чекаута из DisclaimerTemplate (см. common.unresolvedBlock*) */
  checkoutCopy?: CheckoutCopy;
};

type MethodSummary = Bootstrap["methodSummaryByCity"][string]["courier"];
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

function scrollToCheckoutRecipientAuth() {
  document.getElementById("checkout-recipient-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => {
    document.getElementById("checkout-recipient-phone")?.focus();
  }, 350);
}

function GjMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg bg-neutral-900 font-bold text-white ${className}`}
    >
      GJ
    </span>
  );
}

type BonusPointsToggleProps = {
  bonusOn: boolean;
  promoApplied: boolean;
  amountLabel: string;
  onToggle: (next: boolean) => void;
};

function BonusPointsToggle({ bonusOn, promoApplied, amountLabel, onToggle }: BonusPointsToggleProps) {
  const blocked = promoApplied;
  return (
    <div className="flex w-full items-center gap-3">
      <GjMark className="h-8 w-8 text-[10px]" />
      <div className="min-w-0 flex-1">
        <span className="cu-label-primary min-w-0 text-neutral-900">
          Списать с карты GJ {amountLabel}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={bonusOn}
        disabled={blocked}
        onClick={() => {
          if (blocked) return;
          onToggle(!bonusOn);
        }}
        className={`relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 ${
          blocked ? "cursor-not-allowed opacity-45" : "cursor-pointer"
        } ${bonusOn ? "bg-neutral-900" : "bg-neutral-300"}`}
      >
        <span className="sr-only">Списать бонусы с карты GJ</span>
        <span
          className={`pointer-events-none block h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
            bonusOn ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

/** Пока нет входа по телефону — подсказка перейти к блоку «Мои данные». */
function BonusAuthBar() {
  return (
    <button
      type="button"
      onClick={() => scrollToCheckoutRecipientAuth()}
      aria-label="Перейти к входу по телефону, чтобы копить и списывать бонусы"
      className="flex w-full items-center gap-3 rounded-xl p-3 text-left text-neutral-900 transition hover:opacity-90 active:opacity-90"
    >
      <GjMark className="h-10 w-10 text-[11px]" />
      <span className="min-w-0 flex-1 text-sm leading-snug text-neutral-900">
        <span className="block">Войдите в аккаунт, чтобы копить</span>
        <span className="block">и списывать бонусы GJ</span>
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

const MOCK_SLOTS = ["9:00–12:00", "12:00–15:00", "15:00–18:00", "18:00–21:00", "21:00–23:00"];

function startOfStableCalendarDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

function addCalendarDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatRuShortDayMonth(d: Date): string {
  const s = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return s.replace(/\s*г\.?\s*$/i, "").trim();
}

function formatRuWeekdayShort(d: Date): string {
  return d.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "").trim().toLowerCase();
}

function formatRuDayMonthLong(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }).replace(/\s*г\.?\s*$/i, "").trim();
}

function splitCourierDateLabel(label: string): { primary: string; secondary: string } {
  const dayMatch = label.match(/(\d{1,2})/);
  const isTomorrow = /^завтра/i.test(label.trim());
  const primary = dayMatch?.[1] ?? (isTomorrow ? "Завтра" : label.trim());
  if (isTomorrow) return { primary, secondary: "завтра" };
  const secondary = label
    .replace(/\d{1,2}/g, "")
    .replace(/[,.\s]+/g, " ")
    .trim()
    .toLowerCase();
  return { primary, secondary: secondary || "дата" };
}

function parseCheckoutInformer(raw: string): { title: string; body: string } {
  const text = raw.trim();
  if (!text) return { title: "", body: "" };
  if (text.includes("\n")) {
    const [title, ...rest] = text.split("\n");
    return { title: title.trim(), body: rest.join(" ").trim() };
  }
  if (text.includes("::")) {
    const [title, ...rest] = text.split("::");
    return { title: title.trim(), body: rest.join("::").trim() };
  }
  const sentenceSplit = text.match(/^(.+?[.!?])\s+(.+)$/);
  if (sentenceSplit) {
    return {
      title: sentenceSplit[1]!.replace(/[.!?]\s*$/, "").trim(),
      body: sentenceSplit[2]!.trim(),
    };
  }
  return { title: text, body: "" };
}

/** Ближайшие 10 календарных дней: «Завтра, …» + остальные даты в формате `17 пт`. */
function buildCourierDateLabels(reference: Date = new Date()): string[] {
  const base = startOfStableCalendarDay(reference);
  return Array.from({ length: 10 }, (_, idx) => {
    const day = addCalendarDays(base, idx + 1);
    if (idx === 0) return `Завтра, ${formatRuShortDayMonth(day)}`;
    const dayNum = day.getDate();
    return `${dayNum} ${formatRuWeekdayShort(day)}`;
  });
}
/** Демо: лимит списания с карты лояльности и сумма в подписи «Списать с карты GJ …» */
const GJ_LOYALTY_MAX_SPEND_RUB = 1000;
/** Имя перевозчика в составе заголовка курьерской карточки */
const COURIER_CARRIER_LABEL = "СДЭК";

function stripStoreNameForCaption(name: string) {
  return name.replace(/^\s*Магазин\s+/i, "").trim() || name;
}

/** Одна строка в шапке карточки: перевозчик + откуда отгрузка (для сплита и читаемости на тестах). */
function courierPartHeadline(part: ScenarioPart): string {
  if (part.mode !== "courier") return COURIER_CARRIER_LABEL;
  const raw = part.sourceName.trim();
  if (part.sourceType === "warehouse") {
    /** Без названия склада: в данных оно может быть длинным и не нести ценности для покупателя. */
    return `${COURIER_CARRIER_LABEL} со склада`;
  }
  const place = raw ? stripStoreNameForCaption(raw) : "";
  return place ? `${COURIER_CARRIER_LABEL} из магазина ${place}` : `${COURIER_CARRIER_LABEL} из магазина`;
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
    if (!summary.hasSplit) return "";
    if (summary.availableUnits <= 0) return `0 из ${summary.totalUnits} товаров`;
    return "";
  }
  if (!summary.hasSplit) return "";
  if (summary.availableUnits <= 0) return `0 из ${summary.totalUnits} товаров`;
  return `${summary.availableUnits} из ${summary.totalUnits} товаров`;
}

function optionCoverageLabel(summary?: MethodSummary) {
  if (!summary || summary.totalUnits <= 0) return "Нет данных";
  if (summary.availableUnits <= 0) return "Недоступно";
  return `${summary.availableUnits} из ${summary.totalUnits} ${pluralizeProducts(summary.totalUnits)}`;
}

function mergeProductQtyForPreview(lines: { productId: string; quantity: number }[]) {
  const m = new Map<string, number>();
  for (const l of lines) {
    m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity);
  }
  return [...m.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

function splitPvzLinePreviewFromScenario(scenario: ScenarioResult): CartMethodSummariesResult["pvzLinePreview"] {
  const available = mergeProductQtyForPreview(
    scenario.parts.filter((p) => p.mode === "pvz").flatMap((p) => p.items),
  );
  const unavailable = mergeProductQtyForPreview(scenario.remainder);
  return { available, unavailable };
}

function methodSummaryFromPvzOption(option: AlternativeMethodOption | null | undefined): MethodSummary | undefined {
  if (!option || option.methodCode !== "pvz") return undefined;
  return {
    totalUnits: option.totalUnits,
    availableUnits: option.availableUnits,
    fullStoreCount: 0,
    hasSplit: option.unresolvedUnits > 0 || option.scenario.parts.length > 1,
  };
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
    marker: "border-neutral-500 bg-neutral-600 text-white",
    accent: "bg-neutral-100 text-neutral-800",
    card: "border-neutral-200 bg-white",
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
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden className="text-white">
      <path
        d="M3 7L6 10L11 4"
        stroke="currentColor"
        strokeWidth="1.5"
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
}: {
  deliveryDone: boolean;
  recipientDone: boolean;
  paymentDone: boolean;
}) {
  /** «Оформление» не подсвечиваем зелёным — заказ ещё не отправлен, этап завершается кнопкой. */
  const items: { label: string; done: boolean }[] = [
    { label: "Доставка", done: deliveryDone },
    { label: "Получатель", done: recipientDone },
    { label: "Способ оплаты", done: paymentDone },
    { label: "Оформление", done: false },
  ];
  return (
    <nav className="mb-0" aria-label="Этапы оформления заказа">
      <div className="relative grid grid-cols-4">
        <div
          className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-2 z-0 h-px bg-neutral-950"
          aria-hidden
        />
        {items.map(({ label, done }) => (
          <div key={label} className="relative z-10 flex flex-col items-center gap-1">
            <div
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                done ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-900 bg-white"
              }`}
            >
              {done ? <StepperCheckIcon /> : null}
            </div>
            <span className="cu-stepper-label">{label}</span>
          </div>
        ))}
      </div>
    </nav>
  );
}

type SheetProductRef = { image: string; name?: string };

function SheetThumbLabeledRow({
  label,
  items,
  productsById,
  leadText,
  holdText,
}: {
  label: string;
  items: { productId: string; quantity: number }[];
  productsById: Record<string, SheetProductRef>;
  /** Срок готовности / доставки (как в карточке отправления) */
  leadText?: string;
  /** Срок хранения (как в PartCard) */
  holdText?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-neutral-100 bg-neutral-50/70 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      {leadText || holdText ? (
        <div className="mt-1 space-y-0.5 text-[11px] font-normal normal-case leading-snug tracking-normal text-neutral-600">
          {leadText ? <p>{leadText}</p> : null}
          {holdText ? <p>{holdText}</p> : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((it, ix) => (
          <div key={`${it.productId}-${ix}`} className="flex flex-col items-center gap-0.5">
            <div className="relative aspect-[3/4] w-10 overflow-hidden rounded-md bg-neutral-100">
              <SafeProductImage
                src={productsById[it.productId]?.image ?? ""}
                alt={productsById[it.productId]?.name ?? ""}
                fill
                className="object-cover"
                sizes="40px"
              />
              {it.quantity >= 2 ? (
                <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-neutral-900/90 px-[2px] text-[7px] font-semibold leading-none text-white ring-1 ring-white/30">
                  {it.quantity}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PickupStoreSelector({
  stores,
  selectedStoreId,
  lastChosenStoreId,
  productsById,
  onSelect,
}: {
  stores: PickupStoreOption[];
  selectedStoreId: string;
  /** Подсказка «выбирали в прошлый раз» — без автоподстановки выбора */
  lastChosenStoreId?: string | null;
  productsById: Record<string, SheetProductRef>;
  onSelect: (storeId: string) => void;
}) {
  const [storeSearch, setStoreSearch] = useState("");

  const filteredStores = useMemo(() => {
    const q = storeSearch.trim().toLocaleLowerCase("ru");
    if (!q) return stores;
    return stores.filter((store) => store.name.toLocaleLowerCase("ru").includes(q));
  }, [stores, storeSearch]);

  if (stores.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        В этом городе пока нет активных магазинов для самовывоза.
      </div>
    );
  }

  const mapStores = filteredStores;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-neutral-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-3">
        <div className="relative h-52 overflow-hidden rounded-xl border border-white/80 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(226,232,240,0.92))]">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%),linear-gradient(transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%)]" />
          {mapStores.map((store) => {
            const tone = pickupStoreTone(store.summary);
            const storeIx = stores.findIndex((s) => s.id === store.id);
            const pos = PICKUP_MAP_POSITIONS[(storeIx >= 0 ? storeIx : 0) % PICKUP_MAP_POSITIONS.length]!;
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
        <label className="mt-3 block">
          <span className="sr-only">Поиск магазина</span>
          <input
            type="search"
            value={storeSearch}
            onChange={(e) => setStoreSearch(e.target.value)}
            placeholder="Найти магазин"
            autoComplete="off"
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-base outline-none focus:border-neutral-400"
          />
        </label>
      </div>

      <div className="space-y-2">
        {filteredStores.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
            По запросу магазины не найдены.
          </div>
        ) : (
          filteredStores.map((store) => {
            const tone = pickupStoreTone(store.summary);
            const selected = selectedStoreId === store.id;
            const wasLastChoice = lastChosenStoreId === store.id;
            return (
              <button
                key={store.id}
                type="button"
                onClick={() => onSelect(store.id)}
                className={`group w-full rounded-2xl border p-4 text-left transition ${selected ? "border-black bg-white" : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm"}`}
                aria-pressed={selected}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold leading-tight">{store.name}</span>
                      {wasLastChoice ? (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600">
                          Выбирали в прошлый раз
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 text-xs leading-relaxed text-neutral-500">{pickupStoreStatusDetail(store.summary)}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${tone.accent}`}>
                    {pickupStoreStatusTitle(store.summary)}
                  </span>
                </div>
                {store.summary?.immediateLines?.length ||
                store.summary?.laterLines?.length ||
                store.summary?.unavailableLines?.length ? (
                  <div className="mt-3 space-y-2.5 border-t border-neutral-100 pt-3">
                    <SheetThumbLabeledRow
                      label="Сразу в магазине"
                      items={store.summary?.immediateLines ?? []}
                      productsById={productsById}
                      leadText={store.summary?.reserveThumb?.leadText}
                      holdText={store.summary?.reserveThumb?.holdText}
                    />
                    <SheetThumbLabeledRow
                      label="Привезём в магазин"
                      items={store.summary?.laterLines ?? []}
                      productsById={productsById}
                      leadText={store.summary?.collectThumb?.leadText}
                      holdText={store.summary?.collectThumb?.holdText}
                    />
                    <SheetThumbLabeledRow
                      label="Недоступно здесь"
                      items={store.summary?.unavailableLines ?? []}
                      productsById={productsById}
                      leadText={store.summary?.unavailableThumb?.leadText}
                      holdText={store.summary?.unavailableThumb?.holdText}
                    />
                  </div>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Тот же экран «карта + список», что и при выборе самовывоза GJ на чекауте — правки в одном месте для обоих потоков. */
function PickupStoreSelectionOverlay({
  open,
  onDismiss,
  stores,
  selectedStoreId,
  lastChosenStoreId,
  productsById,
  onSelectStore,
  zOverlayClass = "z-[100]",
}: {
  open: boolean;
  onDismiss: () => void;
  stores: PickupStoreOption[];
  selectedStoreId: string;
  lastChosenStoreId?: string | null;
  productsById: Record<string, SheetProductRef>;
  onSelectStore: (storeId: string) => void;
  zOverlayClass?: string;
}) {
  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 ${zOverlayClass} flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6`}
    >
      <button type="button" aria-label="Закрыть выбор магазина" className="absolute inset-0" onClick={onDismiss} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[95dvh] w-full max-w-2xl overflow-y-auto overscroll-y-contain rounded-t-3xl bg-white shadow-2xl sm:max-h-[95vh] sm:rounded-3xl"
      >
        <div className="sticky top-0 z-20 border-b border-neutral-100 bg-white px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="cu-sheet-title">Самовывоз из магазина</h3>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-full border border-neutral-900 bg-white px-3 py-1 text-sm font-medium text-neutral-900"
            >
              Закрыть
            </button>
          </div>
        </div>
        <div className="px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
          <PickupStoreSelector
            stores={stores}
            selectedStoreId={selectedStoreId}
            lastChosenStoreId={lastChosenStoreId}
            productsById={productsById}
            onSelect={onSelectStore}
          />
        </div>
      </div>
    </div>
  );
}

/** Тот же экран с картой ПВЗ, что на основном чекауте — правки в одном месте. */
function PvzPointSelectionOverlay({
  open,
  onDismiss,
  points,
  selectedPointId,
  lastChosenPointId,
  summary,
  linePreview,
  pvzSheetThumbMeta,
  productsById,
  onSelectPoint,
  zOverlayClass = "z-[100]",
}: {
  open: boolean;
  onDismiss: () => void;
  points: PvzPointOption[];
  selectedPointId: string;
  lastChosenPointId?: string | null;
  summary?: MethodSummary;
  linePreview?: CartMethodSummariesResult["pvzLinePreview"];
  pvzSheetThumbMeta?: CartMethodSummariesResult["pvzSheetThumbMeta"];
  productsById: Record<string, SheetProductRef>;
  onSelectPoint: (pointId: string) => void;
  zOverlayClass?: string;
}) {
  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 ${zOverlayClass} flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6`}
    >
      <button type="button" aria-label="Закрыть выбор ПВЗ" className="absolute inset-0" onClick={onDismiss} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[95dvh] w-full max-w-2xl overflow-y-auto overscroll-y-contain rounded-t-3xl bg-white shadow-2xl sm:max-h-[95vh] sm:rounded-3xl"
      >
        <div className="sticky top-0 z-20 border-b border-neutral-100 bg-white px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="cu-sheet-title">Пункт выдачи заказа</h3>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-full border border-neutral-900 bg-white px-3 py-1 text-sm font-medium text-neutral-900"
            >
              Закрыть
            </button>
          </div>
        </div>
        <div className="px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
          <PvzPointSelector
            points={points}
            selectedPointId={selectedPointId}
            lastChosenPointId={lastChosenPointId}
            summary={summary}
            linePreview={linePreview}
            pvzSheetThumbMeta={pvzSheetThumbMeta}
            productsById={productsById}
            onSelect={onSelectPoint}
          />
        </div>
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
          <p className="mt-1 text-xs text-neutral-500">{pickupStoreStatusDetail(store.summary)}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange();
          }}
          className="shrink-0 rounded-lg border border-neutral-900 bg-white px-3 py-2 text-xs font-medium text-neutral-900"
        >
          Изменить
        </button>
      </div>
    </div>
  );
}

function PvzPointSelector({
  points,
  selectedPointId,
  lastChosenPointId,
  summary,
  linePreview,
  pvzSheetThumbMeta,
  productsById,
  onSelect,
}: {
  points: PvzPointOption[];
  selectedPointId: string;
  lastChosenPointId?: string | null;
  summary?: MethodSummary;
  linePreview?: CartMethodSummariesResult["pvzLinePreview"];
  pvzSheetThumbMeta?: CartMethodSummariesResult["pvzSheetThumbMeta"];
  productsById: Record<string, SheetProductRef>;
  onSelect: (pointId: string) => void;
}) {
  const [pvzSearch, setPvzSearch] = useState("");

  const filteredPoints = useMemo(() => {
    const q = pvzSearch.trim().toLocaleLowerCase("ru");
    if (!points.length) return [];
    if (!q) return points;
    return points.filter(
      (p) =>
        p.name.toLocaleLowerCase("ru").includes(q) || p.address.toLocaleLowerCase("ru").includes(q),
    );
  }, [points, pvzSearch]);

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        В этом городе пока нет доступных ПВЗ.
      </div>
    );
  }

  const tone = pvzPointTone(summary);
  const mapPoints = filteredPoints;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-neutral-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-3">
        <div className="relative h-52 overflow-hidden rounded-xl border border-white/80 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(226,232,240,0.92))]">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%),linear-gradient(transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%)]" />
          {mapPoints.map((point) => {
            const pointIx = points.findIndex((p) => p.id === point.id);
            const pos = PICKUP_MAP_POSITIONS[(pointIx >= 0 ? pointIx : 0) % PICKUP_MAP_POSITIONS.length]!;
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
        <label className="mt-3 block">
          <span className="sr-only">Поиск пункта выдачи</span>
          <input
            type="search"
            value={pvzSearch}
            onChange={(e) => setPvzSearch(e.target.value)}
            placeholder="Найти пункт или адрес"
            autoComplete="off"
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-base outline-none focus:border-neutral-400"
          />
        </label>
      </div>

      <div className="space-y-2">
        {filteredPoints.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
            По запросу пункты не найдены.
          </div>
        ) : (
          filteredPoints.map((point) => {
          const selected = selectedPointId === point.id;
          const wasLastChoice = lastChosenPointId === point.id;
          return (
            <button
              key={point.id}
              type="button"
              onClick={() => onSelect(point.id)}
              className={`group w-full rounded-2xl border p-4 text-left transition ${selected ? "border-black bg-white" : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm"}`}
              aria-pressed={selected}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold leading-tight">{point.name}</span>
                    {wasLastChoice ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600">
                        Выбирали в прошлый раз
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 text-sm text-neutral-900">{point.address}</div>
                  <div className="mt-1 text-xs leading-relaxed text-neutral-500">{pvzPointStatusDetail(summary)}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${tone.accent}`}>
                  {pvzPointCountLabel(summary)}
                </span>
              </div>
              {linePreview && (linePreview.available.length > 0 || linePreview.unavailable.length > 0) ? (
                <div className="mt-3 space-y-2.5 border-t border-neutral-100 pt-3">
                  <SheetThumbLabeledRow
                    label="В пункте выдачи"
                    items={linePreview.available}
                    productsById={productsById}
                    leadText={pvzSheetThumbMeta?.atPoint.leadText}
                    holdText={pvzSheetThumbMeta?.atPoint.holdText}
                  />
                  <SheetThumbLabeledRow
                    label="В ПВЗ недоступно"
                    items={linePreview.unavailable}
                    productsById={productsById}
                    leadText="Можно выбрать другой способ доставки"
                  />
                </div>
              ) : null}
            </button>
          );
          })
        )}
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
          className="shrink-0 rounded-lg border border-neutral-900 bg-white px-3 py-2 text-xs font-medium text-neutral-900"
        >
          Изменить
        </button>
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
          className="shrink-0 rounded-lg border border-neutral-900 bg-white px-3 py-2 text-xs font-medium text-neutral-900"
        >
          Изменить
        </button>
      </div>
    </div>
  );
}

/** Прототип: подсказки адреса без внешнего API (после 3+ символов в поле). */
const MOCK_COURIER_ADDRESS_HINTS = [
  "г Москва, Пролетарский пр-кт",
  "г Москва, ул Правды",
  "г Москва, ул Правобережная",
  "г Москва, ул Прасковьина",
  "г Москва, ул Преображенская",
  "г Москва, Преображенская наб",
  "г Москва, Пресненская наб",
  "г Москва, ул Пречистенка",
  "г Москва, Пречистенская наб",
  "г Москва, ул Красная Пресня",
  "г Москва, ул Преображенский Вал",
  "г Москва, ул Тверская",
  "г Москва, ул Арбат",
  "г Москва, Ленинский пр-кт",
  "г Москва, ул Большая Дмитровка",
  "г Москва, наб Космодамианская",
  "г Москва, ул Никольская",
  "г Москва, Кутузовский пр-кт",
] as const;

const ADDRESS_HINT_MAX = 15;

function filterAddressHints(query: string): string[] {
  const q = query.trim();
  if (q.length < 3) return [];
  const low = q.toLowerCase();
  return MOCK_COURIER_ADDRESS_HINTS.filter((a) => a.toLowerCase().includes(low)).slice(0, ADDRESS_HINT_MAX);
}

function highlightStreetFragment(street: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return street;
  const idx = street.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return street;
  return (
    <>
      {street.slice(0, idx)}
      <span className="font-medium text-sky-600">{street.slice(idx, idx + q.length)}</span>
      {street.slice(idx + q.length)}
    </>
  );
}

function AddressSuggestRow({ address, query, onPick }: { address: string; query: string; onPick: () => void }) {
  const m = address.match(/^(г\s+)(Москва)(,\s*)(.*)$/i);
  const label = m ? (
    <span className="text-left text-sm leading-snug text-neutral-900">
      {m[1]}
      <span className="text-sky-600">{m[2]}</span>
      {m[3]}
      {highlightStreetFragment(m[4] ?? "", query)}
    </span>
  ) : (
    <span className="text-left text-sm text-neutral-900">{address}</span>
  );

  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full border-b border-neutral-100 px-0 py-2 text-left transition last:border-b-0 hover:bg-neutral-50 active:bg-neutral-100"
    >
      {label}
    </button>
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
  const [pickedFromHints, setPickedFromHints] = useState(false);
  /** Окно открыто с уже заполненным адресом; сбрасывается, если пользователь стёр поле целиком */
  const [prefillSubmitAllowed, setPrefillSubmitAllowed] = useState(() => !!initialValue.trim());
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [layoutNarrow, setLayoutNarrow] = useState(true);
  /** Отступ снизу до нижней границы visualViewport (клавиатура), px — только узкая вёрстка */
  const [keyboardOverlapPx, setKeyboardOverlapPx] = useState(0);

  useEffect(() => {
    const el = addressInputRef.current;
    if (!el) return;
    el.focus();
    const t = window.setTimeout(() => el.focus(), 150);
    return () => window.clearTimeout(t);
  }, []);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 639.9px)");
    const syncNarrow = () => setLayoutNarrow(mq.matches);
    syncNarrow();
    mq.addEventListener("change", syncNarrow);
    return () => mq.removeEventListener("change", syncNarrow);
  }, []);

  useLayoutEffect(() => {
    if (!layoutNarrow) {
      setKeyboardOverlapPx(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const syncKeyboard = () => {
      setKeyboardOverlapPx(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    syncKeyboard();
    vv.addEventListener("resize", syncKeyboard);
    vv.addEventListener("scroll", syncKeyboard);
    return () => {
      vv.removeEventListener("resize", syncKeyboard);
      vv.removeEventListener("scroll", syncKeyboard);
    };
  }, [layoutNarrow]);

  const hints = useMemo(() => filterAddressHints(value), [value]);
  const manualAddressPath = value.trim().length >= 3 && hints.length === 0;
  const showSelectAddressCta =
    value.trim().length > 0 &&
    (pickedFromHints || prefillSubmitAllowed || manualAddressPath);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <button type="button" aria-label="Закрыть ввод адреса" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Куда доставить"
        className="relative z-10 flex h-[95dvh] max-h-[95dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
      >
        <div className="relative flex h-11 shrink-0 items-center justify-center border-b border-neutral-100 px-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute left-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-100"
          >
            <span className="text-2xl font-light leading-none" aria-hidden>
              ×
            </span>
          </button>
          <h2 className="cu-section-title pointer-events-none px-10 text-center">Куда доставить</h2>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-none sm:max-h-[min(85vh,36rem)]">
          <div
            className={
              showSelectAddressCta && layoutNarrow
                ? "flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-2 pb-[5.75rem]"
                : "flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-2 sm:flex-none sm:overflow-y-auto"
            }
          >
            <form
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
              }}
              className="contents"
            >
              <label htmlFor="courier-address-input" className="sr-only">
                Адрес доставки
              </label>
              <input
                id="courier-address-input"
                ref={addressInputRef}
                type="text"
                name="gj-courier-address-demo"
                enterKeyHint="done"
                autoComplete="off"
                inputMode="text"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                className="min-h-[2.75rem] w-full border-0 border-b border-neutral-200 bg-transparent py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none focus:ring-0"
                placeholder="Укажите адрес доставки"
                value={value}
                onChange={(e) => {
                  const v = e.target.value;
                  setValue(v);
                  if (!v.trim()) {
                    setPickedFromHints(false);
                    setPrefillSubmitAllowed(false);
                  }
                }}
              />
            </form>

            {hints.length > 0 ? (
              <div
                role="listbox"
                aria-label="Подсказки адреса"
                className="mt-2 min-h-0 flex-1 basis-0 overflow-y-auto overscroll-y-contain sm:max-h-[min(50vh,20rem)] sm:flex-none sm:basis-auto"
              >
                {hints.map((addr) => (
                  <AddressSuggestRow
                    key={addr}
                    address={addr}
                    query={value.trim()}
                    onPick={() => {
                      setValue(addr);
                      setPickedFromHints(true);
                      requestAnimationFrame(() => addressInputRef.current?.focus());
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="min-h-0 flex-1" aria-hidden />
            )}
          </div>

          {showSelectAddressCta && !layoutNarrow ? (
            <div className="shrink-0 border-t border-neutral-100 bg-white px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => onSave(value.trim(), target)}
                className="w-full rounded-2xl bg-neutral-900 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2"
              >
                Выбрать адрес
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {showSelectAddressCta && layoutNarrow ? (
        <div
          className="pointer-events-auto fixed left-1/2 z-[120] w-full max-w-lg -translate-x-1/2 border-t border-neutral-100 bg-white px-4 py-2 shadow-[0_-6px_24px_rgba(0,0,0,0.08)]"
          style={{ bottom: keyboardOverlapPx }}
        >
          <div className="pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]">
            <button
              type="button"
              onClick={() => onSave(value.trim(), target)}
              className="w-full rounded-2xl bg-neutral-900 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2"
            >
              Выбрать адрес
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Горизонтальный ряд превью 3:4 как в PartCard: без подписи, бейдж количества при ≥ 2 шт. */
function RemainderLinesThumbStrip({
  lines,
  productsById,
}: {
  lines: RemainderLine[];
  productsById: Record<string, Bootstrap["products"][number]>;
}) {
  if (lines.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {lines.map((line, lineIx) => {
        const sizeLabel = productsById[line.productId]?.sizeLabel?.trim();
        return (
          <div key={`${line.productId}-${lineIx}`} className="flex w-10 shrink-0 flex-col items-center gap-0.5">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-neutral-100">
              <SafeProductImage
                src={productsById[line.productId]?.image ?? ""}
                alt=""
                fill
                className="object-cover"
                sizes="40px"
              />
              {line.quantity >= 2 ? (
                <span
                  className="absolute right-0.5 top-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-neutral-900/90 px-[3px] text-[7px] font-semibold leading-none tabular-nums text-white ring-1 ring-white/35"
                  aria-label={`${line.quantity} шт.`}
                >
                  {line.quantity}
                </span>
              ) : null}
            </div>
            {sizeLabel ? (
              <span className="w-full text-center text-[10px] font-medium leading-none text-neutral-600">
                {sizeLabel}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function UnresolvedItemsBlock({
  resolution,
  productsById,
  onChoose,
  copy,
  ctaDisabled,
  suppressEmptyOptionsHint,
}: {
  resolution: RemainderResolution;
  productsById: Record<string, Bootstrap["products"][number]>;
  onChoose: () => void;
  copy: CheckoutCopy;
  /** Пока грузим варианты доставки для строк */
  ctaDisabled?: boolean;
  /** Не показывать плашку «нет способов», пока options ещё не подтянулись */
  suppressEmptyOptionsHint?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-tight text-neutral-900">{copy.title}</p>
        <p className="mt-2 text-sm leading-snug text-neutral-600">{copy.subtitle}</p>
      </div>

      <div className="mt-6 rounded-xl bg-neutral-50/70 p-3.5 sm:p-4">
        <RemainderLinesThumbStrip lines={resolution.lines} productsById={productsById} />
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={onChoose}
          disabled={ctaDisabled}
          className="w-full rounded-2xl bg-black px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-900 disabled:pointer-events-none disabled:opacity-40"
        >
          {copy.cta}
        </button>
      </div>

      {resolution.options.length === 0 && !suppressEmptyOptionsHint ? (
        <div className="mt-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 p-3.5 text-sm leading-snug text-neutral-600">
          {copy.noAlternatives}
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
          <p className="cu-label-primary text-neutral-900">{methodGroupLabel(option.methodCode)}</p>
        </div>
        {option.methodCode === "pickup" && pickupStore ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-neutral-800">{pickupStore.name}</p>
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 rounded-lg border border-neutral-900 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900"
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
              className="shrink-0 rounded-lg border border-neutral-900 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900"
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
              className="shrink-0 rounded-lg border border-neutral-900 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900"
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
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg border border-neutral-900 bg-white px-3 py-2 text-xs font-medium text-neutral-900"
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
  lastChosenPickupStoreId,
  lastChosenPvzPointId,
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
  /** Та же подсказка «выбирали в прошлый раз», что на основном чекауте */
  lastChosenPickupStoreId?: string | null;
  lastChosenPvzPointId?: string | null;
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
  const [pvzSelectorOpen, setPvzSelectorOpen] = useState(false);
  const splitPvzSummary = useMemo(() => methodSummaryFromPvzOption(pvzOption), [pvzOption]);
  const splitPvzLinePreview = useMemo(
    () => (pvzOption ? splitPvzLinePreviewFromScenario(pvzOption.scenario) : undefined),
    [pvzOption],
  );
  const splitPvzSheetThumbMeta = useMemo(
    () => (pvzOption ? buildPvzSheetThumbMeta(pvzOption.scenario, courierOption?.scenario) : undefined),
    [pvzOption, courierOption],
  );
  const splitPickupStores = useMemo(
    () =>
      pickupOptions
        .filter((o): o is AlternativeMethodOption & { storeId: string } => Boolean(o.storeId))
        .map((opt) => ({
          id: opt.storeId,
          name: opt.storeName?.trim() || "Магазин",
          summary: pickupSummaryFromScenario(opt.totalUnits, opt.scenario, courierOption?.scenario),
        })),
    [pickupOptions, courierOption],
  );
  const selectedPickupOption =
    pickupOptions.find((option) => option.storeId === selectedPickupStoreId) ?? null;
  const selectedPvzPoint = selectedPvzId.trim()
    ? pvzPoints.find((point) => point.id === selectedPvzId)
    : undefined;
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
    if (methodCode === "pvz") {
      setSelectedMethod("pvz");
      setPvzSelectorOpen(true);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
      <button type="button" aria-label="Закрыть выбор способа получения" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Выберите способ получения"
        className="relative z-10 flex h-[95dvh] max-h-[95dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
      >
        <div className="shrink-0 border-b border-neutral-100 bg-white px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="cu-sheet-title">Выберите способ получения</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-neutral-900 bg-white px-3 py-1 text-sm font-medium text-neutral-900"
            >
              Закрыть
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 basis-0 overflow-y-auto overscroll-y-contain px-4 pb-4 pt-3 sm:max-h-[calc(90vh-10rem)] sm:flex-none sm:basis-auto sm:px-5 sm:pb-4 sm:pt-3">
        <div className="rounded-xl bg-neutral-50 p-3">
          <RemainderLinesThumbStrip lines={resolution.lines} productsById={productsById} />
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
              className="mt-3 rounded-lg border border-neutral-900 bg-white px-3 py-2 text-xs font-medium text-neutral-900"
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
              className="mt-3 rounded-lg border border-neutral-900 bg-white px-3 py-2 text-xs font-medium text-neutral-900"
            >
              {courierAddress.trim() ? "Изменить адрес" : "Указать адрес"}
            </button>
          </div>
        ) : null}

        {selectedMethod === "pvz" ? (
          <div className="mt-4 rounded-xl border border-neutral-200 p-4">
            <p className="text-sm font-semibold">ПВЗ для этой части заказа</p>
            {selectedPvzPoint ? (
              <>
                <p className="mt-2 text-sm text-neutral-900">{selectedPvzPoint.name}</p>
                <p className="mt-1 text-xs text-neutral-500">{selectedPvzPoint.address}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">Выберите пункт на карте или в списке.</p>
            )}
            <button
              type="button"
              onClick={() => setPvzSelectorOpen(true)}
              className="mt-3 rounded-lg border border-neutral-900 bg-white px-3 py-2 text-xs font-medium text-neutral-900"
            >
              {selectedPvzPoint ? "Изменить ПВЗ" : "Выбрать ПВЗ"}
            </button>
          </div>
        ) : null}
        </div>

        <div className="shrink-0 border-t border-neutral-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          <div className="flex gap-2">
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
              className="rounded-xl border border-neutral-900 bg-white px-4 py-3 text-sm font-medium text-neutral-900"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
      <PickupStoreSelectionOverlay
        open={pickupSelectorOpen}
        onDismiss={() => setPickupSelectorOpen(false)}
        stores={splitPickupStores}
        selectedStoreId={selectedPickupStoreId}
        lastChosenStoreId={lastChosenPickupStoreId}
        productsById={productsById}
        onSelectStore={(nextStoreId) => {
          setSelectedPickupStoreId(nextStoreId);
          setPickupSelectorOpen(false);
        }}
        zOverlayClass="z-[110]"
      />
      <PvzPointSelectionOverlay
        open={pvzSelectorOpen}
        onDismiss={() => setPvzSelectorOpen(false)}
        points={pvzPoints}
        selectedPointId={selectedPvzId}
        lastChosenPointId={lastChosenPvzPointId}
        summary={splitPvzSummary}
        linePreview={splitPvzLinePreview}
        pvzSheetThumbMeta={splitPvzSheetThumbMeta}
        productsById={productsById}
        onSelectPoint={(nextPointId) => {
          onSelectPvz(nextPointId);
          setPvzSelectorOpen(false);
        }}
        zOverlayClass="z-[110]"
      />
    </div>
  );
}

function PartCard({
  part,
  included,
  onToggle,
  showSelectionControl = true,
  showRemainderHint,
  remainderKeepHint,
  selectedDateIx,
  selectedSlotIx,
  onDateChange,
  onSlotChange,
  badgeLabel,
  shipmentOrdinal,
  inGroup = false,
  courierDateLabels,
}: {
  part: ScenarioPart;
  included: boolean;
  onToggle: () => void;
  showSelectionControl?: boolean;
  /** Показываем подсказку только если реально есть remainder и текст не отключён в админке. */
  showRemainderHint: boolean;
  remainderKeepHint?: string;
  selectedDateIx?: number;
  selectedSlotIx?: number;
  onDateChange?: (dateIx: number) => void;
  onSlotChange?: (slotIx: number) => void;
  badgeLabel?: string;
  /** Номер отправления при сплите (1, 2, …); подпись в стиле `cu-block-heading` */
  shipmentOrdinal?: number;
  /** Без отдельной рамки — внутри общего блока заказа */
  inGroup?: boolean;
  /** Подписи дат курьера (от календаря), по индексу совпадают с `selectedDateIx` */
  courierDateLabels: string[];
}) {
  const visible = part.items.slice(0, 5);
  const extra = part.items.reduce((s, i) => s + i.quantity, 0) - visible.reduce((s, i) => s + i.quantity, 0);
  const sub = Math.round(part.subtotal);
  const ship = included ? part.deliveryPrice : 0;
  const isCourier = part.mode === "courier";
  const dateIx = Math.min(Math.max(selectedDateIx ?? 0, 0), Math.max(0, courierDateLabels.length - 1));
  const deliveryDate = isCourier ? courierDateLabels[dateIx] : null;
  const deliverySlot = isCourier ? MOCK_SLOTS[selectedSlotIx ?? 0] : null;
  const leadLabel = isCourier && deliveryDate && deliverySlot ? `${deliveryDate}, ${deliverySlot}` : part.leadTimeLabel;
  const isGjStorePickup = part.mode === "click_reserve" || part.mode === "click_collect";
  const isPvz = part.mode === "pvz";
  const holdLine = formatHoldNoticeForPart(part.mode, part.holdDays);
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
  const benefitLine = isGjStorePickup
    ? part.mode === "click_reserve"
      ? "Бесплатно · примерка"
      : "Бесплатно"
    : isPvz
      ? "Бесплатно · ПВЗ"
      : isCourier
        ? part.deliveryPrice <= 0
          ? "Бесплатная доставка"
          : `Курьер · ${fmt(part.deliveryPrice)}`
        : null;

  const headingName = isGjStorePickup
    ? part.sourceName
    : isCourier
      ? courierPartHeadline(part)
      : isPvz
        ? part.sourceName
        : partTitle;

  const subtitle = isGjStorePickup
    ? gjPickupHeadline
    : isPvz
      ? pvzHeadline
      : null;
  const courierHeadingDate = isCourier ? addCalendarDays(startOfStableCalendarDay(new Date()), dateIx + 1) : null;
  const courierHeading = isCourier
    ? dateIx === 0
      ? `Завтра, ${formatRuDayMonthLong(courierHeadingDate!)}`
      : formatRuDayMonthLong(courierHeadingDate!)
    : null;
  const primaryHeading = isCourier ? (courierHeading ?? headingName) : (subtitle ?? headingName);
  const secondaryHeading = primaryHeading === headingName ? null : headingName;
  /** Для курьера всегда показываем отдельный блок выбора даты/интервала. */
  const showCourierDeliveryRow = isCourier && Boolean(leadLabel);

  return (
    <div
      className={`transition ${
        inGroup ? "px-5 py-8" : "p-5"
      } ${
        inGroup
          ? included
            ? ""
            : "opacity-60"
          : `rounded-2xl bg-white ${included ? "" : "opacity-60"}`
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
            className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold leading-none ${
              included ? "border-black bg-black text-white" : "border-neutral-400 bg-white text-transparent"
            } ${part.canToggle ? "" : "opacity-40"}`}
          >
            ✓
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold leading-tight text-neutral-900">{primaryHeading}</p>
              {secondaryHeading ? (
                <p className="mt-1.5 text-sm leading-snug text-neutral-600">{secondaryHeading}</p>
              ) : null}
              {holdLine ? (
                <p className="mt-1.5 text-xs text-neutral-500">{holdLine}</p>
              ) : null}
              {benefitLine ? (
                <p className="cu-benefit mt-4">{benefitLine}</p>
              ) : null}
            </div>
            <span className="shrink-0 text-[17px] font-semibold leading-tight tabular-nums text-neutral-900">
              {fmt(sub + ship)}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2.5">
            {visible.map((it, thumbIx) => (
              <div
                key={`${it.productId}-${it.sizeLabel ?? ""}-${thumbIx}`}
                className="flex w-10 shrink-0 flex-col items-center gap-0.5"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-neutral-100">
                  <SafeProductImage src={it.image} alt="" fill className="object-cover" sizes="40px" />
                  {it.quantity >= 2 ? (
                    <span
                      className="absolute right-0.5 top-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-neutral-900/90 px-[3px] text-[7px] font-semibold leading-none tabular-nums text-white ring-1 ring-white/35"
                      aria-label={`${it.quantity} шт.`}
                    >
                      {it.quantity}
                    </span>
                  ) : null}
                </div>
                {it.sizeLabel ? (
                  <span className="w-full text-center text-[10px] font-medium leading-none text-neutral-600">
                    {it.sizeLabel}
                  </span>
                ) : null}
              </div>
            ))}
            {extra > 0 ? (
              <div className="flex aspect-[3/4] w-10 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-xs font-semibold text-neutral-500">
                +{extra}
              </div>
            ) : null}
          </div>

          {showCourierDeliveryRow ? (
            <div className="mt-4 space-y-2">
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {courierDateLabels.map((d, i) => {
                  const chunks = splitCourierDateLabel(d);
                  return (
                    <button
                      key={`courier-date-${i}`}
                      type="button"
                      onClick={() => onDateChange?.(i)}
                      className={`h-[50px] w-[62px] shrink-0 rounded-[18px] border px-2 py-1.5 text-center transition ${
                        i === dateIx
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white text-neutral-900"
                      }`}
                    >
                      <span className="block text-[14px] font-semibold leading-tight">{chunks.primary}</span>
                      <span className={`block text-[11px] leading-tight ${i === dateIx ? "text-white/85" : "text-neutral-600"}`}>
                        {chunks.secondary}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {MOCK_SLOTS.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSlotChange?.(i)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
                      i === (selectedSlotIx ?? 0)
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white text-neutral-900"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {showRemainderHint && remainderKeepHint ? (
            <p className="mt-3 text-xs text-neutral-500">{remainderKeepHint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ScenarioPartCardSkeleton({
  inGroup,
  showShipmentHeading,
}: {
  inGroup?: boolean;
  /** Плейсхолдер строки «Отправление N» как в PartCard при сплите */
  showShipmentHeading?: boolean;
}) {
  const inner = (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-neutral-200" />
      <div className="min-w-0 flex-1 space-y-4">
        {showShipmentHeading ? <div className="h-3.5 w-36 max-w-[14rem] rounded bg-neutral-200/85" /> : null}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="space-y-2">
              <div className="h-4 w-[72%] max-w-[260px] rounded-md bg-neutral-200" />
              <div className="h-3 w-[50%] max-w-[180px] rounded-md bg-neutral-100" />
            </div>
            <div className="mt-4 h-3 w-[38%] max-w-[140px] rounded-md bg-stone-200/90" />
          </div>
          <div className="h-5 w-20 shrink-0 rounded-md bg-neutral-200" />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex w-10 shrink-0 flex-col items-center gap-0.5">
              <div className="aspect-[3/4] w-full rounded-md bg-neutral-200/90" />
              <div className="h-2 w-6 rounded bg-neutral-200/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  if (inGroup) {
    return <div className="px-5 py-8">{inner}</div>;
  }
  return <div className="rounded-2xl bg-white p-5">{inner}</div>;
}

function ScenarioOrderSkeleton({ variant }: { variant: "unified" | "stacked" }) {
  if (variant === "stacked") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="pointer-events-none mb-8 space-y-4 select-none"
      >
        <span className="sr-only">Считаем доступные отправления и сроки.</span>
        <div className="animate-pulse">
          <ScenarioPartCardSkeleton showShipmentHeading />
        </div>
        <div className="animate-pulse">
          <ScenarioPartCardSkeleton showShipmentHeading />
        </div>
      </div>
    );
  }
  return (
    <section
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="pointer-events-none mb-8 select-none overflow-hidden rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100"
    >
      <span className="sr-only">Считаем доступные отправления и сроки.</span>
      <div className="animate-pulse space-y-2 px-4 py-4">
        <div className="h-3 w-36 rounded bg-neutral-200/90" />
        <div className="h-3 w-full max-w-sm rounded bg-neutral-100" />
        <div className="h-4 w-[85%] max-w-xs rounded bg-neutral-200/80" />
      </div>
      <div className="animate-pulse">
        <ScenarioPartCardSkeleton inGroup showShipmentHeading />
      </div>
      <div className="animate-pulse">
        <ScenarioPartCardSkeleton inGroup showShipmentHeading />
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
  /** Варианты доставки для позиций, снятых с отправления (чекбокс) — тот же контракт, что у API-остатка */
  const [manualRemainderResolution, setManualRemainderResolution] = useState<RemainderResolution | null>(null);
  const [manualRemainderFetchPending, setManualRemainderFetchPending] = useState(false);
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

  const checkoutSheetOpen =
    pickupSelectorOpen ||
    pvzSelectorOpen ||
    splitModalState !== null ||
    courierAddressModalTarget !== null ||
    phoneGateOpen;

  useLayoutEffect(() => {
    if (!checkoutSheetOpen) return;
    const { style } = document.body;
    const previousOverflow = style.overflow;
    style.overflow = "hidden";
    return () => {
      if (previousOverflow) {
        style.overflow = previousOverflow;
      } else {
        style.removeProperty("overflow");
      }
    };
  }, [checkoutSheetOpen]);

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
    lines: {
      productId: string;
      quantity: number;
      name: string;
      price: number;
      image: string;
      sizeLabel?: string | null;
    }[];
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
    pvzLinePreview?: CartMethodSummariesResult["pvzLinePreview"];
    pvzSheetThumbMeta?: CartMethodSummariesResult["pvzSheetThumbMeta"];
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
        const json = (await r.json()) as CartMethodSummariesResult;
        if (cancelled || !r.ok || !json.methodSummaries || !json.pickupSummaryByStore) return;
        setCartScopedSummaries({
          methodSummaries: json.methodSummaries,
          pickupSummaryByStore: json.pickupSummaryByStore,
          pvzLinePreview: json.pvzLinePreview,
          pvzSheetThumbMeta: json.pvzSheetThumbMeta,
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
    /** Сразу убираем прошлый сценарий, иначе один кадр показывает старые PartCard до скелетона. */
    setScenario(null);
    setRemainderResolution(null);
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

  useLayoutEffect(() => {
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

  /** Мета сроков в модалке ПВЗ: из сводки корзины или из текущего сценария ПВЗ */
  const pvzOverlayThumbMeta = useMemo(() => {
    if (cartDetail?.lines?.length && cartScopedSummaries?.pvzSheetThumbMeta) {
      return cartScopedSummaries.pvzSheetThumbMeta;
    }
    if (scenario?.deliveryMethodCode === "pvz") {
      return buildPvzSheetThumbMeta(scenario, null);
    }
    return undefined;
  }, [cartDetail?.lines?.length, cartScopedSummaries?.pvzSheetThumbMeta, scenario]);

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
  const courierDateLabels = useMemo(() => buildCourierDateLabels(), []);
  const promoFactor = promoApplied ? 0.8 : 1;

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

  /** Сумма единиц товара во включённых отправлениях (для бейджа «в заказе X из Y») */
  const includedOrderUnits = useMemo(
    () => includedParts.reduce((s, p) => s + p.items.reduce((ps, i) => ps + i.quantity, 0), 0),
    [includedParts],
  );

  const cartGoodsSubtotal = cartDetail?.subtotal ?? 0;
  /** Пока нет сценария доставки — берём сумму корзины; иначе из включённых частей */
  const goodsMerchForUi = allDisplayParts.length > 0 ? includedMerch : cartGoodsSubtotal;

  const payOnDeliveryOnlyEffective = includedParts.length > 1;

  useEffect(() => {
    if (!recipient) setBonusOn(false);
  }, [recipient]);

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

  const promoDiscount = promoApplied ? Math.round(goodsMerchForUi * 0.2) : 0;
  const payFinal =
    allDisplayParts.length > 0
      ? bonusOn
        ? Math.max(0, partsTotal - Math.min(GJ_LOYALTY_MAX_SPEND_RUB, includedMerch))
        : partsTotal
      : bonusOn
        ? Math.max(0, Math.round(cartGoodsSubtotal * promoFactor) - Math.min(GJ_LOYALTY_MAX_SPEND_RUB, goodsMerchForUi))
        : Math.round(cartGoodsSubtotal * promoFactor);

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

  /**
   * Позиции с отправлений с снятой галочкой, для которых ещё нет добора через «другое отправление».
   * Вторичные отправления хранят те же строки в `inputLines` — иначе блок «Как получить остальные товары»
   * дублирует уже оформленное во вторичном сценарии.
   */
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
    for (const sel of secondarySelections) {
      for (const line of sel.inputLines) {
        const cur = map.get(line.productId);
        if (!cur) continue;
        const dec = Math.min(cur.quantity, line.quantity);
        cur.quantity -= dec;
      }
    }
    return [...map.values()].filter((r) => r.quantity > 0);
  }, [allDisplayParts, included, secondarySelections]);

  /**
   * Первичное отправление снято с галочки, но те же строки уже оформлены вторичным блоком —
   * карточку скрываем, иначе можно снова включить и задвоить позиции в заказе.
   */
  const primaryPartKeysSupersededBySecondary = useMemo(() => {
    const parts = scenario?.parts;
    if (!parts?.length || !secondarySelections.length) return new Set<string>();

    const pool = new Map<string, number>();
    for (const sel of secondarySelections) {
      for (const line of sel.inputLines) {
        pool.set(line.productId, (pool.get(line.productId) ?? 0) + line.quantity);
      }
    }
    const poolMut = new Map(pool);
    const hidden = new Set<string>();

    for (const part of parts) {
      if (included[part.key] !== false) continue;
      let ok = true;
      for (const item of part.items) {
        const have = poolMut.get(item.productId) ?? 0;
        if (have < item.quantity) {
          ok = false;
          break;
        }
        poolMut.set(item.productId, have - item.quantity);
      }
      if (ok) hidden.add(part.key);
    }
    return hidden;
  }, [scenario?.parts, secondarySelections, included]);

  useEffect(() => {
    if (manualExcludedLines.length === 0) {
      setManualRemainderResolution(null);
      setManualRemainderFetchPending(false);
      return;
    }
    if (!cityId || !method) {
      setManualRemainderResolution(null);
      setManualRemainderFetchPending(false);
      return;
    }
    const lines = manualExcludedLines.map(({ productId, quantity }) => ({ productId, quantity }));
    setManualRemainderResolution({ lines, options: [] });
    setManualRemainderFetchPending(true);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/checkout/remainder-resolution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cityId,
            deliveryMethodCode: method,
            selectedStoreId: method === "pickup" ? storeId || null : null,
            lines,
          }),
        });
        const text = await res.text();
        const j = JSON.parse(text) as { remainderResolution?: RemainderResolution; error?: string };
        if (!res.ok) throw new Error(j.error ?? text);
        if (!cancelled) {
          setManualRemainderResolution(j.remainderResolution ?? { lines, options: [] });
        }
      } catch {
        if (!cancelled) setManualRemainderResolution({ lines, options: [] });
      } finally {
        if (!cancelled) setManualRemainderFetchPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manualExcludedLines, cityId, method, storeId]);

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

  const openManualRemainderSplitModal = useCallback(() => {
    if (!manualRemainderResolution?.lines.length) return;
    setSplitModalState({ mode: "add", editIndex: null, resolution: manualRemainderResolution });
  }, [manualRemainderResolution]);

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
    const orderBonusUsed = bonusOn ? Math.min(GJ_LOYALTY_MAX_SPEND_RUB, goodsMerchForUi) : 0;
    const payload = {
      parts: includedParts
        .map((p) => ({
          ...p,
          methodLabel: modeLabel(p.mode),
          items: p.items,
          subtotal: Math.round(p.subtotal),
          deliveryPrice: p.deliveryPrice,
          promoDiscount: 0,
          bonusUsed: 0,
          holdNotice: formatHoldNoticeForPart(p.mode, p.holdDays, new Date()) ?? undefined,
          selectedDate:
            p.mode === "courier"
              ? courierDateLabels[
                  Math.min(
                    Math.max(partSchedules[p.key]?.dateIx ?? 0, 0),
                    Math.max(0, courierDateLabels.length - 1),
                  )
                ]
              : undefined,
          selectedSlot: p.mode === "courier" ? MOCK_SLOTS[partSchedules[p.key]?.slotIx ?? 0] : undefined,
        })),
      orderPromoDiscount: promoDiscount,
      orderBonusUsed,
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

  /** Закрыли выбор магазина/ПВЗ без подтверждения точки — убираем способ, иначе остаётся плейсхолдер «Выберите…». */
  const dismissPickupSelector = () => {
    setPickupSelectorOpen(false);
    if (!storeId.trim()) setMethod(null);
  };
  const dismissPvzSelector = () => {
    setPvzSelectorOpen(false);
    if (!pvzId.trim()) setMethod(null);
  };

  if (bootError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-white px-4 py-8 text-sm text-neutral-800">
        <p className="font-semibold text-red-600">Не удалось загрузить оформление заказа</p>
        <p className="text-neutral-600">{bootError}</p>
        <p className="text-xs text-neutral-500">
          Проверьте <code className="rounded bg-neutral-100 px-1">DATABASE_URL</code> в окружении деплоя (ONREZA,
          Vercel и т.д.) и что инстанс PostgreSQL <strong>запущен</strong>. Символы в пароле в URL кодируйте (
          <code className="rounded bg-neutral-100 px-1">*</code>→<code className="rounded bg-neutral-100 px-1">%2A</code>,{" "}
          <code className="rounded bg-neutral-100 px-1">@</code>→<code className="rounded bg-neutral-100 px-1">%40</code>,{" "}
          <code className="rounded bg-neutral-100 px-1">%</code>→<code className="rounded bg-neutral-100 px-1">%25</code>
          ) — см. <code className="rounded bg-neutral-100 px-1">.env.example</code> /{" "}
          <code className="rounded bg-neutral-100 px-1">deploy/onreza.md</code>. Если база на Supabase (не Kaiki),
          для serverless часто нужен pooler — <code className="rounded bg-neutral-100 px-1">npm run supabase:urls</code>.
          Диагностика: <code className="rounded bg-neutral-100 px-1">/api/health</code>.
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
  /**
   * Стабильная нумерация «Отправление N» по порядку в сценарии среди видимых карточек.
   * Снятие галочки не сдвигает номера и не убирает подпись у соседних блоков (иначе UI прыгает).
   * Вторичные сценарии нумеруются отдельно внутри каждого блока добора.
   */
  const shipmentOrdinalForPartKey = (key: string) => {
    const primaryVisible = (scenario?.parts ?? []).filter(
      (p) => !primaryPartKeysSupersededBySecondary.has(p.key),
    );
    const pi = primaryVisible.findIndex((p) => p.key === key);
    if (pi >= 0) {
      return primaryVisible.length > 1 ? pi + 1 : undefined;
    }
    for (const sel of secondaryDisplaySelections) {
      const parts = sel.parts;
      const si = parts.findIndex((p) => p.key === key);
      if (si >= 0) {
        return parts.length > 1 ? si + 1 : undefined;
      }
    }
    return undefined;
  };
  const includedDeliveryTotal = includedParts.reduce((sum, part) => sum + part.deliveryPrice, 0);
  const includedSubtotalTotal = includedParts.reduce((sum, part) => sum + Math.round(part.subtotal * promoFactor), 0);
  const displayGoodsSubtotal =
    includedParts.length > 0
      ? includedSubtotalTotal
      : allDisplayParts.length > 0
        ? 0
        : Math.round(cartGoodsSubtotal * promoFactor);
  const keepSinglePartExpanded = !hasSplit && allDisplayParts.length === 1;

  const unifiedOrderBlock = !!method && !!scenario && scenario.parts.length > 0;

  const awaitingScenario =
    !!cityId &&
    !!method &&
    (method !== "courier" || primaryCourierAddress.trim().length > 0) &&
    (method !== "pickup" || storeId.trim().length > 0) &&
    (method !== "pvz" || pvzId.trim().length > 0);
  const showScenarioSkeleton = loading && awaitingScenario;

  const primarySplitContextBarVisible =
    !showScenarioSkeleton && !!scenario && scenarioInformersForBanner.length > 0;

  const renderPrimarySplitContextBar = (variant: "unified" | "stacked") => {
    if (!primarySplitContextBarVisible) return null;
    const parsed = scenarioInformersForBanner.map(parseCheckoutInformer).filter((x) => x.title || x.body);
    if (!parsed.length) return null;
    const primary = parsed[0]!;
    const extra = parsed.slice(1);
    const bodyLines: string[] = [];
    if (primary.body) bodyLines.push(primary.body);
    for (const item of extra) {
      const composed = item.body ? `${item.title}. ${item.body}` : item.title;
      if (composed.trim()) bodyLines.push(composed.trim());
    }
    const wrapClass =
      variant === "unified"
        ? "w-full bg-white px-5 py-5"
        : "mb-5 w-full rounded-2xl border border-neutral-200 bg-white px-5 py-5";
    return (
      <div className={wrapClass}>
        <div className="min-w-0">
          {primary.title ? <p className="cu-page-title text-neutral-900">{primary.title}</p> : null}
          {bodyLines.length > 0 ? (
            <div className="mt-3 space-y-1.5 border-l-2 border-amber-400/80 pl-2.5 text-[13px] leading-snug text-neutral-700">
              {bodyLines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ) : null}
          {!primary.title && bodyLines.length === 0 ? (
            <p className="text-[13px] leading-snug text-neutral-700">{scenarioInformersForBanner[0]}</p>
          ) : null}
          </div>
      </div>
    );
  };

  const renderScenarioMethodSummary = () => {
    if (!method || !scenario) return null;
    const dm = deliveryOptions.find((d) => d.code === method);
    if (!dm) return null;
    let summaryText = methodSummaryLabel(dm.code as "courier" | "pickup" | "pvz", dm.summary, dm.enabled);
    const s = dm.summary;
    if (
      summaryText &&
      s &&
      s.hasSplit &&
      (method === "courier" || method === "pvz") &&
      summaryText === `${s.availableUnits} из ${s.totalUnits} товаров` &&
      includedOrderUnits === s.availableUnits &&
      units === s.totalUnits
    ) {
      summaryText = "";
    }
    return (
      <>
        {summaryText ? <p className="cu-muted mb-2">{summaryText}</p> : null}
        {method === "pickup" && selectedPickupStore ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-neutral-800">{selectedPickupStore.name}</p>
            <button
              type="button"
              onClick={() => setPickupSelectorOpen(true)}
              className="shrink-0 rounded-lg border border-neutral-900 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900"
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
              className="shrink-0 rounded-lg border border-neutral-900 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900"
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
              className="shrink-0 rounded-lg border border-neutral-900 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900"
            >
              Изменить
            </button>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <div className="checkout-ui relative isolate mx-auto min-h-screen max-w-md bg-white pb-28">
      <div className="sticky top-0 z-50 mb-6 border-b border-neutral-100 bg-white shadow-sm">
        <header className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/cart" className="text-xl text-neutral-700" aria-label="Назад в корзину">
              ←
            </Link>
            <h1 className="cu-page-title flex-1 text-center">Оформление заказа</h1>
            <span className="w-6" />
          </div>
        </header>
        <div className="px-4 pb-3 pt-1">
          <Stepper deliveryDone={unifiedOrderBlock} recipientDone={!!recipient} paymentDone />
        </div>
      </div>

      <div className="relative z-0 px-5 pt-6">

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="cu-section-title">Способ получения</h2>
            <div className="relative">
              <select
                aria-label="Выбор города"
                className="appearance-none rounded-full border border-neutral-200 bg-white pl-3 pr-8 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-800 shadow-sm outline-none transition focus:border-neutral-400"
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
              >
                {boot.cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-neutral-500">
                ▾
              </span>
            </div>
          </div>
          {/* Горизонтальные вкладки */}
          <div className="flex items-stretch gap-3">
            {deliveryOptions.map((dm) => {
              const tabName = dm.code === "pickup" ? "Магазины" : dm.name;
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
                          ? "cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400 opacity-75"
                          : "cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400 opacity-60"
                  }`}
                >
                  <span className="cu-label-primary leading-tight text-inherit">{tabName}</span>
                  <p className={`text-xs leading-tight ${isSelected ? "text-white/95" : "text-neutral-600"}`}>
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
          {deliveryOptions.length > 0 && !method ? (
            <p className="mx-auto mt-3 max-w-[17rem] text-center text-[11px] font-normal leading-snug text-neutral-500">
              Выберите способ получения.
            </p>
          ) : null}
          {deliveryOptions.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">
              Для выбранного города нет доступных способов получения по логистическим правилам.
            </p>
          ) : null}

          {/* Детали способа: «кирпич» только до сборки единого блока; во время запроса сценария не показываем — иначе мелькает упрощённый UI перед PartCard */}
          {method && !unifiedOrderBlock && !showScenarioSkeleton ? (
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

        {showScenarioSkeleton ? (
          <ScenarioOrderSkeleton variant="unified" />
        ) : unifiedOrderBlock ? (
          <section className="mb-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="border-b border-neutral-100 px-4 py-4">{renderScenarioMethodSummary()}</div>
            {renderPrimarySplitContextBar("unified")}
            {(scenario?.parts ?? [])
              .filter((p) => !primaryPartKeysSupersededBySecondary.has(p.key))
              .map((p, partIndex) => (
              <div key={p.key} className={partIndex > 0 ? "border-t border-neutral-100" : ""}>
                <PartCard
                  inGroup
                  shipmentOrdinal={shipmentOrdinalForPartKey(p.key)}
                  part={p}
                  included={included[p.key] !== false}
                  onToggle={() =>
                    setIncluded((prev) => {
                      const cur = prev[p.key] !== false;
                      return { ...prev, [p.key]: !cur };
                    })
                  }
                  showSelectionControl={!keepSinglePartExpanded}
                  showRemainderHint={manualExcludedLines.length > 0 && partIndex === 0}
                  remainderKeepHint={scenario?.remainderKeepHint}
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
                  courierDateLabels={courierDateLabels}
                />
              </div>
            ))}
          </section>
        ) : (
          <>
            {renderPrimarySplitContextBar("stacked")}

            <section className="mb-6 space-y-3">
              {(scenario?.parts ?? [])
                .filter((p) => !primaryPartKeysSupersededBySecondary.has(p.key))
                .map((p, partIndex) => (
                <PartCard
                  key={p.key}
                  shipmentOrdinal={shipmentOrdinalForPartKey(p.key)}
                  courierDateLabels={courierDateLabels}
                  part={p}
                  included={included[p.key] !== false}
                  onToggle={() =>
                    setIncluded((prev) => {
                      const cur = prev[p.key] !== false;
                      return { ...prev, [p.key]: !cur };
                    })
                  }
                  showSelectionControl={!keepSinglePartExpanded}
                  showRemainderHint={manualExcludedLines.length > 0 && partIndex === 0}
                  remainderKeepHint={scenario?.remainderKeepHint}
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
            className="mb-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100"
          >
            <div className="px-4 py-4">
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
                shipmentOrdinal={shipmentOrdinalForPartKey(part.key)}
                part={part}
                included={included[part.key] !== false}
                onToggle={() =>
                  setIncluded((prev) => {
                    const cur = prev[part.key] !== false;
                    return { ...prev, [part.key]: !cur };
                  })
                }
                showSelectionControl
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
                courierDateLabels={courierDateLabels}
              />
            ))}
          </section>
        ))}

        {activeRemainderResolution && activeRemainderResolution.lines.length > 0 ? (
          <section className="mb-8">
            <UnresolvedItemsBlock
              resolution={activeRemainderResolution}
              productsById={productsById}
              onChoose={openCurrentSplitModal}
              copy={boot.checkoutCopy ?? unresolvedBlockCopy()}
            />
          </section>
        ) : null}

        {manualRemainderResolution && manualRemainderResolution.lines.length > 0 ? (
          <section className="mb-8">
            <UnresolvedItemsBlock
              resolution={manualRemainderResolution}
              productsById={productsById}
              onChoose={openManualRemainderSplitModal}
              copy={boot.checkoutCopy ?? unresolvedBlockCopy()}
              ctaDisabled={manualRemainderFetchPending}
              suppressEmptyOptionsHint={manualRemainderFetchPending}
            />
          </section>
        ) : null}

        <section
          className="mb-8 mt-8"
          aria-labelledby="checkout-recipient-heading"
        >
          <h2 id="checkout-recipient-heading" className="cu-section-title mb-3">
            Мои данные
          </h2>
          {!recipient ? (
            <>
              <p className="cu-muted">Введите номер телефона, чтобы оформить заказ</p>
              <input
                id="checkout-recipient-phone"
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
            </>
          ) : (
            <div className="rounded-xl border border-neutral-200 px-3 py-3">
              <p className="cu-label-primary text-neutral-900">{recipient.fullName}</p>
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

        <section className="mb-8 mt-8" aria-labelledby="checkout-payment-heading">
          <h2 id="checkout-payment-heading" className="cu-section-title mb-3">
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
                  <span className="cu-label-primary min-w-0 flex-1 text-neutral-900">{label}</span>
                </button>
              );
            })}
          </div>
          {payOnDeliveryOnlyEffective ? (
            <p className="cu-muted mt-3">{payOnDeliveryDisclaimerText}</p>
          ) : null}
        </section>

        <section className="mb-8 mt-8 space-y-3">
          <div className="flex w-full items-stretch gap-2 rounded-xl bg-neutral-100 p-1.5 pl-3">
            <input
              type="search"
              name="promo"
              autoComplete="off"
              enterKeyHint="done"
              aria-label="Промокод"
              className="cu-promo-input min-w-0 flex-1 border-0 bg-transparent py-2 text-sm uppercase tracking-wide text-neutral-900 outline-none placeholder:text-neutral-500"
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
            {promo.trim().length > 0 && !promoApplied ? (
              <button
                type="button"
                className="shrink-0 rounded-lg bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-800 shadow-sm"
                onClick={handlePromo}
                disabled={bonusOn}
              >
                Применить
              </button>
            ) : null}
          </div>
          {promoApplied ? <p className="text-xs text-emerald-700">Применён промокод APP20 (−20%)</p> : null}
          {recipient ? (
            <BonusPointsToggle
              bonusOn={bonusOn}
              promoApplied={promoApplied}
              amountLabel={fmt(Math.min(GJ_LOYALTY_MAX_SPEND_RUB, goodsMerchForUi))}
              onToggle={(next) => {
                setBonusOn(next);
                if (next) setPromoApplied(false);
              }}
            />
          ) : (
            <BonusAuthBar />
          )}
          {promoApplied || bonusOn ? (
            <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs leading-snug text-neutral-600">
              В одном заказе можно применить или промокод, или бонусы.
            </p>
          ) : null}
        </section>

        <section className="mb-24 border-t border-neutral-100 pt-6">
          <h2 className="cu-section-title">Итого</h2>
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between">
              <span className="cu-total-row-label">Товары</span>
              <span className="cu-total-row-value">{fmt(displayGoodsSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="cu-total-row-label">Доставка</span>
              <span className="cu-total-row-value">
                {includedDeliveryTotal > 0 ? fmt(includedDeliveryTotal) : "Бесплатно"}
              </span>
            </div>
            {promoDiscount > 0 ? (
              <div className="flex justify-between text-sm text-red-600">
                <span>Скидка (APP20)</span>
                <span className="tabular-nums">− {fmt(promoDiscount)}</span>
              </div>
            ) : null}
            {bonusOn ? (
              <div className="flex justify-between text-sm text-red-600">
                <span>Бонусы</span>
                <span className="tabular-nums">− {fmt(Math.min(GJ_LOYALTY_MAX_SPEND_RUB, goodsMerchForUi))}</span>
              </div>
            ) : null}
            <div className="cu-total-final-row">
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
            className="inline-flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-lg bg-black py-4 text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-40"
          >
            {(() => {
              const orderedUnits = includedParts.reduce((s, p) => s + p.items.reduce((ps, i) => ps + i.quantity, 0), 0);
              const price = fmt(payFinal);
              let label: string;
              if (units > 0 && orderedUnits < units) {
                label = `Оформить ${orderedUnits} из ${units} товаров`;
              } else if (units > 0 && orderedUnits > 0) {
                label = `Оформить ${orderedUnits} ${pluralizeProducts(orderedUnits)}`;
              } else {
                label = "Оформить заказ";
              }
              return (
                <>
                  <span>{label}</span>
                  <span className="tabular-nums">{price}</span>
                </>
              );
            })()}
          </button>
        </div>
      </div>

      {pickupSelectorOpen && method === "pickup" ? (
        <PickupStoreSelectionOverlay
          open
          onDismiss={dismissPickupSelector}
          stores={pickupStoresOrdered}
          selectedStoreId={storeId}
          lastChosenStoreId={lastPickupMemoryId}
          productsById={productsById}
          onSelectStore={(nextStoreId) => {
            setStoreId(nextStoreId);
            setPickupSelectorOpen(false);
          }}
        />
      ) : null}
      {pvzSelectorOpen && method === "pvz" ? (
        <PvzPointSelectionOverlay
          open
          onDismiss={dismissPvzSelector}
          points={pvzOptionsOrdered}
          selectedPointId={pvzId}
          lastChosenPointId={lastPvzMemoryId}
          summary={pvzSummary}
          linePreview={cartDetail?.lines?.length ? cartScopedSummaries?.pvzLinePreview : undefined}
          pvzSheetThumbMeta={pvzOverlayThumbMeta}
          productsById={productsById}
          onSelectPoint={(nextPointId) => {
            setPvzId(nextPointId);
            setPvzSelectorOpen(false);
          }}
        />
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
          lastChosenPickupStoreId={lastPickupMemoryId}
          lastChosenPvzPointId={lastPvzMemoryId}
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
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Закрыть окно телефона"
            className="absolute inset-0"
            onClick={() => setPhoneGateOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 max-h-[95dvh] w-full max-w-md overflow-y-auto overscroll-y-contain rounded-t-3xl bg-white shadow-2xl sm:max-h-[95vh] sm:rounded-3xl"
          >
            <div className="sticky top-0 z-20 border-b border-neutral-100 bg-white px-5 pb-3 pt-5">
              <h3 className="cu-sheet-title">Подтвердите телефон</h3>
              <p className="cu-sheet-lead mt-1">
                Чтобы оформить заказ, укажите номер и нажмите «Получить смс с кодом» — в демо переходим без ввода кода.
              </p>
            </div>
            <div className="px-5 pb-5 pt-3">
              <input
                className="w-full rounded-lg border border-neutral-200 px-3 py-3 text-base"
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
                className="mt-2 w-full rounded-lg border border-neutral-900 bg-white py-2.5 text-sm font-medium text-neutral-900"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
