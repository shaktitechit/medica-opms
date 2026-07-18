"use client";

import type { ReactNode } from "react";

import { LargeModalPortal } from "./LargeModalPortal";
import { largeModalBackdropClass } from "./modalLayout";

type LargeModalBackdropProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Full-viewport large-modal shell portaled to document.body so it is not clipped
 * by PageContent overflow or stacked under the shell Topbar / tables.
 */
export function LargeModalBackdrop({ children, className }: LargeModalBackdropProps) {
  const classes = className
    ? `${largeModalBackdropClass} ${className}`
    : largeModalBackdropClass;

  return (
    <LargeModalPortal>
      <div className={classes}>{children}</div>
    </LargeModalPortal>
  );
}
