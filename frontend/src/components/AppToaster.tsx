"use client";

import { useSyncExternalStore } from "react";
import { Toaster } from "sonner";

function subscribeDark(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function prefersDarkSnapshot() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function prefersDarkServerFallback() {
  return false;
}

export function AppToaster() {
  const dark = useSyncExternalStore(
    subscribeDark,
    prefersDarkSnapshot,
    prefersDarkServerFallback,
  );

  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      duration={4200}
      theme={dark ? "dark" : "light"}
    />
  );
}
