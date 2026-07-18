"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { normalizeDepartment, portalSegmentLabel } from "@/constants/dashboardAccess";
import { MedicaLogo } from "@/components/MedicaLogo";
import { RoleBasedMenu } from "./RoleBasedMenu";
import { useShellNav } from "./shell-nav-context";
import { useAppSelector } from "@/store";

type SidebarProps = { portal: string };

export function Sidebar({ portal }: SidebarProps) {
  const pathname = usePathname();
  const { mobileNavOpen, closeMobileNav, desktopCollapsed, setDesktopCollapsed } =
    useShellNav();
  const user = useAppSelector((s) => s.auth.user);
  const userDeptRaw =
    user && typeof user === "object" ? (user as { department?: string }).department : "";
  const userDept = normalizeDepartment(userDeptRaw);

  const lgW = desktopCollapsed
    ? "lg:w-[56px] lg:min-w-[56px]"
    : "lg:w-[11rem] lg:min-w-[11rem]";

  return (
    <aside
      id="app-sidebar"
      aria-label="Main navigation"
      className={[
        "fixed left-0 top-0 z-[40] flex h-[100vh] max-h-[100vh] min-h-0 w-[min(12rem,82vw)] max-w-[13rem] flex-col overflow-hidden border-r border-border bg-card shadow-xl shadow-border/40 transition-[transform,width,min-width] duration-300 ease-out supports-[height:100dvh]:max-h-[100dvh] supports-[height:100dvh]:h-[100dvh]",
        "lg:relative lg:z-0 lg:h-full lg:min-h-0 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:shadow-none",
        lgW,
        mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}
    >
      <div
        className={[
          "relative flex shrink-0 flex-col gap-0.5 border-b border-border px-2 pb-2.5 pr-11 pt-[max(0.75rem,env(safe-area-inset-top))]",
          desktopCollapsed
            ? "lg:items-center lg:px-1.5 lg:pb-2.5 lg:pr-1.5 lg:pt-4"
            : "lg:pr-2",
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
                ? "lg:mx-auto lg:h-8 lg:max-h-8 lg:w-auto lg:max-w-[2.75rem] lg:object-contain"
                : "max-h-9 max-w-[7.5rem]",
            ].join(" ")}
          />
        </Link>
        {userDept ? (
          <p
            className={`truncate text-2xs uppercase tracking-wide text-muted ${desktopCollapsed ? "hidden lg:hidden" : ""}`}
          >
            {userDept}
          </p>
        ) : null}
        <button
          type="button"
          className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-lg p-2 text-muted transition hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 lg:hidden"
          aria-label="Close navigation menu"
          onClick={closeMobileNav}
        >
          <X className="size-5" strokeWidth={2} aria-hidden />
        </button>
      </div>

      <Suspense fallback={null}>
        <RoleBasedMenu
          portal={portal}
          onNavigate={closeMobileNav}
          desktopCollapsed={desktopCollapsed}
        />
      </Suspense>

      <div className="mt-auto hidden shrink-0 border-t border-border lg:flex">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-muted transition hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
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
