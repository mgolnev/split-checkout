/**
 * Заголовок готовности заказа к выдаче в ПВЗ: «Доставим в пункт выдачи …».
 * Диапазон дней считается от «сегодня» в заданном часовом поясе (по умолчанию Москва).
 */

export const PVZ_DELIVERY_TZ = "Europe/Moscow";

const MONTHS_GENITIVE_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

export type PvzDeliveryRuleSlice = {
  pvzDeliveryMinDays: number;
  pvzDeliveryMaxDays: number;
  pvzReadyFixedAt: Date | null;
};

function calendarInZone(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return { y, m, d };
}

/** Григорианское сложение дней к календарной дате (без привязки к UTC-полуночи). */
function addCalendarDaysCivil(y: number, m: number, d: number, addDays: number): { y: number; m: number; d: number } {
  const t = Date.UTC(y, m - 1, d + addDays);
  const x = new Date(t);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

function formatRuDayMonth(y: number, m: number, d: number): string {
  return `${d} ${MONTHS_GENITIVE_RU[m - 1]}`;
}

function formatRuRange(
  a: { y: number; m: number; d: number },
  b: { y: number; m: number; d: number },
): string {
  if (a.y === b.y && a.m === b.m && a.d === b.d) {
    return formatRuDayMonth(a.y, a.m, a.d);
  }
  if (a.y === b.y && a.m === b.m) {
    return `${a.d}–${b.d} ${MONTHS_GENITIVE_RU[a.m - 1]}`;
  }
  return `${formatRuDayMonth(a.y, a.m, a.d)} – ${formatRuDayMonth(b.y, b.m, b.d)}`;
}

/**
 * Фиксированная дата из БД (@db.Date): интерпретируем как календарный день в UTC,
 * чтобы не было сдвига из‑за часового пояса сервера.
 */
function headlineFromFixedDate(fixed: Date): string {
  const y = fixed.getUTCFullYear();
  const m = fixed.getUTCMonth() + 1;
  const d = fixed.getUTCDate();
  return formatRuDayMonth(y, m, d);
}

const HEADLINE_PREFIX = "Доставим в пункт выдачи ";

/**
 * Текст для `ScenarioPart.leadTimeLabel` в режиме ПВЗ.
 */
export function buildPvzDeliveryHeadline(
  rule: PvzDeliveryRuleSlice,
  now: Date = new Date(),
  timeZone: string = PVZ_DELIVERY_TZ,
): string {
  if (rule.pvzReadyFixedAt) {
    return HEADLINE_PREFIX + headlineFromFixedDate(rule.pvzReadyFixedAt);
  }
  const minD = Math.max(1, rule.pvzDeliveryMinDays ?? 3);
  const maxD = Math.max(minD, rule.pvzDeliveryMaxDays ?? 5);
  const today = calendarInZone(now, timeZone);
  const start = addCalendarDaysCivil(today.y, today.m, today.d, minD);
  const end = addCalendarDaysCivil(today.y, today.m, today.d, maxD);
  return HEADLINE_PREFIX + formatRuRange(start, end);
}
