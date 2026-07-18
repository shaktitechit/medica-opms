"use client";

import type { HTMLAttributes, ReactNode } from "react";

import { LargeModalPortal } from "./LargeModalPortal";

type ModalOverlayProps = {
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">;

const DEFAULT_CLASS =
  "fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]";

/**
 * Full-viewport modal shell portaled to document.body (above Topbar / page overflow).
 */
export function ModalOverlay({
  children,
  className = DEFAULT_CLASS,
  ...rest
}: ModalOverlayProps) {
  return (
    <LargeModalPortal>
      <div className={className} {...rest}>
        {children}
      </div>
    </LargeModalPortal>
  );
}
