"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

import { PortalFullScreenLoader } from "./PortalFullScreenLoader";
import { useDelayedActive } from "./useDelayedActive";

export type PortalBusyOverlayProps = {
  active: boolean;
  message?: string;
  subMessage?: string;
  /** Avoid flash on sub-200ms operations */
  delayMs?: number;
  lockScroll?: boolean;
};

export function PortalBusyOverlay({
  active,
  message = "Loading…",
  subMessage,
  delayMs = 180,
  lockScroll = true,
}: PortalBusyOverlayProps) {
  const visible = useDelayedActive(active, delayMs);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!lockScroll || !visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible, lockScroll]);

  if (!mounted || !visible) return null;

  return createPortal(
    <PortalFullScreenLoader message={message} subMessage={subMessage} />,
    document.body,
  );
}

/** Combine multiple RTK / local busy flags into one overlay trigger. */
export function usePortalBusy(...flags: boolean[]): boolean {
  return flags.some(Boolean);
}
