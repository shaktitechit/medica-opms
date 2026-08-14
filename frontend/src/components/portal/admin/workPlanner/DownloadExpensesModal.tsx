"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import { usePathname } from "next/navigation";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { toast } from "@/lib/toast";
import {
  companyLetterheadLogoUrl,
  companyLetterheadName,
  resolvePublicAssetUrl,
} from "@/lib/env";
import { useAppSelector } from "@/store/hooks";
import {
  useLazyListWorkPlanExpensesQuery,
  useListUsersQuery,
  type WorkPlanExpenseRecord,
} from "@/store/api";
import {
  formatPlanDate,
  planIdOf,
  renderExpenseStatusBadge,
  salesUserLabel,
} from "./workPlanUtils";
import {
  buildExpensesReportPdf,
  openBlankPreviewWindow,
  openPdfSystemPreview,
} from "./buildWorkPlannerPdf";

export type DownloadExpensesModalProps = {
  open: boolean;
  onClose: () => void;
};

type PeriodPreset =
  | "today"
  | "yesterday"
  | "current_month"
  | "last_month"
  | "month"
  | "custom";

function ymd(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayRange(): { from: string; to: string } {
  const now = new Date();
  return { from: ymd(now), to: ymd(now) };
}

function yesterdayRange(): { from: string; to: string } {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return { from: ymd(now), to: ymd(now) };
}

function monthRange(offsetMonths: number): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0);
  return { from: ymd(start), to: ymd(end) };
}

function specificMonthRange(yearMonthStr: string): { from: string; to: string } {
  if (!yearMonthStr) return { from: "", to: "" };
  const [yStr, mStr] = yearMonthStr.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  if (!year || !month) return { from: "", to: "" };
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { from: ymd(start), to: ymd(end) };
}

function planRef(exp: WorkPlanExpenseRecord) {
  const wp = exp.work_plan;
  if (!wp || typeof wp === "string") {
    return {
      id: String(wp || ""),
      plan_date: undefined,
      sales_user: undefined as
        | string
        | { _id?: string; name?: string; email?: string }
        | undefined,
      location: undefined as string | undefined,
    };
  }
  return {
    id: planIdOf(wp),
    plan_date: wp.plan_date,
    sales_user: wp.sales_user,
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

function readingValue(n?: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return String(n);
}

function formatDateTime(v: unknown = new Date()): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DownloadExpensesModal({ open, onClose }: DownloadExpensesModalProps) {
  const [preset, setPreset] = useState<PeriodPreset>("current_month");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [salesUserId, setSalesUserId] = useState("");
  const [rows, setRows] = useState<WorkPlanExpenseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const [fetchList] = useLazyListWorkPlanExpensesQuery();
  const usersQ = useListUsersQuery({ department: "sales" }, { skip: !open });

  const authUser = useAppSelector((s) => s.auth.user);
  const downloadedBy = useMemo(() => {
    if (!authUser || typeof authUser !== "object") return "—";
    const u = authUser as Record<string, unknown>;
    return String(u.name ?? u.full_name ?? u.username ?? u.email ?? "").trim() || "—";
  }, [authUser]);

  const pathname = usePathname() || "";
  const portalLabel = useMemo(() => {
    if (pathname.includes("/distributor")) return "Distributor";
    if (pathname.includes("/sales")) return "Sales / Employee";
    if (pathname.includes("/finance")) return "Finance";
    if (pathname.includes("/account")) return "Account";
    if (pathname.includes("/dispatch")) return "Dispatch";
    return "Admin";
  }, [pathname]);

  const companyName = companyLetterheadName();
  const logoUrl = resolvePublicAssetUrl(companyLetterheadLogoUrl());

  const salesUsers = useMemo(() => {
    const raw = usersQ.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: unknown[] }).data;
    }
    return [];
  }, [usersQ.data]);

  const range = useMemo(() => {
    if (preset === "today") return todayRange();
    if (preset === "yesterday") return yesterdayRange();
    if (preset === "current_month") return monthRange(0);
    if (preset === "last_month") return monthRange(-1);
    if (preset === "month") return specificMonthRange(selectedMonth);
    return { from: customFrom, to: customTo };
  }, [preset, selectedMonth, customFrom, customTo]);

  const canLoad =
    Boolean(range.from && range.to) &&
    (preset !== "custom" || (customFrom && customTo && customFrom <= customTo)) &&
    (preset !== "month" || Boolean(selectedMonth));

  const loadExpenses = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    try {
      const all: WorkPlanExpenseRecord[] = [];
      let page = 1;
      let pages = 1;
      const limit = 200;
      do {
        const args: Record<string, string | number | undefined> = {
          page,
          limit,
          from: range.from,
          to: range.to,
        };
        if (salesUserId) args.sales_user = salesUserId;
        const result = await fetchList(args).unwrap();
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
  }, [canLoad, fetchList, range.from, range.to, salesUserId]);

  useEffect(() => {
    if (!open) return;
    setPreset("current_month");
    setSelectedMonth(ymd(new Date()).slice(0, 7));
    setCustomFrom("");
    setCustomTo("");
    setSalesUserId("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (preset === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      setRows([]);
      return;
    }
    if (preset === "month" && !selectedMonth) {
      setRows([]);
      return;
    }
    void loadExpenses();
  }, [open, preset, selectedMonth, customFrom, customTo, salesUserId, loadExpenses]);

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

  const salesLabel = useMemo(
    () =>
      salesUserId
        ? salesUserLabel(
            (salesUsers as Array<{ _id?: string; id?: string; name?: string; email?: string }>).find(
              (u) => String(u._id || u.id) === salesUserId,
            ) || salesUserId,
          )
        : "All sales users",
    [salesUserId, salesUsers],
  );

  const handleDownloadPdf = useCallback(async () => {
    if (rows.length === 0) {
      toast.error("No expenses to download");
      return;
    }
    setIsDownloadingPdf(true);
    const previewWin = openBlankPreviewWindow();
    try {
      const stamp = formatDateTime(new Date());
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = `admin_expenses_${dateStamp}.pdf`;
      const pdf = await buildExpensesReportPdf({
        companyName,
        logoUrl,
        portalLabel,
        downloadedBy,
        generatedAt: stamp,
        periodFrom: range.from,
        periodTo: range.to,
        salesUserLabel: salesLabel,
        expenses: rows,
        totalAmount,
      });
      openPdfSystemPreview(pdf, filename, previewWin);
      toast.success("Expenses PDF opened in preview.");
    } catch (err) {
      previewWin?.close();
      toast.error(err instanceof Error ? err.message : "Could not generate PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [
    rows,
    companyName,
    logoUrl,
    portalLabel,
    downloadedBy,
    range.from,
    range.to,
    salesLabel,
    totalAmount,
  ]);

  if (!open) return null;

  return (
    <LargeModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-[1px]"
        role="presentation"
        onClick={() => !loading && !isDownloadingPdf && onClose()}
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
                Filter by period and sales executive, then download as PDF
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={loading || isDownloadingPdf || rows.length === 0}
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {isDownloadingPdf ? "Opening PDF…" : "Download PDF"}
              </button>
              <button
                type="button"
                disabled={loading || isDownloadingPdf}
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
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="current_month">Current month</option>
                <option value="last_month">Last month</option>
                <option value="month">Specific month</option>
                <option value="custom">Custom date range</option>
              </select>
            </div>
            {preset === "month" ? (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Select month
                </label>
                <input
                  type="month"
                  value={selectedMonth}
                  disabled={loading}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
                />
              </div>
            ) : preset === "custom" ? (
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
                {range.from === range.to ? range.from : `${range.from} → ${range.to}`}
              </div>
            )}
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                Sales executive
              </label>
              <select
                value={salesUserId}
                disabled={loading}
                onChange={(e) => setSalesUserId(e.target.value)}
                className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
              >
                <option value="">All</option>
                {(salesUsers as Array<{ _id?: string; id?: string; name?: string }>).map(
                  (u) => {
                    const id = String(u._id || u.id || "");
                    return (
                      <option key={id} value={id}>
                        {u.name || id}
                      </option>
                    );
                  },
                )}
              </select>
            </div>
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
            ) : preset === "month" && !selectedMonth ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Select a month to load expenses.
              </div>
            ) : rows.length === 0 && !loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No expenses found for this filter.
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Expense date</th>
                    <th className="px-3 py-2.5 font-semibold">Plan date</th>
                    <th className="px-3 py-2.5 font-semibold">Sales executive</th>
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
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          {salesUserLabel(plan.sales_user)}
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
