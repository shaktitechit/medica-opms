"use client";

import React from "react";

type OrderDueSheetBadgeProps = {
  uploaded?: boolean;
  className?: string;
};

export function OrderDueSheetBadge({ uploaded, className = "" }: OrderDueSheetBadgeProps) {
  if (uploaded) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-955/30 dark:text-emerald-400 dark:ring-emerald-500/25 ${className}`}
      >
        Due Sheet Uploaded
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-600/10 dark:bg-amber-955/30 dark:text-amber-400 dark:ring-amber-500/25 ${className}`}
    >
      Due Sheet Pending
    </span>
  );
}
