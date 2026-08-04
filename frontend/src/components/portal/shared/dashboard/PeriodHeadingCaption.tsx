import { formatPeriodLabel } from "./periodFilterUtils";
import { DATE_FILTER_OPTIONS } from "../orderList/orderListDateFilter";

interface PeriodHeadingCaptionProps {
  selectedYears: number[];
  /** Omit for year-only charts (e.g. monthly performance). */
  selectedMonths?: number[];
  dateFilter?: string;
  customDateFrom?: string;
  customDateTo?: string;
  className?: string;
}

export function formatPeriodCaption(
  dateFilter?: string,
  customDateFrom: string = "",
  customDateTo: string = "",
  selectedYears: number[] = [],
  selectedMonths?: number[],
): string {
  if (dateFilter && dateFilter !== "all") {
    if (dateFilter === "custom") {
      const fromStr = customDateFrom || "Start";
      const toStr = customDateTo || "End";
      return `${fromStr} to ${toStr}`;
    } else {
      return DATE_FILTER_OPTIONS.find((opt) => opt.id === dateFilter)?.label ?? dateFilter;
    }
  } else {
    return formatPeriodLabel(selectedYears, selectedMonths);
  }
}

/** Shows the active year/month filter under a report title. */
export default function PeriodHeadingCaption({
  selectedYears,
  selectedMonths,
  dateFilter,
  customDateFrom = "",
  customDateTo = "",
  className = "",
}: PeriodHeadingCaptionProps) {
  const label = formatPeriodCaption(dateFilter, customDateFrom, customDateTo, selectedYears, selectedMonths);

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
