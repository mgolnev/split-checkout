import type { ReactNode } from "react";

/** Базовый шрифт чекаута (см. app/layout.tsx — Geist на body). */
const FONT_LINE =
  "Geist (next/font/google, переменная --font-geist-sans на body, наследуется всем UI). Моноширинный Geist Mono в чекауте не используется для основного текста.";

export type TypoSpecLines = {
  size: string;
  color: string;
  weight: string;
  tracking?: string;
  caseTransform?: string;
  notes?: string;
};

function SpecDl({ spec }: { spec: TypoSpecLines }) {
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="shrink-0 font-medium text-neutral-800 sm:w-36">{k}</dt>
      <dd className="min-w-0 text-neutral-700">{v}</dd>
    </div>
  );
  return (
    <dl className="mt-3 space-y-2 border-t border-neutral-100 pt-3 text-xs leading-snug">
      <Row k="Шрифт" v={FONT_LINE} />
      <Row k="Размер" v={spec.size} />
      <Row k="Цвет" v={spec.color} />
      <Row k="Начертание" v={spec.weight} />
      {spec.tracking ? <Row k="Разрядка" v={spec.tracking} /> : <Row k="Разрядка" v="По умолчанию (без доп. tracking в классе)" />}
      {spec.caseTransform ? <Row k="Регистр" v={spec.caseTransform} /> : <Row k="Регистр" v="Как в макете (без принудительного uppercase, если не указано иное)" />}
      {spec.notes ? <Row k="Особенности" v={spec.notes} /> : null}
    </dl>
  );
}

function TypographyInventoryRow({
  num,
  title,
  classHint,
  spec,
  children,
}: {
  num: string;
  title: string;
  classHint: string;
  spec: TypoSpecLines;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 border-b border-neutral-100 py-5 last:border-b-0 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-start">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
          {num}. {title}
        </p>
        <code className="mt-1.5 block whitespace-pre-wrap break-all rounded bg-neutral-100 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-neutral-700">
          {classHint}
        </code>
        <SpecDl spec={spec} />
      </div>
      <div className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">{children}</div>
    </div>
  );
}

type Entry = {
  sortPx: number;
  title: string;
  classHint: string;
  spec: TypoSpecLines;
  demo: ReactNode;
};

function BackChevronDemo() {
  return (
    <svg className="h-6 w-6 text-neutral-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownDemo() {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-800">
      Москва
      <svg className="h-3.5 w-3.5 text-neutral-500" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6.5 8 10l4-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const RAW_ENTRIES: Entry[] = [
  {
    sortPx: 20,
    title: "Карта: крупное название в превью шита",
    classHint: ".cu-text-display — text-[20px] font-semibold leading-tight text-neutral-900",
    spec: {
      size: "20px (text-[20px], токен display)",
      color: "neutral-900",
      weight: "font-semibold (600)",
      tracking: "По умолчанию",
      caseTransform: "Как в данных (часто ВЕРХНИЙ РЕГИСТР в названии ТЦ)",
      notes: "line-clamp-2 при длине; в чекауте — break-words",
    },
    demo: <p className="cu-text-display break-words">ТРЦ Афимолл</p>,
  },
  {
    sortPx: 19,
    title: "Назад в корзину (иконка-шеврон, не текст)",
    classHint: "SVG h-6 w-6 stroke currentColor (как CheckoutBackChevronIcon в CheckoutApp)",
    spec: {
      size: "Бокс иконки 24×24 px (h-6 w-6), толщина штриха 2",
      color: "neutral-700 (currentColor)",
      weight: "— (контур SVG, не шрифт)",
      tracking: "—",
      caseTransform: "—",
      notes: "Типографика не применяется; для сортировки условно рядом с бывшим text-xl",
    },
    demo: <BackChevronDemo />,
  },
  {
    sortPx: 18,
    title: "Заголовок шита / модалки",
    classHint: ".cu-sheet-title — text-lg font-semibold leading-snug text-neutral-900",
    spec: {
      size: "18px (text-lg)",
      color: "neutral-900",
      weight: "font-semibold (600)",
      tracking: "По умолчанию",
      notes: "leading-snug",
    },
    demo: <h3 className="cu-sheet-title">Подтвердите телефон</h3>,
  },
  {
    sortPx: 17,
    title: "PartCard: итоговая сумма / название в списке (как headline)",
    classHint: ".cu-text-headline tabular-nums для суммы",
    spec: {
      size: "16px (text-base)",
      color: "neutral-900",
      weight: "font-semibold; tabular-nums для суммы",
      notes: "Цена и названия магазина/ПВЗ в списке — единый кегль headline",
    },
    demo: (
      <div className="space-y-2">
        <span className="cu-text-headline tabular-nums">13 797 ₽</span>
        <p className="cu-text-headline leading-tight">Пункт на Ленинском</p>
      </div>
    ),
  },
  {
    sortPx: 16,
    title: "Заголовок экрана (шапка) / заголовок в информере",
    classHint: ".cu-page-title (= .cu-text-headline) — text-base font-semibold leading-snug text-neutral-900",
    spec: {
      size: "16px (text-base)",
      color: "neutral-900",
      weight: "font-semibold",
      notes: "Тот же токен для заголовка экрана и крупного заголовка в баннере split",
    },
    demo: (
      <div className="space-y-2">
        <h1 className="cu-page-title text-center">Оформление заказа</h1>
        <p className="cu-text-headline leading-tight">Завтра, 20 апреля</p>
      </div>
    ),
  },
  {
    sortPx: 15,
    title: "Блок неразрешённых позиций (заголовок карточки)",
    classHint: ".cu-text-headline — важный заголовок карточки",
    spec: {
      size: "16px (text-base)",
      color: "neutral-900",
      weight: "font-semibold",
    },
    demo: <p className="cu-text-headline leading-tight">Не все товары в корзине</p>,
  },
  {
    sortPx: 14,
    title: "Лид шита, акцентные строки, итого, PartCard второй уровень, промо, CTA текст, ошибка",
    classHint:
      ".cu-sheet-lead, .cu-label-primary, .cu-total-*, text-sm … — см. классы в чекауте (основной «рабочий» кегль 14px)",
    spec: {
      size: "14px (text-sm)",
      color: "neutral-600 / 900 в зависимости от роли",
      weight: "Обычно font-semibold для акцентов; в лиде — без жирного в токене cu-sheet-lead",
      notes: "Самый частый размер тела интерфейса; сводка сплита может быть text-neutral-400",
    },
    demo: (
      <div className="space-y-2">
        <p className="cu-sheet-lead">Введите номер телефона, пришлём смс-код</p>
        <span className="cu-label-primary text-neutral-900">Банковской картой онлайн</span>
        <p className="text-sm leading-snug text-neutral-600">Курьерская служба</p>
        <p className="text-sm text-neutral-400">5 из 5 товаров</p>
      </div>
    ),
  },
  {
    sortPx: 13,
    title: "Календарь курьера (число), слоты времени, тело информера у границы",
    classHint: ".cu-text-body-semibold (число); .cu-text-body-medium (слот); .cu-text-body в цитате",
    spec: {
      size: "14px (text-sm)",
      color: "neutral-600 / 800 / 700",
      weight: "semibold в ячейке даты; medium у чипа слота",
      notes: "В баннере — border-l-2 + отступ",
    },
    demo: (
      <div className="flex flex-wrap items-center gap-2">
        <span className="cu-text-body-semibold leading-tight">20</span>
        <span className="cu-text-body-medium rounded-full border border-neutral-200 px-3 py-1.5 text-neutral-800">
          12:00–15:00
        </span>
        <div className="cu-text-body border-l-2 border-neutral-900 pl-2.5 text-neutral-700">
          <p>Объединить в один заказ не сможем</p>
        </div>
      </div>
    ),
  },
  {
    sortPx: 12,
    title: "Название блока секции, вторичные подсказки, селектор города, покрытие вкладок",
    classHint:
      ".cu-section-title / .cu-text-section (uppercase); .cu-muted; text-xs; чипы фильтра text-sm",
    spec: {
      size: "12px (text-xs и text-sm у чипов)",
      color: "neutral-900 / 500 / 600 / 800",
      weight: "semibold у заголовка секции; medium у muted",
      tracking: "У .cu-section-title: tracking-[0.08em]; у селектора города — без tracking",
      caseTransform: "Заголовки секций — ВСЕ ЗАГЛАВНЫЕ (uppercase)",
      notes: "cu-muted — отдельный токен для подсказок",
    },
    demo: (
      <div className="space-y-2">
        <h2 className="cu-section-title">Способ получения</h2>
        <p className="cu-muted">Введите номер телефона, чтобы оформить заказ и списывать бонусы</p>
        <ChevronDownDemo />
        <span className="rounded-full border border-neutral-200 bg-white/95 px-3 py-1.5 text-sm font-semibold text-neutral-800">
          Сегодня
        </span>
      </div>
    ),
  },
  {
    sortPx: 11,
    title: "Степпер, подписи к превью товара, пин на карте (основная строка), подсказка в модалке сплита",
    classHint: ".cu-stepper-label — text-xs; MapStorePin — text-xs",
    spec: {
      size: "12px (text-xs)",
      color: "neutral-600 / #1F1F1F на пине",
      weight: "font-medium в степпере; font-normal на пине",
      notes: "Минимум 12px для подписей карты (кроме микробейджей)",
    },
    demo: (
      <div className="space-y-2">
        <span className="cu-stepper-label">Доставка</span>
        <p className="text-xs leading-snug text-neutral-950">46 / 39 · 52</p>
        <p className="cu-muted text-center">Выберите способ получения.</p>
        <div className="text-xs font-normal leading-snug text-[#1F1F1F]">2 сегодня</div>
      </div>
    ),
  },
  {
    sortPx: 10,
    title: "Выгода PartCard (.cu-benefit), день недели в календаре, микротекст на пине",
    classHint: ".cu-benefit — text-[11px] uppercase tracking-[0.12em] rgba(140,130,120,1)",
    spec: {
      size: "11px (text-[11px])",
      color: "rgba(140, 130, 120, 1) (= gj-muted #8c8278)",
      weight: "font-semibold",
      tracking: "tracking-[0.12em] (разреженнее, чем у .cu-text-badge)",
      caseTransform: "У benefit — ВСЕ ЗАГЛАВНЫЕ",
      notes: "Дни недели под числом — text-xs, без uppercase",
    },
    demo: (
      <div className="space-y-2">
        <p className="cu-benefit">Бесплатная доставка</p>
        <span className="text-xs leading-tight text-neutral-600">пн</span>
        <span className="cu-text-micro opacity-90">1 позже</span>
      </div>
    ),
  },
  {
    sortPx: 9,
    title: "Бейдж «Рекомендуем» на вкладке доставки",
    classHint: ".cu-text-badge bg-[#009966] text-white py-1",
    spec: {
      size: "10px (text-[10px])",
      color: "фон #009966, текст белый; на выбранной вкладке — bg-white/20 text-white",
      weight: "font-semibold",
      tracking: "tracking-wide",
      caseTransform: "ВЕРХНИЙ РЕГИСТР",
    },
    demo: (
      <span className="cu-text-badge inline-flex rounded-full bg-[#009966] px-1.5 py-1 text-white">
        Рекомендуем
      </span>
    ),
  },
  {
    sortPx: 8,
    title: "Микробейджи количества (превью товара)",
    classHint: ".cu-text-counter text-white на тёмном круге",
    spec: {
      size: "8px (text-[8px])",
      color: "белый на тёмном круге",
      weight: "font-semibold",
      tracking: "tabular-nums для цифр",
      notes: "Только для счётчиков на миниатюре товара",
    },
    demo: (
      <div className="flex items-center gap-2">
        <span className="cu-text-counter rounded bg-neutral-900/90 px-1 text-white">3</span>
        <span className="cu-text-counter rounded-full bg-neutral-900/90 px-[3px] text-white">12</span>
      </div>
    ),
  },
  {
    sortPx: 12,
    title: "Заголовок подблока (токен в CSS, редко в разметке)",
    classHint: ".cu-block-heading — text-xs uppercase tracking-[0.08em] (как секция)",
    spec: {
      size: "12px (text-xs)",
      color: "neutral-900",
      weight: "font-semibold",
      tracking: "tracking-[0.08em], как у cu-section-title",
      caseTransform: "ВЕРХНИЙ РЕГИСТР",
    },
    demo: <p className="cu-block-heading">Отправление 1</p>,
  },
  {
    sortPx: 14,
    title: "Строки итого (отдельные токены)",
    classHint: ".cu-total-row-label / .cu-total-row-value / .cu-total-final-row",
    spec: {
      size: "14px (text-sm)",
      color: "neutral-600 у подписи; neutral-900 у значения",
      weight: "Обычный у label; tabular-nums у значения; финальная строка font-semibold",
    },
    demo: (
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="cu-total-row-label">Товары</span>
          <span className="cu-total-row-value">12 345 ₽</span>
        </div>
        <div className="cu-total-final-row border-t border-neutral-100 pt-2">
          <span>Итого</span>
          <span>12 345 ₽</span>
        </div>
      </div>
    ),
  },
  {
    sortPx: 14,
    title: "Вкладки способа доставки (композиция)",
    classHint: "Название: .cu-label-primary; строка «N из M»: text-xs",
    spec: {
      size: "14px + 12px второй строкой",
      color: "Контраст по выбранной вкладке (белый / neutral-900)",
      weight: "semibold у названия",
      notes: "Два кегля в одной плитке",
    },
    demo: (
      <div className="flex max-w-md gap-2 rounded-xl border border-neutral-200 p-2">
        <div className="flex min-h-[72px] min-w-0 flex-1 flex-col justify-center gap-1 rounded-xl border border-black bg-black px-2 py-2">
          <span className="cu-label-primary text-white">Курьер</span>
          <p className="text-xs leading-tight text-white/95">5 из 5 товаров</p>
        </div>
        <div className="flex min-h-[72px] min-w-0 flex-1 flex-col justify-center gap-1 rounded-xl border border-neutral-200 px-2 py-2">
          <span className="cu-label-primary text-neutral-900">ПВЗ</span>
          <p className="text-xs leading-tight text-neutral-600">3 из 5 товаров</p>
        </div>
      </div>
    ),
  },
  {
    sortPx: 14,
    title: "Поле промокода (ввод)",
    classHint: "text-sm uppercase tracking-wide text-neutral-900",
    spec: {
      size: "14px",
      color: "neutral-900",
      weight: "по умолчанию (regular в поле)",
      tracking: "tracking-wide; символы приведены к uppercase визуально",
      caseTransform: "Прописные латиница/цифры в демо",
    },
    demo: <span className="text-sm uppercase tracking-wide text-neutral-900">APP20</span>,
  },
  {
    sortPx: 14,
    title: "Кнопки CTA (основной и альтернативный кегль)",
    classHint: "text-sm font-semibold — без uppercase и без tracking-wide",
    spec: {
      size: "14px (text-sm) для основных CTA",
      color: "белый на чёрном фоне",
      weight: "font-semibold",
      tracking: "По умолчанию (без tracking-wide у CTA)",
      caseTransform: "Как в предложении (без принудительного uppercase)",
    },
    demo: (
      <div className="space-y-2">
        <div className="rounded-lg bg-black py-3 text-center text-sm font-semibold text-white">Оформить заказ</div>
        <div className="rounded-lg bg-black py-2.5 text-center text-sm font-semibold text-white">
          Получить смс с кодом
        </div>
      </div>
    ),
  },
  {
    sortPx: 14,
    title: "Сообщение об ошибке загрузки",
    classHint: "text-sm; заголовок font-semibold text-red-600",
    spec: {
      size: "14px",
      color: "neutral-800 тело; red-600 заголовок",
      weight: "semibold у заголовка ошибки",
    },
    demo: (
      <div className="space-y-1 text-sm text-neutral-800">
        <p className="font-semibold text-red-600">Не удалось загрузить оформление заказа</p>
        <p>Проверьте подключение к базе.</p>
      </div>
    ),
  },
  {
    sortPx: 14,
    title: "Бонус-бар (одна строка)",
    classHint: "text-sm leading-snug text-neutral-900",
    spec: {
      size: "14px",
      color: "neutral-900",
      weight: "regular (без font-semibold в классе)",
    },
    demo: (
      <span className="text-sm leading-snug text-neutral-900">
        Войдите в аккаунт, чтобы копить и списывать бонусы GJ
      </span>
    ),
  },
  {
    sortPx: 12,
    title: "Вторичные кнопки («Изменить»)",
    classHint: "text-xs font-medium text-neutral-900",
    spec: {
      size: "12px (text-xs)",
      color: "neutral-900",
      weight: "font-medium (500)",
    },
    demo: (
      <button type="button" className="rounded-lg border border-neutral-900 bg-white px-3 py-2 text-xs font-medium text-neutral-900">
        Изменить
      </button>
    ),
  },
  {
    sortPx: 12,
    title: "PartCard: срок хранения и примечания",
    classHint: "text-xs text-neutral-500",
    spec: {
      size: "12px",
      color: "neutral-500",
      weight: "regular",
    },
    demo: <p className="text-xs text-neutral-500">Срок хранения: 8 дней с момента поступления</p>,
  },
];

export function CheckoutTypographyCatalog() {
  const sorted = [...RAW_ENTRIES].sort((a, b) => b.sortPx - a.sortPx || a.title.localeCompare(b.title, "ru"));
  return (
    <section className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-5 shadow-sm">
      <h2 className="cu-page-title">Полный каталог типографики чекаута</h2>
      <p className="cu-muted mt-2 max-w-3xl">
        Сортировка: от большего кегля к меньшему (поле <strong className="text-neutral-800">sortPx</strong>). Источники:{" "}
        <code className="rounded bg-white px-1">app/globals.css</code>,{" "}
        <code className="rounded bg-white px-1">components/CheckoutApp.tsx</code>,{" "}
        <code className="rounded bg-white px-1">components/MapStorePin.tsx</code>.
      </p>
      <div className="mt-6 rounded-xl border border-neutral-200 bg-white">
        {sorted.map((entry, i) => (
          <TypographyInventoryRow
            key={`${entry.title}-${i}`}
            num={String(i + 1).padStart(2, "0")}
            title={entry.title}
            classHint={entry.classHint}
            spec={entry.spec}
          >
            {entry.demo}
          </TypographyInventoryRow>
        ))}
      </div>
    </section>
  );
}
