"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
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
import { commonDisclaimer, fullCheckoutCopy, selectorCopy } from "@/lib/disclaimers";
import {
  buildPvzSheetThumbMeta,
  pickupSummaryFromScenario,
  type CartMethodSummariesResult,
  type PickupStoreSummary,
} from "@/lib/cart-method-summaries";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { formatHoldNoticeForPart } from "@/lib/hold-display";
import { MapStorePin } from "@/components/MapStorePin";
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

type CheckoutCopy = ReturnType<typeof fullCheckoutCopy>;
type SelectorCopy = ReturnType<typeof selectorCopy>;
const FALLBACK_SELECTOR_COPY = selectorCopy();

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
  /** Тексты UI чекаута из DisclaimerTemplate (common.unresolvedBlock*, common.checkoutPromoBonus*) */
  checkoutCopy?: CheckoutCopy;
  /** Тексты модалок выбора магазина/ПВЗ из DisclaimerTemplate */
  checkoutSelectorCopy?: SelectorCopy;
};

type MethodSummary = Bootstrap["methodSummaryByCity"][string]["courier"];
type PickupStoreOption = {
  id: string;
  name: string;
  summary?: PickupStoreSummary;
};

type PvzPointOption = Bootstrap["pvzByCity"][string][number];

function applyCopyTemplate(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

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

/** Склеивает строки остатка из разных источников в одну витрину (без дублей по productId). */
function mergeRemainderLineLists(...lists: ReadonlyArray<ReadonlyArray<RemainderLine>>): RemainderLine[] {
  const map = new Map<string, number>();
  for (const list of lists) {
    for (const { productId, quantity } of list) {
      if (quantity <= 0) continue;
      map.set(productId, (map.get(productId) ?? 0) + quantity);
    }
  }
  return [...map.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

function remainderLineCounts(lines: ReadonlyArray<RemainderLine>): Map<string, number> {
  const m = new Map<string, number>();
  for (const { productId, quantity } of lines) {
    if (quantity <= 0) continue;
    m.set(productId, (m.get(productId) ?? 0) + quantity);
  }
  return m;
}

/** Сравнение наборов позиций (без учёта порядка строк). */
function remainderLinesMultisetEqual(a: ReadonlyArray<RemainderLine>, b: ReadonlyArray<RemainderLine>): boolean {
  const ma = remainderLineCounts(a);
  const mb = remainderLineCounts(b);
  if (ma.size !== mb.size) return false;
  for (const [k, v] of ma) {
    if (mb.get(k) !== v) return false;
  }
  return true;
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

function formatRuWeekdayShort(d: Date): string {
  return d.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "").trim().toLowerCase();
}

function formatRuDayMonthLong(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }).replace(/\s*г\.?\s*$/i, "").trim();
}

function splitCourierDateLabel(label: string): { primary: string; secondary: string } {
  const dayMatch = label.match(/(\d{1,2})/);
  const primary = dayMatch?.[1] ?? label.trim();
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

/** Ближайшие 10 календарных дней в формате `18 сб` (слово «Завтра» только в заголовке карточки, не в пилюле). */
function buildCourierDateLabels(reference: Date = new Date()): string[] {
  const base = startOfStableCalendarDay(reference);
  return Array.from({ length: 10 }, (_, idx) => {
    const day = addCalendarDays(base, idx + 1);
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

function methodSummaryFromAlternativeOption(option: AlternativeMethodOption): MethodSummary {
  return {
    totalUnits: option.totalUnits,
    availableUnits: option.availableUnits,
    fullStoreCount: 0,
    hasSplit: option.unresolvedUnits > 0 || option.scenario.parts.length > 1,
  };
}

function methodSummaryFromPvzOption(option: AlternativeMethodOption | null | undefined): MethodSummary | undefined {
  if (!option || option.methodCode !== "pvz") return undefined;
  return methodSummaryFromAlternativeOption(option);
}

type PickupScenarioKind =
  | "today_all"
  | "today_later"
  | "later_all"
  | "later_partial"
  | "incomplete"
  | "empty";

const RU_MONTH_SHORT_BY_NAME: Record<string, string> = {
  января: "01",
  феврала: "02",
  марта: "03",
  апреля: "04",
  мая: "05",
  июня: "06",
  июля: "07",
  августа: "08",
  сентября: "09",
  октября: "10",
  ноября: "11",
  декабря: "12",
};

const RU_MONTH_PATTERN = Object.keys(RU_MONTH_SHORT_BY_NAME).join("|");

function pickupStoreScenarioKind(summary?: PickupStoreSummary): PickupScenarioKind {
  if (!summary || summary.totalUnits <= 0) return "empty";
  if (summary.availableUnits <= 0) return "incomplete";
  if (summary.hasFullCoverage && summary.collectUnits === 0) return "today_all";
  if (summary.hasFullCoverage && summary.reserveUnits > 0 && summary.collectUnits > 0) return "today_later";
  if (summary.hasFullCoverage && summary.reserveUnits <= 0 && summary.collectUnits > 0) return "later_all";
  if (!summary.hasFullCoverage && summary.reserveUnits <= 0 && summary.collectUnits > 0) return "later_partial";
  return "incomplete";
}

function pickupCollectDateLong(summary?: PickupStoreSummary): string | null {
  const raw = summary?.collectThumb?.leadText?.trim();
  if (!raw) return null;
  const text = raw.replace(/^Доставим\s+в\s+магазин\s+/i, "").trim();
  const match = text.match(new RegExp(`(\\d{1,2}\\s+(?:${RU_MONTH_PATTERN}))`, "i"));
  return match?.[1] ?? null;
}

function pickupCollectAllStoreLine(summary?: PickupStoreSummary): string {
  const longDate = pickupCollectDateLong(summary);
  return longDate ? `Привезём все товары в этот магазин ${longDate}` : "Привезём все товары в этот магазин";
}

function pickupCollectDateShort(summary?: PickupStoreSummary): string | null {
  const raw = summary?.collectThumb?.leadText?.trim();
  if (!raw) return null;
  const longMatch = raw.toLocaleLowerCase("ru-RU").match(new RegExp(`(\\d{1,2})\\s+(${RU_MONTH_PATTERN})`, "i"));
  if (longMatch) {
    const day = longMatch[1]!.padStart(2, "0");
    const month = RU_MONTH_SHORT_BY_NAME[longMatch[2]!.toLocaleLowerCase("ru-RU")];
    return month ? `${day}.${month}` : null;
  }
  const numericMatch = raw.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-]\d{2,4})?\b/);
  if (!numericMatch) return null;
  const day = numericMatch[1]!.padStart(2, "0");
  const month = numericMatch[2]!.padStart(2, "0");
  return `${day}.${month}`;
}

function pickupCollectPinLine(summary?: PickupStoreSummary): string {
  const shortDate = pickupCollectDateShort(summary);
  return shortDate ? `Привезём ${shortDate}` : "Привезём позже";
}

/** Строки на пине карты (как подпись в балуне Яндекса). */
function pickupStorePinLines(summary?: PickupStoreSummary): { line1: string; line2?: string } {
  const kind = pickupStoreScenarioKind(summary);
  if (kind === "empty" || !summary) return { line1: "—" };
  if (kind === "today_all") return { line1: "Все сегодня" };
  if (kind === "today_later") return { line1: `${summary.reserveUnits} сегодня`, line2: `${summary.collectUnits} позже` };
  if (kind === "later_all") return { line1: pickupCollectPinLine(summary) };
  if (kind === "later_partial") return { line1: `${summary.availableUnits} из ${summary.totalUnits}` };
  return { line1: `${summary.availableUnits} из ${summary.totalUnits}` };
}

/** Выше = лучше: всё сегодня → сегодня+позже → всё позже → частично позже → не собрать. */
function pickupStoreSortScore(summary?: PickupStoreSummary): number {
  if (!summary || summary.totalUnits <= 0) return 0;
  const kind = pickupStoreScenarioKind(summary);
  switch (kind) {
    case "today_all":
      return 1_000_000 + summary.reserveUnits * 100 + summary.totalUnits;
    case "today_later":
      return 800_000 + summary.reserveUnits * 1_000 + summary.collectUnits;
    case "later_all":
      return 600_000 + summary.collectUnits * 100 + summary.totalUnits;
    case "later_partial":
      return 300_000 + summary.collectUnits * 1_000 + summary.availableUnits;
    case "incomplete":
      return 100_000 + summary.availableUnits * 1_000 + summary.reserveUnits;
    default:
      return -100_000 - (summary.remainderUnits ?? 0);
  }
}

function sortPickupStoresByScenario(list: PickupStoreOption[]): PickupStoreOption[] {
  return [...list].sort((a, b) => {
    const d = pickupStoreSortScore(b.summary) - pickupStoreSortScore(a.summary);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, "ru");
  });
}

function pickupStoreStatusTitle(summary?: PickupStoreSummary) {
  const kind = pickupStoreScenarioKind(summary);
  if (!summary || kind === "empty") return "Данные по товарам уточняются";
  if (kind === "today_all") return "Все товары доступны сегодня";
  if (kind === "today_later") return "Часть сегодня, часть привезём";
  if (kind === "later_all") return "Привезём заказ в магазин";
  return "Доступна только часть заказа";
}

function pickupStoreStatusDetail(summary?: PickupStoreSummary) {
  if (!summary || summary.totalUnits <= 0) return "Данные по товарам уточняются.";
  const kind = pickupStoreScenarioKind(summary);
  if (kind === "today_all") return `Все ${summary.totalUnits} ${pluralizeProducts(summary.totalUnits)} готовы к выдаче в магазине.`;
  if (kind === "today_later") return `${summary.reserveUnits} ${pluralizeProducts(summary.reserveUnits)} сегодня, ${summary.collectUnits} привезём в магазин.`;
  if (kind === "later_all") return `${pickupCollectAllStoreLine(summary)}.`;
  if (kind === "later_partial") return `Сможем привезти ${summary.availableUnits} из ${summary.totalUnits} товаров.`;
  if (summary.availableUnits <= 0) return `Доступно 0 из ${summary.totalUnits} товаров для самовывоза.`;
  const parts: string[] = [];
  if (summary.reserveUnits > 0) parts.push(`${summary.reserveUnits} доступны сразу`);
  if (summary.collectUnits > 0) parts.push(`${summary.collectUnits} привезём в магазин`);
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
      marker: "border-amber-500 bg-amber-500 text-neutral-950",
      accent: "bg-amber-100 text-amber-950",
      card: "border-amber-200 bg-amber-50/60",
    };
  }
  return {
    marker: "border-neutral-400 bg-neutral-200 text-neutral-700",
    accent: "bg-neutral-100 text-neutral-600",
    card: "border-neutral-200 bg-neutral-50/90",
  };
}

/** Одна строка под названием магазина в свёрнутой карточке (тот же смысл, что на пине). */
function pickupStoreCompactScenarioLine(summary?: PickupStoreSummary): string {
  if (!summary || summary.totalUnits <= 0) return "Нет состава корзины для оценки";
  const kind = pickupStoreScenarioKind(summary);
  if (kind === "today_all") return "Все товары можно забрать сегодня";
  if (kind === "today_later") {
    return `${summary.reserveUnits} ${pluralizeProducts(summary.reserveUnits)} сегодня · ${summary.collectUnits} позже`;
  }
  if (kind === "later_all") return pickupCollectAllStoreLine(summary);
  if (kind === "later_partial") return `Сможем привезти ${summary.availableUnits} из ${summary.totalUnits} товаров`;
  if (summary.availableUnits > 0) return `Доступно ${summary.availableUnits} из ${summary.totalUnits} товаров`;
  return `Доступно 0 из ${summary.totalUnits} товаров`;
}

function pickupStorePinEmphasisClass(
  summary: PickupStoreSummary | undefined,
  opts: { recommended: boolean; pinOpen: boolean },
): string {
  const kind = pickupStoreScenarioKind(summary);
  if (opts.pinOpen) return "z-[35] scale-[1.06]";
  if ((kind === "today_all" || kind === "today_later") && opts.recommended) return "z-[14] scale-[1.03]";
  if (kind === "incomplete" || kind === "later_partial") return "z-[8] scale-[0.95] opacity-70";
  if (kind === "later_all") return "z-[9] opacity-80";
  if (kind === "today_later") return "z-[10]";
  return "z-[11]";
}

type PickupStoreListFilter = "all" | "today_all" | "today_later";
type PickupBottomSheetMode = "collapsed" | "preview" | "expanded";

function pickupStoreIsTodayAll(store: PickupStoreOption): boolean {
  const s = store.summary;
  return !!s && s.availableUnits > 0 && s.hasFullCoverage && s.collectUnits === 0 && s.remainderUnits === 0;
}

function pickupStoreIsTodayLater(store: PickupStoreOption): boolean {
  const s = store.summary;
  return !!s && s.availableUnits > 0 && s.hasFullCoverage && s.reserveUnits > 0 && s.collectUnits > 0;
}

/** Можно выбрать точку, если в ней доступна хотя бы часть заказа (не только при полном покрытии). */
function pickupStoreCanSelect(summary?: PickupStoreSummary): boolean {
  return !!summary && summary.availableUnits > 0;
}

function storeMatchesPickupListFilter(store: PickupStoreOption, filter: PickupStoreListFilter): boolean {
  if (filter === "all") return true;
  switch (filter) {
    case "today_all":
      return pickupStoreIsTodayAll(store);
    case "today_later":
      return pickupStoreIsTodayLater(store);
    default:
      return true;
  }
}

function sortPickupStoresForList(list: PickupStoreOption[]): PickupStoreOption[] {
  return [...list].sort((a, b) => {
    const d = pickupStoreSortScore(b.summary) - pickupStoreSortScore(a.summary);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, "ru");
  });
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

function pvzPointStatusDetail(summary: MethodSummary | undefined, copy: SelectorCopy["pvz"] = FALLBACK_SELECTOR_COPY.pvz) {
  if (!summary || summary.totalUnits <= 0) return copy.noCart;
  if (summary.availableUnits <= 0) return copy.unavailable;
  if (summary.availableUnits >= summary.totalUnits) {
    return applyCopyTemplate(copy.allAvailable, { total: summary.totalUnits, available: summary.availableUnits });
  }
  return applyCopyTemplate(copy.partial, { total: summary.totalUnits, available: summary.availableUnits });
}

function pvzPointPinLine(summary?: MethodSummary): string {
  if (!summary || summary.totalUnits <= 0) return "Нет данных";
  if (summary.availableUnits >= summary.totalUnits) return "Все товары";
  return `${summary.availableUnits} из ${summary.totalUnits}`;
}

function pvzPointCompactScenarioLine(summary?: MethodSummary): string {
  if (!summary || summary.totalUnits <= 0) return "Нет данных по корзине";
  if (summary.availableUnits <= 0) return `0 из ${summary.totalUnits}`;
  if (summary.availableUnits >= summary.totalUnits) return "Все товары доступны";
  return `${summary.availableUnits} из ${summary.totalUnits}`;
}

function pvzPointEmphasisClass(
  summary: MethodSummary | undefined,
  opts: { recommended: boolean; pinOpen: boolean },
): string {
  if (opts.pinOpen) return "z-[35] scale-[1.05] ring-4 ring-black/15";
  if (opts.recommended && summary && summary.availableUnits > 0) return "z-[14] scale-[1.03] ring-2 ring-black/10";
  if (!summary || summary.availableUnits <= 0 || summary.availableUnits < summary.totalUnits) {
    return "z-[8] scale-[0.95] opacity-75";
  }
  return "z-[11]";
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

function PickupStoreFulfillmentBlock({
  title,
  leadText,
  benefitText,
  items,
  productsById,
}: {
  title: string;
  leadText?: string;
  benefitText?: string;
  items: { productId: string; quantity: number }[];
  productsById: Record<string, SheetProductRef>;
}) {
  if (items.length === 0) return null;
  const compactTitle =
    title === "Привезём в магазин" && leadText?.startsWith("Доставим в магазин ")
      ? `Привезём в магазин ${leadText.replace("Доставим в магазин ", "")}`
      : leadText
        ? `${title} · ${leadText}`
        : title;
  return (
    <div className="border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0">
      <p className="text-[13px] font-semibold leading-snug text-neutral-700">{compactTitle}</p>
      {benefitText ? <p className="cu-benefit mt-1 inline-flex">{benefitText}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2.5">
        {items.map((it, ix) => (
          <div
            key={`${title}-${it.productId}-${ix}`}
            className="relative h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-neutral-100"
          >
            <SafeProductImage
              src={productsById[it.productId]?.image ?? ""}
              alt={productsById[it.productId]?.name ?? ""}
              fill
              className="object-cover"
              sizes="48px"
            />
            {it.quantity >= 2 ? (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-900/90 px-[3px] text-[8px] font-semibold leading-none text-white ring-1 ring-white/30">
                {it.quantity}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Прямоугольник видимой области Safari/iOS (над клавиатурой). */
function readVisualViewportFrame(): { top: number; left: number; width: number; height: number } {
  if (typeof window === "undefined") {
    return { top: 0, left: 0, width: 0, height: 0 };
  }
  const vv = window.visualViewport;
  if (!vv) {
    return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  }
  return {
    top: Math.round(vv.offsetTop),
    left: Math.round(vv.offsetLeft),
    width: Math.max(1, Math.round(vv.width)),
    height: Math.max(1, Math.round(vv.height)),
  };
}

/**
 * Пока active — подписываемся на visualViewport (resize + scroll): на iOS при клавиатуре
 * layout viewport и «absolute bottom» внутри flex дают смещение; fixed с этими числами прилипает к видимой области.
 */
function useVisualViewportFrame(active: boolean) {
  const [frame, setFrame] = useState(readVisualViewportFrame);

  useLayoutEffect(() => {
    if (!active || typeof window === "undefined") return;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setFrame(readVisualViewportFrame());
      });
    };
    schedule();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [active]);

  return active ? frame : null;
}

function PickupStoreSelector({
  stores,
  selectedStoreId,
  lastChosenStoreId,
  productsById,
  copy,
  onSelect,
  onClose,
}: {
  stores: PickupStoreOption[];
  selectedStoreId: string;
  /** Подсказка «выбирали в прошлый раз» — без автоподстановки выбора */
  lastChosenStoreId?: string | null;
  productsById: Record<string, SheetProductRef>;
  copy?: SelectorCopy["pickup"];
  onSelect: (storeId: string) => void;
  onClose: () => void;
}) {
  const [storeSearch, setStoreSearch] = useState("");
  const [listFilter, setListFilter] = useState<PickupStoreListFilter>("all");
  const [searchActive, setSearchActive] = useState(false);
  const [expandedStoreIds, setExpandedStoreIds] = useState<Record<string, boolean>>({});
  const [mapPreviewStoreId, setMapPreviewStoreId] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<PickupBottomSheetMode>("collapsed");
  const sheetDragRef = useRef<{ startY: number } | null>(null);
  const ignoreSheetClickRef = useRef(false);
  const vvSheet = useVisualViewportFrame(searchActive);

  const searchMatchedStores = useMemo(() => {
    const q = storeSearch.trim().toLocaleLowerCase("ru");
    const base = !q ? stores : stores.filter((store) => store.name.toLocaleLowerCase("ru").includes(q));
    return sortPickupStoresByScenario(base);
  }, [stores, storeSearch]);

  const filterAvailability = useMemo(
    () => ({
      all: searchMatchedStores.length,
      todayAll: searchMatchedStores.filter(pickupStoreIsTodayAll).length,
      todayLater: searchMatchedStores.filter(pickupStoreIsTodayLater).length,
    }),
    [searchMatchedStores],
  );

  const filteredStores = useMemo(() => {
    let base = searchMatchedStores;
    if (listFilter !== "all") {
      base = base.filter((s) => storeMatchesPickupListFilter(s, listFilter));
    }
    return sortPickupStoresForList(base);
  }, [searchMatchedStores, listFilter]);

  const todayAllAvailable = filterAvailability.todayAll > 0;
  const todayLaterAvailable = filterAvailability.todayLater > 0;
  const pickupSelectorCopy = copy ?? FALLBACK_SELECTOR_COPY.pickup;

  const pickupFilterDisclaimer = useMemo(() => {
    if (filterAvailability.all === 0) return null;
    if (!todayAllAvailable && !todayLaterAvailable) {
      return pickupSelectorCopy.noTodayOptions;
    }
    if (!todayAllAvailable) {
      return pickupSelectorCopy.noTodayAllButTodayLater;
    }
    if (!todayLaterAvailable) {
      return pickupSelectorCopy.noTodayLater;
    }
    return null;
  }, [filterAvailability.all, pickupSelectorCopy, todayAllAvailable, todayLaterAvailable]);

  const toggleExpandedStore = (id: string) => {
    setExpandedStoreIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const mapPreviewStore = useMemo(
    () => (mapPreviewStoreId ? filteredStores.find((s) => s.id === mapPreviewStoreId) ?? null : null),
    [filteredStores, mapPreviewStoreId],
  );

  useEffect(() => {
    if (mapPreviewStoreId && !filteredStores.some((s) => s.id === mapPreviewStoreId)) {
      setMapPreviewStoreId(null);
      setSheetMode("collapsed");
    }
  }, [filteredStores, mapPreviewStoreId]);

  const recommendedStore = filteredStores[0] ?? null;
  const recommendedStoreId = recommendedStore?.id ?? null;
  const mapPinPosition = useMemo(() => {
    const rec = recommendedStoreId;
    const others = filteredStores.filter((s) => s.id !== rec);
    return (storeId: string): { left: string; top: string } => {
      if (mapPreviewStoreId === storeId) return { left: "50%", top: "25%" };
      if (rec && storeId === rec) return { left: "50%", top: "42%" };
      const ix = others.findIndex((s) => s.id === storeId);
      const p = PICKUP_MAP_POSITIONS[(ix >= 0 ? ix : 0) % PICKUP_MAP_POSITIONS.length]!;
      return { left: p.left, top: p.top };
    };
  }, [filteredStores, mapPreviewStoreId, recommendedStoreId]);

  const mapStores = filteredStores;
  const sheetStore = mapPreviewStore ?? recommendedStore ?? filteredStores[0] ?? null;
  const sheetScenarioLine = sheetStore ? pickupStoreCompactScenarioLine(sheetStore.summary) : "";
  const sheetExpanded = sheetMode === "expanded";
  const showPreview = sheetMode === "preview" && !!sheetStore;
  /** Без vv: как после свайпа. С vv (фокус поиска + клавиатура iOS): высота/позиция задаются инлайном от visualViewport. */
  const sheetClass = vvSheet
    ? "max-h-none"
    : sheetMode === "expanded" || searchActive
      ? "max-h-[78dvh]"
      : showPreview
        ? "max-h-[calc(100dvh-7rem)]"
        : "max-h-[34dvh]";
  const sheetScrollClass = showPreview
    ? "max-h-[calc(100dvh-12rem)]"
    : "max-h-[calc(78dvh-5.5rem)]";
  const sheetScrollClassEffective = vvSheet ? "min-h-0 flex-1" : sheetScrollClass;
  const sheetPositionClass = vvSheet ? "" : "absolute bottom-0 left-0 right-0";
  const sheetTransitionClass = vvSheet ? "transition-none" : "transition-[max-height,top] duration-200";
  const sheetFixedStyle: CSSProperties | undefined = vvSheet
    ? {
        position: "fixed",
        top: vvSheet.top,
        left: vvSheet.left,
        width: vvSheet.width,
        height: vvSheet.height,
        right: "auto",
        bottom: "auto",
      }
    : undefined;
  const mapFixedStyle: CSSProperties | undefined = vvSheet
    ? {
        position: "fixed",
        top: vvSheet.top,
        left: vvSheet.left,
        width: vvSheet.width,
        height: vvSheet.height,
        right: "auto",
        bottom: "auto",
      }
    : undefined;

  const handleSheetPointerUp = (clientY: number) => {
    const start = sheetDragRef.current?.startY;
    sheetDragRef.current = null;
    if (start == null) return;
    const delta = clientY - start;
    if (delta < -28) {
      ignoreSheetClickRef.current = true;
      window.setTimeout(() => {
        ignoreSheetClickRef.current = false;
      }, 0);
      setSheetMode("expanded");
      return;
    }
    if (delta > 28) {
      ignoreSheetClickRef.current = true;
      window.setTimeout(() => {
        ignoreSheetClickRef.current = false;
      }, 0);
      setSheetMode(mapPreviewStore ? "preview" : "collapsed");
      setSearchActive(false);
    }
  };

  const filterChip = (id: PickupStoreListFilter, label: string) => {
    const disabled = (id === "today_all" && !todayAllAvailable) || (id === "today_later" && !todayLaterAvailable);
    const active = !disabled && listFilter === id;
    return (
      <button
        key={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setListFilter(id);
          setMapPreviewStoreId(null);
          if (searchActive) {
            setSheetMode("expanded");
          } else {
            setSearchActive(false);
            setSheetMode("collapsed");
          }
        }}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold shadow-sm backdrop-blur-md transition ${
          active
            ? "border-neutral-900 bg-neutral-900 text-white"
            : disabled
              ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400 shadow-none"
              : "border-neutral-200 bg-white/95 text-neutral-800"
        }`}
        aria-disabled={disabled}
      >
        {label}
      </button>
    );
  };

  if (stores.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        В этом городе пока нет активных магазинов для самовывоза.
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden isolate">
      <CheckoutCloseCrossButton
        ariaLabel="Закрыть карту выбора магазина"
        onClick={onClose}
        className={
          vvSheet ? "fixed right-4 z-30" : "fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-30"
        }
        style={vvSheet ? { top: Math.max(16, vvSheet.top + 4) } : undefined}
      />
      <div
        className={`overflow-hidden [backface-visibility:hidden] ${vvSheet ? "fixed z-[1]" : "fixed inset-0 z-[1]"}`}
        style={mapFixedStyle}
      >
        <div
          className="absolute inset-0 z-0 bg-[linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)]"
          onClick={() => {
            setSearchActive(false);
            setMapPreviewStoreId(null);
            setSheetMode("collapsed");
          }}
          aria-hidden
        />
        <div
          className="absolute inset-0 z-[1] overflow-hidden"
          onClick={() => {
            setSearchActive(false);
            setMapPreviewStoreId(null);
            setSheetMode("collapsed");
          }}
        >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(226,232,240,0.92))]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%),linear-gradient(transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%)]" />
        {showPreview ? <div className="pointer-events-none absolute inset-0 z-[5] bg-black/10" aria-hidden /> : null}
        {mapStores.map((store) => {
          const pinLines = pickupStorePinLines(store.summary);
          const pos = mapPinPosition(store.id);
          const pinOpen = mapPreviewStoreId === store.id;
          const recommended = recommendedStoreId === store.id;
          const emphasis = pickupStorePinEmphasisClass(store.summary, { recommended, pinOpen });
          return (
            <button
              key={store.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSearchActive(false);
                setMapPreviewStoreId(store.id);
                setSheetMode("preview");
              }}
              className={`pointer-events-auto absolute -translate-x-[38px] -translate-y-full border-0 bg-transparent p-0 text-left shadow-none outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 ${emphasis}`}
              style={{ left: pos.left, top: pos.top }}
              aria-pressed={pinOpen}
              aria-expanded={pinOpen}
              aria-label={`${store.name}. ${pickupStoreCompactScenarioLine(store.summary)}. ${pickupStoreStatusTitle(store.summary)}.`}
            >
              <MapStorePin
                line1={pinLines.line1}
                line2={pinLines.line2}
                wasLastChoice={lastChosenStoreId === store.id}
              />
            </button>
          );
        })}
        </div>
      </div>

      <div
        role="region"
        aria-label="Результаты поиска магазинов"
        className={`z-40 flex min-h-0 flex-col overflow-hidden rounded-t-2xl border border-neutral-200/80 bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.14)] ${sheetTransitionClass} ${sheetClass} ${vvSheet ? "fixed" : sheetPositionClass}`}
        style={sheetFixedStyle}
      >
        <div
          className="cursor-grab shrink-0 px-4 pb-2 pt-2 active:cursor-grabbing"
          onPointerDown={(event) => {
            sheetDragRef.current = { startY: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => handleSheetPointerUp(event.clientY)}
          onPointerCancel={() => {
            sheetDragRef.current = null;
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (ignoreSheetClickRef.current) return;
              setSheetMode((prev) => (prev === "expanded" ? (mapPreviewStore ? "preview" : "collapsed") : "expanded"));
            }}
            className="block w-full rounded-xl outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-neutral-900"
            aria-expanded={sheetExpanded}
          >
            <span className="mx-auto block h-1 w-10 rounded-full bg-neutral-200" aria-hidden />
          </button>
        </div>
        {showPreview ? (
          <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-2">
            <p className="min-w-0 flex-1 truncate text-left text-[22px] font-semibold leading-tight text-neutral-900">
              {sheetStore?.name}
            </p>
            <CheckoutCloseCrossButton
              ariaLabel="Закрыть карточку магазина"
              onClick={() => {
                setSearchActive(false);
                setMapPreviewStoreId(null);
                setSheetMode("collapsed");
              }}
            />
          </div>
        ) : null}

        {!showPreview ? (
          <div className="shrink-0 px-4 pb-3">
            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 focus-within:border-neutral-400">
                <span className="sr-only">Поиск по магазинам</span>
                <svg
                  className="h-5 w-5 shrink-0 text-neutral-700"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.5 16.5 4 4" />
                </svg>
                <input
                  type="search"
                  value={storeSearch}
                  onFocus={() => {
                    setSearchActive(true);
                    setSheetMode("expanded");
                    setMapPreviewStoreId(null);
                  }}
                  onChange={(e) => {
                    setSearchActive(true);
                    setStoreSearch(e.target.value);
                    setMapPreviewStoreId(null);
                    setSheetMode("expanded");
                  }}
                  placeholder="Поиск по магазинам"
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-base outline-none"
                />
              </label>
              {searchActive || storeSearch.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    setStoreSearch("");
                    setSearchActive(false);
                    setSheetMode("collapsed");
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-2xl leading-none text-neutral-950 shadow-sm"
                  aria-label="Свернуть поиск"
                >
                  ×
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {filterChip("all", "Все магазины")}
              {filterChip("today_all", "Забрать всё сегодня")}
              {filterChip("today_later", "Сегодня + позже")}
            </div>
            {pickupFilterDisclaimer ? (
              <p className="mt-1.5 px-1 text-[11px] leading-snug text-neutral-950">
                {pickupFilterDisclaimer}
              </p>
            ) : null}
          </div>
        ) : null}

        <div
          className={`${sheetScrollClassEffective} overflow-y-auto overscroll-y-contain px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]`}
        >
          {showPreview && sheetStore && !sheetExpanded ? (
            <div className="pb-1">
              <div className="space-y-3">
                <p className="inline-flex max-w-full rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold leading-snug text-neutral-800">
                  {sheetScenarioLine}
                </p>
                {lastChosenStoreId === sheetStore.id ? (
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                    Выбирали в прошлый раз
                  </p>
                ) : null}
                <PickupStoreFulfillmentBlock
                  title="Сразу в магазине"
                  leadText={sheetStore.summary?.reserveThumb?.leadText}
                  benefitText="Бесплатно · примерка"
                  items={sheetStore.summary?.immediateLines ?? []}
                  productsById={productsById}
                />
                <PickupStoreFulfillmentBlock
                  title="Привезём в магазин"
                  leadText={sheetStore.summary?.collectThumb?.leadText}
                  benefitText="Бесплатно"
                  items={sheetStore.summary?.laterLines ?? []}
                  productsById={productsById}
                />
              </div>
              {pickupStoreCanSelect(sheetStore.summary) ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => onSelect(sheetStore.id)}
                    className="w-full rounded-xl border border-neutral-900 bg-white py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50"
                  >
                    Выбрать
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {sheetExpanded ? (
            <div className="pb-4">
              <div className="space-y-2">
                {filteredStores.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
                    {storeSearch.trim()
                      ? "По запросу магазины не найдены."
                      : listFilter === "today_all"
                        ? pickupSelectorCopy.noTodayAllButTodayLater
                        : listFilter === "today_later"
                          ? pickupSelectorCopy.noTodayLater
                          : "Магазины не найдены."}
                  </div>
                ) : (
                  filteredStores.map((store) => {
                    const selected = selectedStoreId === store.id;
                    const wasLastChoice = lastChosenStoreId === store.id;
                    const scenarioLine = pickupStoreCompactScenarioLine(store.summary);
                    const detailsOpen = !!expandedStoreIds[store.id];
                    const hasDetails =
                      !!store.summary?.immediateLines?.length ||
                      !!store.summary?.laterLines?.length;
                    const canSelectStore = pickupStoreCanSelect(store.summary);
                    return (
                      <div
                        key={store.id}
                        className={`rounded-2xl border bg-white p-3 transition sm:p-4 ${selected ? "border-black" : "border-neutral-200"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 flex-1 text-[17px] font-semibold leading-tight text-neutral-900">
                            {store.name}
                          </p>
                          {canSelectStore ? (
                            <button
                              type="button"
                              onClick={() => onSelect(store.id)}
                              className="shrink-0 rounded-xl border border-neutral-900 bg-white px-4 py-2 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-50"
                              aria-pressed={selected}
                            >
                              Выбрать
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-3 space-y-3">
                          <p className="inline-flex max-w-full rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold leading-snug text-neutral-800">
                            {scenarioLine}
                          </p>
                          {wasLastChoice ? (
                            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                              Выбирали в прошлый раз
                            </p>
                          ) : null}
                          {hasDetails ? (
                            <button
                              type="button"
                              onClick={() => toggleExpandedStore(store.id)}
                              className="flex w-fit items-center gap-1 text-xs font-semibold text-neutral-700 transition hover:text-neutral-950"
                              aria-expanded={detailsOpen}
                            >
                              <span>{detailsOpen ? "Свернуть" : "Подробнее"}</span>
                              <svg
                                className={`mt-px h-3.5 w-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                                viewBox="0 0 16 16"
                                fill="none"
                                aria-hidden
                              >
                                <path d="M4 6.5 8 10l4-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          ) : null}
                          {detailsOpen ? (
                            <div className="space-y-3 border-t border-neutral-100 pt-3">
                              <PickupStoreFulfillmentBlock
                                title="Сразу в магазине"
                                leadText={store.summary?.reserveThumb?.leadText}
                                benefitText="Бесплатно · примерка"
                                items={store.summary?.immediateLines ?? []}
                                productsById={productsById}
                              />
                              <PickupStoreFulfillmentBlock
                                title="Привезём в магазин"
                                leadText={store.summary?.collectThumb?.leadText}
                                benefitText="Бесплатно"
                                items={store.summary?.laterLines ?? []}
                                productsById={productsById}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Круглая кнопка ×: белый фон, серая обводка, тень — единый стиль закрытия на чекауте. */
function CheckoutCloseCrossButton({
  ariaLabel,
  onClick,
  className = "",
  style,
}: {
  ariaLabel: string;
  onClick: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={style}
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-xl leading-none text-neutral-950 shadow-[0_6px_18px_rgba(0,0,0,0.12)] backdrop-blur-md ${className}`}
    >
      <span aria-hidden>×</span>
    </button>
  );
}

/** Общая шапка bottom-sheet как у выбора магазина/ПВЗ на чекауте (sticky + × справа). */
function CheckoutSheetStickyHeader({
  title,
  onClose,
  variant = "sticky",
}: {
  title: string;
  onClose: () => void;
  /** Плавающая шапка поверх полноэкранной карты (как в Яндекс.Картах). */
  variant?: "sticky" | "floating";
}) {
  return (
    <div
      className={
        variant === "floating"
          ? "pointer-events-auto absolute left-0 right-0 top-0 z-40 border-b border-neutral-100/80 bg-white/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-sm backdrop-blur-md sm:px-5 sm:pb-4"
          : "sticky top-0 z-20 border-b border-neutral-100 bg-white px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="cu-sheet-title min-w-0 flex-1 pr-2">{title}</h3>
        <CheckoutCloseCrossButton ariaLabel="Закрыть" onClick={onClose} />
      </div>
    </div>
  );
}

/** Горизонтальные вкладки способа получения — общий блок для основного чекаута и модалки сплита. */
function CheckoutDeliveryMethodTabs({
  items,
  className = "flex items-stretch gap-3",
  coveragePending = false,
}: {
  className?: string;
  /** Пока не пришли сводки по корзине — плейсхолдер вместо строки «N из M товаров». */
  coveragePending?: boolean;
  items: Array<{
    id: string;
    tabLabel: string;
    coverage: string;
    selected: boolean;
    disabled?: boolean;
    /** Состояние «ПВЗ недоступен для заказа» — те же отступы/курсор, что на основном чекауте */
    mutedUnavailable?: boolean;
    recommended?: boolean;
    title?: string;
    onSelect: () => void;
  }>;
}) {
  return (
    <div className={className}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          title={item.title}
          aria-busy={coveragePending}
          onClick={() => {
            if (item.disabled) return;
            item.onSelect();
          }}
          className={`flex min-h-[75px] flex-1 flex-col items-start justify-center gap-1 rounded-xl border px-3 py-3 text-left transition ${
            item.selected
              ? "border-black bg-black text-white"
              : item.disabled
                ? item.mutedUnavailable
                  ? "cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400 opacity-75"
                  : "cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400 opacity-60"
                : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300"
          }`}
        >
          <span className="cu-label-primary leading-tight text-inherit">{item.tabLabel}</span>
          {coveragePending ? (
            <span
              className={`block h-3.5 w-[5.25rem] max-w-full animate-pulse rounded-sm ${
                item.selected ? "bg-white/30" : "bg-neutral-200"
              }`}
              aria-hidden
            />
          ) : (
            <p className={`text-xs leading-tight ${item.selected ? "text-white/95" : "text-neutral-600"}`}>
              {item.coverage}
            </p>
          )}
          {item.recommended && !coveragePending ? (
            <span
              className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                item.selected ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              Рекомендуем
            </span>
          ) : null}
        </button>
      ))}
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
  copy,
  onSelectStore,
  zOverlayClass = "z-[100]",
}: {
  open: boolean;
  onDismiss: () => void;
  stores: PickupStoreOption[];
  selectedStoreId: string;
  lastChosenStoreId?: string | null;
  productsById: Record<string, SheetProductRef>;
  copy?: SelectorCopy["pickup"];
  onSelectStore: (storeId: string) => void;
  zOverlayClass?: string;
}) {
  if (!open) return null;
  return (
    <div className={`fixed inset-0 ${zOverlayClass} flex items-stretch justify-stretch bg-black/45 p-0`}>
      <button type="button" aria-label="Закрыть выбор магазина" className="absolute inset-0" onClick={onDismiss} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex h-full max-h-none w-full max-w-none flex-col overflow-hidden rounded-none bg-white shadow-2xl"
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <PickupStoreSelector
            stores={stores}
            selectedStoreId={selectedStoreId}
            lastChosenStoreId={lastChosenStoreId}
            productsById={productsById}
            copy={copy}
            onSelect={onSelectStore}
            onClose={onDismiss}
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
  copy,
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
  copy?: SelectorCopy["pvz"];
  onSelectPoint: (pointId: string) => void;
  zOverlayClass?: string;
}) {
  if (!open) return null;
  return (
    <div className={`fixed inset-0 ${zOverlayClass} flex items-stretch justify-stretch bg-black/45 p-0`}>
      <button type="button" aria-label="Закрыть выбор ПВЗ" className="absolute inset-0" onClick={onDismiss} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex h-full max-h-none w-full max-w-none flex-col overflow-hidden rounded-none bg-white shadow-2xl"
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <PvzPointSelector
            points={points}
            selectedPointId={selectedPointId}
            lastChosenPointId={lastChosenPointId}
            summary={summary}
            linePreview={linePreview}
            pvzSheetThumbMeta={pvzSheetThumbMeta}
            productsById={productsById}
            copy={copy}
            onSelect={onSelectPoint}
            onClose={onDismiss}
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
  copy,
  onSelect,
  onClose,
}: {
  points: PvzPointOption[];
  selectedPointId: string;
  lastChosenPointId?: string | null;
  summary?: MethodSummary;
  linePreview?: CartMethodSummariesResult["pvzLinePreview"];
  pvzSheetThumbMeta?: CartMethodSummariesResult["pvzSheetThumbMeta"];
  productsById: Record<string, SheetProductRef>;
  copy?: SelectorCopy["pvz"];
  onSelect: (pointId: string) => void;
  onClose: () => void;
}) {
  const [pvzSearch, setPvzSearch] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [expandedPointIds, setExpandedPointIds] = useState<Record<string, boolean>>({});
  const [mapPreviewPointId, setMapPreviewPointId] = useState<string | null>(null);
  const [sheetMode, setSheetMode] = useState<PickupBottomSheetMode>("collapsed");
  const sheetDragRef = useRef<{ startY: number } | null>(null);
  const ignoreSheetClickRef = useRef(false);
  const vvSheet = useVisualViewportFrame(searchActive);

  const filteredPoints = useMemo(() => {
    const q = pvzSearch.trim().toLocaleLowerCase("ru");
    if (!points.length) return [];
    if (!q) return points;
    return points.filter(
      (p) =>
        p.name.toLocaleLowerCase("ru").includes(q) || p.address.toLocaleLowerCase("ru").includes(q),
    );
  }, [points, pvzSearch]);

  const toggleExpandedPoint = (id: string) => {
    setExpandedPointIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const mapPreviewPoint = useMemo(
    () => (mapPreviewPointId ? filteredPoints.find((p) => p.id === mapPreviewPointId) ?? null : null),
    [filteredPoints, mapPreviewPointId],
  );

  useEffect(() => {
    if (mapPreviewPointId && !filteredPoints.some((p) => p.id === mapPreviewPointId)) {
      setMapPreviewPointId(null);
      setSheetMode("collapsed");
    }
  }, [filteredPoints, mapPreviewPointId]);

  const mapPoints = filteredPoints;
  const recommendedPoint = filteredPoints[0] ?? null;
  const recommendedPointId = recommendedPoint?.id ?? null;
  const sheetPoint = mapPreviewPoint ?? recommendedPoint ?? filteredPoints[0] ?? null;
  const showPreview = sheetMode === "preview" && !!sheetPoint;
  const sheetExpanded = sheetMode === "expanded";
  const scenarioLine = pvzPointCompactScenarioLine(summary);
  const pvzSelectorCopy = copy ?? FALLBACK_SELECTOR_COPY.pvz;
  const pvzStatusDetail = pvzPointStatusDetail(summary, pvzSelectorCopy);
  const hasDetails = !!linePreview && (linePreview.available.length > 0 || linePreview.unavailable.length > 0);
  const mapPointPosition = (pointId: string): { left: string; top: string } => {
    if (mapPreviewPointId === pointId) return { left: "50%", top: "25%" };
    if (recommendedPointId && pointId === recommendedPointId) return { left: "50%", top: "42%" };
    const others = filteredPoints.filter((p) => p.id !== recommendedPointId);
    const ix = others.findIndex((p) => p.id === pointId);
    const p = PICKUP_MAP_POSITIONS[(ix >= 0 ? ix : 0) % PICKUP_MAP_POSITIONS.length]!;
    return { left: p.left, top: p.top };
  };
  const sheetClass = vvSheet
    ? "max-h-none"
    : sheetMode === "expanded" || searchActive
      ? "max-h-[78dvh]"
      : showPreview
        ? "max-h-[calc(100dvh-7rem)]"
        : "max-h-[28dvh]";
  const sheetScrollClass = showPreview
    ? "max-h-[calc(100dvh-12rem)]"
    : "max-h-[calc(78dvh-5.5rem)]";
  const sheetScrollClassEffective = vvSheet ? "min-h-0 flex-1" : sheetScrollClass;
  const sheetPositionClass = vvSheet ? "" : "absolute bottom-0 left-0 right-0";
  const sheetTransitionClass = vvSheet ? "transition-none" : "transition-[max-height,top] duration-200";
  const sheetFixedStyle: CSSProperties | undefined = vvSheet
    ? {
        position: "fixed",
        top: vvSheet.top,
        left: vvSheet.left,
        width: vvSheet.width,
        height: vvSheet.height,
        right: "auto",
        bottom: "auto",
      }
    : undefined;
  const mapFixedStyle: CSSProperties | undefined = vvSheet
    ? {
        position: "fixed",
        top: vvSheet.top,
        left: vvSheet.left,
        width: vvSheet.width,
        height: vvSheet.height,
        right: "auto",
        bottom: "auto",
      }
    : undefined;

  const handleSheetPointerUp = (clientY: number) => {
    const start = sheetDragRef.current?.startY;
    sheetDragRef.current = null;
    if (start == null) return;
    const delta = clientY - start;
    if (delta < -28) {
      ignoreSheetClickRef.current = true;
      window.setTimeout(() => {
        ignoreSheetClickRef.current = false;
      }, 0);
      setSheetMode("expanded");
      return;
    }
    if (delta > 28) {
      ignoreSheetClickRef.current = true;
      window.setTimeout(() => {
        ignoreSheetClickRef.current = false;
      }, 0);
      setSheetMode(mapPreviewPoint ? "preview" : "collapsed");
      setSearchActive(false);
    }
  };

  const renderPvzDetails = () =>
    hasDetails ? (
      <div className="space-y-3">
        <PickupStoreFulfillmentBlock
          title="В пункте выдачи"
          leadText={pvzSheetThumbMeta?.atPoint.leadText}
          benefitText="Бесплатно · ПВЗ"
          items={linePreview?.available ?? []}
          productsById={productsById}
        />
        <PickupStoreFulfillmentBlock
          title="В ПВЗ недоступно"
          leadText="Можно выбрать другой способ доставки"
          items={linePreview?.unavailable ?? []}
          productsById={productsById}
        />
      </div>
    ) : null;

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
        В этом городе пока нет доступных ПВЗ.
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden isolate">
      <CheckoutCloseCrossButton
        ariaLabel="Закрыть карту выбора ПВЗ"
        onClick={onClose}
        className={
          vvSheet ? "fixed right-4 z-30" : "fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-30"
        }
        style={vvSheet ? { top: Math.max(16, vvSheet.top + 4) } : undefined}
      />
      <div
        className={`overflow-hidden [backface-visibility:hidden] ${vvSheet ? "fixed z-[1]" : "fixed inset-0 z-[1]"}`}
        style={mapFixedStyle}
      >
        <div
          className="absolute inset-0 z-0 bg-[linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)]"
          onClick={() => {
            setSearchActive(false);
            setMapPreviewPointId(null);
            setSheetMode("collapsed");
          }}
          aria-hidden
        />
        <div
          className="absolute inset-0 z-[1] overflow-hidden"
          onClick={() => {
            setSearchActive(false);
            setMapPreviewPointId(null);
            setSheetMode("collapsed");
          }}
        >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(226,232,240,0.92))]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%),linear-gradient(transparent_24%,rgba(148,163,184,0.14)_25%,rgba(148,163,184,0.14)_26%,transparent_27%,transparent_74%,rgba(148,163,184,0.14)_75%,rgba(148,163,184,0.14)_76%,transparent_77%)]" />
        {showPreview ? <div className="pointer-events-none absolute inset-0 z-[5] bg-black/10" aria-hidden /> : null}
        {mapPoints.map((point) => {
            const pos = mapPointPosition(point.id);
            const pinOpen = mapPreviewPointId === point.id;
            const recommended = recommendedPointId === point.id;
            const wasLastChoice = lastChosenPointId === point.id;
            const emphasis = pvzPointEmphasisClass(summary, { recommended, pinOpen });
            return (
              <button
                key={point.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchActive(false);
                  setMapPreviewPointId(point.id);
                  setSheetMode("preview");
                }}
                className={`pointer-events-auto absolute -translate-x-[38px] -translate-y-full border-0 bg-transparent p-0 text-left shadow-none outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 ${emphasis} ${
                  !pinOpen && selectedPointId === point.id ? "ring-2 ring-black/25 ring-offset-2 rounded-full" : ""
                }`}
                style={{ left: pos.left, top: pos.top }}
                aria-pressed={pinOpen}
                aria-expanded={pinOpen}
                aria-label={`${point.name}. ${pvzPointCountLabel(summary)}. ${pvzPointStatusTitle(summary)}.`}
              >
                <MapStorePin
                  brandMark="ПВЗ"
                  line1={pvzPointPinLine(summary)}
                  wasLastChoice={wasLastChoice}
                />
              </button>
            );
        })}
        </div>
      </div>

      <div
        role="region"
        aria-label="Результаты поиска ПВЗ"
        className={`z-40 flex min-h-0 flex-col overflow-hidden rounded-t-2xl border border-neutral-200/80 bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.14)] ${sheetTransitionClass} ${sheetClass} ${vvSheet ? "fixed" : sheetPositionClass}`}
        style={sheetFixedStyle}
      >
        <div
          className="cursor-grab shrink-0 px-4 pb-2 pt-2 active:cursor-grabbing"
          onPointerDown={(event) => {
            sheetDragRef.current = { startY: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => handleSheetPointerUp(event.clientY)}
          onPointerCancel={() => {
            sheetDragRef.current = null;
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (ignoreSheetClickRef.current) return;
              setSheetMode((prev) => (prev === "expanded" ? (mapPreviewPoint ? "preview" : "collapsed") : "expanded"));
            }}
            className="block w-full rounded-xl outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-neutral-900"
            aria-expanded={sheetExpanded}
          >
            <span className="mx-auto block h-1 w-10 rounded-full bg-neutral-200" aria-hidden />
          </button>
        </div>

        {showPreview ? (
          <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-left text-[22px] font-semibold leading-tight text-neutral-900">
                {sheetPoint?.name}
              </p>
              {sheetPoint?.address ? (
                <p className="mt-1 truncate text-sm leading-snug text-neutral-500">{sheetPoint.address}</p>
              ) : null}
            </div>
            <CheckoutCloseCrossButton
              ariaLabel="Закрыть карточку ПВЗ"
              onClick={() => {
                setSearchActive(false);
                setMapPreviewPointId(null);
                setSheetMode("collapsed");
              }}
            />
          </div>
        ) : null}

        {!showPreview ? (
          <div className="shrink-0 px-4 pb-4">
            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 focus-within:border-neutral-400">
                <span className="sr-only">Поиск ПВЗ</span>
                <svg
                  className="h-5 w-5 shrink-0 text-neutral-700"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.5 16.5 4 4" />
                </svg>
                <input
                  type="search"
                  value={pvzSearch}
                  onFocus={() => {
                    setSearchActive(true);
                    setSheetMode("expanded");
                    setMapPreviewPointId(null);
                  }}
                  onChange={(e) => {
                    setSearchActive(true);
                    setPvzSearch(e.target.value);
                    setMapPreviewPointId(null);
                    setSheetMode("expanded");
                  }}
                  placeholder="Поиск по ПВЗ"
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-base outline-none"
                />
              </label>
              {searchActive || pvzSearch.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    setPvzSearch("");
                    setSearchActive(false);
                    setSheetMode("collapsed");
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-2xl leading-none text-neutral-950 shadow-sm"
                  aria-label="Свернуть поиск"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          className={`${sheetScrollClassEffective} overflow-y-auto overscroll-y-contain px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]`}
        >
          {showPreview && sheetPoint && !sheetExpanded ? (
            <div className="pb-1">
              <div className="space-y-3">
                <p className="inline-flex max-w-full rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold leading-snug text-neutral-800">
                  {scenarioLine}
                </p>
                {pvzStatusDetail ? (
                  <p className="text-sm leading-snug text-neutral-600">{pvzStatusDetail}</p>
                ) : null}
                {lastChosenPointId === sheetPoint.id ? (
                  <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                    Выбирали в прошлый раз
                  </p>
                ) : null}
                {renderPvzDetails()}
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => onSelect(sheetPoint.id)}
                  className="w-full rounded-xl border border-neutral-900 bg-white py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50"
                >
                  Выбрать
                </button>
              </div>
            </div>
          ) : null}

          {sheetExpanded ? (
            <div className="pb-4">
              <div className="space-y-2">
                {filteredPoints.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
                    По запросу пункты не найдены.
                  </div>
                ) : (
                  filteredPoints.map((point) => {
                    const selected = selectedPointId === point.id;
                    const wasLastChoice = lastChosenPointId === point.id;
                    const detailsOpen = !!expandedPointIds[point.id];
                    return (
                      <div
                        key={point.id}
                        className={`rounded-2xl border bg-white p-3 transition sm:p-4 ${selected ? "border-black" : "border-neutral-200"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[17px] font-semibold leading-tight text-neutral-900">{point.name}</p>
                            <p className="mt-1 truncate text-sm leading-snug text-neutral-500">{point.address}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onSelect(point.id)}
                            className="shrink-0 rounded-xl border border-neutral-900 bg-white px-4 py-2 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-50"
                            aria-pressed={selected}
                          >
                            Выбрать
                          </button>
                        </div>
                        <div className="mt-3 space-y-3">
                          <p className="inline-flex max-w-full rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold leading-snug text-neutral-800">
                            {scenarioLine}
                          </p>
                          {wasLastChoice ? (
                            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                              Выбирали в прошлый раз
                            </p>
                          ) : null}
                          {hasDetails ? (
                            <button
                              type="button"
                              onClick={() => toggleExpandedPoint(point.id)}
                              className="flex w-fit items-center gap-1 text-xs font-semibold text-neutral-700 transition hover:text-neutral-950"
                              aria-expanded={detailsOpen}
                            >
                              <span>{detailsOpen ? "Свернуть" : "Подробнее"}</span>
                              <svg
                                className={`mt-px h-3.5 w-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                                viewBox="0 0 16 16"
                                fill="none"
                                aria-hidden
                              >
                                <path d="M4 6.5 8 10l4-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          ) : null}
                          {detailsOpen ? <div className="space-y-3 border-t border-neutral-100 pt-3">{renderPvzDetails()}</div> : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PvzSelectedPointCard({
  point,
  summary,
  copy,
  onChange,
}: {
  point?: PvzPointOption;
  summary?: MethodSummary;
  copy?: SelectorCopy["pvz"];
  onChange: () => void;
}) {
  if (!point) {
    return (
      <div className="mt-3 text-sm text-neutral-500">
        Пункт выдачи пока не выбран.
      </div>
    );
  }

  const statusDetail = pvzPointStatusDetail(summary, copy ?? FALLBACK_SELECTOR_COPY.pvz);

  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{point.name}</p>
          <p className="mt-1 text-xs text-neutral-500">{point.address}</p>
          {statusDetail ? <p className="mt-1 text-xs text-neutral-500">{statusDetail}</p> : null}
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
        <div className="flex min-h-12 shrink-0 items-center border-b border-neutral-100 px-2 py-2 sm:px-3">
          <div className="flex min-h-12 w-12 shrink-0 items-center justify-start" aria-hidden />
          <h2 className="cu-section-title min-w-0 flex-1 text-center">Куда доставить</h2>
          <div className="flex shrink-0 items-center justify-end">
            <CheckoutCloseCrossButton ariaLabel="Закрыть" onClick={onClose} />
          </div>
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
          <div key={`${line.productId}-${lineIx}`} className="flex w-12 shrink-0 flex-col items-center gap-0.5">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-neutral-100">
              <SafeProductImage
                src={productsById[line.productId]?.image ?? ""}
                alt=""
                fill
                className="object-cover"
                sizes="48px"
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
  selectorCopy: selectorUiCopy,
  selectedPvzId,
  onSelectPvz,
  courierAddress,
  onEditCourierAddress,
  onClose,
  onConfirm,
  saving,
  lastChosenPickupStoreId,
  lastChosenPvzPointId,
  methodTabNames,
}: {
  resolution: RemainderResolution;
  productsById: Record<string, Bootstrap["products"][number]>;
  pvzPoints: PvzPointOption[];
  selectorCopy?: SelectorCopy;
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
  /** Подписи вкладок как на основном чекауте (`Магазины` для самовывоза, имена методов из bootstrap). */
  methodTabNames?: Partial<Record<DeliveryMethodCode, string>>;
}) {
  const labelCourier = methodTabNames?.courier ?? "Курьер";
  const labelPickup = methodTabNames?.pickup ?? "Магазины";
  const labelPvz = methodTabNames?.pvz ?? "ПВЗ";
  const courierOption = resolution.options.find((option) => option.methodCode === "courier") ?? null;
  const pickupOptions = resolution.options.filter((option) => option.methodCode === "pickup");
  const pvzOption = resolution.options.find((option) => option.methodCode === "pvz") ?? null;
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
        className="relative z-10 flex h-[95dvh] max-h-[95dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
      >
        <CheckoutSheetStickyHeader title="Выберите способ получения" onClose={onClose} />

        <div className="min-h-0 flex-1 basis-0 overflow-y-auto overscroll-y-contain px-5 pb-4 pt-4">
        <div className="rounded-xl bg-neutral-50/70 p-3.5 sm:p-4">
          <RemainderLinesThumbStrip lines={resolution.lines} productsById={productsById} />
        </div>

        <CheckoutDeliveryMethodTabs
          className="mt-4 flex items-stretch gap-3"
          items={[
            courierOption
              ? {
                  id: "courier",
                  tabLabel: labelCourier,
                  coverage: optionCoverageLabel(methodSummaryFromAlternativeOption(courierOption)),
                  selected: selectedMethod === "courier",
                  onSelect: () => handleMethodSelect("courier"),
                }
              : null,
            pickupOptions[0]
              ? {
                  id: "pickup",
                  tabLabel: labelPickup,
                  coverage: optionCoverageLabel(methodSummaryFromAlternativeOption(pickupOptions[0])),
                  selected: selectedMethod === "pickup",
                  onSelect: () => handleMethodSelect("pickup"),
                }
              : null,
            pvzOption
              ? {
                  id: "pvz",
                  tabLabel: labelPvz,
                  coverage: optionCoverageLabel(methodSummaryFromAlternativeOption(pvzOption)),
                  selected: selectedMethod === "pvz",
                  onSelect: () => handleMethodSelect("pvz"),
                }
              : null,
          ].filter((item): item is NonNullable<typeof item> => Boolean(item))}
        />

        {courierOption || pickupOptions[0] || pvzOption ? (
          !selectedMethod ? (
            <p className="mx-auto mt-3 max-w-[17rem] text-center text-[11px] font-normal leading-snug text-neutral-500">
              Выберите способ получения.
            </p>
          ) : null
        ) : null}

        {selectedMethod ? (
          <div className="mt-3 rounded-xl border border-neutral-200 bg-white px-3 py-3">
            {(() => {
              const optForSummary =
                selectedMethod === "courier"
                  ? courierOption
                  : selectedMethod === "pickup"
                    ? pickupOptions[0] ?? null
                    : selectedMethod === "pvz"
                      ? pvzOption
                      : null;
              const dmSummary = optForSummary ? methodSummaryFromAlternativeOption(optForSummary) : undefined;
              const summaryText =
                selectedMethod && dmSummary
                  ? methodSummaryLabel(selectedMethod, dmSummary, true)
                  : "";
              const chosenSplitPickupStore = splitPickupStores.find((s) => s.id === selectedPickupStoreId);
              return (
                <>
                  {summaryText ? <p className="mb-2 text-sm text-neutral-400">{summaryText}</p> : null}
                  {selectedMethod === "pickup" ? (
                    chosenSplitPickupStore ? (
                      <PickupSelectedStoreCard
                        store={chosenSplitPickupStore}
                        onChange={() => setPickupSelectorOpen(true)}
                        embedded
                      />
                    ) : (
                      <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/80 p-3 text-sm text-neutral-700">
                        <p className="font-medium text-neutral-900">Выберите магазин</p>
                        <p className="mt-1 text-xs text-neutral-600">
                          {lastChosenPickupStoreId &&
                          splitPickupStores.some((s) => s.id === lastChosenPickupStoreId) ? (
                            <>
                              В прошлый раз вы выбирали «
                              {splitPickupStores.find((s) => s.id === lastChosenPickupStoreId)!.name}» — он показан
                              первым в списке.
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
                    )
                  ) : null}
                  {selectedMethod === "courier" && courierOption ? (
                    <CourierAddressCard
                      address={courierAddress}
                      onChange={() => onEditCourierAddress(courierOption)}
                    />
                  ) : null}
                  {selectedMethod === "pvz" ? (
                    selectedPvzPoint ? (
                      <PvzSelectedPointCard
                        point={selectedPvzPoint}
                        summary={splitPvzSummary}
                        copy={selectorUiCopy?.pvz}
                        onChange={() => setPvzSelectorOpen(true)}
                      />
                    ) : (
                      <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/80 p-3 text-sm text-neutral-700">
                        <p className="font-medium text-neutral-900">Выберите ПВЗ</p>
                        <p className="mt-1 text-xs text-neutral-600">
                          {lastChosenPvzPointId && pvzPoints.some((p) => p.id === lastChosenPvzPointId) ? (
                            <>
                              В прошлый раз вы выбирали «{pvzPoints.find((p) => p.id === lastChosenPvzPointId)!.name}» —
                              он показан первым в списке.
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
                    )
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : null}
        </div>

        <div className="shrink-0 border-t border-neutral-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => selectedOption && onConfirm(selectedOption)}
            disabled={confirmDisabled}
            className="w-full rounded-2xl bg-black px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-900 disabled:pointer-events-none disabled:opacity-40"
          >
            {saving ? "Подтверждаем…" : "Выбрать этот вариант"}
          </button>
        </div>
      </div>
      <PickupStoreSelectionOverlay
        open={pickupSelectorOpen}
        onDismiss={() => setPickupSelectorOpen(false)}
        stores={splitPickupStores}
        selectedStoreId={selectedPickupStoreId}
        lastChosenStoreId={lastChosenPickupStoreId}
        productsById={productsById}
        copy={selectorUiCopy?.pickup}
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
        copy={selectorUiCopy?.pvz}
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
  const secondaryHeading = isCourier || isGjStorePickup || primaryHeading === headingName ? null : headingName;
  /** Для курьера всегда показываем отдельный блок выбора даты/интервала. */
  const showCourierDeliveryRow = isCourier && Boolean(leadLabel);

  return (
    <div
      className={`transition ${
        inGroup ? "px-5 pb-8 pt-6" : "p-5"
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
                className="flex w-12 shrink-0 flex-col items-center gap-0.5"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-neutral-100">
                  <SafeProductImage src={it.image} alt="" fill className="object-cover" sizes="48px" />
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
              <div className="flex aspect-[3/4] w-12 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-xs font-semibold text-neutral-500">
                +{extra}
              </div>
            ) : null}
          </div>

          {showCourierDeliveryRow ? (
            <div className="mt-4 space-y-2">
              <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {courierDateLabels.map((d, i) => {
                  const chunks = splitCourierDateLabel(d);
                  return (
                    <button
                      key={`courier-date-${i}`}
                      type="button"
                      onClick={() => onDateChange?.(i)}
                      className={`h-[44px] w-[54px] shrink-0 rounded-[14px] border px-1.5 py-1 text-center transition ${
                        i === dateIx
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 bg-white text-neutral-900"
                      }`}
                    >
                      <span className="block text-[13px] font-semibold leading-tight">{chunks.primary}</span>
                      <span className={`block text-[10px] leading-tight ${i === dateIx ? "text-white/85" : "text-neutral-600"}`}>
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
            <div key={i} className="flex w-12 shrink-0 flex-col items-center gap-0.5">
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
  /** Остаток по объединённым линиям (цепочка nextResolution + снятые галочки) — один блок и один запрос remainder-resolution */
  const [unifiedRemainderResolution, setUnifiedRemainderResolution] = useState<RemainderResolution | null>(null);
  const [unifiedRemainderFetchPending, setUnifiedRemainderFetchPending] = useState(false);
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
    const scrollY = window.scrollY;
    const { style } = document.body;
    const previousOverflow = style.overflow;
    const previousPosition = style.position;
    const previousTop = style.top;
    const previousLeft = style.left;
    const previousRight = style.right;
    const previousWidth = style.width;

    style.overflow = "hidden";
    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";

    return () => {
      if (previousOverflow) {
        style.overflow = previousOverflow;
      } else {
        style.removeProperty("overflow");
      }
      if (previousPosition) {
        style.position = previousPosition;
      } else {
        style.removeProperty("position");
      }
      if (previousTop) {
        style.top = previousTop;
      } else {
        style.removeProperty("top");
      }
      if (previousLeft) {
        style.left = previousLeft;
      } else {
        style.removeProperty("left");
      }
      if (previousRight) {
        style.right = previousRight;
      } else {
        style.removeProperty("right");
      }
      if (previousWidth) {
        style.width = previousWidth;
      } else {
        style.removeProperty("width");
      }
      window.scrollTo(0, scrollY);
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
    };
  }, [checkoutSheetOpen]);

  useEffect(() => {
    let cancelled = false;
    fetchWithRetry("/api/bootstrap")
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
          const r = await fetchWithRetry("/api/cart-lines", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cityId,
              lines: fromStorage.map(({ productId, quantity }) => ({ productId, quantity })),
            }),
          });
          if (!r.ok) throw new Error(String(r.status));
          const json = (await r.json()) as {
            lines: { productId: string; quantity: number; name: string; price: number; image: string }[];
            units: number;
            subtotal: number;
          };
          if (!cancelled) setCartDetail(json);
          return;
        }
        const r = await fetchWithRetry(`/api/cart-lines?cityId=${encodeURIComponent(cityId)}`);
        if (!r.ok) throw new Error(String(r.status));
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
  const [cartSummariesFetchFailed, setCartSummariesFetchFailed] = useState(false);

  useEffect(() => {
    setCartScopedSummaries(null);
  }, [cityId]);

  useEffect(() => {
    if (!cityId || !cartDetail?.lines?.length) {
      setCartScopedSummaries(null);
      setCartSummariesFetchFailed(false);
      return;
    }
    setCartSummariesFetchFailed(false);
    setCartScopedSummaries(null);
    let cancelled = false;
    const lines = cartDetail.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));

    void (async () => {
      try {
        const r = await fetchWithRetry("/api/cart-summaries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cityId, lines }),
        });
        const json = (await r.json()) as CartMethodSummariesResult;
        if (cancelled) return;
        if (!r.ok || !json.methodSummaries || !json.pickupSummaryByStore) {
          setCartScopedSummaries(null);
          setCartSummariesFetchFailed(true);
          return;
        }
        setCartScopedSummaries({
          methodSummaries: json.methodSummaries,
          pickupSummaryByStore: json.pickupSummaryByStore,
          pvzLinePreview: json.pvzLinePreview,
          pvzSheetThumbMeta: json.pvzSheetThumbMeta,
        });
      } catch {
        if (!cancelled) {
          setCartScopedSummaries(null);
          setCartSummariesFetchFailed(true);
        }
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

  /** Пока `/api/cart-summaries` не вернул сводки — скелетон строки «N из M» на вкладках способа получения. */
  const methodTabsCoveragePending = useMemo(
    () =>
      Boolean(
        cartDetail?.lines?.length &&
          !cartSummariesFetchFailed &&
          !cartScopedSummaries?.methodSummaries,
      ),
    [cartDetail?.lines?.length, cartSummariesFetchFailed, cartScopedSummaries?.methodSummaries],
  );

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
      const res = await fetchWithRetry("/api/checkout/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityId,
          deliveryMethodCode: params.deliveryMethodCode,
          selectedStoreId: params.selectedStoreId ?? null,
          lines: params.lines,
        }),
      });
      const data = (await res.json()) as {
        scenario?: ScenarioResult;
        remainderResolution?: RemainderResolution | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Сценарий: ${res.status}`);
      }
      return {
        scenario: data.scenario!,
        remainderResolution: data.remainderResolution ?? null,
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
        const scoreDiff = pickupStoreSortScore(b.summary) - pickupStoreSortScore(a.summary);
        if (scoreDiff !== 0) return scoreDiff;
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
  const selectorUiCopy = boot?.checkoutSelectorCopy ?? FALLBACK_SELECTOR_COPY;

  const splitModalMethodTabNames = useMemo(
    () =>
      boot
        ? ({
            courier: boot.deliveryMethods.find((m) => m.code === "courier")?.name ?? "Курьер",
            pickup: "Магазины",
            pvz: boot.deliveryMethods.find((m) => m.code === "pvz")?.name ?? "ПВЗ",
          } satisfies Partial<Record<DeliveryMethodCode, string>>)
        : undefined,
    [boot],
  );

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

  /** Все позиции без оформленной доставки: API-остаток + снятые галочки — один общий блок на чекауте */
  const mergedCheckoutRemainderLines = useMemo(
    () =>
      mergeRemainderLineLists(
        activeRemainderResolution?.lines ?? [],
        manualExcludedLines.map(({ productId, quantity }) => ({ productId, quantity })),
      ),
    [activeRemainderResolution, manualExcludedLines],
  );

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
    if (mergedCheckoutRemainderLines.length === 0) {
      setUnifiedRemainderResolution(null);
      setUnifiedRemainderFetchPending(false);
      return;
    }
    if (!cityId || !method) {
      setUnifiedRemainderResolution(null);
      setUnifiedRemainderFetchPending(false);
      return;
    }
    const lines = mergedCheckoutRemainderLines;
    setUnifiedRemainderResolution({ lines, options: [] });
    setUnifiedRemainderFetchPending(true);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchWithRetry("/api/checkout/remainder-resolution", {
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
          setUnifiedRemainderResolution(j.remainderResolution ?? { lines, options: [] });
        }
      } catch {
        if (!cancelled) setUnifiedRemainderResolution({ lines, options: [] });
      } finally {
        if (!cancelled) setUnifiedRemainderFetchPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mergedCheckoutRemainderLines, cityId, method, storeId]);

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

  const openUnifiedRemainderSplitModal = useCallback(() => {
    if (!unifiedRemainderResolution?.lines.length) return;
    setSplitModalState({ mode: "add", editIndex: null, resolution: unifiedRemainderResolution });
  }, [unifiedRemainderResolution]);

  const openSplitEditModal = (selectionIndex: number) => {
    const sel = secondarySelections[selectionIndex];
    if (!sel?.inputLines?.length) return;
    const lines: RemainderLine[] = sel.inputLines.map((l) => ({ productId: l.productId, quantity: l.quantity }));

    const chainSource =
      selectionIndex === 0 ? remainderResolution : secondarySelections[selectionIndex - 1]?.nextResolution;

    if (chainSource?.lines.length && remainderLinesMultisetEqual(lines, chainSource.lines)) {
      setSplitModalState({
        mode: "edit",
        editIndex: selectionIndex,
        resolution: { lines, options: chainSource.options },
      });
      return;
    }

    setSplitModalState({
      mode: "edit",
      editIndex: selectionIndex,
      resolution: { lines, options: [] },
    });

    void (async () => {
      try {
        if (!cityId || !method) return;
        const res = await fetchWithRetry("/api/checkout/remainder-resolution", {
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
        const nextRes = j.remainderResolution ?? { lines, options: [] };
        setSplitModalState((prev) => {
          if (prev?.mode !== "edit" || prev.editIndex !== selectionIndex) return prev;
          return { ...prev, resolution: nextRes };
        });
      } catch {
        setSplitModalState((prev) => {
          if (prev?.mode !== "edit" || prev.editIndex !== selectionIndex) return prev;
          return { ...prev, resolution: { lines, options: [] } };
        });
      }
    })();
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

  const checkoutCopyResolved = boot.checkoutCopy ?? fullCheckoutCopy();

  const hasSplit = allDisplayParts.length > 1 || unresolvedLines.length > 0;
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
            <div className="mt-3 space-y-1.5 border-l-2 border-neutral-900 pl-2.5 text-[13px] leading-snug text-neutral-700">
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
                className="appearance-none rounded-full border-0 bg-transparent pl-3 pr-8 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-800 shadow-none outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-900/15 focus-visible:ring-offset-0"
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
          <CheckoutDeliveryMethodTabs
            coveragePending={methodTabsCoveragePending}
            items={deliveryOptions.map((dm) => {
              const tabName = dm.code === "pickup" ? "Магазины" : dm.name;
              const isSelected = method === dm.code;
              const isRecommended = recommendedMethodCode === dm.code;
              const coverage = optionCoverageLabel(dm.summary);
              const mutedPvz =
                dm.code === "pvz" &&
                "pvzUnavailableForOrder" in dm &&
                (dm as { pvzUnavailableForOrder?: boolean }).pvzUnavailableForOrder;
              return {
                id: dm.id,
                tabLabel: tabName,
                coverage,
                selected: isSelected,
                disabled: !dm.enabled,
                mutedUnavailable: mutedPvz,
                recommended: isRecommended,
                title: mutedPvz
                  ? "Этот заказ через ПВЗ не оформить: для выбранных позиций нет остатка на складе под отгрузку в пункт. Выберите курьера или магазин."
                  : undefined,
                onSelect: () => {
                  selectPrimaryMethod(dm.code as "courier" | "pickup" | "pvz");
                  if (dm.code === "pickup") setPickupSelectorOpen(true);
                  if (dm.code === "pvz") setPvzSelectorOpen(true);
                },
              };
            })}
          />
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
                          copy={selectorUiCopy.pvz}
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

        {unifiedRemainderResolution && unifiedRemainderResolution.lines.length > 0 ? (
          <section className="mb-8">
            <UnresolvedItemsBlock
              resolution={unifiedRemainderResolution}
              productsById={productsById}
              onChoose={openUnifiedRemainderSplitModal}
              copy={checkoutCopyResolved}
              ctaDisabled={unifiedRemainderFetchPending}
              suppressEmptyOptionsHint={unifiedRemainderFetchPending}
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
          {payOnDeliveryOnlyEffective ? (
            <div className="mb-3">
              <p className="cu-page-title text-neutral-900">Несколько отправлений</p>
              <div className="mt-2.5 border-l-2 border-neutral-900 pl-2.5 text-[13px] leading-snug text-neutral-800">
                <p>{payOnDeliveryDisclaimerText}</p>
              </div>
            </div>
          ) : null}
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
        </section>

        <section className="mb-8 mt-8 space-y-3">
          {(recipient || promoApplied || bonusOn) ? (
            <div>
              <p className="cu-page-title text-neutral-900">{checkoutCopyResolved.promoBonusTitle}</p>
              <div className="mt-2.5 border-l-2 border-neutral-900 pl-2.5 text-[13px] leading-snug text-neutral-800">
                <p>{checkoutCopyResolved.promoBonusBody}</p>
              </div>
            </div>
          ) : null}
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
              if (units > 0 && orderedUnits === 0) {
                label = "Выберите способ получения";
              } else if (units > 0 && orderedUnits < units) {
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
          copy={selectorUiCopy.pickup}
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
          copy={selectorUiCopy.pvz}
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
          selectorCopy={selectorUiCopy}
          methodTabNames={splitModalMethodTabNames}
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
            <div className="sticky top-0 z-20 border-b border-neutral-100 bg-white px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 pr-1">
                  <h3 className="cu-sheet-title">Подтвердите телефон</h3>
                  <p className="cu-sheet-lead mt-1">
                    Чтобы оформить заказ, укажите номер и нажмите «Получить смс с кодом» — в демо переходим без ввода
                    кода.
                  </p>
                </div>
                <CheckoutCloseCrossButton
                  ariaLabel="Закрыть окно телефона"
                  onClick={() => setPhoneGateOpen(false)}
                />
              </div>
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
