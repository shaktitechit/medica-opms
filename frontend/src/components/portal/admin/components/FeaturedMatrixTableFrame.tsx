"use client";

import type { ReactNode } from "react";
import type { MatrixMetric } from "./featuredMatrixUtils";
import AdminPeriodFilter from "./AdminPeriodFilter";

interface FeaturedMatrixTableFrameProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  accentClass: string;
  metric?: MatrixMetric;
  onMetricChange?: (metric: MatrixMetric) => void;
  /** When false, hides Quantity/Volume toggle (e.g. sales portal quantity-only). */
  showMetricToggle?: boolean;
  availableYears: number[];
  selectedYears: number[];
  selectedMonths: number[];
  onYearsChange: (years: number[]) => void;
  onMonthsChange: (months: number[]) => void;
  children: ReactNode;
}

export default function FeaturedMatrixTableFrame({
  title,
  subtitle,
  icon,
  accentClass,
  metric,
  onMetricChange,
  showMetricToggle = true,
  availableYears,
  selectedYears,
  selectedMonths,
  onYearsChange,
  onMonthsChange,
  children,
}: FeaturedMatrixTableFrameProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-white/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className={`mt-0.5 shrink-0 ${accentClass}`}>{icon}</span>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 font-sans">
                {title}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {showMetricToggle && onMetricChange && (
              <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => onMetricChange("quantity")}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition cursor-pointer ${
                    metric === "quantity"
                      ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  Quantity
                </button>
                <button
                  type="button"
                  onClick={() => onMetricChange("volume")}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition cursor-pointer ${
                    metric === "volume"
                      ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  Volume
                </button>
              </div>
            )}
            <AdminPeriodFilter
              availableYears={availableYears}
              selectedYears={selectedYears}
              selectedMonths={selectedMonths}
              onYearsChange={onYearsChange}
              onMonthsChange={onMonthsChange}
              size="sm"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">{children}</div>
    </div>
  );
}
