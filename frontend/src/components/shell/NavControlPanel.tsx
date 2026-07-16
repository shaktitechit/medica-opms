"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { PORTAL_NAV, isNavLeafActive } from "@/constants/portalNav";
import { normalizeDepartment, PORTAL_NAV_TOP } from "@/constants/dashboardAccess";
import { NavIcon } from "./NavIcon";
import { useShellNav } from "./shell-nav-context";
import { useAppSelector } from "@/store";

type NavControlPanelProps = { portal: string };

/**
 * Horizontal nav strip rendered below the Topbar on desktop screens.
 * Visible only when the sidebar is in its collapsed (icon-only) state.
 * Toggling the sidebar open hides this panel so navigation lives in one place.
 */
export function NavControlPanel({ portal }: NavControlPanelProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { desktopCollapsed, setDesktopCollapsed } = useShellNav();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const user = useAppSelector((s) => s.auth.user);
  const userDeptRaw =
    user && typeof user === "object" ? (user as { department?: string }).department : "";
  const userDept = normalizeDepartment(userDeptRaw);

  const navLeaves = PORTAL_NAV[portal as keyof typeof PORTAL_NAV] ?? [];

  const topSlots = PORTAL_NAV_TOP.filter(
    (slot) =>
      slot.href !== `/${portal}` &&
      slot.depts.map((d) => normalizeDepartment(d)).includes(userDept),
  );

  const openMenu = (key: string) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpenKey(key);
  };

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenKey(null), 120);
  };

  return (
    <div
      aria-hidden={!desktopCollapsed}
      className={[
        "relative z-30 hidden lg:flex shrink-0 items-center gap-1 border-b border-slate-200/80 bg-white px-3 dark:border-white/10 dark:bg-slate-950",
        "transition-all duration-300 ease-out",
        desktopCollapsed
          ? "max-h-[48px] opacity-100 py-1.5 pointer-events-auto overflow-visible"
          : "max-h-0 opacity-0 py-0 pointer-events-none overflow-hidden",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => setDesktopCollapsed(false)}
        title="Expand sidebar"
        aria-label="Expand sidebar"
        className="mr-1 flex shrink-0 items-center justify-center rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
      >
        <ChevronRight className="size-4 shrink-0" strokeWidth={2} aria-hidden />
      </button>

      <div className="mr-2 h-5 w-px shrink-0 bg-slate-200 dark:bg-white/10" />

      {navLeaves.map((leaf) => {
        const href =
          leaf.segments.length === 0
            ? `/${portal}`
            : `/${portal}/${leaf.segments.join("/")}`;
        const active = isNavLeafActive(portal, leaf, pathname);
        const children = leaf.children ?? [];
        const key = leaf.segments.join("/") || "__root__";
        const isOpen = openKey === key;
        const linkHref = children.length ? `${href}?${children[0].query}` : href;

        if (children.length === 0) {
          return (
            <Link
              key={href}
              href={linkHref}
              title={leaf.label}
              className={[
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap transition",
                active
                  ? "bg-blue-600/12 text-blue-950 ring-1 ring-blue-600/30 dark:bg-blue-500/15 dark:text-blue-50"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-slate-100",
              ].join(" ")}
            >
              <NavIcon name={leaf.icon} className="size-3.5 shrink-0" strokeWidth={2} />
              <span>{leaf.label}</span>
            </Link>
          );
        }

        return (
          <div
            key={href}
            className="relative shrink-0"
            onMouseEnter={() => openMenu(key)}
            onMouseLeave={scheduleClose}
            onFocus={() => openMenu(key)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                scheduleClose();
              }
            }}
          >
            <Link
              href={linkHref}
              aria-expanded={isOpen}
              aria-haspopup="menu"
              className={[
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap transition",
                active || isOpen
                  ? "bg-blue-600/12 text-blue-950 ring-1 ring-blue-600/30 dark:bg-blue-500/15 dark:text-blue-50"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-slate-100",
              ].join(" ")}
            >
              <NavIcon name={leaf.icon} className="size-3.5 shrink-0" strokeWidth={2} />
              <span>{leaf.label}</span>
              <ChevronDown
                className={`size-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                strokeWidth={2.5}
                aria-hidden
              />
            </Link>

            {isOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full z-50 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900"
              >
                {children.map((child) => {
                  const [qKey, qVal] = child.query.split("=");
                  const currentVal =
                    searchParams.get(qKey) ?? children[0].query.split("=")[1];
                  const childActive = active && currentVal === qVal;
                  return (
                    <Link
                      key={child.query}
                      role="menuitem"
                      href={`${href}?${child.query}`}
                      onClick={() => setOpenKey(null)}
                      className={[
                        "flex items-center gap-2 px-3 py-2 text-[12px] font-medium transition",
                        childActive
                          ? "bg-blue-600/10 text-blue-950 dark:bg-blue-500/15 dark:text-blue-50"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/8",
                      ].join(" ")}
                    >
                      <NavIcon name={child.icon} className="size-3.5 shrink-0" strokeWidth={2} />
                      <span>{child.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {topSlots.length > 0 && (
        <>
          <div className="mx-1.5 h-5 w-px shrink-0 bg-slate-200 dark:bg-white/10" />
          {topSlots.map((slot) => {
            const active =
              pathname === slot.href || pathname.startsWith(`${slot.href}/`);
            return (
              <Link
                key={slot.href}
                href={slot.href}
                title={slot.label}
                className={[
                  "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap transition",
                  active
                    ? "bg-slate-200/85 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-slate-100",
                ].join(" ")}
              >
                <NavIcon name={slot.icon} className="size-3.5 shrink-0" strokeWidth={2} />
                <span>{slot.label}</span>
              </Link>
            );
          })}
        </>
      )}
    </div>
  );
}
