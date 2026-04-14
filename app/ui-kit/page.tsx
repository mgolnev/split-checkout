import Link from "next/link";
import type { ReactNode } from "react";
import { PromoStripDemo } from "./promo-strip-demo";

function CompareRow({
  title,
  token,
  children,
}: {
  title: string;
  token?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-neutral-100 pb-8 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="cu-section-title">{title}</h2>
        {token ? (
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">{token}</code>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-500">В продукте</p>
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">{children}</div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-800/90">
            Предложение дизайнера
          </p>
          <div className="flex min-h-[5.5rem] items-center justify-center rounded-xl border border-dashed border-amber-300/90 bg-amber-50/50 p-4 text-center text-xs leading-snug text-neutral-500">
            Вставьте скрин, ссылку на Figma или краткое описание отличий от колонки слева.
          </div>
        </div>
      </div>
    </section>
  );
}

export default function UiKitPage() {
  return (
    <div className="checkout-ui min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="cu-page-title">UI kit — чекаут</p>
            <p className="cu-muted mt-1 max-w-xl">
              Текущие токены и паттерны из кода. Правая колонка — для макета дизайнера и заметок при ревью.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/"
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-800"
            >
              На главную
            </Link>
            <Link
              href="/checkout"
              className="rounded-lg bg-black px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white"
            >
              Checkout
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
        <CompareRow title="Типографика" token="globals.css · cu-*">
          <div className="space-y-4">
            <p className="cu-page-title">cu-page-title — заголовок экрана</p>
            <p className="cu-section-title">cu-section-title — секция</p>
            <p className="cu-block-heading">cu-block-heading — отправление</p>
            <p className="cu-sheet-title">cu-sheet-title — заголовок модалки</p>
            <p className="cu-sheet-lead">cu-sheet-lead — подзаголовок модалки или пояснение к блоку.</p>
            <p className="cu-label-primary text-neutral-900">cu-label-primary — акцентная строка в карточке</p>
            <p className="cu-muted">cu-muted — вторичный текст, подсказки</p>
            <div className="flex justify-center rounded-lg bg-neutral-50 py-2">
              <span className="cu-stepper-label">cu-stepper-label — шаг / подпись таба</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="cu-total-row-label">cu-total-row-label</span>
              <span className="cu-total-row-value">12 345 ₽</span>
            </div>
            <div className="cu-total-final-row border-t border-neutral-100 pt-2">
              <span>Итого</span>
              <span>12 345 ₽</span>
            </div>
          </div>
        </CompareRow>

        <CompareRow title="Основная кнопка (CTA)" token="CheckoutApp · fixed bar">
          <button
            type="button"
            className="w-full rounded-lg bg-black py-4 text-sm font-semibold uppercase tracking-wide text-white"
          >
            Оформить заказ
          </button>
        </CompareRow>

        <CompareRow title="Вторичные кнопки" token="border + uppercase">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-neutral-900 bg-white px-3 py-2 text-xs font-medium text-neutral-900"
            >
              Изменить
            </button>
            <button
              type="button"
              className="rounded-lg bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-800 shadow-sm"
            >
              Применить
            </button>
          </div>
        </CompareRow>

        <CompareRow title="Текстовая ссылка" token="underline">
          <button
            type="button"
            className="text-xs font-medium text-neutral-500 underline decoration-neutral-300 underline-offset-2"
          >
            Подробнее
          </button>
        </CompareRow>

        <CompareRow title="Выбор способа доставки (карточка)" token="rounded-xl border">
          <div className="space-y-2">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-black bg-white p-4 text-left ring-1 ring-black"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-black">
                <span className="h-2.5 w-2.5 rounded-full bg-black" />
              </span>
              <span className="cu-label-primary min-w-0 text-neutral-900">Курьер — выбрано</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-300"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-neutral-300" />
              <span className="cu-label-primary min-w-0 text-neutral-900">Самовывоз</span>
            </button>
          </div>
        </CompareRow>

        <CompareRow title="Галочка отправления (PartCard)" token="rounded-full border-2">
          <div className="flex gap-3">
            <button
              type="button"
              role="checkbox"
              aria-checked={true}
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-black bg-black text-[11px] font-bold leading-none text-white"
            >
              ✓
            </button>
            <button
              type="button"
              role="checkbox"
              aria-checked={false}
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-neutral-400 bg-white text-[11px] font-bold leading-none text-transparent"
            >
              ✓
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-900">Соберём за 30 минут</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--gj-muted)]">
                бесплатно / примерка
              </p>
            </div>
          </div>
        </CompareRow>

        <CompareRow title="Бейджи и чипы" token="rounded-full">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold uppercase text-neutral-700">
              В заказе
            </span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600">
              Размер
            </span>
            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-neutral-600">
              В заказе 3 из 5 шт
            </span>
          </div>
        </CompareRow>

        <CompareRow title="Информер (split / предупреждение)" token="border-l-2 amber">
          <div className="flex w-full items-start gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5">
            <div className="min-w-0 flex-1 space-y-1 border-l-2 border-amber-400/70 pl-2.5 text-xs leading-snug text-neutral-800">
              <p>Пример текста информера при нескольких отправлениях или ограничениях.</p>
            </div>
          </div>
        </CompareRow>

        <CompareRow title="Промокод (поле + применить)" token="cu-promo-input · type=search">
          <PromoStripDemo />
        </CompareRow>

        <CompareRow title="Карточка в группе (разделитель)" token="divide-y">
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
            <div className="px-4 py-3 text-sm font-medium text-neutral-800">Шапка блока</div>
            <div className="px-4 py-4 text-sm text-neutral-600">Тело карточки PartCard (inGroup)</div>
          </div>
        </CompareRow>

        <CompareRow title="Пустое / недоступное состояние" token="border-dashed">
          <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
            Для курьерской доставки нужен адрес. После ввода покажем доступные отправления.
          </div>
        </CompareRow>

        <CompareRow title="Успех (промокод применён)" token="text-emerald-700">
          <p className="text-xs text-emerald-700">Применён промокод APP20 (−20%)</p>
        </CompareRow>

        <CompareRow title="Переключатель бонусов" token="rounded-full · h-7 w-12">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-100 bg-neutral-50/80 px-3 py-2">
            <span className="cu-label-primary text-neutral-900">Списать бонусы</span>
            <button
              type="button"
              aria-pressed={false}
              className="relative h-7 w-12 shrink-0 rounded-full bg-neutral-300 p-0.5 transition-colors"
            >
              <span className="pointer-events-none block h-6 w-6 translate-x-0 rounded-full bg-white shadow-sm" />
            </button>
          </div>
        </CompareRow>

        <footer className="border-t border-neutral-100 pt-6 text-center text-[11px] text-neutral-400">
          Маршрут <code className="rounded bg-neutral-100 px-1">/ui-kit</code> — не показывается покупателям в бою,
          только для команды и дизайна.
        </footer>
      </div>
    </div>
  );
}
