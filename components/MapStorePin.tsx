"use client";

/** Горизонтальное смещение: центр чёрного круга и нижней точки от левого края пина (круг 76px). */
export const MAP_STORE_PIN_ANCHOR_OFFSET_X_PX = 38;

type MapStorePinProps = {
  /** Текст в чёрном круге: по умолчанию GJ; для ПВЗ на карте — «ПВЗ». */
  brandMark?: string;
  /** Готовые подписи (как из pickupStorePinLines) */
  line1?: string;
  line2?: string | null;
  /** Либо счётчики по ТЗ: «N сегодня» / «M позже» */
  todayCount?: number;
  laterCount?: number;
  /** Ранее выбирали этот магазин — бейдж ↻ на круге */
  wasLastChoice?: boolean;
  className?: string;
};

/**
 * Кастомный HTML-overlay пина: круг (GJ или ПВЗ) + белая плашка + указатель.
 * Якорь геоточки — центр нижней круглой точки; позиционируйте контейнер с учётом {@link MAP_STORE_PIN_ANCHOR_OFFSET_X_PX}.
 */
export function MapStorePin({
  brandMark = "GJ",
  line1: line1Prop,
  line2: line2Prop,
  todayCount,
  laterCount,
  wasLastChoice = false,
  className = "",
}: MapStorePinProps) {
  const line1 =
    todayCount !== undefined
      ? `${todayCount} сегодня`
      : (line1Prop ?? "—");
  const line2 =
    todayCount !== undefined
      ? laterCount != null && laterCount > 0
        ? `${laterCount} позже`
        : null
      : line2Prop ?? null;
  const showLine2 = line2 != null && line2 !== "";

  return (
    <div
      className={`relative inline-flex w-max max-w-[min(100%,calc(100vw-2rem))] shrink-0 flex-row items-start pt-[3px] max-sm:pt-px ${className}`}
    >
      {/* Колонка: круг + хвост — треугольник без зазора под кругом */}
      <div className="flex w-[76px] shrink-0 flex-col items-center">
        <div
          className={`relative z-10 flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full bg-[#050505] font-bold tracking-[0.5px] text-white ${
            brandMark.length > 2 ? "text-[12px] leading-tight sm:text-[13px]" : "text-[18px]"
          }`}
        >
          <span className="whitespace-nowrap px-0.5 text-center">{brandMark}</span>
          {wasLastChoice ? (
            <span
              className="absolute -right-0.5 -top-0.5 z-[1] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-neutral-800 text-[7px] leading-none text-white"
              title="Выбирали в прошлый раз"
            >
              ↻
            </span>
          ) : null}
        </div>
        {/* Сильнее подтягиваем к кругу, верх «ножки» уходит под диск (z ниже круга) */}
        <div className="-mt-2 z-[5] flex flex-col items-center leading-none" aria-hidden>
          <div className="h-0 w-0 shrink-0 border-x-[11px] border-x-transparent border-t-[14px] border-t-[#050505]" />
          {/* Точка вплотную к ножке треугольника (без вертикального стержня) */}
          <div className="-mt-px h-[18px] w-[18px] shrink-0 rounded-full border-4 border-white bg-[#050505] shadow-[0_2px_6px_rgba(0,0,0,0.25)]" />
        </div>
      </div>

      {/* Плашка: ширина по контенту, визуально под кругом (перекрытие слева) */}
      <div
        className={
          "z-0 -ml-[38px] flex min-h-[76px] min-w-0 max-w-[min(16rem,calc(100vw-5rem))] flex-col justify-center gap-0.5 rounded-[18px] border border-black/[0.06] bg-white px-3 py-2 pl-14 shadow-[0_4px_16px_rgba(0,0,0,0.12)] max-sm:rounded-2xl max-sm:px-2.5 max-sm:py-1.5 max-sm:pl-11"
        }
      >
        <div className="break-words text-[15px] font-normal leading-snug text-[#1F1F1F] max-sm:text-[14px]">
          {line1}
        </div>
        {showLine2 ? (
          <div className="break-words text-[15px] font-normal leading-snug text-[#1F1F1F] max-sm:text-[14px]">{line2}</div>
        ) : null}
      </div>
    </div>
  );
}
