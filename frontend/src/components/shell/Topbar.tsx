"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Menu, Sun, Moon, Clock } from "lucide-react";
import { GoogleSheetRemindersModal } from "../portal/shared/GoogleSheetRemindersModal";
import { useListRemindersQuery } from "@/store/api";

import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";
import { UserMenuDropdown } from "./UserMenuDropdown";
import { useShellNav } from "./shell-nav-context";
import { useAppSelector } from "@/store";
import { useIsDark, toggleTheme } from "@/hooks/useTheme";

type TopbarProps = { portal: string };

export function Topbar({ portal }: TopbarProps) {
  const user = useAppSelector((s) => s.auth.user);
  const { openMobileNav, mobileNavOpen } = useShellNav();
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const isDark = useIsDark();

  const currentUserId = useMemo(() => {
    return user ? String(user._id || user.id || "") : "";
  }, [user]);

  const { data: remindersData } = useListRemindersQuery(
    currentUserId ? { user: currentUserId } : {},
    { skip: !currentUserId }
  );
  const todayRemindersCount = useMemo(() => {
    if (!remindersData) return 0;
    const list = Array.isArray(remindersData) ? remindersData : (remindersData as any).data || [];
    
    const isTodayOrPast = (dateStr?: string) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      const today = new Date();
      const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      return dDate.getTime() <= todayDate.getTime();
    };

    return list.filter((r: any) => r.status === "active" && isTodayOrPast(r.next_followup_date)).length;
  }, [remindersData]);

  const label = portal.charAt(0).toUpperCase() + portal.slice(1);

  return (
    <header className={`${showRemindersModal ? "z-[100]" : "z-[50]"} relative flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-md sm:gap-3 sm:px-4 sm:py-3 md:px-6`}>
      <button
        type="button"
        className="-ml-0.5 inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-foreground transition hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 lg:hidden"
        aria-label="Open navigation menu"
        aria-controls="app-sidebar"
        aria-expanded={mobileNavOpen}
        onClick={openMobileNav}
      >
        <Menu className="size-6" strokeWidth={2} aria-hidden />
      </button>

      <Link
        href={`/${portal}`}
        className="min-w-0 max-w-[8rem] truncate text-sm font-semibold leading-tight text-foreground sm:max-w-[14rem] lg:hidden"
        title={label}
      >
        {label}
      </Link>

      <GlobalSearch portal={portal} />

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-muted transition hover:bg-surface-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 cursor-pointer"
          aria-label="Toggle dark mode"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? (
            <Sun className="size-5 transition-transform duration-300 rotate-0 scale-100" />
          ) : (
            <Moon className="size-5 transition-transform duration-300 rotate-0 scale-100" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowRemindersModal(true)}
          className="relative inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-muted transition hover:bg-surface-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 cursor-pointer"
          title="Watch Reminders Spreadsheet"
          aria-label="Watch Reminders"
        >
          <Clock className="size-5" />
          {todayRemindersCount > 0 && (
            <>
              <style>{`
                @keyframes pulse-bounce {
                  0%, 100% {
                    transform: scale(1) translateY(0);
                    box-shadow: 0 0 0 0 rgba(225, 29, 72, 0.7);
                  }
                  50% {
                    transform: scale(1.15) translateY(-2px);
                    box-shadow: 0 0 0 6px rgba(225, 29, 72, 0);
                  }
                }
              `}</style>
              <span
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-2xs font-bold text-danger-foreground shadow-lg ring-1.5 ring-card"
                style={{
                  animation: "pulse-bounce 2s infinite ease-in-out"
                }}
              >
                {todayRemindersCount}
              </span>
            </>
          )}
        </button>

        <NotificationBell />
        <div className="hidden h-6 w-px bg-border sm:block" />
        <UserMenuDropdown portal={portal} user={user} />
      </div>

      <GoogleSheetRemindersModal
        isOpen={showRemindersModal}
        onClose={() => setShowRemindersModal(false)}
      />
    </header>
  );
}

