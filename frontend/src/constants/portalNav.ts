/**
 * Role portal navigation — paths are `/portal` plus optional segments (`/sales/my-orders`).
 * `icon` keys map to {@link NAV_ICON_MAP} in `components/shell/NavIcon.tsx`.
 */
export const PORTALS = [
  "admin",
  "sales",
  "finance",
  "dispatch",
  "super_admin",
  "account",
] as const;

export type PortalKey = (typeof PORTALS)[number];

export type PortalNavLeaf = {
  /** URL segments after `/portal` (none = overview at `/portal`). */
  segments: readonly string[];
  label: string;
  /** Matches a key from `NAV_ICON_MAP` in `NavIcon.tsx`. */
  icon: string;
};

export const PORTAL_NAV: Record<PortalKey, readonly PortalNavLeaf[]> = {
  admin: [
    { segments: [], label: "Overview", icon: "LayoutDashboard" },
    { segments: ["orders"], label: "Orders", icon: "ClipboardList" },
    { segments: ["create-order"], label: "Create Order", icon: "FilePlus" },
    { segments: ["parties"], label: "Parties", icon: "Users" },
    { segments: ["products"], label: "Products", icon: "Package" },
  ],
  sales: [
    { segments: [], label: "Overview", icon: "LayoutDashboard" },
    { segments: ["orders"], label: "Orders", icon: "ClipboardList" },
    { segments: ["create-order"], label: "Create Order", icon: "FilePlus" },
  ],
  finance: [
    { segments: [], label: "Overview", icon: "LayoutDashboard" },
    {
      segments: ["orders"],
      label: "Orders",
      icon: "ClipboardCheck",
    },
    { segments: ["create-order"], label: "Create Order", icon: "FilePlus" },
    { segments: ["parties"], label: "Parties", icon: "Users" },
    { segments: ["products"], label: "Products", icon: "Package" },
  ],
  account: [
    { segments: [], label: "Overview", icon: "LayoutDashboard" },
    {
      segments: ["orders"],
      label: "Orders",
      icon: "ClipboardCheck",
    },
    { segments: ["create-order"], label: "Create Order", icon: "FilePlus" },
    { segments: ["parties"], label: "Parties", icon: "Users" },
    { segments: ["products"], label: "Products", icon: "Package" },
  ],
  dispatch: [
    { segments: [], label: "Overview", icon: "LayoutDashboard" },
    { segments: ["orders"], label: "Orders", icon: "Inbox" },
    { segments: ["transport-agents"], label: "Transport Agents", icon: "Building2" },
  ],
  super_admin: [
    { segments: [], label: "Overview", icon: "LayoutDashboard" },
    { segments: ["orders"], label: "All Orders", icon: "ClipboardList" },
    { segments: ["users"], label: "Users", icon: "Users" },
    { segments: ["parties"], label: "Parties", icon: "Building2" },
    { segments: ["products"], label: "Products", icon: "Package" },
  ],
};

export function isPortalKey(x: string): x is PortalKey {
  return (PORTALS as readonly string[]).includes(x);
}

export function portalHref(
  portal: PortalKey,
  segments: readonly string[],
): string {
  if (!segments.length) return `/${portal}`;
  return `/${portal}/${segments.join("/")}`;
}

/** Title for the current path; falls back to humanized last segment. */
export function resolvePortalPageTitle(
  portal: PortalKey,
  rest: readonly string[] | undefined,
): string {
  const pathSegs = rest ?? [];
  const leaves = PORTAL_NAV[portal];
  const hit = leaves.find(
    (l) =>
      l.segments.length === pathSegs.length &&
      l.segments.every((s, i) => s === pathSegs[i]),
  );
  if (hit) return hit.label;
  if (!pathSegs.length) return "Overview";
  return pathSegs[pathSegs.length - 1]
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function isNavLeafActive(
  portal: string,
  leaf: PortalNavLeaf,
  pathname: string,
): boolean {
  if (!isPortalKey(portal)) return false;
  const href = portalHref(portal, leaf.segments);
  if (pathname === href) return true;
  if (href !== `/${portal}` && pathname.startsWith(`${href}/`)) return true;

  // Custom rule: make Orders active when viewing /order/*
  if (leaf.segments[0] === "orders" && pathname.startsWith(`/${portal}/order/`)) {
    return true;
  }
  return false;
}
