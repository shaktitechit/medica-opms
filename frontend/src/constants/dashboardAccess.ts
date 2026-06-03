/**
 * Mirrors backend dept gates (`requireDepartmentOnly`) for portal prefixes.
 */

import type { PortalKey } from "./portalNav";
import { PORTALS } from "./portalNav";

export type PortalRouteMeta = {
  path: string;
  label: string;
  /** Departments allowed for this `/portal/**` subtree. */
  depts: readonly string[];
  /** Lucide registry key (`NavIcon.jsx` NAV_ICON_MAP). */
  icon: string;
};

/** Ordered top-level portals (sidebar shortcuts). Each mount is dept-scoped only. */
export const PORTAL_ROUTES = [
  {
    path: "/admin",
    label: "Admin",
    depts: ["admin"],
    icon: "ShieldCheck",
  },
  {
    path: "/sales",
    label: "Sales",
    depts: ["sales"],
    icon: "TrendingUp",
  },
  {
    path: "/finance",
    label: "Finance",
    /** Collection staff use the finance portal (no separate collection role). */
    depts: ["finance", "collection"],
    icon: "Landmark",
  },
  {
    path: "/dispatch",
    label: "Dispatch",
    depts: ["dispatch"],
    icon: "Boxes",
  },
  {
    path: "/super_admin",
    label: "Super Admin",
    depts: ["super_admin"],
    icon: "Shield",
  },
] as const satisfies readonly PortalRouteMeta[];

/** @deprecated Prefer {@link PORTAL_ROUTES}; kept for gradual migration. */
export const DASHBOARD_ROUTES = PORTAL_ROUTES;

export const PORTAL_NAV_TOP = PORTAL_ROUTES.map((r) => ({
  href: r.path,
  label: r.label,
  depts: [...r.depts],
  icon: r.icon,
}));

/** @deprecated Use {@link PORTAL_NAV_TOP}. */
export const DASHBOARD_NAV = PORTAL_NAV_TOP;

export const PORTAL_PATH_TO_DEPTS: Record<string, readonly string[]> =
  Object.fromEntries(PORTAL_ROUTES.map((r) => [r.path, r.depts]));

/** @deprecated Use {@link PORTAL_PATH_TO_DEPTS}. */
export const DASHBOARD_PATH_TO_DEPTS = PORTAL_PATH_TO_DEPTS;

export type DashboardNavItem = {
  href: string;
  label: string;
  depts: readonly string[];
  icon: string;
};

const HOME_LOOKUP: Record<string, string> = {
  admin: "/admin",
  sales: "/sales",
  finance: "/finance",
  dispatch: "/dispatch",
  super_admin: "/super_admin",
  /** Legacy backend `collection` operators → finance portal */
  collection: "/finance",
};

/** Base path prefixes a department may navigate. */
const DEPT_TO_ALLOWED_PREFIXES: Record<string, readonly string[]> =
  PORTAL_ROUTES.reduce<Record<string, string[]>>((acc, r) => {
    for (const d of r.depts) {
      acc[d] ??= [];
      acc[d].push(r.path);
    }
    return acc;
  }, {});

export function normalizeDepartment(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "null" || s === "undefined") return "";
  return s;
}

export function portalFirstSegment(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  return parts[0] ?? null;
}

/** Department may access KPI for legacy `/api/dashboard/:segment` (still tied to dept name). */
export function departmentAllowsDashboardSegment(
  department: string,
  segment: string,
): boolean {
  const seg = normalizeDepartment(segment);
  const dept = normalizeDepartment(department);
  if (!seg || !dept) return false;
  const pathname = `/${seg}`;
  if (!(PORTALS as readonly string[]).includes(seg)) return false;
  const allowed = PORTAL_PATH_TO_DEPTS[pathname];
  if (!allowed?.length) return false;
  return (allowed as readonly string[]).includes(dept);
}

export function userDashboardDepartment(user: unknown): string {
  if (!user || typeof user !== "object") return "";
  const d = (user as Record<string, unknown>).department;
  return normalizeDepartment(d);
}

export function allowedDashboardNavForUser(user: unknown): DashboardNavItem[] {
  const dept = userDashboardDepartment(user);
  if (!dept) return [];
  return PORTAL_NAV_TOP.filter((n) =>
    (n.depts as readonly string[]).includes(dept),
  );
}

export function portalSegmentLabel(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts[0]) return null;
  const base = `/${parts[0]}`;
  const meta = PORTAL_ROUTES.find((r) => r.path === base);
  return meta?.label ?? null;
}

/** @deprecated Use {@link portalSegmentLabel}. */
export function dashboardSegmentLabel(pathname: string): string | null {
  return portalSegmentLabel(pathname);
}

export function resolveHomeDashboardPath(dept: string): string | null {
  const d = normalizeDepartment(dept);
  if (!d) return null;
  return HOME_LOOKUP[d] ?? null;
}

function pathsMatchAllowedPrefixes(
  pathname: string,
  prefixes: readonly string[],
): boolean {
  for (const p of prefixes) {
    if (pathname === p) return true;
    if (pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

/**
 * Whether this signed-in department may open `pathname` under any of its portal roots.
 */
export function departmentAllowsPortalPath(params: {
  pathname: string;
  department: string;
}): boolean {
  const dept = normalizeDepartment(params.department);
  const { pathname } = params;
  if (!dept) return false;

  const prefixes = DEPT_TO_ALLOWED_PREFIXES[dept];
  if (!prefixes?.length) return false;
  return pathsMatchAllowedPrefixes(pathname, prefixes);
}

/**
 * Rewrite legacy `/dashboard/sales/foo` paths to `/sales/foo`.
 */
export function normalizeDeepLinkPath(raw: string): string {
  const pathOnly = raw.split("?")[0]?.trim() ?? "";
  if (!pathOnly.startsWith("/")) return "";
  const m = pathOnly.match(/^\/dashboard\/([^/]+)(\/.*)?$/);
  if (!m?.[1]) return pathOnly;
  return `/${m[1]}${m[2] ?? ""}`;
}

/**
 * @deprecated Use {@link departmentAllowsPortalPath}.
 * Legacy `/dashboard/:segment` deep links are redirected to `/:segment` by middleware.
 */
export function departmentAllowsDashboardPath(params: {
  pathname: string;
  department: string;
}): boolean {
  const { pathname } = params;
  if (pathname.startsWith("/dashboard/")) {
    const seg = pathname.split("/").filter(Boolean)[1];
    if (seg)
      return departmentAllowsDashboardSegment(params.department, seg);
  }
  return departmentAllowsPortalPath(params);
}

export function isProtectedPortalPath(pathname: string): boolean {
  return PORTAL_ROUTES.some(
    (r) => pathname === r.path || pathname.startsWith(`${r.path}/`),
  );
}

/** `/admin`, `/sales`, … portal prefixes allowed for this dept. */
export function portalPrefixesForDepartment(
  department: string,
): readonly string[] {
  const d = normalizeDepartment(department);
  if (!d) return [];
  return DEPT_TO_ALLOWED_PREFIXES[d] ?? [];
}

export function knownPortalFromPath(pathname: string): PortalKey | null {
  const first = portalFirstSegment(pathname);
  if (!first) return null;
  return (PORTALS as readonly string[]).includes(first)
    ? (first as PortalKey)
    : null;
}
