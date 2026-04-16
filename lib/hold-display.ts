import type { ScenarioPart } from "@/lib/types";

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

/** Последний календарный день хранения: N дней включительно, отсчёт от дня оформления (день 1). */
export function storeStockHoldLastInclusiveDay(holdDays: number, reference: Date = new Date()): Date {
  const base = startOfStableCalendarDay(reference);
  return addCalendarDays(base, Math.max(0, holdDays - 1));
}

function pluralizeDays(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

/** «18 апреля» — день и месяц без года для подписи «до … включительно». */
function formatRuDateLong(d: Date): string {
  return d
    .toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    .replace(/\s*г\.?\s*$/i, "")
    .trim();
}

/** Самовывоз из наличия: срок из правила «Хранение самовывоза из наличия, дней» → крайний день по календарю. */
export function formatStoreStockHoldLine(holdDays: number, reference: Date = new Date()): string {
  if (holdDays < 1) return "";
  const last = storeStockHoldLastInclusiveDay(holdDays, reference);
  return `Срок хранения: до ${formatRuDateLong(last)} включительно`;
}

/** Click & collect и ПВЗ: N из админки («Хранение click & collect» / «Хранение ПВЗ»). */
export function formatTransitHoldLine(holdDays: number): string {
  if (holdDays < 1) return "";
  return `Срок хранения: ${holdDays} ${pluralizeDays(holdDays)} с момента поступления`;
}

/**
 * Текст блока «Срок хранения» для карточки отправления.
 * Курьер — без блока (null).
 */
export function formatHoldNoticeForPart(
  mode: ScenarioPart["mode"],
  holdDays: number | undefined,
  reference: Date = new Date(),
): string | null {
  if (holdDays == null || holdDays < 1) return null;
  if (mode === "click_reserve") {
    return formatStoreStockHoldLine(holdDays, reference);
  }
  if (mode === "click_collect" || mode === "pvz") {
    return formatTransitHoldLine(holdDays);
  }
  return null;
}
