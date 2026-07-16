"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  normalizeDepartment,
  PORTAL_NAV_TOP,
} from "@/constants/dashboardAccess";
import { PORTAL_NAV, isNavLeafActive, type PortalNavChild } from "@/constants/portalNav";
import { NavIcon } from "./NavIcon";
import { useAppSelector } from "@/store";

type RoleBasedMenuProps = {
  portal: string;
  onNavigate?: () => void;
  desktopCollapsed: boolean;
};

type FlyoutState = {
  key: string;
  href: string;
  children: readonly PortalNavChild[];
  active: boolean;
  top: number;
  left: number;
};

export function RoleBasedMenu({
  portal,
  onNavigate,
  desktopCollapsed,
}: RoleBasedMenuProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useAppSelector((s) => s.auth.user);
  const userDeptRaw =
    user && typeof user === "object" ? (user as { department?: string }).department : "";
  const userDept = normalizeDepartment(userDeptRaw);

  const navLeaves = PORTAL_NAV[portal as keyof typeof PORTAL_NAV] ?? [];
  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openFlyout = (
    key: string,
    href: string,
    children: readonly PortalNavChild[],
    active: boolean,
  ) => {
    clearClose();
    const el = itemRefs.current[key];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setFlyout({
      key,
      href,
      children,
      active,
      top: desktopCollapsed ? rect.top : rect.bottom + 2,
      left: desktopCollapsed ? rect.right + 6 : rect.left,
    });
  };

  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(() => setFlyout(null), 140);
  };

  const linkBase =
    "flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-[13px] transition";
  const linkCollapsedDesktop =
    "lg:justify-center lg:gap-0 lg:px-1.5 lg:py-2";
  const linkActivePortal =
    "bg-blue-600/12 font-medium text-blue-950 ring-1 ring-blue-600/30 dark:bg-blue-500/15 dark:text-blue-50";

  const linkPassive =
    "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5";

  const shortcutActivePortal =
    "bg-slate-200/85 text-xs font-medium dark:bg-slate-800";
  const shortcutPassive =
    "text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5";

  return (
    <nav className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1.5 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <ul className="space-y-0.5">
        {navLeaves.map((leaf) => {
          const href =
            leaf.segments.length === 0
              ? `/${portal}`
              : `/${portal}/${leaf.segments.join("/")}`;
          const active = isNavLeafActive(portal, leaf, pathname);
          const children = leaf.children ?? [];
          const key = leaf.segments.join("/") || "__root__";
          const isOpen = flyout?.key === key;
          const parentHref = children.length ? `${href}?${children[0].query}` : href;

          if (children.length === 0) {
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={desktopCollapsed ? leaf.label : undefined}
                  onClick={onNavigate}
                  className={[
                    linkBase,
                    desktopCollapsed ? linkCollapsedDesktop : "",
                    active ? linkActivePortal : linkPassive,
                  ].join(" ")}
                >
                  <NavIcon name={leaf.icon} />
                  <span className={`min-w-0 truncate ${desktopCollapsed ? "lg:sr-only" : ""}`}>
                    {leaf.label}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li
              key={href}
              ref={(el) => {
                itemRefs.current[key] = el;
              }}
              onMouseEnter={() => openFlyout(key, href, children, active)}
              onMouseLeave={scheduleClose}
            >
              <Link
                href={parentHref}
                title={desktopCollapsed ? leaf.label : undefined}
                onClick={onNavigate}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                className={[
                  linkBase,
                  "w-full",
                  desktopCollapsed ? linkCollapsedDesktop : "",
                  active || isOpen ? linkActivePortal : linkPassive,
                ].join(" ")}
              >
                <NavIcon name={leaf.icon} />
                <span className={`min-w-0 flex-1 truncate ${desktopCollapsed ? "lg:sr-only" : ""}`}>
                  {leaf.label}
                </span>
                <ChevronDown
                  className={`size-3.5 shrink-0 text-slate-400 transition-transform ${desktopCollapsed ? "lg:hidden" : ""} ${isOpen ? "rotate-180" : ""}`}
                  strokeWidth={2.5}
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>

      {flyout && (
        <div
          role="menu"
          onMouseEnter={clearClose}
          onMouseLeave={scheduleClose}
          style={{ top: flyout.top, left: flyout.left }}
          className="fixed z-[60] min-w-[12rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900"
        >
          {flyout.children.map((child) => {
            const [qKey, qVal] = child.query.split("=");
            const currentVal =
              searchParams.get(qKey) ?? flyout.children[0].query.split("=")[1];
            const childActive = flyout.active && currentVal === qVal;
            return (
              <Link
                key={child.query}
                role="menuitem"
                href={`${flyout.href}?${child.query}`}
                onClick={() => {
                  setFlyout(null);
                  onNavigate?.();
                }}
                className={[
                  "flex min-w-0 items-center gap-1.5 px-3 py-2 text-xs transition",
                  childActive
                    ? "bg-blue-600/10 font-medium text-blue-900 dark:bg-blue-500/15 dark:text-blue-100"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5",
                ].join(" ")}
              >
                <NavIcon name={child.icon} className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">{child.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      <ul className="space-y-0.5">
        {PORTAL_NAV_TOP.filter(
          (slot) =>
            slot.href !== `/${portal}` &&
            slot.depts.map((d) => normalizeDepartment(d)).includes(userDept),
        ).map((slot) => {
          const active =
            pathname === slot.href || pathname.startsWith(`${slot.href}/`);
          const row = [
            "flex rounded-md px-2 py-1.5 transition",
            desktopCollapsed
              ? "lg:justify-center lg:px-1.5 lg:py-2 lg:aspect-square lg:mx-auto lg:w-auto lg:min-w-[2.5rem]"
              : "",
            active ? shortcutActivePortal : shortcutPassive,
          ].join(" ");
          return (
            <li key={slot.href}>
              <Link
                href={slot.href}
                title={desktopCollapsed ? slot.label : undefined}
                onClick={onNavigate}
                className={row}
              >
                <NavIcon name={slot.icon} />
                <span className={`min-w-0 truncate ${desktopCollapsed ? "lg:sr-only" : ""}`}>
                  {slot.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
