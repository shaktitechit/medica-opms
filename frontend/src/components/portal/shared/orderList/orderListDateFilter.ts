export const DATE_FILTER_OPTIONS = [
  { id: "all", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_week", label: "Last 7 Days" },
  { id: "last_month", label: "Last Month" },
  { id: "custom", label: "Custom Range" },
] as const;

export type DateFilterId = (typeof DATE_FILTER_OPTIONS)[number]["id"];

function toDay(v: unknown): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Client-side order date filter using order_date (falls back to created timestamps). */
export function orderMatchesDateFilter(
  order: Record<string, unknown>,
  dateFilter: string,
  customDateFrom: string,
  customDateTo: string,
): boolean {
  if (dateFilter === "all") return true;

  const now = new Date();
  let dateFrom: Date | null = null;
  let dateTo: Date | null = null;

  if (dateFilter === "today") {
    dateFrom = startOfDay(now);
    dateTo = endOfDay(now);
  } else if (dateFilter === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    dateFrom = startOfDay(y);
    dateTo = endOfDay(y);
  } else if (dateFilter === "last_week") {
    const w = new Date(now);
    w.setDate(w.getDate() - 7);
    dateFrom = startOfDay(w);
    dateTo = endOfDay(now);
  } else if (dateFilter === "last_month") {
    const m = new Date(now);
    m.setMonth(m.getMonth() - 1);
    dateFrom = startOfDay(m);
    dateTo = endOfDay(now);
  } else if (dateFilter === "custom") {
    if (customDateFrom) dateFrom = startOfDay(new Date(customDateFrom));
    if (customDateTo) dateTo = endOfDay(new Date(customDateTo));
  }

  if (!dateFrom && !dateTo) return true;

  const raw = order.order_date ?? order.created_at ?? order.createdAt;
  const d = toDay(raw);
  if (!d) return false;
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;
  return true;
}

export const dateFilterSelectClass =
  "shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none transition focus:border-purple-600 focus:ring-2 focus:ring-purple-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 cursor-pointer";

export const dateInputSelectClass =
  "min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none transition focus:border-purple-600 focus:ring-2 focus:ring-purple-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 cursor-pointer";
