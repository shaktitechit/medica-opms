"use client";

import { createContext, useContext } from "react";
import type { Dispatch, SetStateAction } from "react";

/**
 * Mobile drawer + desktop persistent sidebar orchestration (see {@link DashboardShell}).
 * Also carries desktop sidebar collapsed state so child components (NavControlPanel,
 * Topbar, Sidebar) can all read/toggle it without prop-drilling.
 */
const noop = () => {};

export type ShellNavContextValue = {
  mobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  /** Desktop-only: whether the sidebar is in its narrow/icon-only collapsed state. */
  desktopCollapsed: boolean;
  setDesktopCollapsed: Dispatch<SetStateAction<boolean>>;
};

export const ShellNavContext = createContext<ShellNavContextValue>({
  mobileNavOpen: false,
  openMobileNav: noop,
  closeMobileNav: noop,
  desktopCollapsed: true,
  setDesktopCollapsed: noop,
});

export function useShellNav() {
  return useContext(ShellNavContext);
}
