/**
 * Заголовок готовности click & collect: «Доставим в магазин 19 апреля».
 * День считается как «сегодня + N календарных дней» в часовом поясе Москвы.
 */

const CLICK_COLLECT_TZ = "Europe/Moscow";

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

function calendarInZone(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "01");
  const d = Number(parts.find((p) => p.type === "day")?.value ?? "01");
  return { y, m, d };
}

function addCalendarDaysCivil(y: number, m: number, d: number, addDays: number): { y: number; m: number; d: number } {
  const t = Date.UTC(y, m - 1, d + addDays);
  const x = new Date(t);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

function formatRuDayMonth(m: number, d: number): string {
  return `${d} ${MONTHS_GENITIVE_RU[m - 1]}`;
}

export function buildClickCollectDeliveryHeadline(leadDays: number, now: Date = new Date()): string {
  const days = Math.max(0, Math.floor(Number(leadDays)));
  const today = calendarInZone(now, CLICK_COLLECT_TZ);
  const target = addCalendarDaysCivil(today.y, today.m, today.d, days);
  return `Доставим в магазин ${formatRuDayMonth(target.m, target.d)}`;
}

