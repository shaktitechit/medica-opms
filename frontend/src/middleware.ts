import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isProtectedPortalPath,
  normalizeDeepLinkPath,
  portalPrefixesForDepartment,
  resolveHomeDashboardPath,
} from "@/constants/dashboardAccess";
import {
  DEPT_HINT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/sessionCookie";

function redirectDashboardLegacy(pathname: string, req: NextRequest) {
  const m = pathname.match(/^\/dashboard\/([^/]+)(\/.*)?$/);
  if (!m || !m[1]) return null;
  const target = `/${m[1]}${m[2] ?? ""}`;
  return NextResponse.redirect(new URL(target, req.url));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const dashRedirect = redirectDashboardLegacy(pathname, req);
  if (dashRedirect) return dashRedirect;

  const isLoginRoute = pathname === "/login";
  const hasSession = req.cookies.get(SESSION_COOKIE_NAME)?.value === "1";

  const rawDeptHint = req.cookies.get(DEPT_HINT_COOKIE_NAME)?.value ?? "";
  const deptHint =
    rawDeptHint && rawDeptHint.length > 0
      ? decodeURIComponent(rawDeptHint).trim().toLowerCase()
      : "";

  const protectionHit = isProtectedPortalPath(pathname);

  const homeUrl = (): string =>
    deptHint ? resolveHomeDashboardPath(deptHint) ?? "/login" : "/login";

  const pathAllowedForDept = (targetPath: string): boolean =>
    portalPrefixesForDepartment(deptHint).some(
      (prefix) =>
        targetPath === prefix || targetPath.startsWith(`${prefix}/`),
    );

  if (isLoginRoute && hasSession && deptHint) {
    const fromRaw = req.nextUrl.searchParams.get("from")?.trim() ?? "";
    const normalized = normalizeDeepLinkPath(fromRaw);
    const pathOnly = (normalized.split("?")[0] ?? "").trim();
    if (
      pathOnly.length > 0 &&
      pathOnly.startsWith("/") &&
      isProtectedPortalPath(pathOnly) &&
      pathAllowedForDept(pathOnly)
    ) {
      return NextResponse.redirect(new URL(pathOnly, req.url));
    }
    return NextResponse.redirect(new URL(homeUrl(), req.url));
  }

  if (protectionHit && !hasSession) {
    const login = new URL("/login", req.url);
    login.searchParams.set("from", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  if (protectionHit && hasSession && deptHint) {
    if (!pathAllowedForDept(pathname)) {
      return NextResponse.redirect(new URL(homeUrl(), req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/admin/:path*",
    "/sales/:path*",
    "/finance/:path*",
    "/dispatch/:path*",
    "/super_admin/:path*",
  ],
};
