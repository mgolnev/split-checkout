"use client";

/**
 * Диаметр круга бренда; половина = горизонтальное смещение якоря геоточки от левого края пина.
 * На градиентной карте в `CheckoutApp` класс `-translate-x-[…px]` должен совпадать с этой половиной.
 */
const PIN_DISK_PX = 36;

/** Центр круга и нижней точки от левого края пина (половина {@link PIN_DISK_PX}). */
export const MAP_STORE_PIN_ANCHOR_OFFSET_X_PX = PIN_DISK_PX / 2;

/** Непрозрачная градация: чёрный → тёмно-серые (без opacity на всём пине). */
export type MapStorePinSurface = "ink" | "charcoal" | "graphite" | "slate";

const SURFACE: Record<
  MapStorePinSurface,
  { disk: string; tail: string; dot: string; labelShadow: string }
> = {
  ink: {
    disk: "bg-[#050505]",
    tail: "border-t-[#050505]",
    dot: "bg-[#050505]",
    labelShadow: "shadow-[0_3px_12px_rgba(0,0,0,0.14)]",
  },
  charcoal: {
    disk: "bg-[#171717]",
    tail: "border-t-[#171717]",
    dot: "bg-[#171717]",
    labelShadow: "shadow-[0_3px_12px_rgba(0,0,0,0.12)]",
  },
  graphite: {
    disk: "bg-[#2a2a2a]",
    tail: "border-t-[#2a2a2a]",
    dot: "bg-[#2a2a2a]",
    labelShadow: "shadow-[0_3px_11px_rgba(0,0,0,0.1)]",
  },
  slate: {
    disk: "bg-[#404040]",
    tail: "border-t-[#404040]",
    dot: "bg-[#404040]",
    labelShadow: "shadow-[0_2px_10px_rgba(0,0,0,0.09)]",
  },
};

export type MapStorePinProps = {
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
  /** Заливка круга/хвоста: иерархия без прозрачности */
  surface?: MapStorePinSurface;
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
  surface = "ink",
}: MapStorePinProps) {
  const pal = SURFACE[surface];
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
      className={`relative inline-flex w-max max-w-[min(100%,calc(100vw-2rem))] shrink-0 flex-row items-start pt-px max-sm:pt-px ${className}`}
    >
      <div className="flex w-[36px] shrink-0 flex-col items-center">
        <div
          className={`relative z-10 flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full font-bold tracking-[0.35px] text-white ${pal.disk} ${
            brandMark.length > 2 ? "text-[8px] leading-tight sm:text-[9px]" : "text-[11px]"
          }`}
        >
          <span className="whitespace-nowrap px-0.5 text-center">{brandMark}</span>
          {wasLastChoice ? (
            <span
              className="absolute -right-px -top-px z-[1] flex h-2 w-2 items-center justify-center rounded-full bg-neutral-800 text-[4px] leading-none text-white"
              title="Выбирали в прошлый раз"
            >
              ↻
            </span>
          ) : null}
        </div>
        <div className="-mt-0.5 z-[5] flex flex-col items-center leading-none" aria-hidden>
          <div className={`h-0 w-0 shrink-0 border-x-[5px] border-x-transparent border-t-[7px] ${pal.tail}`} />
          <div
            className={`-mt-px h-[10px] w-[10px] shrink-0 rounded-full border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.22)] ${pal.dot}`}
          />
        </div>
      </div>

      <div
        className={`z-0 -ml-[18px] flex min-h-[36px] min-w-0 max-w-[min(14rem,calc(100vw-4rem))] flex-col justify-center gap-0.5 rounded-[10px] border border-black/[0.06] bg-white px-1.5 py-1 pl-8 ${pal.labelShadow} max-sm:rounded-lg max-sm:px-1 max-sm:py-0.5 max-sm:pl-7`}
      >
        <div className="break-words text-[11px] font-normal leading-snug text-[#1F1F1F] max-sm:text-[10px]">
          {line1}
        </div>
        {showLine2 ? (
          <div className="break-words text-[11px] font-normal leading-snug text-[#1F1F1F] max-sm:text-[10px]">{line2}</div>
        ) : null}
      </div>
    </div>
  );
}
