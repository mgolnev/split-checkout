"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; description?: string };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Обзор",
    items: [{ href: "/admin", label: "Панель", description: "Сводка и подсказки" }],
  },
  {
    title: "Каталог и склад",
    items: [
      { href: "/admin/products", label: "Товары", description: "SKU, цены, активность" },
      { href: "/admin/inventory", label: "Остатки", description: "Количества по источникам" },
    ],
  },
  {
    title: "География и доставка",
    items: [
      { href: "/admin/cities", label: "Города", description: "Регион и click & collect" },
      { href: "/admin/sources", label: "Источники отгрузки", description: "Склады и магазины (самовывоз)" },
      { href: "/admin/pvz-points", label: "ПВЗ", description: "Пункты выдачи для способа ПВЗ" },
      { href: "/admin/delivery-methods", label: "Способы получения", description: "Курьер, ПВЗ, самовывоз" },
    ],
  },
  {
    title: "Правила и сценарии",
    items: [
      { href: "/admin/rules", label: "Логистические правила", description: "Сроки, цены, шаги" },
      { href: "/admin/disclaimers", label: "Дисклеймеры", description: "Тексты в checkout" },
      { href: "/admin/overrides", label: "Overrides", description: "Принудительный JSON-сценарий" },
    ],
  },
];

const FLAT_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

function NavLink({ href, label, description }: NavItem) {
  const pathname = usePathname();
  const active =
    href === "/admin"
      ? pathname === "/admin" || pathname === "/admin/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group flex flex-col rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
        active
          ? "bg-[var(--admin-nav-active-bg)] font-medium text-[var(--admin-nav-active-fg)] shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <span>{label}</span>
      {description ? (
        <span
          className={`mt-0.5 text-xs font-normal ${
            active ? "text-slate-500" : "text-slate-400 group-hover:text-slate-500"
          }`}
        >
          {description}
        </span>
      ) : null}
    </Link>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = FLAT_NAV.find((item) =>
    item.href === "/admin"
      ? pathname === "/admin" || pathname === "/admin/"
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <div className="admin-app flex min-h-screen bg-slate-50 text-slate-900">
      <a
        href="#admin-main-content"
        className="sr-only rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:shadow-lg"
      >
        К основному содержимому
      </a>

      <aside
        className="admin-sidebar flex w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white shadow-sm"
        aria-label="Разделы админки"
      >
        <div className="border-b border-slate-100 px-4 py-5">
          <Link
            href="/admin"
            className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            <span className="text-base font-semibold tracking-tight text-slate-900">Split Checkout</span>
            <span className="mt-0.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
              Админ-панель
            </span>
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3" aria-label="Навигация по разделам">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} {...item} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <Link
            href="/checkout"
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
          >
            Открыть checkout
            <span aria-hidden>→</span>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex min-h-14 shrink-0 items-center border-b border-slate-200/80 bg-white/90 px-6 py-3 backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{current?.label ?? "Админка"}</p>
            <p className="truncate text-xs text-slate-500">
              {current?.description ?? "Настройка данных и правил прототипа"}
            </p>
          </div>
        </header>
        <main
          id="admin-main-content"
          tabIndex={-1}
          className="admin-main flex-1 overflow-auto px-6 py-8 outline-none lg:px-10"
        >
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
