"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";

import { downloadCsvFile } from "@/components/portal/admin/components/reportDownloadUtils";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { toast } from "@/lib/toast";
import {
  useLazyListWorkPlansQuery,
  useListUsersQuery,
  type WorkPlanRecord,
  type WorkPlanVisitRecord,
} from "@/store/api";
import {
  WORK_PLAN_STATUS_TABS,
  formatDateTime,
  formatPlanDate,
  planIdOf,
  renderPlanStatusBadge,
  renderVisitStatusBadge,
  salesUserLabel,
  visitPartyLabel,
} from "./workPlanUtils";

export type DownloadWorkPlansModalProps = {
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

export function DownloadWorkPlansModal({ open, onClose }: DownloadWorkPlansModalProps) {
  const [preset, setPreset] = useState<PeriodPreset>("current_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [salesUserId, setSalesUserId] = useState("");
  const [rows, setRows] = useState<WorkPlanRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchList] = useLazyListWorkPlansQuery();
  const usersQ = useListUsersQuery({ department: "sales" }, { skip: !open });

  const salesUsers = useMemo(() => {
    const raw = usersQ.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: unknown[] }).data;
    }
    return [];
  }, [usersQ.data]);

  const range = useMemo(() => {
    if (preset === "current_month") return monthRange(0);
    if (preset === "last_month") return monthRange(-1);
    return { from: customFrom, to: customTo };
  }, [preset, customFrom, customTo]);

  const canLoad =
    Boolean(range.from && range.to) &&
    (preset !== "custom" || (customFrom && customTo && customFrom <= customTo));

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
          include_visits: 1,
        };
        if (statusFilter && statusFilter !== "all") args.status = statusFilter;
        if (salesUserId) args.sales_user = salesUserId;
        const result = await fetchList(args).unwrap();
        all.push(...(result.data ?? []));
        pages = Math.max(result.pages || 1, 1);
        page += 1;
      } while (page <= pages);
      setRows(all);
    } catch {
      toast.error("Failed to load work plans for download");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canLoad, fetchList, range.from, range.to, salesUserId, statusFilter]);

  useEffect(() => {
    if (!open) return;
    setPreset("current_month");
    setCustomFrom("");
    setCustomTo("");
    setStatusFilter("all");
    setSalesUserId("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (preset === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      setRows([]);
      return;
    }
    void loadPlans();
  }, [open, preset, customFrom, customTo, salesUserId, statusFilter, loadPlans]);

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

  const handleDownloadCsv = () => {
    if (rows.length === 0) {
      toast.error("No work plans to download");
      return;
    }
    const headers = [
      "Plan date",
      "Sales executive",
      "Location",
      "Plan status",
      "Plan remarks",
      "Visit #",
      "Party",
      "Party type",
      "Contact person",
      "Contact number",
      "Contact email",
      "Address",
      "Purpose",
      "Planned start",
      "Planned end",
      "Visit status",
      "Check-in",
      "Check-out",
      "Outcome",
      "Notes",
      "Meeting doctor",
      "Meeting purchase",
      "Meeting finance",
      "Meeting engineer",
      "New product introduced",
      "Order received",
      "Next follow-up",
      "Submitted at",
      "Approved / Rejected by",
      "Approved at",
      "Rejection reason",
    ];
    const csvRows: Array<Array<string | number>> = [];
    for (const r of rows) {
      const visits = Array.isArray(r.visits) ? r.visits : [];
      const planBase = [
        formatPlanDate(r.plan_date),
        salesUserLabel(r.sales_user),
        r.location || "",
        r.status || "",
        r.remarks || "",
      ];
      const planTail = [
        r.submitted_at ? formatPlanDate(r.submitted_at) : "",
        salesUserLabel(r.approved_by),
        r.approved_at ? formatPlanDate(r.approved_at) : "",
        r.rejection_reason || "",
      ];
      if (visits.length === 0) {
        csvRows.push([
          ...planBase,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          ...planTail,
        ]);
        continue;
      }
      for (const v of visits) {
        csvRows.push([
          ...planBase,
          v.sequence ?? "",
          visitPartyLabel(v),
          v.party_type || "",
          v.contact_person || "",
          v.contact_number || "",
          v.contact_email || "",
          v.address || "",
          v.purpose || "",
          v.planned_start_time ? formatDateTime(v.planned_start_time) : "",
          v.planned_end_time ? formatDateTime(v.planned_end_time) : "",
          v.status || "",
          v.actual_check_in ? formatDateTime(v.actual_check_in) : "",
          v.actual_check_out ? formatDateTime(v.actual_check_out) : "",
          v.outcome || "",
          v.notes || "",
          yn(v.meeting_with_doctor),
          yn(v.meeting_with_purchase),
          yn(v.meeting_with_finance),
          yn(v.meeting_with_engineer),
          yn(v.new_product_introduced),
          yn(v.order_received),
          v.next_followup_date ? formatPlanDate(v.next_followup_date) : "",
          ...planTail,
        ]);
      }
    }
    const salesLabel =
      salesUserId
        ? salesUserLabel(
            (salesUsers as Array<{ _id?: string; id?: string; name?: string; email?: string }>).find(
              (u) => String(u._id || u.id) === salesUserId,
            ) || salesUserId,
          )
        : "All sales users";
    const statusLabel =
      WORK_PLAN_STATUS_TABS.find((t) => t.id === statusFilter)?.label || "All";
    downloadCsvFile(
      `admin_work_plans_${range.from}_to_${range.to}.csv`,
      headers,
      csvRows,
      [
        `Admin work plans export`,
        `Period: ${range.from} to ${range.to}`,
        `Status: ${statusLabel}`,
        `Sales user: ${salesLabel}`,
        `Plans: ${rows.length}`,
        `Visits: ${totalVisits}`,
      ],
    );
    toast.success("Work plan CSV downloaded");
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
                Filter by period and sales executive, then download as CSV (includes all visits)
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
              {totalVisits === 1 ? "" : "s"}
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto">
            <PortalBusyOverlay active={loading} message="Loading work plans…" />
            {preset === "custom" && (!customFrom || !customTo) ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Select a from and to date to load work plans.
              </div>
            ) : rows.length === 0 && !loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No work plans found for this filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-white/10">
                {rows.map((row) => {
                  const visits = Array.isArray(row.visits) ? row.visits : [];
                  return (
                    <section key={planIdOf(row)} className="bg-white dark:bg-slate-900">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-white/10 dark:bg-slate-950/80">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {formatPlanDate(row.plan_date)}
                        </h3>
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          {salesUserLabel(row.sales_user)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {row.location || "No location"}
                        </span>
                        {renderPlanStatusBadge(row.status)}
                        <span className="text-xs tabular-nums text-slate-500">
                          {visits.length} visit{visits.length === 1 ? "" : "s"}
                        </span>
                        {row.remarks ? (
                          <span className="max-w-md truncate text-xs text-slate-500 dark:text-slate-400">
                            {row.remarks}
                          </span>
                        ) : null}
                      </div>

                      {visits.length === 0 ? (
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
                                <th className="px-3 py-2 font-semibold">Meetings & flags</th>
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
