"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { normalizeDepartment, portalSegmentLabel } from "@/constants/dashboardAccess";
import { MedicaLogo } from "@/components/MedicaLogo";
import { RoleBasedMenu } from "./RoleBasedMenu";
import { useShellNav } from "./shell-nav-context";
import { useDesktopSidebarCollapsed } from "./useDesktopSidebarCollapsed";
import { useAppSelector } from "@/store";

type SidebarProps = { portal: string };

export function Sidebar({ portal }: SidebarProps) {
  const pathname = usePathname();
  const { mobileNavOpen, closeMobileNav } = useShellNav();
  const [desktopCollapsed, setDesktopCollapsed] = useDesktopSidebarCollapsed();
  const user = useAppSelector((s) => s.auth.user);
  const userDeptRaw =
    user && typeof user === "object" ? (user as { department?: string }).department : "";
  const userDept = normalizeDepartment(userDeptRaw);

  const lgW = desktopCollapsed
    ? "lg:w-[76px] lg:min-w-[76px]"
    : "lg:w-[260px] lg:min-w-[260px]";

  return (
    <aside
      id="app-sidebar"
      aria-label="Main navigation"
      className={[
        "fixed left-0 top-0 z-[40] flex h-[100vh] max-h-[100vh] min-h-0 w-[min(18rem,88vw)] max-w-[20rem] flex-col overflow-hidden border-r border-slate-200/80 bg-white shadow-xl shadow-slate-200/40 transition-[transform,width,min-width] duration-300 ease-out supports-[height:100dvh]:max-h-[100dvh] supports-[height:100dvh]:h-[100dvh] dark:border-white/10 dark:bg-slate-950 dark:shadow-black/30",
        "lg:relative lg:z-0 lg:h-full lg:min-h-0 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:shadow-none dark:lg:bg-slate-950",
        lgW,
        mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}
    >
      <div
        className={[
          "relative flex shrink-0 flex-col gap-1 border-b border-slate-200/90 px-4 pb-4 pr-14 pt-[max(1rem,env(safe-area-inset-top))] dark:border-white/10",
          desktopCollapsed
            ? "lg:items-center lg:px-3 lg:pb-3 lg:pr-3 lg:pt-5"
            : "lg:pr-4",
        ].join(" ")}
      >
        <Link
          href={`/${portal}`}
          className="relative block min-w-0 lg:text-center"
          onClick={closeMobileNav}
          aria-label={`Medica — ${portalSegmentLabel(pathname)}`}
        >
          <MedicaLogo
            className={`${desktopCollapsed ? "justify-center lg:justify-center" : ""}`}
            imgClassName={[
              "pr-8 lg:pr-0",
              desktopCollapsed
                ? "lg:mx-auto lg:h-9 lg:max-h-9 lg:w-auto lg:max-w-[3.25rem] lg:object-contain"
                : "max-h-10 max-w-[12rem]",
            ].join(" ")}
          />
        </Link>
        {userDept ? (
          <p
            className={`truncate text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 ${desktopCollapsed ? "hidden lg:hidden" : ""}`}
          >
            {userDept}
          </p>
        ) : null}
        <button
          type="button"
          className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/55 lg:hidden dark:text-slate-300 dark:hover:bg-white/10"
          aria-label="Close navigation menu"
          onClick={closeMobileNav}
        >
          <X className="size-5" strokeWidth={2} aria-hidden />
        </button>
      </div>

      <RoleBasedMenu
        portal={portal}
        onNavigate={closeMobileNav}
        desktopCollapsed={desktopCollapsed}
      />

      <div className="mt-auto hidden shrink-0 border-t border-slate-200/90 dark:border-white/10 lg:flex">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 dark:text-slate-300 dark:hover:bg-white/10"
          aria-label={
            desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"
          }
          title={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setDesktopCollapsed((c) => !c)}
        >
          {desktopCollapsed ? (
            <ChevronRight className="size-5 shrink-0" strokeWidth={2} aria-hidden />
          ) : (
            <>
              <ChevronLeft className="size-5 shrink-0" strokeWidth={2} aria-hidden />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Collapse
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
