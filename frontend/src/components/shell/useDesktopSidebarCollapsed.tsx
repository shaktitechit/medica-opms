"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

const COLLAPSED_KEY = "medica.sidebar.desktopCollapsed.v1";

type SetCollapsed = Dispatch<SetStateAction<boolean>>;

/** Desktop-only collapse (pref persisted in localStorage after mount). */
export function useDesktopSidebarCollapsed(): [
  boolean,
  SetCollapsed,
] {
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(COLLAPSED_KEY);
        // If never set before, keep the default (true = collapsed).
        // If explicitly stored, honour the stored value.
        if (stored === "0") {
          setCollapsed(false);
        }
        // stored === "1" or null → stay collapsed (default)
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setPersistedCollapsed = useCallback<SetCollapsed>((nextOrUpdater) => {
    setCollapsed((prev) => {
      const resolved =
        typeof nextOrUpdater === "function"
          ? (nextOrUpdater as (p: boolean) => boolean)(prev)
          : nextOrUpdater;
      try {
        localStorage.setItem(COLLAPSED_KEY, resolved ? "1" : "0");
      } catch {
        /* ignore */
      }
      return resolved;
    });
  }, []);

  return [collapsed, setPersistedCollapsed];
}
