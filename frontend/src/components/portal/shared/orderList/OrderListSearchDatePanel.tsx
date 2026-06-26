"use client";

import { Search, X } from "lucide-react";
import {
  DATE_FILTER_OPTIONS,
  dateFilterSelectClass,
  dateInputSelectClass,
} from "./orderListDateFilter";

type OrderListSearchDatePanelProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  dateFilter: string;
  onDateFilterChange: (value: string) => void;
  customDateFrom: string;
  customDateTo: string;
  onCustomDateFromChange: (value: string) => void;
  onCustomDateToChange: (value: string) => void;
  searchFocusClass?: string;
  desktopPlaceholder?: string;
  mobilePlaceholder?: string;
  compact?: boolean;
};

const defaultSearchFocus =
  "focus:border-blue-600 focus:ring-blue-500/25 dark:focus:border-blue-500";

export function OrderListSearchDatePanel({
  searchQuery,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  customDateFrom,
  customDateTo,
  onCustomDateFromChange,
  onCustomDateToChange,
  searchFocusClass = defaultSearchFocus,
  desktopPlaceholder = "Search universally by order # or party name across all tabs...",
  mobilePlaceholder = "Search order # or party…",
  compact = false,
}: OrderListSearchDatePanelProps) {
  const panelPadding = compact ? "p-2" : "p-2 sm:p-4";
  const desktopInputPy = compact ? "py-2" : "py-2.5";
  const dateSelectPy = compact ? "py-2 text-xs" : "py-2.5 text-sm";

  return (
    <div className={`relative shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 ${panelPadding}`}>
      {/* Mobile / small */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
              <Search className="h-3.5 w-3.5" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={mobilePlaceholder}
              className={`w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs text-slate-900 outline-none transition focus:ring-2 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 ${searchFocusClass}`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-2 text-slate-400 hover:text-slate-655"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select
            value={dateFilter}
            onChange={(e) => onDateFilterChange(e.target.value)}
            className={`${dateFilterSelectClass} max-w-[6.75rem]`}
            aria-label="Order date filter"
          >
            {DATE_FILTER_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {dateFilter === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customDateFrom}
              onChange={(e) => onCustomDateFromChange(e.target.value)}
              className={`${dateInputSelectClass} flex-1`}
              title="From date"
              aria-label="From date"
            />
            <span className="text-[10px] text-slate-400">—</span>
            <input
              type="date"
              value={customDateTo}
              onChange={(e) => onCustomDateToChange(e.target.value)}
              className={`${dateInputSelectClass} flex-1`}
              title="To date"
              aria-label="To date"
            />
          </div>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={desktopPlaceholder}
              className={`w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-900 outline-none transition focus:ring-2 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 ${desktopInputPy} ${searchFocusClass}`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3 text-slate-400 hover:text-slate-655"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Order Date
            </span>
            <select
              value={dateFilter}
              onChange={(e) => onDateFilterChange(e.target.value)}
              className={`${dateFilterSelectClass} min-w-[9rem] ${dateSelectPy}`}
              aria-label="Order date filter"
            >
              {DATE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            {dateFilter === "custom" && (
              <>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => onCustomDateFromChange(e.target.value)}
                  className={`${dateInputSelectClass} ${compact ? "py-2 text-xs" : "py-2.5 text-sm"}`}
                  title="From date"
                  aria-label="From date"
                />
                <span className="text-xs text-slate-400">—</span>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => onCustomDateToChange(e.target.value)}
                  className={`${dateInputSelectClass} ${compact ? "py-2 text-xs" : "py-2.5 text-sm"}`}
                  title="To date"
                  aria-label="To date"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
