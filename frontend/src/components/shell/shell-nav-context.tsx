"use client";

import { createContext, useContext } from "react";

/**
 * Mobile drawer + desktop persistent sidebar orchestration (see {@link DashboardShell}).
 */
const noop = () => {};

export type ShellNavContextValue = {
  mobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
};

export const ShellNavContext = createContext<ShellNavContextValue>({
  mobileNavOpen: false,
  openMobileNav: noop,
  closeMobileNav: noop,
});

export function useShellNav() {
  return useContext(ShellNavContext);
}
