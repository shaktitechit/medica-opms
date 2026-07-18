"use client";

import { useMemo, useState } from "react";
import { Package, X } from "lucide-react";
import {
  largeModalBackdropClass,
  largeModalPanelClass,
} from "@/components/portal/shared/modalLayout";
import AdminPeriodFilter from "@/components/portal/admin/components/AdminPeriodFilter";
import { useAdminPeriodFilter } from "@/components/portal/admin/components/useAdminPeriodFilter";
import PeriodHeadingCaption from "@/components/portal/admin/components/PeriodHeadingCaption";
import ReportDownloadButton from "@/components/portal/admin/components/ReportDownloadButton";
import { formatPeriodLabel } from "@/components/portal/admin/components/periodFilterUtils";
import { downloadCsvFile, reportFilename } from "@/components/portal/admin/components/reportDownloadUtils";

interface SalesProductLeaderboardProps {
  orders: any[];
  isOrdersFetching: boolean;
}

type RateBucket = { qty: number; sr: number; sra: number; cr: number };

function normalizeRateType(raw: unknown): "SR" | "SRA" | "CR" | null {
  const rateType = !raw || raw === "MANUAL" ? "SR" : String(raw).toUpperCase();
  if (rateType === "SR" || rateType === "SRA" || rateType === "CR") return rateType;
  return null;
}

function itemNetQty(item: any): number {
  const del = Number(item.delivered_quantity) || 0;
  const ret = Number(item.returned_quantity) || 0;
  return del - ret;
}

function resolveProductName(item: any): string {
  return (
    item.product?.name ??
    item.product_name ??
    (typeof item.product === "object" ? item.product?.name : String(item.product ?? "")) ??
    "Unknown Product"
  );
}

export default function SalesProductLeaderboard({
  orders,
  isOrdersFetching,
}: SalesProductLeaderboardProps) {
  const [showAll, setShowAll] = useState(false);
  const {
    availableYears,
    selectedYears,
    setSelectedYears,
    selectedMonths,
    setSelectedMonths,
    filteredOrders,
  } = useAdminPeriodFilter(orders);

  const productQuantities = useMemo(() => {
    const map = new Map<string, RateBucket>();
    for (const o of filteredOrders) {
      const items = Array.isArray(o.order_items) ? o.order_items : [];
      for (const item of items) {
        const prodName = resolveProductName(item);
        if (!prodName) continue;
        const qty = itemNetQty(item);
        const bucket = map.get(prodName) ?? { qty: 0, sr: 0, sra: 0, cr: 0 };
        bucket.qty += qty;
        const rateType = normalizeRateType(item.applied_rate_type);
        if (rateType === "SR") bucket.sr += qty;
        else if (rateType === "SRA") bucket.sra += qty;
        else if (rateType === "CR") bucket.cr += qty;
        map.set(prodName, bucket);
      }
    }
    return Array.from(map.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.qty - a.qty);
  }, [filteredOrders]);

  const totals = useMemo(
    () =>
      productQuantities.reduce(
        (acc, p) => ({
          qty: acc.qty + p.qty,
          sr: acc.sr + p.sr,
          sra: acc.sra + p.sra,
          cr: acc.cr + p.cr,
        }),
        { qty: 0, sr: 0, sra: 0, cr: 0 }
      ),
    [productQuantities]
  );


  const handleDownload = () => {
    if (productQuantities.length === 0) return;
    const headers = ["Product", "Net Qty", "SR", "SRA", "CR"];
    const rows = productQuantities.map((r) => [r.name, r.qty, r.sr, r.sra, r.cr]);
    downloadCsvFile(
      reportFilename("salesproductleaderboard", selectedYears, selectedMonths),
      headers,
      rows,
      [
        `Report: SalesProductLeaderboard`,
        `Period: ${formatPeriodLabel(selectedYears, selectedMonths)}`,
      ],
    );
  };

  const periodFilter = (
    <AdminPeriodFilter
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
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Package className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 font-sans">
                    Top 5 Products
                  </h3>
                  <PeriodHeadingCaption
                    selectedYears={selectedYears}
                    selectedMonths={selectedMonths}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline cursor-pointer shrink-0"
              >
                View All
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {periodFilter}
              <ReportDownloadButton
                onDownload={handleDownload}
                disabled={isOrdersFetching || productQuantities.length === 0}
                size="sm"
              />
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-100/50 dark:border-white/5">
                  <th className="py-2 font-semibold">Product Name</th>
                  <th className="py-2 text-right font-semibold">Net Qty</th>
                  <th className="py-2 text-right font-semibold">SR</th>
                  <th className="py-2 text-right font-semibold">SRA</th>
                  <th className="py-2 text-right font-semibold">CR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {isOrdersFetching ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      <span className="inline-block h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ) : productQuantities.length > 0 ? (
                  productQuantities.slice(0, 5).map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/30 dark:hover:bg-white/5 transition-colors">
                      <td className="py-2.5 font-medium text-slate-800 dark:text-slate-250 pr-4 break-words">
                        {p.name}
                      </td>
                      <td className="py-2.5 text-right font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                        {p.qty.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {p.sr.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {p.sra.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {p.cr.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      No product data found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAll && (
        <div className={largeModalBackdropClass}>
          <div className={`${largeModalPanelClass} max-w-5xl h-[min(90vh,750px)]`}>
            <div className="flex flex-col gap-3 p-5 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-5 w-5 shrink-0 text-blue-600" />
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                      Product Sales breakdown (Net Quantity)
                    </h3>
                    <PeriodHeadingCaption
                      selectedYears={selectedYears}
                      selectedMonths={selectedMonths}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAll(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-250 cursor-pointer shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
              {periodFilter}
              <ReportDownloadButton
                onDownload={handleDownload}
                disabled={isOrdersFetching || productQuantities.length === 0}
                size="sm"
              />
            </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="text-slate-450 dark:text-slate-505 border-b border-slate-100 dark:border-white/5">
                    <th className="py-2 font-semibold">Product Name</th>
                    <th className="py-2 text-right font-semibold">Net Qty</th>
                    <th className="py-2 text-right font-semibold">SR</th>
                    <th className="py-2 text-right font-semibold">SRA</th>
                    <th className="py-2 text-right font-semibold">CR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {productQuantities.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/30 dark:hover:bg-white/5 transition-colors">
                      <td className="py-2.5 font-medium text-slate-800 dark:text-slate-250 pr-4 break-words">
                        {p.name}
                      </td>
                      <td className="py-2.5 text-right font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                        {p.qty.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {p.sr.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {p.sra.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {p.cr.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {productQuantities.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-slate-800/50">
                      <td className="py-3 font-bold text-slate-900 dark:text-slate-100 pr-4">
                        Total
                      </td>
                      <td className="py-3 text-right font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                        {totals.qty.toLocaleString()}
                      </td>
                      <td className="py-3 text-right font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                        {totals.sr.toLocaleString()}
                      </td>
                      <td className="py-3 text-right font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                        {totals.sra.toLocaleString()}
                      </td>
                      <td className="py-3 text-right font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                        {totals.cr.toLocaleString()}
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
        </div>
      )}
    </>
  );
}
