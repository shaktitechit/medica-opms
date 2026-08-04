"use client";

import { useMemo, useState } from "react";
import { Briefcase, X } from "lucide-react";
import { LargeModalBackdrop } from "@/components/portal/shared/LargeModalBackdrop";
import { largeModalPanelClass } from "@/components/portal/shared/modalLayout";
import { resolveUserDisplay } from "@/components/portal/shared/userDisplay";
import PeriodFilter from "./PeriodFilter";
import { usePeriodFilter } from "./usePeriodFilter";
import PeriodHeadingCaption from "./PeriodHeadingCaption";
import ReportDownloadButton from "./ReportDownloadButton";
import { formatPeriodLabel } from "./periodFilterUtils";
import { downloadCsvFile, reportFilename } from "./reportDownloadUtils";
import { shouldIncludeOrder } from "./featuredMatrixUtils";

interface SalesLeaderboardProps {
  orders: any[];
  isOrdersFetching: boolean;
  userNameById: Record<string, string>;
  disableInternalFilter?: boolean;
}

import {
  Metric,
  QtyBasis,
  RateBucket,
  normalizeRateType,
  itemMetricValue,
  formatMetricValue,
} from "./leaderboardUtils";

function resolveSalesPersonName(
  order: any,
  userNameById: Record<string, string>,
): string {
  const label = resolveUserDisplay(order?.assigned_sales_user, userNameById);
  return !label || label === "—" ? "Unassigned" : label;
}

export default function SalesLeaderboard({
  orders,
  isOrdersFetching,
  userNameById,
  disableInternalFilter = true,
}: SalesLeaderboardProps) {
  const [showAll, setShowAll] = useState(false);
  const [metric, setMetric] = useState<Metric>("quantity");
  const [qtyBasis, setQtyBasis] = useState<QtyBasis>("approved");
  const {
    availableYears,
    selectedYears,
    setSelectedYears,
    selectedMonths,
    setSelectedMonths,
    filteredOrders,
  } = usePeriodFilter(orders);

  const displayOrders = disableInternalFilter ? orders : filteredOrders;

  const salesRows = useMemo(() => {
    const map = new Map<string, RateBucket>();
    for (const o of displayOrders) {
      if (!shouldIncludeOrder(o, qtyBasis)) continue;
      const salesLabel = resolveSalesPersonName(o, userNameById);
      const items = Array.isArray(o.order_items) ? o.order_items : [];
      const bucket = map.get(salesLabel) ?? { total: 0, sr: 0, sra: 0, cr: 0 };
      for (const item of items) {
        const value = itemMetricValue(item, metric, qtyBasis);
        bucket.total += value;
        const rateType = normalizeRateType(item.applied_rate_type);
        if (rateType === "SR") bucket.sr += value;
        else if (rateType === "SRA") bucket.sra += value;
        else if (rateType === "CR") bucket.cr += value;
      }
      map.set(salesLabel, bucket);
    }
    return Array.from(map.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.total - a.total);
  }, [filteredOrders, userNameById, metric, qtyBasis]);

  const totals = useMemo(
    () =>
      salesRows.reduce(
        (acc, p) => ({
          total: acc.total + p.total,
          sr: acc.sr + p.sr,
          sra: acc.sra + p.sra,
          cr: acc.cr + p.cr,
        }),
        { total: 0, sr: 0, sra: 0, cr: 0 }
      ),
    [salesRows]
  );

  const valueLabel =
    qtyBasis === "dispatched"
      ? metric === "quantity"
        ? "Dispatched Qty"
        : "Dispatched Vol"
      : metric === "quantity"
        ? "Approved Qty"
        : "Approved Vol";
  const breakdownTitle =
    qtyBasis === "dispatched"
      ? metric === "quantity"
        ? "Sales Person breakdown (Dispatched Quantity)"
        : "Sales Person breakdown (Dispatched Volume)"
      : metric === "quantity"
        ? "Sales Person breakdown (Approved Quantity)"
        : "Sales Person breakdown (Approved Volume)";

  const basisToggle = (
    <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
      <button
        type="button"
        onClick={() => setQtyBasis("approved")}
        className={`rounded-md px-2.5 py-1 text-2xs font-semibold transition cursor-pointer ${
          qtyBasis === "approved"
            ? "bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-300"
            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        }`}
      >
        Approved
      </button>
      <button
        type="button"
        onClick={() => setQtyBasis("dispatched")}
        className={`rounded-md px-2.5 py-1 text-2xs font-semibold transition cursor-pointer ${
          qtyBasis === "dispatched"
            ? "bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-300"
            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        }`}
      >
        Dispatched
      </button>
    </div>
  );

  const metricToggle = (
    <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
      <button
        type="button"
        onClick={() => setMetric("quantity")}
        className={`rounded-md px-2.5 py-1 text-2xs font-semibold transition cursor-pointer ${
          metric === "quantity"
            ? "bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-300"
            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        }`}
      >
        Quantity
      </button>
      <button
        type="button"
        onClick={() => setMetric("volume")}
        className={`rounded-md px-2.5 py-1 text-2xs font-semibold transition cursor-pointer ${
          metric === "volume"
            ? "bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-300"
            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        }`}
      >
        Volume
      </button>
    </div>
  );

  const handleDownload = () => {
    if (salesRows.length === 0) return;
    const headers = ["Sales Person", valueLabel, "SR", "SRA", "CR"];
    const rows = salesRows.map((r) => [r.name, r.total, r.sr, r.sra, r.cr]);
    downloadCsvFile(
      reportFilename("sales_leaderboard", selectedYears, selectedMonths),
      headers,
      rows,
      [
        `Report: SalesLeaderboard`,
        `Period: ${formatPeriodLabel(selectedYears, selectedMonths)}`,
        `Metric: ${metric}`,
        `Basis: ${qtyBasis}`,
      ],
    );
  };

  const periodFilter = (
    <PeriodFilter
      availableYears={availableYears}
      selectedYears={selectedYears}
      selectedMonths={selectedMonths}
      onYearsChange={setSelectedYears}
      onMonthsChange={setSelectedMonths}
      size="sm"
    />
  );

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 flex flex-col justify-between">
        <div>
          <div className="flex flex-col gap-3 pb-4 border-b border-slate-100 dark:border-white/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Briefcase className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 font-sans">
                    Top 5 Sales Persons
                  </h3>
                  <PeriodHeadingCaption
                    selectedYears={selectedYears}
                    selectedMonths={selectedMonths}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {basisToggle}
                {metricToggle}
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 hover:underline cursor-pointer"
                >
                  View All
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ReportDownloadButton
                onDownload={handleDownload}
                disabled={isOrdersFetching || salesRows.length === 0}
                size="sm"
              />
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="text-slate-400 dark:text-slate-505 border-b border-slate-100/50 dark:border-white/5 divide-x divide-slate-100/70 dark:divide-white/5">
                  <th className="py-2 pr-2 font-semibold">Sales Person</th>
                  <th className="py-2 px-2 text-right font-semibold">{valueLabel}</th>
                  <th className="py-2 px-2 text-right font-semibold">SR</th>
                  <th className="py-2 px-2 text-right font-semibold">SRA</th>
                  <th className="py-2 pl-2 text-right font-semibold">CR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {isOrdersFetching ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      <span className="inline-block h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ) : salesRows.length > 0 ? (
                  salesRows.slice(0, 5).map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/30 dark:hover:bg-white/5 transition-colors divide-x divide-slate-100/70 dark:divide-white/5">
                      <td className="py-2.5 font-medium text-slate-800 dark:text-slate-250 pr-2 break-words">
                        {p.name}
                      </td>
                      <td className="py-2.5 px-2 text-right font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                        {formatMetricValue(p.total, metric)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatMetricValue(p.sr, metric)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatMetricValue(p.sra, metric)}
                      </td>
                      <td className="py-2.5 pl-2 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatMetricValue(p.cr, metric)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      No sales person data found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAll && (
        <LargeModalBackdrop>
          <div className={`${largeModalPanelClass} max-w-5xl h-[min(90vh,750px)]`}>
            <div className="flex flex-col gap-3 p-5 border-b border-slate-100 dark:border-white/5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Briefcase className="h-5 w-5 shrink-0 text-violet-600" />
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                      {breakdownTitle}
                    </h3>
                    <PeriodHeadingCaption
                      selectedYears={selectedYears}
                      selectedMonths={selectedMonths}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {basisToggle}
                  {metricToggle}
                  <button
                    type="button"
                    onClick={() => setShowAll(false)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-250 cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ReportDownloadButton
                  onDownload={handleDownload}
                  disabled={isOrdersFetching || salesRows.length === 0}
                  size="sm"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="text-slate-455 dark:text-slate-505 border-b border-slate-100 dark:border-white/5 divide-x divide-slate-100/70 dark:divide-white/5">
                    <th className="py-2 pr-2 font-semibold">Sales Person</th>
                    <th className="py-2 px-2 text-right font-semibold">{valueLabel}</th>
                    <th className="py-2 px-2 text-right font-semibold">SR</th>
                    <th className="py-2 px-2 text-right font-semibold">SRA</th>
                    <th className="py-2 pl-2 text-right font-semibold">CR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {salesRows.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/30 dark:hover:bg-white/5 transition-colors divide-x divide-slate-100/70 dark:divide-white/5">
                      <td className="py-2.5 font-medium text-slate-800 dark:text-slate-250 pr-2 break-words">
                        {p.name}
                      </td>
                      <td className="py-2.5 px-2 text-right font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                        {formatMetricValue(p.total, metric)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatMetricValue(p.sr, metric)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatMetricValue(p.sra, metric)}
                      </td>
                      <td className="py-2.5 pl-2 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatMetricValue(p.cr, metric)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {salesRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-slate-800/50 divide-x divide-slate-100/70 dark:divide-white/5">
                      <td className="py-3 font-bold text-slate-900 dark:text-slate-100 pr-2">
                        Total
                      </td>
                      <td className="py-3 px-2 text-right font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                        {formatMetricValue(totals.total, metric)}
                      </td>
                      <td className="py-3 px-2 text-right font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                        {formatMetricValue(totals.sr, metric)}
                      </td>
                      <td className="py-3 px-2 text-right font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                        {formatMetricValue(totals.sra, metric)}
                      </td>
                      <td className="py-3 pl-2 text-right font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                        {formatMetricValue(totals.cr, metric)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-white/5">
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </LargeModalBackdrop>
      )}
    </>
  );
}
