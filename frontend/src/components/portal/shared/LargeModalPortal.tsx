"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders large portal modals on document.body so they are not clipped by
 * PageContent overflow / stacked under the shell Topbar.
 */
export function LargeModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
