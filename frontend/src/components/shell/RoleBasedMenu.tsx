"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  normalizeDepartment,
  PORTAL_NAV_TOP,
} from "@/constants/dashboardAccess";
import { PORTAL_NAV, isNavLeafActive } from "@/constants/portalNav";
import { NavIcon } from "./NavIcon";
import { useAppSelector } from "@/store";

type RoleBasedMenuProps = {
  portal: string;
  onNavigate?: () => void;
  desktopCollapsed: boolean;
};

export function RoleBasedMenu({
  portal,
  onNavigate,
  desktopCollapsed,
}: RoleBasedMenuProps) {
  const pathname = usePathname();
  const user = useAppSelector((s) => s.auth.user);
  const userDeptRaw =
    user && typeof user === "object" ? (user as { department?: string }).department : "";
  const userDept = normalizeDepartment(userDeptRaw);

  const navLeaves = PORTAL_NAV[portal as keyof typeof PORTAL_NAV] ?? [];

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

  const sectionLbl =
    "mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500";

  return (
    <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1.5 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* <p
        className={`${sectionLbl} ${desktopCollapsed ? "hidden lg:hidden" : ""}`}
      >
        {portal.charAt(0).toUpperCase() + portal.slice(1)}
      </p> */}
      <ul className="space-y-0.5">
        {navLeaves.map((leaf) => {
          const href =
            leaf.segments.length === 0
              ? `/${portal}`
              : `/${portal}/${leaf.segments.join("/")}`;
          const active = isNavLeafActive(portal, leaf, pathname);
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
        })}
      </ul>


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
