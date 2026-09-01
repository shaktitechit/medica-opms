"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import { usePathname } from "next/navigation";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { toast } from "@/lib/toast";
import { usePdfCompanyLetterhead } from "@/components/portal/shared/pdfCompanyLetterhead";
import { useAppSelector } from "@/store/hooks";
import {
  useLazyGetWorkPlanQuery,
  useLazyListWorkPlansQuery,
  useListUsersQuery,
  type WorkPlanRecord,
  type WorkPlanVisitRecord,
} from "@/store/api";
import {
  WORK_PLAN_STATUS_TABS,
  WORK_PLAN_TYPE_TABS,
  formatDateTime,
  formatPlanDate,
  isLeavePlan,
  isWorkTaskPlan,
  planIdOf,
  planTypeOf,
  renderPlanStatusBadge,
  renderVisitStatusBadge,
  salesUserLabel,
  visitPartyLabel,
} from "./workPlanUtils";
import {
  buildWorkPlansReportPdf,
  openBlankPreviewWindow,
  openPdfSystemPreview,
} from "./buildWorkPlannerPdf";

export type DownloadWorkPlansModalProps = {
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

function yn(v: boolean | null | undefined): string {
  if (v == null) return "";
  return v ? "Yes" : "No";
}

function visitContactLine(v: WorkPlanVisitRecord): string {
  return [v.contact_person, v.contact_number, v.contact_email]
    .filter(Boolean)
    .join(" · ");
}

function visitMeetingsLine(v: WorkPlanVisitRecord): string {
  const parts: string[] = [];
  if (v.meeting_with_doctor != null) parts.push(`Doctor: ${yn(v.meeting_with_doctor)}`);
  if (v.meeting_with_purchase != null)
    parts.push(`Purchase: ${yn(v.meeting_with_purchase)}`);
  if (v.meeting_with_finance != null)
    parts.push(`Finance: ${yn(v.meeting_with_finance)}`);
  if (v.meeting_with_engineer != null)
    parts.push(`Engineer: ${yn(v.meeting_with_engineer)}`);
  return parts.join("; ");
}

function formatPdfDateTime(v: unknown = new Date()): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function workStatusBadge(status?: string) {
  const s = status || "pending";
  const cls =
    s === "completed"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      : s === "cancelled"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {s.replace(/_/g, " ")}
    </span>
  );
}

function needsDetailHydration(p: WorkPlanRecord): boolean {
  const visitHave = Array.isArray(p.visits) ? p.visits.length : 0;
  const visitCount = Number(p.visit_count) || 0;
  const workHave = Array.isArray(p.works) ? p.works.length : 0;
  const workCount = Number(p.work_count) || 0;
  return (
    !Array.isArray(p.visits) ||
    visitCount > visitHave ||
    !Array.isArray(p.works) ||
    workCount > workHave
  );
}

export function DownloadWorkPlansModal({ open, onClose }: DownloadWorkPlansModalProps) {
  const [preset, setPreset] = useState<PeriodPreset>("current_month");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planTypeFilter, setPlanTypeFilter] = useState("all");
  const [salesUserId, setSalesUserId] = useState("");
  const [rows, setRows] = useState<WorkPlanRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const [fetchList] = useLazyListWorkPlansQuery();
  const [fetchPlan] = useLazyGetWorkPlanQuery();
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

  const letterhead = usePdfCompanyLetterhead();

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

  const loadPlans = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    try {
      const all: WorkPlanRecord[] = [];
      let page = 1;
      let pages = 1;
      const limit = 200;
      do {
        const args: Record<string, string | number | undefined> = {
          page,
          limit,
          from: range.from,
          to: range.to,
          include_visits: "true",
          include_works: "true",
        };
        if (statusFilter && statusFilter !== "all") args.status = statusFilter;
        if (planTypeFilter && planTypeFilter !== "all") args.plan_type = planTypeFilter;
        if (salesUserId) args.sales_user = salesUserId;
        const result = await fetchList(args).unwrap();
        all.push(...(result.data ?? []));
        pages = Math.max(result.pages || 1, 1);
        page += 1;
      } while (page <= pages);

      const hydrated = [...all];
      const missingIdx = hydrated
        .map((p, i) => (needsDetailHydration(p) ? i : -1))
        .filter((i) => i >= 0);
      const batch = 6;
      for (let i = 0; i < missingIdx.length; i += batch) {
        const slice = missingIdx.slice(i, i + batch);
        const details = await Promise.all(
          slice.map(async (idx) => {
            const id = planIdOf(hydrated[idx]!);
            if (!id) return null;
            try {
              return await fetchPlan(id).unwrap();
            } catch {
              return null;
            }
          }),
        );
        details.forEach((detail, j) => {
          const idx = slice[j]!;
          if (!detail) return;
          hydrated[idx] = {
            ...hydrated[idx]!,
            visits: Array.isArray(detail.visits) ? detail.visits : hydrated[idx]!.visits,
            visit_count: Array.isArray(detail.visits)
              ? detail.visits.length
              : hydrated[idx]!.visit_count,
            works: Array.isArray(detail.works) ? detail.works : hydrated[idx]!.works,
            work_count: Array.isArray(detail.works)
              ? detail.works.length
              : hydrated[idx]!.work_count,
          };
        });
      }
      setRows(hydrated);
    } catch {
      toast.error("Failed to load work plans for download");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canLoad, fetchList, fetchPlan, planTypeFilter, range.from, range.to, salesUserId, statusFilter]);

  useEffect(() => {
    if (!open) return;
    setPreset("current_month");
    setSelectedMonth(ymd(new Date()).slice(0, 7));
    setCustomFrom("");
    setCustomTo("");
    setStatusFilter("all");
    setPlanTypeFilter("all");
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
    void loadPlans();
  }, [open, preset, selectedMonth, customFrom, customTo, salesUserId, statusFilter, planTypeFilter, loadPlans]);

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

  const totalVisits = useMemo(
    () =>
      rows.reduce(
        (sum, r) =>
          sum +
          (Array.isArray(r.visits)
            ? r.visits.length
            : Number(r.visit_count) || 0),
        0,
      ),
    [rows],
  );

  const totalWorks = useMemo(
    () =>
      rows.reduce(
        (sum, r) =>
          sum +
          (Array.isArray(r.works) ? r.works.length : Number(r.work_count) || 0),
        0,
      ),
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

  const statusLabelDisplay = useMemo(
    () => WORK_PLAN_STATUS_TABS.find((t) => t.id === statusFilter)?.label || "All",
    [statusFilter],
  );

  const planTypeLabelDisplay = useMemo(
    () => WORK_PLAN_TYPE_TABS.find((t) => t.id === planTypeFilter)?.label || "All types",
    [planTypeFilter],
  );

  const handleDownloadPdf = useCallback(async () => {
    if (rows.length === 0) {
      toast.error("No work plans to download");
      return;
    }
    setIsDownloadingPdf(true);
    const previewWin = openBlankPreviewWindow();
    try {
      const stamp = formatPdfDateTime(new Date());
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = `admin_work_plans_${dateStamp}.pdf`;
      const pdf = await buildWorkPlansReportPdf({
        letterhead,
        portalLabel,
        downloadedBy,
        generatedAt: stamp,
        periodFrom: range.from,
        periodTo: range.to,
        salesUserLabel: salesLabel,
        statusLabel: statusLabelDisplay,
        planTypeLabel: planTypeLabelDisplay,
        plans: rows,
      });
      openPdfSystemPreview(pdf, filename, previewWin);
      toast.success("Work plans PDF opened in preview.");
    } catch (err) {
      previewWin?.close();
      toast.error(err instanceof Error ? err.message : "Could not generate PDF.");
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [
    rows,
    letterhead,
    portalLabel,
    downloadedBy,
    range.from,
    range.to,
    salesLabel,
    statusLabelDisplay,
    planTypeLabelDisplay,
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
          aria-label="Download work plans"
          className="relative flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/10 sm:px-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Download work plans
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Filter by period, type and sales executive, then download as PDF (visits and work tasks)
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
                Status
              </label>
              <select
                value={statusFilter}
                disabled={loading}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="min-w-[140px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
              >
                {WORK_PLAN_STATUS_TABS.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                Plan type
              </label>
              <select
                value={planTypeFilter}
                disabled={loading}
                onChange={(e) => setPlanTypeFilter(e.target.value)}
                className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
              >
                {WORK_PLAN_TYPE_TABS.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </div>
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
              {rows.length} plan{rows.length === 1 ? "" : "s"} · {totalVisits} visit
              {totalVisits === 1 ? "" : "s"} · {totalWorks} task{totalWorks === 1 ? "" : "s"}
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto">
            <PortalBusyOverlay active={loading} message="Loading work plans…" />
            {preset === "custom" && (!customFrom || !customTo) ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Select a from and to date to load work plans.
              </div>
            ) : preset === "month" && !selectedMonth ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Select a month to load work plans.
              </div>
            ) : rows.length === 0 && !loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No work plans found for this filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-white/10">
                {rows.map((row) => {
                  const visits = Array.isArray(row.visits) ? row.visits : [];
                  const works = Array.isArray(row.works) ? row.works : [];
                  const typeLabel = planTypeOf(row.plan_type);
                  const workPlan = isWorkTaskPlan(row.plan_type);
                  const leavePlan = isLeavePlan(row.plan_type);
                  return (
                    <section key={planIdOf(row)} className="bg-white dark:bg-slate-900">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-white/10 dark:bg-slate-950/80">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {formatPlanDate(row.plan_date)}
                        </h3>
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          {salesUserLabel(row.sales_user)}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-white/10 dark:text-slate-200">
                          {typeLabel}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {row.location || "No location"}
                        </span>
                        {renderPlanStatusBadge(row.status)}
                        <span className="text-xs tabular-nums text-slate-500">
                          {leavePlan
                            ? "Leave"
                            : workPlan
                              ? `${works.length} task${works.length === 1 ? "" : "s"}`
                              : `${visits.length} visit${visits.length === 1 ? "" : "s"}`}
                        </span>
                        {row.remarks ? (
                          <span className="max-w-md truncate text-xs text-slate-500 dark:text-slate-400">
                            {row.remarks}
                          </span>
                        ) : null}
                      </div>

                      {leavePlan ? (
                        <div className="px-4 py-3 text-xs text-slate-500">
                          Leave — no visits or work tasks.
                        </div>
                      ) : workPlan ? (
                        works.length === 0 ? (
                          <div className="px-4 py-3 text-xs text-slate-500">
                            No work tasks on this plan.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[800px] border-collapse text-left text-xs">
                              <thead className="bg-white text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                                <tr>
                                  <th className="px-3 py-2 font-semibold">#</th>
                                  <th className="px-3 py-2 font-semibold">Title</th>
                                  <th className="px-3 py-2 font-semibold">Description</th>
                                  <th className="px-3 py-2 font-semibold">Planned</th>
                                  <th className="px-3 py-2 font-semibold">Status</th>
                                  <th className="px-3 py-2 font-semibold">Completion remarks</th>
                                </tr>
                              </thead>
                              <tbody>
                                {works.map((w) => (
                                  <tr
                                    key={planIdOf(w) || `${planIdOf(row)}-work-${w.sequence}`}
                                    className="border-t border-slate-100 align-top dark:border-white/5"
                                  >
                                    <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                                      {w.sequence ?? "—"}
                                    </td>
                                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                                      {w.title || "—"}
                                    </td>
                                    <td className="max-w-[240px] px-3 py-2 text-slate-600 dark:text-slate-400">
                                      {w.description || "—"}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-400">
                                      <div>
                                        {w.planned_start_time
                                          ? formatDateTime(w.planned_start_time)
                                          : "—"}
                                      </div>
                                      {w.planned_end_time ? (
                                        <div className="text-[11px]">
                                          → {formatDateTime(w.planned_end_time)}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td className="px-3 py-2">{workStatusBadge(w.status)}</td>
                                    <td className="max-w-[240px] px-3 py-2 text-slate-600 dark:text-slate-400">
                                      {w.completion_remarks || "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      ) : visits.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-slate-500">
                          No visits on this plan.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
                            <thead className="bg-white text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                              <tr>
                                <th className="px-3 py-2 font-semibold">#</th>
                                <th className="px-3 py-2 font-semibold">Party</th>
                                <th className="px-3 py-2 font-semibold">Contact</th>
                                <th className="px-3 py-2 font-semibold">Address</th>
                                <th className="px-3 py-2 font-semibold">Purpose</th>
                                <th className="px-3 py-2 font-semibold">Planned</th>
                                <th className="px-3 py-2 font-semibold">Status</th>
                                <th className="px-3 py-2 font-semibold">Execution</th>
                                <th className="px-3 py-2 font-semibold">Outcome / notes</th>
                                <th className="px-3 py-2 font-semibold">Meetings &amp; flags</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visits.map((v) => (
                                <tr
                                  key={planIdOf(v) || `${planIdOf(row)}-${v.sequence}`}
                                  className="border-t border-slate-100 align-top dark:border-white/5"
                                >
                                  <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                                    {v.sequence ?? "—"}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="font-medium text-slate-900 dark:text-slate-100">
                                      {visitPartyLabel(v)}
                                    </div>
                                    {v.party_type ? (
                                      <div className="text-[11px] text-slate-500">
                                        {v.party_type}
                                      </div>
                                    ) : null}
                                  </td>
                                  <td className="max-w-[180px] px-3 py-2 text-slate-600 dark:text-slate-400">
                                    {visitContactLine(v) || "—"}
                                  </td>
                                  <td className="max-w-[160px] px-3 py-2 text-slate-600 dark:text-slate-400">
                                    {v.address || "—"}
                                  </td>
                                  <td className="max-w-[140px] px-3 py-2 text-slate-700 dark:text-slate-300">
                                    {v.purpose || "—"}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-400">
                                    <div>{formatDateTime(v.planned_start_time)}</div>
                                    {v.planned_end_time ? (
                                      <div className="text-[11px]">
                                        → {formatDateTime(v.planned_end_time)}
                                      </div>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-2">
                                    {renderVisitStatusBadge(v.status)}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-400">
                                    {v.actual_check_in ? (
                                      <div>In: {formatDateTime(v.actual_check_in)}</div>
                                    ) : (
                                      "—"
                                    )}
                                    {v.actual_check_out ? (
                                      <div>Out: {formatDateTime(v.actual_check_out)}</div>
                                    ) : null}
                                    {v.next_followup_date ? (
                                      <div>
                                        Follow-up: {formatPlanDate(v.next_followup_date)}
                                      </div>
                                    ) : null}
                                  </td>
                                  <td className="max-w-[200px] px-3 py-2 text-slate-600 dark:text-slate-400">
                                    {v.outcome ? <div>{v.outcome}</div> : null}
                                    {v.notes ? (
                                      <div className="text-[11px] text-slate-500">{v.notes}</div>
                                    ) : null}
                                    {!v.outcome && !v.notes ? "—" : null}
                                  </td>
                                  <td className="max-w-[200px] px-3 py-2 text-slate-600 dark:text-slate-400">
                                    {visitMeetingsLine(v) || null}
                                    {v.new_product_introduced != null ? (
                                      <div>
                                        New product: {yn(v.new_product_introduced)}
                                      </div>
                                    ) : null}
                                    {v.order_received != null ? (
                                      <div>Order: {yn(v.order_received)}</div>
                                    ) : null}
                                    {!visitMeetingsLine(v) &&
                                    v.new_product_introduced == null &&
                                    v.order_received == null
                                      ? "—"
                                      : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </LargeModalPortal>
  );
}

export default DownloadWorkPlansModal;
