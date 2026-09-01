"use client";

import { X } from "lucide-react";
import { PRIORITY_OPTIONS } from "@/components/portal/shared/orderStatusOptions";
import { getOrderListTabIcon } from "./orderListTabIcons";

type TabItem = { id: string; label: string };

type FilterOption = { value: string; label: string };

type OrderListBottomTabStripProps = {
  tabs: readonly TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  filteredCount: number;
  /** Per-tab counts (Quick Access sync). Falls back to filteredCount for active tab. */
  tabCounts?: Record<string, number>;
  isFetching?: boolean;
  searchQuery: string;
  onClearSearch: () => void;
  priorityFilter: string;
  onPriorityFilterChange: (value: string) => void;
  /** Label for the right-corner select (defaults to "Priority"). */
  filterLabel?: string;
  /** Options for the right-corner select (defaults to All + priority levels). */
  filterOptions?: readonly FilterOption[];
  showReset?: boolean;
  onReset?: () => void;
  accentActiveClass?: string;
  searchResultAccentClass?: string;
  countBadgeClass?: string;
  compact?: boolean;
};

const defaultAccent =
  "border-primary text-primary dark:border-primary dark:text-primary";

export function OrderListBottomTabStrip({
  tabs,
  activeTab,
  onTabChange,
  filteredCount,
  tabCounts,
  isFetching = false,
  searchQuery,
  onClearSearch,
  priorityFilter,
  onPriorityFilterChange,
  filterLabel = "Priority",
  filterOptions,
  showReset = false,
  onReset,
  accentActiveClass = defaultAccent,
  searchResultAccentClass = "text-primary dark:text-primary",
  countBadgeClass = "bg-primary",
  compact = false,
}: OrderListBottomTabStripProps) {
  const tabPy = compact ? "py-2 sm:py-2" : "py-2.5 sm:py-3";
  const filterPy = compact ? "py-1.5" : "py-2";

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white/95 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-screen-2xl flex-col sm:flex-row sm:items-center sm:justify-between">
        {searchQuery.trim() ? (
          <div className="flex items-center gap-2.5 px-4 py-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Showing{" "}
              <span className={`font-bold ${searchResultAccentClass}`}>{filteredCount}</span> result
              {filteredCount !== 1 ? "s" : ""} for{" "}
              <span className="italic font-bold text-slate-900 dark:text-slate-100">
                &quot;{searchQuery}&quot;
              </span>
            </span>
            <button
              type="button"
              onClick={onClearSearch}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
        ) : (
          <nav className="flex overflow-x-auto scrollbar-none px-1 sm:px-2" aria-label="Order stages">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const TabIcon = getOrderListTabIcon(tab.id);
              const count =
                tabCounts?.[tab.id] ?? (isActive ? filteredCount : undefined);
              const showCount = count != null && !isFetching;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  title={`${tab.label}${showCount ? ` (${count})` : ""}`}
                  aria-label={tab.label}
                  className={`relative inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-t-2 px-2 text-xs font-semibold transition sm:px-3 md:px-3 ${tabPy} ${
                    isActive ? accentActiveClass : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <TabIcon className="h-4 w-4 shrink-0 md:hidden" aria-hidden />
                  <span className="hidden md:inline">{tab.label}</span>
                  {showCount && (
                    <>
                      <span
                        className={`hidden rounded-full px-1.5 py-0.5 text-2xs font-bold md:inline ${
                          isActive
                            ? "bg-primary-muted text-primary border border-primary/20"
                            : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                        }`}
                      >
                        {count}
                      </span>
                      {isActive && (
                        <span
                          className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-2xs font-bold text-white md:hidden ${countBadgeClass}`}
                        >
                          {count}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        <div className={`flex shrink-0 items-center gap-2 border-t border-slate-100 px-4 dark:border-white/5 sm:border-t-0 ${filterPy}`}>
          <label className="whitespace-nowrap text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {filterLabel}
          </label>
          <select
            value={priorityFilter}
            onChange={(e) => onPriorityFilterChange(e.target.value)}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
          >
            {filterOptions ? (
              filterOptions.map((opt, i) => (
                <option key={`${opt.value}:${i}`} value={opt.value}>
                  {opt.label}
                </option>
              ))
            ) : (
              <>
                <option value="all">All</option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </>
            )}
          </select>
          {showReset && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="cursor-pointer text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
