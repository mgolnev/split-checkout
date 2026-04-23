"use client";

/**
 * Диаметр круга бренда; половина = горизонтальное смещение якоря геоточки от левого края пина.
 * На градиентной карте в `CheckoutApp` класс `-translate-x-[…px]` должен совпадать с этой половиной.
 */
const PIN_DISK_PX = 36;

/** Центр круга и нижней точки от левого края пина (половина {@link PIN_DISK_PX}). */
export const MAP_STORE_PIN_ANCHOR_OFFSET_X_PX = PIN_DISK_PX / 2;

/** Нет в наличии: лёгкое просвечивание карты; выше 0.48 — пин плотнее, но не полностью непрозрачный. */
const OUT_OF_STOCK_OPACITY = 0.68;

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
  /** Частичное покрытие / не рекомендован: светло-серый из палитры (neutral-400), без полупрозрачности. */
  slate: {
    disk: "bg-neutral-400",
    tail: "border-t-neutral-400",
    dot: "bg-neutral-400",
    labelShadow: "shadow-[0_2px_10px_rgba(0,0,0,0.09)]",
  },
};

export type MapStorePinProps = {
  /** Текст в чёрном круге: по умолчанию GJ; для ПВЗ на карте — «ПВЗ». */
  brandMark?: string;
  /** Первая строка плашки (например «6 из 8» по покрытию заказа). */
  line1?: string;
  /** Вторая строка (например «3 сегодня»). */
  line2?: string | null;
  /** Ранее выбирали этот магазин — бейдж ↻ на круге */
  wasLastChoice?: boolean;
  /** Нет доступных позиций — только круг с хвостом, без плашки и подписи */
  outOfStock?: boolean;
  className?: string;
  /** Заливка круга/хвоста: иерархия без прозрачности */
  surface?: MapStorePinSurface;
  /** Полное покрытие заказа в точке — зелёная метка на нижней точке пина (как на референсе). */
  fullCoverageMarker?: boolean;
  /**
   * `compact` — только круг и «ножка» (без белой плашки), для низкого зума карты.
   * `expanded` — плашка с {@link line1} / {@link line2}.
   */
  labelLayout?: "compact" | "expanded";
};

/**
 * Кастомный HTML-overlay пина: круг (GJ или ПВЗ) + белая плашка + указатель (плашка скрыта при {@link MapStorePinProps.outOfStock}).
 * Якорь геоточки — центр нижней круглой точки; позиционируйте контейнер с учётом {@link MAP_STORE_PIN_ANCHOR_OFFSET_X_PX}.
 */
export function MapStorePin({
  brandMark = "GJ",
  line1 = "—",
  line2 = null,
  wasLastChoice = false,
  outOfStock = false,
  className = "",
  surface = "ink",
  fullCoverageMarker = false,
  labelLayout = "expanded",
}: MapStorePinProps) {
  const pal = SURFACE[surface];
  const showLine2 = line2 != null && line2 !== "";
  const anchorDotClass = fullCoverageMarker ? "bg-emerald-500" : pal.dot;
  const diskTextClass = surface === "slate" ? "text-neutral-950" : "text-white";
  const showPlaque = labelLayout === "expanded" && !outOfStock;
  /**
   * Компактный режим: та же «многослойная» ring-обводка, что и у частичного (янтарь),
   * для полного покрытия — изумрудная, заметно зелёная.
   */
  const compactCoverageRing =
    labelLayout === "compact" && !outOfStock
      ? fullCoverageMarker
        ? "ring-[2.5px] ring-emerald-400/95 ring-offset-0"
        : "ring-[2.5px] ring-amber-400/95 ring-offset-0"
      : "";

  return (
    <div
      className={`relative inline-flex w-max max-w-[min(100%,calc(100vw-2rem))] shrink-0 flex-row items-start pt-px max-sm:pt-px ${className}`}
    >
      <div
        className="flex w-[36px] shrink-0 flex-col items-center"
        style={outOfStock ? { opacity: OUT_OF_STOCK_OPACITY } : undefined}
      >
        <div
          className={`relative z-10 flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full font-bold ${diskTextClass} ${pal.disk} ${compactCoverageRing} ${
            brandMark.length > 2 ? "text-[10px] leading-tight" : "text-xs"
          }`}
        >
          <span className="whitespace-nowrap px-0.5 text-center">{brandMark}</span>
          {wasLastChoice ? (
            <span
              className="absolute -right-px -top-px z-[1] flex h-3 w-3 items-center justify-center rounded-full bg-neutral-800 text-[10px] leading-none text-white"
              title="Выбирали в прошлый раз"
            >
              ↻
            </span>
          ) : null}
        </div>
        <div className="-mt-0.5 z-[5] flex flex-col items-center leading-none" aria-hidden>
          <div className={`h-0 w-0 shrink-0 border-x-[5px] border-x-transparent border-t-[7px] ${pal.tail}`} />
          <div
            className={`-mt-px h-[10px] w-[10px] shrink-0 rounded-full border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.22)] ${anchorDotClass}`}
          />
        </div>
      </div>

      {showPlaque ? (
        <div
          className={`z-0 -ml-[20px] flex min-h-[36px] min-w-0 max-w-[min(14rem,calc(100vw-4rem))] flex-col justify-center gap-px rounded-[10px] border border-black/[0.06] bg-white px-1.5 py-1 pl-[26px] ${pal.labelShadow} max-sm:rounded-lg max-sm:px-1 max-sm:py-0.5 max-sm:pl-[22px]`}
        >
          <div className="break-words text-[11px] font-semibold leading-snug text-[#1F1F1F]">
            {line1}
          </div>
          {showLine2 ? (
            <div className="break-words text-[11px] font-normal leading-snug text-[#1F1F1F]">{line2}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
