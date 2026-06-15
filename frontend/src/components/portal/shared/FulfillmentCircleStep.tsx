"use client";

import React, { useMemo } from "react";
import { type OrderStatusDimension } from "./orderStatusDimensions";

export function FulfillmentCircleStep({
  label,
  status,
  completed = 0,
  total = 0,
  icon: Icon,
}: {
  label: string;
  status: OrderStatusDimension | undefined;
  completed?: number;
  total?: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  if (!status) return null;

  const radius = 15;
  const strokeWidth = 2.5;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = Math.max(total, 1);
  const progressRatio = Math.min(1, Math.max(0, completed / safeTotal));
  const dashOffset = circumference * (1 - progressRatio);

  let strokeColor = "stroke-slate-300 dark:stroke-slate-700";
  let textColor = "text-slate-700 dark:text-slate-350";
  let quantityColor = "text-slate-800 dark:text-slate-200";
  let bgColor = "bg-slate-50 dark:bg-slate-900/50";
  let ringColor = "ring-slate-200 dark:ring-white/5";

  if (status.tone === "success") {
    strokeColor = "stroke-emerald-500";
    textColor = "text-emerald-750 dark:text-emerald-400";
    quantityColor = "text-emerald-600 dark:text-emerald-400 font-extrabold";
    bgColor = "bg-emerald-500/5 dark:bg-emerald-950/20";
    ringColor = "ring-emerald-500/20 dark:ring-emerald-500/10";
  } else if (status.tone === "warning") {
    strokeColor = "stroke-amber-500";
    textColor = "text-amber-700 dark:text-amber-455";
    quantityColor = "text-amber-600 dark:text-amber-400 font-extrabold";
    bgColor = "bg-amber-500/5 dark:bg-amber-955/20";
    ringColor = "ring-amber-500/20 dark:ring-amber-500/10";
  } else if (status.tone === "danger") {
    strokeColor = "stroke-rose-500";
    textColor = "text-rose-700 dark:text-rose-455";
    quantityColor = "text-rose-600 dark:text-rose-400 font-extrabold";
    bgColor = "bg-rose-500/5 dark:bg-rose-950/20";
    ringColor = "ring-rose-500/20 dark:ring-rose-500/10";
  } else if (status.tone === "info") {
    strokeColor = "stroke-blue-500";
    textColor = "text-blue-700 dark:text-blue-450";
    quantityColor = "text-blue-600 dark:text-blue-400 font-extrabold";
    bgColor = "bg-blue-500/5 dark:bg-blue-955/20";
    ringColor = "ring-blue-500/20 dark:ring-blue-500/10";
  }

  const tooltipText = useMemo(
    () =>
      `${label}: ${status.label} (${completed}/${total} qty${status.detail ? ` · ${status.detail}` : ""})`,
    [label, status.label, status.detail, completed, total],
  );

  return (
    <div className="flex flex-col items-center min-w-[70px] group cursor-help" title={tooltipText}>
      <div
        className={`relative flex items-center justify-center h-9 w-9 rounded-full ring-1 ${ringColor} ${bgColor} ${textColor}`}
      >
        <svg
          className="absolute inset-0 h-full w-full transform -rotate-90 pointer-events-none"
          viewBox="0 0 36 36"
        >
          <circle
            cx="18"
            cy="18"
            r={radius}
            className="stroke-slate-200 dark:stroke-slate-800"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx="18"
            cy="18"
            r={radius}
            className={`${strokeColor} transition-[stroke-dashoffset] duration-300`}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <Icon className="h-3.5 w-3.5 z-10" />
      </div>
      <span className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-center">
        {label}
      </span>
      <span className={`text-[10px] font-bold tracking-tight ${quantityColor}`}>
        {completed} / {total}
      </span>
    </div>
  );
}
