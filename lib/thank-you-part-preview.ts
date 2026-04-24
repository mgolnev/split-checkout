import type { ThankYouPart } from "@/lib/thank-you-session";

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

/** Как в `buildCourierDateLabels` чекаута: ближайшие дни `18 сб`. */
function buildCourierDateLabels(reference: Date = new Date()): string[] {
  const base = startOfStableCalendarDay(reference);
  return Array.from({ length: 10 }, (_, idx) => {
    const day = addCalendarDays(base, idx + 1);
    return `${day.getDate()} ${formatRuWeekdayShort(day)}`;
  });
}

const PICKUP_RESERVE_TITLE = "Соберём за 30 минут";
const PICKUP_COLLECT_TITLE = "Доставим в магазин";

export type ThankYouPartCardPreview = {
  primaryHeading: string;
  secondaryHeading: string | null;
  lineTotal: number;
  priceBreakdownTitle: string | undefined;
  benefitOrFee: string | null;
};

/**
 * Заголовок / выгода / итог по строке как в `PartCard` чекаута (без «Посылка N»).
 * Для курьера дата считается от `orderedAtIso`, чтобы совпасть с днём оформления.
 */
export function thankYouPartCardPreview(
  part: ThankYouPart,
  orderedAtIso: string,
  fmtRub: (n: number) => string,
): ThankYouPartCardPreview {
  const mode = part.mode;
  const isCourier = mode === "courier";
  const isGjStorePickup = mode === "click_reserve" || mode === "click_collect";
  const isPvz = mode === "pvz";

  const gjPickupHeadline =
    part.leadTimeLabel?.trim() ||
    (mode === "click_reserve" ? PICKUP_RESERVE_TITLE : mode === "click_collect" ? PICKUP_COLLECT_TITLE : "");
  const pvzHeadline = part.leadTimeLabel?.trim() || part.sourceName;
  const headingName = part.sourceName;

  let primaryHeading: string;
  if (isCourier) {
    const ref = new Date(orderedAtIso);
    const labels = buildCourierDateLabels(Number.isNaN(ref.getTime()) ? new Date() : ref);
    const ix = part.selectedDate ? labels.findIndex((l) => l === part.selectedDate) : -1;
    if (ix >= 0) {
      const base = startOfStableCalendarDay(Number.isNaN(ref.getTime()) ? new Date() : ref);
      const dayDate = addCalendarDays(base, ix + 1);
      const long = formatRuDayMonthLong(dayDate);
      primaryHeading = ix === 0 ? `Завтра, ${long}` : long;
    } else {
      primaryHeading =
        part.selectedDate && part.selectedSlot
          ? `${part.selectedDate}, ${part.selectedSlot}`
          : part.leadTimeLabel?.trim() || part.methodLabel;
    }
  } else if (isGjStorePickup) {
    primaryHeading = gjPickupHeadline || headingName;
  } else if (isPvz) {
    primaryHeading = pvzHeadline || headingName;
  } else {
    primaryHeading = headingName;
  }

  const secondaryHeading =
    isCourier || isGjStorePickup || isPvz || primaryHeading === headingName ? null : headingName;

  const merch = part.subtotal;
  const ship = part.deliveryPrice;
  const lineTotal = merch + ship;
  const priceBreakdownTitle =
    merch > 0 || ship > 0
      ? ship > 0
        ? `Товары: ${fmtRub(merch)} · Доставка: ${fmtRub(ship)}`
        : `Товары: ${fmtRub(merch)} · Доставка бесплатно`
      : undefined;

  const courierPaidFeeLine = isCourier && ship > 0 ? `+${fmtRub(ship)} за доставку` : null;
  const benefitLine = isGjStorePickup
    ? mode === "click_reserve"
      ? "Бесплатно · примерка"
      : "Бесплатно"
    : isPvz
      ? "Бесплатно · ПВЗ"
      : isCourier
        ? ship <= 0
          ? "Бесплатная доставка"
          : null
        : null;

  const benefitOrFee = courierPaidFeeLine ?? benefitLine;

  return { primaryHeading, secondaryHeading, lineTotal, priceBreakdownTitle, benefitOrFee };
}
