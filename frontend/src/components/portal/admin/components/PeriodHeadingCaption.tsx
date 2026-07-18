"use client";

import { formatPeriodLabel } from "./periodFilterUtils";

interface PeriodHeadingCaptionProps {
  selectedYears: number[];
  /** Omit for year-only charts (e.g. monthly performance). */
  selectedMonths?: number[];
  className?: string;
}

/** Shows the active year/month filter under a report title. */
export default function PeriodHeadingCaption({
  selectedYears,
  selectedMonths,
  className = "",
}: PeriodHeadingCaptionProps) {
  const label = formatPeriodLabel(selectedYears, selectedMonths);
  if (!label) return null;

  return (
    <p
      className={`mt-0.5 text-xs font-medium leading-snug text-slate-500 dark:text-slate-400 ${className}`}
    >
      <span className="font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Period
      </span>
      <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
      <span className="tabular-nums text-slate-700 dark:text-slate-200">{label}</span>
    </p>
  );
}
