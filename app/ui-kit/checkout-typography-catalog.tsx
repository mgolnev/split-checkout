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
    <dl className="mt-3 space-y-2 border-t border-neutral-100 pt-3 text-[11px] leading-snug">
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
    <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-800">
      Москва
      <svg className="h-3.5 w-3.5 text-neutral-500" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6.5 8 10l4-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const RAW_ENTRIES: Entry[] = [
  {
    sortPx: 22,
    title: "Карта: крупное название в превью шита",
    classHint: "text-[22px] font-semibold leading-tight text-neutral-900 line-clamp-2",
    spec: {
      size: "22px (произвольный размер, не из шкалы Tailwind theme)",
      color: "neutral-900",
      weight: "font-semibold (600)",
      tracking: "По умолчанию",
      caseTransform: "Как в данных (часто ВЕРХНИЙ РЕГИСТР в названии ТЦ)",
      notes: "line-clamp-2 при длине; в чекауте — break-words",
    },
    demo: <p className="break-words text-[22px] font-semibold leading-tight text-neutral-900">ТРЦ Афимолл</p>,
  },
  {
    sortPx: 20,
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
    title: "PartCard: итоговая сумма в шапке / карта: название в списке",
    classHint: "text-[17px] font-semibold tabular-nums text-neutral-900",
    spec: {
      size: "17px (кастомный)",
      color: "neutral-900",
      weight: "font-semibold; tabular-nums для суммы",
      notes: "Одинаковый размер для цены в PartCard и названия ПВЗ в списке",
    },
    demo: (
      <div className="space-y-2">
        <span className="text-[17px] font-semibold tabular-nums text-neutral-900">13 797 ₽</span>
        <p className="text-[17px] font-semibold leading-tight text-neutral-900">Пункт на Ленинском</p>
      </div>
    ),
  },
  {
    sortPx: 16,
    title: "Заголовок экрана (шапка) / PartCard главный заголовок / заголовок в информере",
    classHint: ".cu-page-title — text-base font-semibold leading-snug text-neutral-900",
    spec: {
      size: "16px (text-base)",
      color: "neutral-900",
      weight: "font-semibold",
      notes: "Тот же токен для заголовка экрана и крупного заголовка в баннере split",
    },
    demo: (
      <div className="space-y-2">
        <h1 className="cu-page-title text-center">Оформление заказа</h1>
        <p className="text-base font-semibold leading-tight text-neutral-900">Завтра, 20 апреля</p>
      </div>
    ),
  },
  {
    sortPx: 15,
    title: "Блок неразрешённых позиций (заголовок карточки)",
    classHint: "text-[15px] font-semibold leading-tight text-neutral-900",
    spec: {
      size: "15px (кастомный)",
      color: "neutral-900",
      weight: "font-semibold",
    },
    demo: <p className="text-[15px] font-semibold leading-tight text-neutral-900">Не все товары в корзине</p>,
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
    classHint: "text-[13px] font-semibold | font-medium; text-[13px] leading-snug в цитате",
    spec: {
      size: "13px (кастомный)",
      color: "neutral-600 / 800 / 700",
      weight: "semibold в ячейке даты; medium у чипа слота",
      notes: "В баннере — border-l-2 + отступ",
    },
    demo: (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold leading-tight text-neutral-900">20</span>
        <span className="rounded-full border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-neutral-800">
          12:00–15:00
        </span>
        <div className="border-l-2 border-neutral-900 pl-2.5 text-[13px] leading-snug text-neutral-700">
          <p>Объединить в один заказ не сможем</p>
        </div>
      </div>
    ),
  },
  {
    sortPx: 12,
    title: "Название блока секции, вторичные подсказки, селектор города, покрытие вкладок",
    classHint:
      ".cu-section-title (uppercase); .cu-muted; text-xs; чипы фильтра text-[12px] при необходимости",
    spec: {
      size: "12px (text-xs и отдельно 12px у чипов)",
      color: "neutral-900 / 500 / 600 / 800",
      weight: "semibold у заголовка секции; medium у muted",
      tracking: "У .cu-section-title: tracking-[0.08em]; у города: tracking-wide",
      caseTransform: "Заголовки секций — ВСЕ ЗАГЛАВНЫЕ (uppercase)",
      notes: "cu-muted — отдельный токен для подсказок",
    },
    demo: (
      <div className="space-y-2">
        <h2 className="cu-section-title">Способ получения</h2>
        <p className="cu-muted">Введите номер телефона, чтобы оформить заказ</p>
        <ChevronDownDemo />
        <span className="rounded-full border border-neutral-200 bg-white/95 px-3 py-1.5 text-[12px] font-semibold text-neutral-800">
          Сегодня
        </span>
      </div>
    ),
  },
  {
    sortPx: 11,
    title: "Степпер, подписи к превью товара, пин на карте (основная строка), подсказка в модалке сплита",
    classHint: ".cu-stepper-label — text-[11px]; MapStorePin label text-[11px]",
    spec: {
      size: "11px (text-[11px])",
      color: "neutral-600 / #1F1F1F на пине",
      weight: "font-medium в степпере; font-normal на пине",
      notes: "На узком экране пин может снижаться до 10px",
    },
    demo: (
      <div className="space-y-2">
        <span className="cu-stepper-label">Доставка</span>
        <p className="text-[11px] leading-snug text-neutral-950">46 / 39 · 52</p>
        <p className="text-center text-[11px] font-normal leading-snug text-neutral-500">Выберите способ получения.</p>
        <div className="text-[11px] font-normal leading-snug text-[#1F1F1F]">2 сегодня</div>
      </div>
    ),
  },
  {
    sortPx: 10,
    title: "Выгода PartCard (.cu-benefit), день недели в календаре, микротекст на пине",
    classHint: ".cu-benefit — text-[10px] uppercase tracking-[0.12em] text-[var(--gj-muted)]",
    spec: {
      size: "10px (text-[10px])",
      color: "gj-muted CSS-переменная / neutral-600",
      weight: "font-medium",
      tracking: "tracking-[0.12em] у benefit",
      caseTransform: "У benefit — ВСЕ ЗАГЛАВНЫЕ",
      notes: "Дни недели под числом — без uppercase",
    },
    demo: (
      <div className="space-y-2">
        <p className="cu-benefit">Бесплатная доставка</p>
        <span className="text-[10px] leading-tight text-neutral-600">пн</span>
        <span className="text-[10px] opacity-90">1 позже</span>
      </div>
    ),
  },
  {
    sortPx: 9,
    title: "Бейдж «Рекомендуем» на вкладке доставки",
    classHint: "text-[9px] font-semibold uppercase tracking-wide",
    spec: {
      size: "9px (кастомный)",
      color: "emerald-800 на светлом фоне / белый на тёмной вкладке",
      weight: "font-semibold",
      tracking: "tracking-wide",
      caseTransform: "ВЕРХНИЙ РЕГИСТР",
    },
    demo: (
      <span className="inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-800">
        Рекомендуем
      </span>
    ),
  },
  {
    sortPx: 8,
    title: "Микробейджи количества (превью товара)",
    classHint: "text-[8px] / text-[7px] font-semibold tabular-nums text-white",
    spec: {
      size: "7–8px",
      color: "белый на тёмном круге",
      weight: "font-semibold",
      tracking: "tabular-nums для цифр",
      notes: "Экстремально малый кегль только для счётчиков на миниатюре",
    },
    demo: (
      <div className="flex items-center gap-2">
        <span className="rounded bg-neutral-900/90 px-1 text-[8px] font-semibold text-white">3</span>
        <span className="rounded-full bg-neutral-900/90 px-[3px] text-[7px] font-semibold tabular-nums text-white">12</span>
      </div>
    ),
  },
  {
    sortPx: 12,
    title: "Заголовок подблока (токен в CSS, редко в разметке)",
    classHint: ".cu-block-heading — text-xs uppercase tracking-[0.06em]",
    spec: {
      size: "12px (text-xs)",
      color: "neutral-900",
      weight: "font-semibold",
      tracking: "tracking-[0.06em] (чуть плотнее, чем у cu-section-title)",
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
    classHint: "text-sm font-semibold | text-xs font-semibold uppercase tracking-wide",
    spec: {
      size: "14px или 12px на вторичной CTA",
      color: "белый на чёрном фоне",
      weight: "font-semibold",
      tracking: "У варианта xs часто uppercase + tracking-wide",
      caseTransform: "У нижней кнопки в примере — капс",
    },
    demo: (
      <div className="space-y-2">
        <div className="rounded-lg bg-black py-3 text-center text-sm font-semibold text-white">Оформить заказ</div>
        <div className="rounded-lg bg-black py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-white">
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
