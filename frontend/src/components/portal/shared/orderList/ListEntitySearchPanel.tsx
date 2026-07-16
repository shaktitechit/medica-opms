"use client";

import { Search, X } from "lucide-react";
import { dateFilterSelectClass } from "./orderListDateFilter";

export type ListEntitySelectFilter = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  ariaLabel: string;
  /** Shown next to the select on desktop (optional). */
  label?: string;
  className?: string;
};

type ListEntitySearchPanelProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  desktopPlaceholder?: string;
  mobilePlaceholder?: string;
  filters?: ReadonlyArray<ListEntitySelectFilter>;
  searchFocusClass?: string;
  compact?: boolean;
};

const defaultSearchFocus =
  "focus:border-blue-600 focus:ring-blue-500/25 dark:focus:border-blue-500";

export function ListEntitySearchPanel({
  searchQuery,
  onSearchChange,
  desktopPlaceholder = "Search…",
  mobilePlaceholder = "Search…",
  filters = [],
  searchFocusClass = defaultSearchFocus,
  compact = false,
}: ListEntitySearchPanelProps) {
  const panelPadding = compact ? "p-2" : "p-2 sm:p-4";
  const desktopInputPy = compact ? "py-2" : "py-2.5";
  const selectPy = compact ? "py-2 text-xs" : "py-2.5 text-sm";

  return (
    <div
      className={`relative shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 ${panelPadding}`}
    >
      {/* Mobile */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="relative min-w-0">
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
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {filters.length > 0 ? (
          <div className="flex items-center gap-2">
            {filters.map((f) => (
              <select
                key={f.id}
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                aria-label={f.ariaLabel}
                className={`${dateFilterSelectClass} min-w-0 flex-1 ${f.className ?? ""}`}
              >
                {f.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ))}
          </div>
        ) : null}
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
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {filters.map((f) => (
            <div key={f.id} className="flex shrink-0 flex-wrap items-center gap-2">
              {f.label ? (
                <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {f.label}
                </span>
              ) : null}
              <select
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                aria-label={f.ariaLabel}
                className={`${dateFilterSelectClass} min-w-[9rem] ${selectPy} ${f.className ?? ""}`}
              >
                {f.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
