"use client";

import React, { useMemo } from "react";
import { Flag } from "lucide-react";
import { useListFlagsQuery } from "@/store/api";

type OrderFlagBadgeProps = {
  orderId?: string;
  department?: string;
  status?: "none" | "resolved" | "unresolved";
  className?: string;
};

function extractFlags(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
    if (Array.isArray(o.flags)) return o.flags as Record<string, unknown>[];
  }
  return [];
}

export function OrderFlagBadge({
  orderId,
  department,
  status,
  className = "",
}: OrderFlagBadgeProps) {
  const { data: flagsData } = useListFlagsQuery({}, { skip: !orderId });

  const computedStatus = useMemo(() => {
    if (!orderId) return status ?? "none";
    const allFlags = extractFlags(flagsData);
    const orderFlags = allFlags.filter((f) => String(f.order || "") === orderId);

    if (orderFlags.length === 0) return "none";

    const matchingFlags = department
      ? orderFlags.filter((f) => String(f.department) === department)
      : orderFlags;

    if (matchingFlags.length === 0) return "none";

    const hasUnresolved = matchingFlags.some(
      (f) => f.status === "open" || f.status === "in_progress"
    );

    return hasUnresolved ? "unresolved" : "resolved";
  }, [flagsData, orderId, department, status]);

  if (computedStatus === "none") return null;

  if (computedStatus === "resolved") {
    return (
      <span
        title="All Flag(s) Resolved"
        className={`inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-955/30 dark:text-emerald-400 dark:ring-emerald-500/25 gap-1 select-none ${className}`}
      >
        <Flag className="h-3 w-3 fill-emerald-700 dark:fill-emerald-400 stroke-none" />
        Resolved
      </span>
    );
  }

  // computedStatus === "unresolved"
  return (
    <span
      title="Unresolved Flag(s) Exist"
      className={`inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-600/10 dark:bg-rose-955/30 dark:text-rose-400 dark:ring-rose-500/25 gap-1 select-none ${className}`}
    >
      <Flag className="h-3 w-3 fill-rose-700 dark:fill-rose-400 stroke-none animate-pulse" />
      Flagged
    </span>
  );
}
