export const MONTH_OPTIONS = [
  { value: 0, label: "Jan" },
  { value: 1, label: "Feb" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Apr" },
  { value: 4, label: "May" },
  { value: 5, label: "Jun" },
  { value: 6, label: "Jul" },
  { value: 7, label: "Aug" },
  { value: 8, label: "Sep" },
  { value: 9, label: "Oct" },
  { value: 10, label: "Nov" },
  { value: 11, label: "Dec" },
] as const;

export type OrderYearMonth = { year: number; month: number };

export function getOrderYearMonth(order: unknown): OrderYearMonth | null {
  const row = order as {
    order_date?: unknown;
    created_at?: unknown;
    createdAt?: unknown;
  };
  const dateStr = row?.order_date ?? row?.created_at ?? row?.createdAt;
  if (!dateStr) return null;
  const d = new Date(String(dateStr));
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function collectAvailableYears(orders: unknown[]): number[] {
  const years = new Set<number>();
  for (const o of orders) {
    const ym = getOrderYearMonth(o);
    if (ym) years.add(ym.year);
  }
  years.add(new Date().getFullYear());
  return Array.from(years).sort((a, b) => b - a);
}

export function filterOrdersByPeriod(
  orders: unknown[],
  selectedYears: number[],
  selectedMonths: number[],
): unknown[] {
  if (selectedYears.length === 0 || selectedMonths.length === 0) return [];
  const yearSet = new Set(selectedYears);
  const monthSet = new Set(selectedMonths);
  return orders.filter((o) => {
    const ym = getOrderYearMonth(o);
    if (!ym) return false;
    return yearSet.has(ym.year) && monthSet.has(ym.month);
  });
}

export function formatMultiSelectLabel(
  selected: number[],
  allCount: number,
  singular: string,
  plural: string,
  resolveLabel?: (value: number) => string,
): string {
  if (selected.length === 0) return `Select ${singular}`;
  if (selected.length === 1) {
    const value = selected[0];
    return resolveLabel ? resolveLabel(value) : String(value);
  }
  if (selected.length === allCount) return `All ${plural}`;
  return `${selected.length} ${plural}`;
}

export const ALL_MONTHS = MONTH_OPTIONS.map((m) => m.value);
