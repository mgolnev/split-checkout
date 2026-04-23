"use client";

import Link from "next/link";

const TAB_BAR_ICON_BOX = "flex h-10 w-10 shrink-0 items-center justify-center";
const TAB_BAR_ICON = "h-5 w-5 shrink-0";

export type GjMobileTabId = "home" | "catalog" | "cart" | "favorites" | "profile";

type IconName = GjMobileTabId;

const gj = {
  inactiveIcon: "text-[#999999]",
  inactiveLabel: "text-[#535353]",
  active: "text-black",
  red: "bg-[#ea1d2d]",
} as const;

function TabBarOutlineIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? TAB_BAR_ICON}
      aria-hidden
    >
      {name === "home" && (
        <>
          <path d="M2.5 9.4 12 2.6 21.5 9.4" />
          <path d="M5 9.8V19.4c0 .4.3.7.7.7h2.4v-4.4c0-.7.5-1.2 1.2-1.2h1.4c.7 0 1.2.5 1.2 1.2v4.4h2.4c.4 0 .7-.3.7-.7V9.8" />
        </>
      )}
      {name === "catalog" && (
        <>
          <line x1="2.5" y1="5.4" x2="8" y2="5.4" />
          <line x1="2.5" y1="7.8" x2="6" y2="7.8" />
          <line x1="2.5" y1="10.2" x2="7" y2="10.2" />
          <circle cx="16.2" cy="7.2" r="2.3" />
          <line x1="17.8" y1="8.6" x2="20" y2="10.8" />
        </>
      )}
      {name === "cart" && (
        <>
          <path d="M9.1 4.7V3.1a2.9 2.9 0 0 1 5.8 0v1.6" />
          <path d="M4.5 5.2h15l-1.05 11.8a1.4 1.4 0 0 1-1.4 1.3H6.9a1.4 1.4 0 0 1-1.4-1.3L4.5 5.2Z" />
        </>
      )}
      {name === "favorites" && (
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l7.78-7.78a5.5 5.5 0 0 0 0-7.78Z" />
      )}
      {name === "profile" && (
        <>
          <path d="M4.2 20.1v-.5a5.8 5.8 0 0 1 5.6-4.4h4.3a5.8 5.8 0 0 1 5.6 4.4v.5" />
          <circle cx="12" cy="7" r="3" />
        </>
      )}
    </svg>
  );
}

const tabItemClass = "relative flex w-[59px] flex-col items-center justify-center gap-0.5";
const labelClass = "min-w-0 text-center text-[11px] font-normal leading-3 tracking-[-0.11px]";

export type GjMobileTabBarProps = {
  /** Какой пункт подсвечен (иконка и подпись чёрные) */
  active: GjMobileTabId;
  /** Кол-во в корзине; при &gt; 0 показывается красный бейдж */
  cartCount: number;
  /** Кол-во в избранном; при &gt; 0 — бейдж (как в макете) */
  favoritesCount: number;
  /** Красная точка на «Профиль» */
  showProfileDot?: boolean;
  className?: string;
};

/**
 * Нижний таббар (макет Figma: 5 иконок, T3 11/12, серый / чёрный active, бейджи #EA1D2D).
 */
export function GjMobileTabBar({
  active,
  cartCount,
  favoritesCount,
  showProfileDot = true,
  className,
}: GjMobileTabBarProps) {
  const isActive = (t: GjMobileTabId) => active === t;
  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-20 border-t border-[#e8e8e8] bg-white px-4 [padding-bottom:max(1.5rem,env(safe-area-inset-bottom,0px))] ${className ?? ""}`.trim()}
      aria-label="Основной раздел"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-center gap-2 text-[11px] leading-3 tracking-[-0.11px]">
        <Link
          href="/"
          className={tabItemClass}
          aria-current={isActive("home") ? "page" : undefined}
        >
          <span className={TAB_BAR_ICON_BOX}>
            <TabBarOutlineIcon
              name="home"
              className={`${TAB_BAR_ICON} ${isActive("home") ? gj.active : gj.inactiveIcon}`}
            />
          </span>
          <span
            className={
              isActive("home")
                ? `${labelClass} font-normal text-black`
                : `${labelClass} font-normal ${gj.inactiveLabel}`
            }
          >
            Главная
          </span>
        </Link>

        <div className={tabItemClass} role="group" aria-label="Каталог (скоро)">
          <span className={TAB_BAR_ICON_BOX}>
            <TabBarOutlineIcon
              name="catalog"
              className={`${TAB_BAR_ICON} ${isActive("catalog") ? gj.active : gj.inactiveIcon}`}
            />
          </span>
          <span
            className={
              isActive("catalog")
                ? `${labelClass} font-normal text-black`
                : `${labelClass} font-normal ${gj.inactiveLabel}`
            }
          >
            Каталог
          </span>
        </div>

        <Link
          href="/cart"
          className={tabItemClass}
          aria-current={isActive("cart") ? "page" : undefined}
        >
          {cartCount > 0 ? (
            <span
              className={`absolute right-1 top-1 z-10 box-border flex min-h-[1.25rem] min-w-[0.75rem] items-center justify-center rounded-[10px] px-[3px] py-0.5 text-center text-[11px] font-normal leading-3 text-white [letter-spacing:-0.11px] ${gj.red} ring-1 ring-white`}
              aria-label={`${cartCount} в корзине`}
            >
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          ) : null}
          <span className={TAB_BAR_ICON_BOX}>
            <TabBarOutlineIcon
              name="cart"
              className={`${TAB_BAR_ICON} ${isActive("cart") ? gj.active : gj.inactiveIcon}`}
            />
          </span>
          <span
            className={
              isActive("cart")
                ? `${labelClass} font-normal text-black`
                : `${labelClass} font-normal ${gj.inactiveLabel}`
            }
          >
            Корзина
          </span>
        </Link>

        <div className={tabItemClass} role="group" aria-label="Избранное (скоро)">
          {favoritesCount > 0 ? (
            <span
              className={`absolute right-1 top-1 z-10 box-border flex min-h-[1.25rem] min-w-[0.75rem] items-center justify-center rounded-[10px] px-[3px] py-0.5 text-[11px] font-normal leading-3 text-white [letter-spacing:-0.11px] ${gj.red} ring-1 ring-white`}
              aria-hidden
            >
              {favoritesCount > 99 ? "99+" : favoritesCount}
            </span>
          ) : null}
          <span className={TAB_BAR_ICON_BOX}>
            <TabBarOutlineIcon
              name="favorites"
              className={`${TAB_BAR_ICON} ${isActive("favorites") ? gj.active : gj.inactiveIcon}`}
            />
          </span>
          <span
            className={
              isActive("favorites")
                ? `${labelClass} font-normal text-black`
                : `${labelClass} font-normal ${gj.inactiveLabel}`
            }
          >
            Избранное
          </span>
        </div>

        <div className={tabItemClass} role="group" aria-label="Профиль (скоро)">
          {showProfileDot ? (
            <span
              className={`absolute right-1 top-1 z-10 h-1.5 w-1.5 rounded-full ${gj.red} ring-1 ring-white`}
              aria-label="Уведомление"
            />
          ) : null}
          <span className={TAB_BAR_ICON_BOX}>
            <TabBarOutlineIcon
              name="profile"
              className={`${TAB_BAR_ICON} ${isActive("profile") ? gj.active : gj.inactiveIcon}`}
            />
          </span>
          <span
            className={
              isActive("profile")
                ? `${labelClass} font-normal text-black`
                : `${labelClass} font-normal ${gj.inactiveLabel}`
            }
          >
            Профиль
          </span>
        </div>
      </div>
    </nav>
  );
}
