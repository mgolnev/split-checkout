import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Платформы вроде Onreza иногда прокидывают внутренний IP:порт в `X-Forwarded-Host`,
 * а браузер шлёт `Origin: https://<публичный-хост>`. Next.js 15+ отклоняет Server Actions
 * при несовпадении. Выравниваем заголовок только если:
 * - `x-forwarded-host` похож на внутренний адрес;
 * - есть валидный `Origin` и его host входит в явный allowlist (env).
 */
function isProbablyInternalForwardedHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (h === "localhost" || h.startsWith("127.")) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d+))?$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function trustedOriginHostEntries(): string[] {
  const raw = process.env.SERVER_ACTION_TRUSTED_ORIGINS?.trim();
  const fromEnv = raw ? raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      fromEnv.push(new URL(appUrl).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  return [...new Set(fromEnv)];
}

function originHostMatchesTrustlist(originHost: string, trust: string[]): boolean {
  const h = originHost.toLowerCase();
  for (const entry of trust) {
    if (entry.startsWith("*.")) {
      const base = entry.slice(2);
      if (h === base) return true;
      if (h.endsWith("." + base)) return true;
    } else if (h === entry) return true;
  }
  return false;
}

function withAlignedForwardedHost(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  const xfHost = headers.get("x-forwarded-host");
  const origin = headers.get("origin");
  if (!xfHost || !origin) return headers;
  if (!isProbablyInternalForwardedHost(xfHost)) return headers;
  const trust = trustedOriginHostEntries();
  if (trust.length === 0) return headers;
  try {
    const originHost = new URL(origin).hostname;
    if (!originHostMatchesTrustlist(originHost, trust)) return headers;
    headers.set("x-forwarded-host", originHost);
  } catch {
    /* ignore */
  }
  return headers;
}

export function middleware(req: NextRequest) {
  const requestHeaders = withAlignedForwardedHost(req);
  const forward = { request: { headers: requestHeaders } } as const;

  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin")) return NextResponse.next(forward);
  if (pathname.startsWith("/admin/login")) return NextResponse.next(forward);
  if (req.cookies.get("admin_ok")?.value === "1") return NextResponse.next(forward);
  return NextResponse.redirect(new URL("/admin/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
