"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";

import { downloadCsvFile } from "@/components/portal/shared/dashboard/reportDownloadUtils";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { toast } from "@/lib/toast";
import {
  useLazyListWorkPlanExpensesQuery,
  type WorkPlanExpenseRecord,
} from "@/store/api";
import {
  formatPlanDate,
  planIdOf,
  renderExpenseStatusBadge,
} from "./workPlanUtils";

export type DownloadExpensesModalProps = {
  open: boolean;
  onClose: () => void;
};

type PeriodPreset = "current_month" | "last_month" | "custom";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthRange(offsetMonths: number): { from: string; to: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths + 1, 0),
  );
  return { from: ymd(start), to: ymd(end) };
}

function planRef(exp: WorkPlanExpenseRecord) {
  const wp = exp.work_plan;
  if (!wp || typeof wp === "string") {
    return { id: String(wp || ""), plan_date: undefined, location: undefined as string | undefined };
  }
  return {
    id: planIdOf(wp),
    plan_date: wp.plan_date,
    location: wp.location,
  };
}

function formatMoney(n?: number) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function visitLabel(exp: WorkPlanExpenseRecord) {
  const visit = exp.work_plan_visit;
  if (!visit) return "Plan-level";
  if (typeof visit === "string") return "Visit";
  const party =
    (typeof visit.party === "object" && visit.party?.party_name) ||
    visit.party_name ||
    "";
  const seq = visit.sequence != null ? `#${visit.sequence}` : "Visit";
  return party ? `${seq} — ${party}` : seq;
}

function attachmentName(
  att: WorkPlanExpenseRecord["receipt_attachment"],
): string {
  if (!att) return "";
  if (typeof att === "string") return "Attached";
  return att.original_name || att.file_name || "Attached";
}

function readingValue(n?: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return String(n);
}

export function DownloadExpensesModal({ open, onClose }: DownloadExpensesModalProps) {
  const [preset, setPreset] = useState<PeriodPreset>("current_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rows, setRows] = useState<WorkPlanExpenseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchList] = useLazyListWorkPlanExpensesQuery();

  const range = useMemo(() => {
    if (preset === "current_month") return monthRange(0);
    if (preset === "last_month") return monthRange(-1);
    return { from: customFrom, to: customTo };
  }, [preset, customFrom, customTo]);

  const canLoad =
    Boolean(range.from && range.to) &&
    (preset !== "custom" || (customFrom && customTo && customFrom <= customTo));

  const loadExpenses = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    try {
      const all: WorkPlanExpenseRecord[] = [];
      let page = 1;
      let pages = 1;
      const limit = 200;
      do {
        const result = await fetchList({
          page,
          limit,
          from: range.from,
          to: range.to,
        }).unwrap();
        all.push(...(result.data ?? []));
        pages = Math.max(result.pages || 1, 1);
        page += 1;
      } while (page <= pages);
      setRows(all);
    } catch {
      toast.error("Failed to load expenses for download");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canLoad, fetchList, range.from, range.to]);

  useEffect(() => {
    if (!open) return;
    setPreset("current_month");
    setCustomFrom("");
    setCustomTo("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (preset === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      setRows([]);
      return;
    }
    void loadExpenses();
  }, [open, preset, customFrom, customTo, loadExpenses]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, loading, onClose]);

  const totalAmount = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [rows],
  );

  const handleDownloadCsv = () => {
    if (rows.length === 0) {
      toast.error("No expenses to download");
      return;
    }
    const headers = [
      "Expense date",
      "Plan date",
      "Location",
      "Visit",
      "Category",
      "Sub-category",
      "Start reading",
      "Closing reading",
      "Start reading image",
      "End reading image",
      "Amount",
      "Payment",
      "Status",
      "Vendor",
      "Bill number",
      "Description",
      "Receipt",
    ];
    const csvRows = rows.map((r) => {
      const plan = planRef(r);
      const isPrivateBike = r.sub_category === "Private Bike";
      return [
        formatPlanDate(r.expense_date),
        formatPlanDate(plan.plan_date),
        plan.location || "",
        visitLabel(r),
        r.category || "",
        r.sub_category || "",
        isPrivateBike ? readingValue(r.start_reading) : "",
        isPrivateBike ? readingValue(r.closing_reading) : "",
        isPrivateBike ? attachmentName(r.start_reading_image) : "",
        isPrivateBike ? attachmentName(r.end_reading_image) : "",
        Number(r.amount) || 0,
        r.payment_mode || "",
        r.status || "",
        r.vendor_name || "",
        r.bill_number || "",
        r.description || "",
        attachmentName(r.receipt_attachment),
      ];
    });
    downloadCsvFile(
      `sales_expenses_${range.from}_to_${range.to}.csv`,
      headers,
      csvRows,
      [
        `Sales expenses export`,
        `Period: ${range.from} to ${range.to}`,
        `Rows: ${rows.length}`,
        `Total amount: ${formatMoney(totalAmount)}`,
      ],
    );
    toast.success("Expense CSV downloaded");
  };

  if (!open) return null;

  return (
    <LargeModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-[1px]"
        role="presentation"
        onClick={() => !loading && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Download expenses"
          className="relative flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/10 sm:px-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Download expenses
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Choose a period to load your expenses, then download as CSV
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={loading || rows.length === 0}
                onClick={handleDownloadCsv}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Download CSV
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/10 sm:px-5">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                Period
              </label>
              <select
                value={preset}
                disabled={loading}
                onChange={(e) => setPreset(e.target.value as PeriodPreset)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
              >
                <option value="current_month">Current month</option>
                <option value="last_month">Last month</option>
                <option value="custom">Custom date range</option>
              </select>
            </div>
            {preset === "custom" ? (
              <>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">
                    From
                  </label>
                  <input
                    type="date"
                    value={customFrom}
                    disabled={loading}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">
                    To
                  </label>
                  <input
                    type="date"
                    value={customTo}
                    disabled={loading}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
                  />
                </div>
              </>
            ) : (
              <div className="pb-1.5 text-xs text-slate-500 dark:text-slate-400">
                {range.from} → {range.to}
              </div>
            )}
            <div className="ml-auto pb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              {rows.length} expense{rows.length === 1 ? "" : "s"} · Total{" "}
              {formatMoney(totalAmount)}
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto">
            <PortalBusyOverlay active={loading} message="Loading expenses…" />
            {preset === "custom" && (!customFrom || !customTo) ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Select a from and to date to load expenses.
              </div>
            ) : rows.length === 0 && !loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No expenses found for this period.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Expense date</th>
                    <th className="px-3 py-2.5 font-semibold">Plan date</th>
                    <th className="px-3 py-2.5 font-semibold">Location</th>
                    <th className="px-3 py-2.5 font-semibold">Visit</th>
                    <th className="px-3 py-2.5 font-semibold">Category</th>
                    <th className="px-3 py-2.5 font-semibold">Meter reading</th>
                    <th className="px-3 py-2.5 font-semibold">Amount</th>
                    <th className="px-3 py-2.5 font-semibold">Payment</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const plan = planRef(row);
                    const isPrivateBike = row.sub_category === "Private Bike";
                    return (
                      <tr
                        key={planIdOf(row)}
                        className="border-t border-slate-100 dark:border-white/5"
                      >
                        <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                          {formatPlanDate(row.expense_date)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          {formatPlanDate(plan.plan_date)}
                        </td>
                        <td className="max-w-[140px] truncate px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          {plan.location || "—"}
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          {visitLabel(row)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          <div>{row.category || "—"}</div>
                          {row.sub_category ? (
                            <div className="text-[11px] text-slate-500">
                              {row.sub_category}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          {isPrivateBike ? (
                            <div>
                              <div className="tabular-nums">
                                {readingValue(row.start_reading) || "—"} →{" "}
                                {readingValue(row.closing_reading) || "—"}
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {[
                                  attachmentName(row.start_reading_image)
                                    ? "Start img"
                                    : null,
                                  attachmentName(row.end_reading_image)
                                    ? "End img"
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "No images"}
                              </div>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums font-medium text-slate-900 dark:text-slate-100">
                          {formatMoney(row.amount)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          {row.payment_mode || "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {renderExpenseStatusBadge(row.status)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </LargeModalPortal>
  );
}

export default DownloadExpensesModal;
