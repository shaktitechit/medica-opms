"use client";

import { useEffect, useState } from "react";

/** Shows `active` only after `delayMs` to avoid flash on fast network responses. */
export function useDelayedActive(active: boolean, delayMs = 180): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return visible;
}
