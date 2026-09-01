"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
      // collapsed sidebar → flyout to the right; expanded → flyout below
      top: desktopCollapsed ? rect.top : rect.bottom + 2,
      left: desktopCollapsed ? rect.right + 6 : rect.left,
    });
  };

  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(() => setFlyout(null), 140);
  };

  const linkBase =
    "group flex min-w-0 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-150 text-left";
  const linkCollapsedDesktop =
    "lg:justify-center lg:gap-0 lg:px-1.5 lg:py-2";
  const linkActivePortal =
    "bg-primary-muted text-primary font-semibold ring-1 ring-primary/25 shadow-2xs";
  const linkPassive =
    "text-slate-600 dark:text-slate-300 hover:bg-primary-muted/70 dark:hover:bg-primary-muted/40 hover:text-primary";

  const flyoutMenu =
    mounted && flyout
      ? createPortal(
          <div
            role="menu"
            onMouseEnter={clearClose}
            onMouseLeave={scheduleClose}
            style={{ top: flyout.top, left: flyout.left }}
            className="fixed z-[9999] min-w-[11.5rem] max-w-[14rem] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-2xl backdrop-blur-md"
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
                    "group flex min-w-0 w-full items-center gap-2 px-3 py-1.5 text-[11px] font-medium transition-colors text-left",
                    childActive
                      ? "bg-primary-muted font-semibold text-primary"
                      : "text-slate-600 hover:bg-primary-muted/70 dark:hover:bg-primary-muted/40 hover:text-primary dark:text-slate-300",
                  ].join(" ")}
                >
                  <NavIcon
                    name={child.icon}
                    className={`size-3.5 shrink-0 transition-colors ${
                      childActive
                        ? "text-primary"
                        : "text-slate-400 group-hover:text-primary"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate">{child.label}</span>
                </Link>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
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
                    <NavIcon
                      name={leaf.icon}
                      className={`size-[18px] shrink-0 transition-colors ${
                        active
                          ? "text-primary"
                          : "text-slate-400 group-hover:text-primary"
                      }`}
                    />
                    <span className={`min-w-0 flex-1 truncate ${desktopCollapsed ? "lg:sr-only" : ""}`}>
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
                <button
                  type="button"
                  title={desktopCollapsed ? leaf.label : undefined}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                  onClick={() => {
                    if (isOpen) {
                      setFlyout(null);
                    } else {
                      openFlyout(key, href, children, active);
                    }
                  }}
                  className={[
                    linkBase,
                    "cursor-pointer",
                    desktopCollapsed ? linkCollapsedDesktop : "",
                    active || isOpen ? linkActivePortal : linkPassive,
                  ].join(" ")}
                >
                  <NavIcon
                    name={leaf.icon}
                    className={`size-[18px] shrink-0 transition-colors ${
                      active || isOpen
                        ? "text-primary"
                        : "text-slate-400 group-hover:text-primary"
                    }`}
                  />
                  <span className={`min-w-0 flex-1 truncate ${desktopCollapsed ? "lg:sr-only" : ""}`}>
                    {leaf.label}
                  </span>
                  <ChevronDown
                    className={`size-3.5 shrink-0 transition-transform ${
                      active || isOpen
                        ? "text-primary"
                        : "text-muted group-hover:text-primary"
                    } ${desktopCollapsed ? "lg:hidden" : ""} ${isOpen ? "rotate-180" : ""}`}
                    strokeWidth={2.5}
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>

        {PORTAL_NAV_TOP.some(
          (slot) =>
            slot.href !== `/${portal}` &&
            slot.depts.map((d) => normalizeDepartment(d)).includes(userDept),
        ) && (
          <ul className="mt-2 pt-2 border-t border-border space-y-0.5">
            {PORTAL_NAV_TOP.filter(
              (slot) =>
                slot.href !== `/${portal}` &&
                slot.depts.map((d) => normalizeDepartment(d)).includes(userDept),
            ).map((slot) => {
              const active =
                pathname === slot.href || pathname.startsWith(`${slot.href}/`);
              return (
                <li key={slot.href}>
                  <Link
                    href={slot.href}
                    title={desktopCollapsed ? slot.label : undefined}
                    onClick={onNavigate}
                    className={[
                      linkBase,
                      desktopCollapsed ? linkCollapsedDesktop : "",
                      active ? linkActivePortal : linkPassive,
                    ].join(" ")}
                  >
                    <NavIcon
                      name={slot.icon}
                      className={`size-[18px] shrink-0 transition-colors ${
                        active
                          ? "text-primary"
                          : "text-slate-400 group-hover:text-primary"
                      }`}
                    />
                    <span className={`min-w-0 flex-1 truncate ${desktopCollapsed ? "lg:sr-only" : ""}`}>
                      {slot.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Flyout rendered via portal to escape overflow:hidden on sidebar */}
      {flyoutMenu}
    </>
  );
}
