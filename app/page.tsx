import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Split checkout — прототип</h1>
      <p className="text-sm text-neutral-600">
        Интерактивный checkout для коридорных UX-тестов: курьер, самовывоз, ПВЗ, split и остаток в корзине.
      </p>
      <div className="flex flex-col gap-3">
        <Link
          className="rounded-lg bg-black px-4 py-3 text-center text-sm font-medium uppercase tracking-wide text-white"
          href="/checkout"
        >
          Открыть checkout
        </Link>
        <Link
          className="rounded-lg border border-neutral-900 px-4 py-3 text-center text-sm font-medium uppercase tracking-wide text-neutral-900"
          href="/cart"
        >
          Корзина
        </Link>
        <Link
          className="rounded-lg border border-neutral-300 px-4 py-3 text-center text-sm font-medium"
          href="/admin/login"
        >
          Админка
        </Link>
        <Link
          className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-center text-sm font-medium text-neutral-600"
          href="/ui-kit"
        >
          UI kit (дизайн)
        </Link>
      </div>
    </main>
  );
}
