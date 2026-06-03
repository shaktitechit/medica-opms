"use client";

import { CircleUser, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { clearSessionMarks } from "@/lib/sessionCookie";
import { toast } from "@/lib/toast";
import { logout, medicaApi, useAppDispatch } from "@/store";

function pickDisplayName(user: unknown): string {
  if (!user || typeof user !== "object") return "User";
  const u = user as Record<string, unknown>;
  if (typeof u.name === "string" && u.name.trim()) return u.name.trim();
  if (typeof u.full_name === "string" && u.full_name.trim())
    return u.full_name.trim();
  const first =
    typeof u.first_name === "string" ? u.first_name.trim() : "";
  const last = typeof u.last_name === "string" ? u.last_name.trim() : "";
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  if (typeof u.email === "string" && u.email.trim()) return u.email.trim();
  return "User";
}

function pickEmail(user: unknown): string {
  if (!user || typeof user !== "object") return "";
  const u = user as Record<string, unknown>;
  return typeof u.email === "string" ? u.email.trim() : "";
}

function pickInitial(user: unknown): string {
  const name = pickDisplayName(user);
  if (name && name !== "User") {
    const letter = name.match(/[a-zA-Z\u00C0-\u024F]/)?.[0];
    if (letter) return letter.toUpperCase();
    return name.charAt(0).toUpperCase();
  }
  const email = pickEmail(user);
  if (email) return email.charAt(0).toUpperCase();
  return "?";
}

type UserMenuDropdownProps = {
  portal: string;
  user: unknown;
};

export function UserMenuDropdown({ portal, user }: UserMenuDropdownProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const btnId = useId();
  const menuId = useId();

  const displayName = pickDisplayName(user);
  const email = pickEmail(user);
  const initial = pickInitial(user);

  const onLogout = useCallback(() => {
    dispatch(medicaApi.util.resetApiState());
    dispatch(logout());
    clearSessionMarks();
    setOpen(false);
    toast.success("Signed out");
    router.replace("/login");
  }, [dispatch, router]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (
        e.target instanceof Node &&
        !rootRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const profileHref = `/${portal}/profile`;

  return (
    <div className="relative" ref={rootRef}>
      <button
        id={btnId}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-sm font-semibold text-white shadow-md ring-2 ring-white transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:ring-slate-950 dark:focus-visible:ring-offset-slate-950"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={`Account menu for ${displayName}`}
      >
        {initial}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={btnId}
          className="absolute right-0 top-[calc(100%+8px)] z-[55] w-[min(calc(100vw-2rem),280px)] overflow-hidden rounded-xl border border-slate-200/90 bg-white py-2 shadow-xl dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-start gap-3 border-b border-slate-200/90 px-4 pb-3 pt-1 dark:border-white/10">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-lg font-semibold text-white shadow-inner">
              {initial}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                {displayName}
              </p>
              {email ? (
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  {email}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  No email on file
                </p>
              )}
            </div>
          </div>

          <div className="py-1">
            <Link
              href={profileHref}
              role="menuitem"
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.06]"
              onClick={() => setOpen(false)}
            >
              <CircleUser
                className="size-[18px] shrink-0 text-slate-400"
                strokeWidth={2}
                aria-hidden
              />
              Profile
            </Link>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              onClick={onLogout}
            >
              <LogOut className="size-[18px] shrink-0" strokeWidth={2} aria-hidden />
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
