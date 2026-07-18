"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  ALL_MONTHS,
  MONTH_OPTIONS,
  formatMultiSelectLabel,
} from "./periodFilterUtils";

interface AdminPeriodFilterProps {
  availableYears: number[];
  selectedYears: number[];
  selectedMonths: number[];
  onYearsChange: (years: number[]) => void;
  onMonthsChange: (months: number[]) => void;
  /** Visual density for leaderboard headers vs KPI row */
  size?: "sm" | "md";
}

function MultiSelectMenu({
  label,
  buttonLabel,
  options,
  selected,
  onToggle,
  size,
}: {
  label: string;
  buttonLabel: string;
  options: { value: number; label: string }[];
  selected: number[];
  onToggle: (value: number) => void;
  size: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const btnClass =
    size === "sm"
      ? "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-2xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
      : "flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer";

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={btnClass}>
        <span className="text-slate-500 dark:text-slate-400 font-medium">{label}</span>
        <span>{buttonLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-slate-400 dark:border-white/5">
            Select {label.toLowerCase()}
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => onToggle(opt.value)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer"
                  >
                    <span>{opt.label}</span>
                    {checked ? (
                      <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded border border-slate-300 dark:border-slate-600" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AdminPeriodFilter({
  availableYears,
  selectedYears,
  selectedMonths,
  onYearsChange,
  onMonthsChange,
  size = "md",
}: AdminPeriodFilterProps) {
  const toggleYear = (year: number) => {
    if (selectedYears.includes(year)) {
      if (selectedYears.length === 1) return;
      onYearsChange(selectedYears.filter((y) => y !== year));
      return;
    }
    onYearsChange([...selectedYears, year].sort((a, b) => b - a));
  };

  const toggleMonth = (month: number) => {
    if (selectedMonths.includes(month)) {
      if (selectedMonths.length === 1) return;
      onMonthsChange(selectedMonths.filter((m) => m !== month).sort((a, b) => a - b));
      return;
    }
    onMonthsChange([...selectedMonths, month].sort((a, b) => a - b));
  };

  const yearLabel = formatMultiSelectLabel(
    selectedYears,
    availableYears.length,
    "year",
    "years",
  );

  const monthLabel = formatMultiSelectLabel(
    selectedMonths,
    ALL_MONTHS.length,
    "month",
    "months",
    (value) => MONTH_OPTIONS.find((m) => m.value === value)?.label ?? String(value),
  );

  const yearOptions = availableYears.map((y) => ({ value: y, label: String(y) }));
  const monthOptions = MONTH_OPTIONS.map((m) => ({ value: m.value, label: m.label }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={
          size === "sm"
            ? "text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
            : "text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
        }
      >
        Filter
      </span>
      <MultiSelectMenu
        label="Year"
        buttonLabel={yearLabel}
        options={yearOptions}
        selected={selectedYears}
        onToggle={toggleYear}
        size={size}
      />
      <MultiSelectMenu
        label="Month"
        buttonLabel={monthLabel}
        options={monthOptions}
        selected={selectedMonths}
        onToggle={toggleMonth}
        size={size}
      />
    </div>
  );
}
