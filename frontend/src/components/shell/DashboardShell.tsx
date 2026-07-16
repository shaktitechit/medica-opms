"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { PageContent } from "./PageContent";
import { Sidebar } from "./Sidebar";
import { ShellNavContext } from "./shell-nav-context";
import { Topbar } from "./Topbar";
import { NavControlPanel } from "./NavControlPanel";
import { useDesktopSidebarCollapsed } from "./useDesktopSidebarCollapsed";
import { Suspense } from "react";

type DashboardShellProps = {
  portal: string;
  children: ReactNode;
};

export function DashboardShell({ portal, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useDesktopSidebarCollapsed();

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);

  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileNav();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, closeMobileNav]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const navValue = useMemo(
    () => ({
      mobileNavOpen,
      openMobileNav,
      closeMobileNav,
      desktopCollapsed,
      setDesktopCollapsed,
    }),
    [mobileNavOpen, openMobileNav, closeMobileNav, desktopCollapsed, setDesktopCollapsed],
  );

  return (
    <ShellNavContext.Provider value={navValue}>
      <div className="relative flex h-[100vh] max-h-[100vh] min-h-0 w-full flex-row overflow-hidden bg-slate-100 dark:bg-slate-950 supports-[height:100dvh]:max-h-[100dvh] supports-[height:100dvh]:h-[100dvh]">
        <div
          aria-hidden={!mobileNavOpen}
          className={[
            "fixed inset-0 z-[35] bg-slate-900/45 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden",
            mobileNavOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
          ].join(" ")}
          onClick={closeMobileNav}
        />

        <Sidebar portal={portal} />

        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar portal={portal} />
          {/* Nav control panel — visible on desktop only when sidebar is collapsed */}
          <Suspense fallback={null}>
            <NavControlPanel portal={portal} />
          </Suspense>
          <PageContent>{children}</PageContent>
        </div>
      </div>
    </ShellNavContext.Provider>
  );
}

/** @deprecated Prefer {@link DashboardShell}. */
export const PortalShell = DashboardShell;
