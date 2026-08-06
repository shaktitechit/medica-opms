"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";

import { downloadCsvFile } from "@/components/portal/shared/dashboard/reportDownloadUtils";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { toast } from "@/lib/toast";
import {
  useLazyGetTransportPlanQuery,
  useLazyListTransportPlansQuery,
  useListTransportAgentsQuery,
  type TransportPlanOrderRecord,
  type TransportPlanRecord,
} from "@/store/api";
import {
  TRANSPORT_PLAN_STATUS_TABS,
  agentLabel,
  formatMoney,
  formatPlanDate,
  orderNoOf,
  partyLabel,
  planIdOf,
  renderOrderStatusBadge,
  renderPlanStatusBadge,
} from "./transportPlanUtils";

export type DownloadTransportPlansModalProps = {
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

function idOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const row = value as { _id?: string; id?: string };
    return String(row._id || row.id || "");
  }
  return "";
}

function shipmentStatusOf(line: TransportPlanOrderRecord): string {
  return String(line.transport?.shipment_status || "").toLowerCase();
}

export function DownloadTransportPlansModal({
  open,
  onClose,
}: DownloadTransportPlansModalProps) {
  const [preset, setPreset] = useState<PeriodPreset>("current_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentId, setAgentId] = useState("");
  const [plans, setPlans] = useState<TransportPlanRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [fetchList] = useLazyListTransportPlansQuery();
  const [fetchDetail] = useLazyGetTransportPlanQuery();
  const agentsQ = useListTransportAgentsQuery({}, { skip: !open });

  const agents = useMemo(() => {
    const raw = agentsQ.data;
    if (Array.isArray(raw)) return raw;
    return [];
  }, [agentsQ.data]);

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
      const listRows: TransportPlanRecord[] = [];
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
        if (statusFilter && statusFilter !== "all") args.status = statusFilter;
        if (agentId) args.transport_agent = agentId;
        const result = await fetchList(args).unwrap();
        listRows.push(...(result.data ?? []));
        pages = Math.max(result.pages || 1, 1);
        page += 1;
      } while (page <= pages);

      const detailedPlans = await Promise.all(
        listRows.map(async (row) => {
          const pid = planIdOf(row);
          if (!pid) return row;
          try {
            const detail = await fetchDetail(pid).unwrap();
            return detail || row;
          } catch {
            return row;
          }
        }),
      );

      setPlans(detailedPlans);
    } catch {
      toast.error("Failed to load transport plans for download");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [canLoad, fetchDetail, fetchList, range.from, range.to, agentId, statusFilter]);

  useEffect(() => {
    if (!open) return;
    setPreset("current_month");
    setCustomFrom("");
    setCustomTo("");
    setStatusFilter("all");
    setAgentId("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (preset === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      setPlans([]);
      return;
    }
    void loadPlans();
  }, [open, preset, customFrom, customTo, agentId, statusFilter, loadPlans]);

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

  const totalOrders = useMemo(
    () =>
      plans.reduce(
        (sum, p) =>
          sum +
          (p.summary?.total_orders ??
            (p.orders ? p.orders.filter((o) => o.status !== "cancelled").length : p.order_count || 0)),
        0,
      ),
    [plans],
  );

  const handleDownloadCsv = () => {
    if (plans.length === 0) {
      toast.error("No transport plans to download");
      return;
    }
    const headers = [
      "Plan Date",
      "Transport Agent",
      "Plan Status",
      "Plan Remarks",
      "Order No",
      "Party",
      "Dispatch No",
      "Bill / Invoice No",
      "LR No",
      "Packages",
      "Weight (kg)",
      "Invoice Value",
      "Order Line Status",
      "Shipment Status",
      "Vehicle No",
      "Driver Phone",
      "Submitted At",
      "Completed At",
      "Cancelled At",
      "Cancellation Reason",
    ];

    const csvRows: Array<Array<string | number>> = [];
    for (const p of plans) {
      const orders = (p.orders ?? []).filter((o) => o.status !== "cancelled");
      const planBase = [
        formatPlanDate(p.plan_date),
        agentLabel(p.transport_agent),
        p.status || "",
        p.remarks || "",
      ];
      const planTail = [
        p.submitted_at ? formatPlanDate(p.submitted_at) : "",
        p.completed_at ? formatPlanDate(p.completed_at) : "",
        p.cancelled_at ? formatPlanDate(p.cancelled_at) : "",
        p.cancellation_reason || "",
      ];

      if (orders.length === 0) {
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
          ...planTail,
        ]);
        continue;
      }

      for (const line of orders) {
        const ord = line.order && typeof line.order === "object" ? line.order : null;
        const disp = line.dispatch && typeof line.dispatch === "object" ? line.dispatch : null;
        const transport = line.transport || null;
        const invoice = line.invoice_number || disp?.bill_number || "";
        const lr = line.lr_number || transport?.lr_number || "";
        const packages = line.packages ?? "";
        const weight = line.weight ?? transport?.weight ?? "";
        const val = ord?.grand_total ?? "";
        const vehicle = transport?.vehicle_number || transport?.vehicle_no || "";
        const driver = transport?.driver_mobile || transport?.driver_phone || "";

        csvRows.push([
          ...planBase,
          orderNoOf(line.order),
          partyLabel(line.party || ord?.party),
          disp?.dispatch_no || idOf(line.dispatch) || "",
          invoice,
          lr,
          packages,
          weight,
          val,
          line.status || "",
          shipmentStatusOf(line),
          vehicle,
          driver,
          ...planTail,
        ]);
      }
    }

    const agentLabelSelected =
      agentId
        ? agentLabel(agents.find((a) => idOf(a) === agentId)) || agentId
        : "All Agents";
    const statusLabelSelected =
      TRANSPORT_PLAN_STATUS_TABS.find((t) => t.id === statusFilter)?.label || "All";

    downloadCsvFile(
      `transport_plans_${range.from}_to_${range.to}.csv`,
      headers,
      csvRows,
      [
        `Transport plans export`,
        `Period: ${range.from} to ${range.to}`,
        `Status: ${statusLabelSelected}`,
        `Agent: ${agentLabelSelected}`,
        `Plans: ${plans.length}`,
        `Total Orders: ${totalOrders}`,
      ],
    );
    toast.success("Transport plan CSV downloaded");
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
          aria-label="Download transport plans"
          className="relative flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/10 sm:px-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Download transport plans
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Filter by period, plan status, and transport agent, then download complete CSV report
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={loading || plans.length === 0}
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
                Plan Status
              </label>
              <select
                value={statusFilter}
                disabled={loading}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="min-w-[140px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
              >
                {TRANSPORT_PLAN_STATUS_TABS.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                Transport Agent
              </label>
              <select
                value={agentId}
                disabled={loading}
                onChange={(e) => setAgentId(e.target.value)}
                className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
              >
                <option value="">All</option>
                {agents.map((a) => {
                  const id = idOf(a);
                  return (
                    <option key={id} value={id}>
                      {agentLabel(a)}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="ml-auto pb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              {plans.length} plan{plans.length === 1 ? "" : "s"} · {totalOrders} order
              {totalOrders === 1 ? "" : "s"}
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto">
            <PortalBusyOverlay active={loading} message="Loading transport plans…" />
            {preset === "custom" && (!customFrom || !customTo) ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Select a from and to date to load transport plans.
              </div>
            ) : plans.length === 0 && !loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No transport plans found for this filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-white/10">
                {plans.map((p) => {
                  const orders = (p.orders ?? []).filter((o) => o.status !== "cancelled");
                  const summary = p.summary || {
                    total_orders: orders.length,
                    total_packages: p.total_packages || 0,
                    total_weight: p.total_weight || 0,
                    total_invoice_value: 0,
                  };

                  return (
                    <section key={planIdOf(p)} className="bg-white dark:bg-slate-900">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-white/10 dark:bg-slate-950/80">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {formatPlanDate(p.plan_date)}
                        </h3>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Agent: {agentLabel(p.transport_agent)}
                        </span>
                        {renderPlanStatusBadge(p.status)}
                        <span className="text-xs tabular-nums text-slate-500">
                          {summary.total_orders ?? orders.length} orders · {summary.total_packages ?? 0} pkg · {summary.total_weight ?? 0} kg
                        </span>
                        {summary.total_invoice_value ? (
                          <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            {formatMoney(summary.total_invoice_value)}
                          </span>
                        ) : null}
                        {p.remarks ? (
                          <span className="max-w-md truncate text-xs text-slate-500 dark:text-slate-400">
                            Remarks: {p.remarks}
                          </span>
                        ) : null}
                      </div>

                      {orders.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-slate-500">
                          No orders attached to this plan.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
                            <thead className="bg-white text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                              <tr>
                                <th className="px-3 py-2 font-semibold">Order #</th>
                                <th className="px-3 py-2 font-semibold">Party</th>
                                <th className="px-3 py-2 font-semibold">Dispatch #</th>
                                <th className="px-3 py-2 font-semibold">Invoice / Bill #</th>
                                <th className="px-3 py-2 font-semibold">LR #</th>
                                <th className="px-3 py-2 font-semibold">Pkg / Wt</th>
                                <th className="px-3 py-2 font-semibold">Status</th>
                                <th className="px-3 py-2 font-semibold">Shipment</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orders.map((line) => {
                                const lineId = planIdOf(line);
                                const ord = line.order && typeof line.order === "object" ? line.order : null;
                                const disp = line.dispatch && typeof line.dispatch === "object" ? line.dispatch : null;
                                const transport = line.transport || null;
                                const shipmentStatus = shipmentStatusOf(line);
                                const invoice = line.invoice_number || disp?.bill_number || "—";
                                const lr = line.lr_number || transport?.lr_number || "—";
                                const pkgs = line.packages ?? (transport?.packed_boxes != null ? Number(transport?.packed_boxes || 0) + Number(transport?.open_boxes || 0) : "—");
                                const wt = line.weight ?? transport?.weight ?? "—";

                                return (
                                  <tr
                                    key={lineId || idOf(line.dispatch)}
                                    className="border-t border-slate-100 align-top dark:border-white/5"
                                  >
                                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                                      {orderNoOf(line.order)}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                      {partyLabel(line.party || ord?.party)}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                                      {disp?.dispatch_no || idOf(line.dispatch) || "—"}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                                      {invoice}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                                      {lr}
                                    </td>
                                    <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                                      {pkgs} pkg / {wt} kg
                                    </td>
                                    <td className="px-3 py-2">
                                      {renderOrderStatusBadge(line.status)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {transport ? (
                                        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                                          {(shipmentStatus || "created").replaceAll("_", " ")}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
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

export default DownloadTransportPlansModal;
