"use client";

/** Первая загрузка страницы корзины (bootstrap + первый кадр). */
export function CartBootstrapSkeleton() {
  return (
    <div
      className="mx-auto flex min-h-screen max-w-md flex-col bg-white"
      role="status"
      aria-label="Загрузка корзины"
    >
      <div className="animate-pulse border-b border-neutral-100">
        <div className="flex items-center gap-2 px-3 py-3">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-neutral-200" />
          <div className="mx-auto h-4 max-w-[140px] flex-1 rounded bg-neutral-200" />
          <div className="h-10 w-10 shrink-0" />
        </div>
        <div className="px-4 py-2">
          <div className="h-9 w-full rounded-lg bg-neutral-200" />
        </div>
        <div className="px-4 py-3">
          <div className="h-5 w-32 rounded bg-neutral-200" />
        </div>
      </div>
      <div className="animate-pulse flex-1 divide-y divide-neutral-100 px-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3 py-4">
            <div className="mt-1 h-5 w-5 shrink-0 rounded-full bg-neutral-200" />
            <div className="h-[120px] w-[92px] shrink-0 rounded-lg bg-neutral-200" />
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <div className="h-4 w-[92%] rounded bg-neutral-200" />
              <div className="h-4 w-[55%] rounded bg-neutral-200" />
              <div className="mt-2 h-8 w-24 rounded-lg bg-neutral-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Строки товаров, пока грузятся линии корзины по городу. */
export function CartLinesSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="animate-pulse divide-y divide-neutral-100"
      role="status"
      aria-label="Загрузка корзины"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 py-4">
          <div className="mt-1 h-5 w-5 shrink-0 rounded-full bg-neutral-200" />
          <div className="h-[120px] w-[92px] shrink-0 rounded-lg bg-neutral-200" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="h-4 w-[92%] rounded bg-neutral-200" />
            <div className="h-4 w-[50%] rounded bg-neutral-200" />
            <div className="mt-2 h-8 w-28 rounded-lg bg-neutral-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Первая загрузка чекаута (bootstrap). */
export function CheckoutBootstrapSkeleton() {
  return (
    <div
      className="checkout-ui relative isolate mx-auto min-h-screen max-w-md bg-neutral-100 pb-28"
      role="status"
      aria-label="Загрузка оформления заказа"
    >
      <div className="animate-pulse border-b border-neutral-100 bg-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="h-9 w-9 shrink-0 rounded-md bg-neutral-200" />
          <div className="mx-auto h-5 max-w-[220px] flex-1 rounded bg-neutral-200" />
          <div className="h-9 w-6 shrink-0" />
        </div>
        <div className="px-4 pb-3 pt-1">
          <div className="mx-auto flex max-w-xs justify-center gap-2">
            <div className="h-2 w-16 rounded-full bg-neutral-200" />
            <div className="h-2 w-16 rounded-full bg-neutral-200" />
            <div className="h-2 w-16 rounded-full bg-neutral-200" />
          </div>
        </div>
      </div>
      <div className="relative z-0 flex flex-col gap-3 px-4 pt-4">
        <div className="overflow-hidden rounded-2xl bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="h-5 w-44 rounded bg-neutral-200" />
            <div className="h-8 w-28 shrink-0 rounded-full bg-neutral-200" />
          </div>
          <div className="h-12 w-full rounded-xl bg-neutral-200" />
          <div className="mt-4 space-y-3">
            <div className="h-14 w-full rounded-xl bg-neutral-100" />
            <div className="h-14 w-full rounded-xl bg-neutral-100" />
            <div className="h-14 w-full rounded-xl bg-neutral-100" />
          </div>
        </div>
        <div className="rounded-2xl bg-white p-5">
          <div className="h-5 w-36 rounded bg-neutral-200" />
          <div className="mt-4 h-4 w-full rounded bg-neutral-100" />
          <div className="mt-2 h-4 w-full max-w-[280px] rounded bg-neutral-100" />
        </div>
      </div>
    </div>
  );
}
