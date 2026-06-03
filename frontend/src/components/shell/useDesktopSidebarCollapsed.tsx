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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (
        typeof window !== "undefined" &&
        localStorage.getItem(COLLAPSED_KEY) === "1"
      ) {
        setCollapsed(true);
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
