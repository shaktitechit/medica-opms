"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";

import { usePathname } from "next/navigation";
import { useAppSelector } from "@/store/hooks";
import { buildTransportPlansPdf } from "./buildTransportPlansPdf";
import { usePdfCompanyLetterhead } from "@/components/portal/shared/pdfCompanyLetterhead";
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

type PeriodPreset = "today" | "yesterday" | "current_month" | "last_month" | "custom";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDateTime(v: unknown = new Date()): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hr = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day} ${hr}:${min}`;
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

function formatAddr(addr: unknown): string {
  if (!addr) return "";
  if (typeof addr === "string") return addr.trim();
  if (typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    const parts: string[] = [];
    if (a.address_line_1) parts.push(String(a.address_line_1).trim());
    if (a.address_line_2) parts.push(String(a.address_line_2).trim());
    const cityLine = [a.city, a.state, a.pincode]
      .map((x) => (x ? String(x).trim() : ""))
      .filter(Boolean)
      .join(", ");
    if (cityLine) parts.push(cityLine);
    if (a.country && String(a.country).trim() !== "India") {
      parts.push(String(a.country).trim());
    }
    return parts.join(", ");
  }
  return "";
}

function partyCity(party: unknown): string {
  if (!party || typeof party !== "object") return "—";
  const p = party as {
    shipping_address?: any;
    billing_address?: any;
    address?: any;
  };
  const city =
    p.shipping_address?.city ||
    p.billing_address?.city ||
    p.address?.city ||
    "";
  return String(city).trim() || "—";
}

function shipmentStatusOf(line: TransportPlanOrderRecord): string {
  return String(line.transport?.shipment_status || "").toLowerCase();
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  disabled,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (id: string) => {
    if (id === "all") {
      onChange([]);
    } else {
      const next = selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id];
      onChange(next);
    }
  };

  const displayText =
    selected.length === 0
      ? "All"
      : selected
          .map((id) => options.find((o) => o.id === id)?.label)
          .filter(Boolean)
          .join(", ");

  return (
    <div className="relative inline-block text-left">
      <label className="mb-1 block text-[11px] font-medium text-slate-500">
        {label}
      </label>
      <div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex w-full min-w-[160px] max-w-[240px] justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
        >
          <span className="truncate">{displayText}</span>
          <svg
            className="ml-2 -mr-0.5 h-4 w-4 shrink-0 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 mt-1 z-50 w-56 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-slate-900 dark:ring-white/15">
            <div className="py-1 max-h-60 overflow-y-auto">
              <label className="flex items-center px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.length === 0}
                  onChange={() => handleToggle("all")}
                  className="mr-2 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                All
              </label>
              {options
                .filter((o) => o.id !== "all")
                .map((opt) => (
                  <label
                    key={opt.id}
                    className="flex items-center px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(opt.id)}
                      onChange={() => handleToggle(opt.id)}
                      className="mr-2 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {opt.label}
                  </label>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function DownloadTransportPlansModal({
  open,
  onClose,
}: DownloadTransportPlansModalProps) {
  const [preset, setPreset] = useState<PeriodPreset>("current_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [agentId, setAgentId] = useState<string[]>([]);
  const [plans, setPlans] = useState<TransportPlanRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const letterhead = usePdfCompanyLetterhead();

  const authUser = useAppSelector((s) => s.auth.user);
  const downloadedBy = useMemo(() => {
    if (!authUser || typeof authUser !== "object") return "—";
    const u = authUser as Record<string, unknown>;
    return (
      String(u.name ?? u.full_name ?? u.username ?? u.email ?? "").trim() || "—"
    );
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

  const [fetchList] = useLazyListTransportPlansQuery();
  const [fetchDetail] = useLazyGetTransportPlanQuery();
  const agentsQ = useListTransportAgentsQuery({}, { skip: !open });

  const agents = useMemo(() => {
    const raw = agentsQ.data;
    if (Array.isArray(raw)) return raw;
    return [];
  }, [agentsQ.data]);

  const agentOptions = useMemo(() => {
    const list = agents.map((a) => ({
      id: idOf(a),
      label: agentLabel(a) || idOf(a),
    }));
    return [{ id: "all", label: "All" }, ...list];
  }, [agents]);

  const range = useMemo(() => {
    if (preset === "today") {
      const now = new Date();
      return { from: ymd(now), to: ymd(now) };
    }
    if (preset === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: ymd(yesterday), to: ymd(yesterday) };
    }
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
        if (statusFilter.length > 0) args.status = statusFilter.join(",");
        if (agentId.length > 0) args.transport_agent = agentId.join(",");
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
  }, [canLoad, fetchDetail, fetchList, range.from, range.to, agentId.join(","), statusFilter.join(",")]);

  useEffect(() => {
    if (!open) return;
    setPreset("current_month");
    setCustomFrom("");
    setCustomTo("");
    setStatusFilter([]);
    setAgentId([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (preset === "custom" && (!customFrom || !customTo || customFrom > customTo)) {
      setPlans([]);
      return;
    }
    void loadPlans();
  }, [open, preset, customFrom, customTo, agentId.join(","), statusFilter.join(","), loadPlans]);

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

  const agentLabelSelected = useMemo(() => {
    return agentId.length > 0
      ? agentId.map((id) => agentLabel(agents.find((a) => idOf(a) === id)) || id).join(", ")
      : "All Agents";
  }, [agentId, agents]);

  const statusLabelSelected = useMemo(() => {
    return statusFilter.length > 0
      ? statusFilter.map((id) => TRANSPORT_PLAN_STATUS_TABS.find((t) => t.id === id)?.label || id).join(", ")
      : "All";
  }, [statusFilter]);

  const handleDownloadPdf = useCallback(async () => {
    if (plans.length === 0) {
      toast.error("No transport plans to download");
      return;
    }
    setIsDownloadingPdf(true);
    try {
      const dateStamp = new Date().toISOString().slice(0, 10);
      const pdf = await buildTransportPlansPdf({
        letterhead,
        portalLabel,
        downloadedBy,
        generatedAt: formatDateTime(new Date()),
        plans,
        range,
        statusLabelSelected,
        agentLabelSelected,
      });
      pdf.save(`transport_plans_${dateStamp}.pdf`);
      toast.success("Transport plans PDF downloaded.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not generate PDF.";
      toast.error(message);
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [
    agentLabelSelected,
    downloadedBy,
    letterhead,
    plans,
    portalLabel,
    range,
    statusLabelSelected,
  ]);

  if (!open) return null;

  return (
    <LargeModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/50 p-0 backdrop-blur-[1px]"
        role="presentation"
        onClick={() => !loading && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Download transport plans"
          className="relative flex h-screen w-screen max-w-none flex-col overflow-hidden rounded-none border-0 bg-white shadow-2xl dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/10 sm:px-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Download transport plans
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Filter by period, plan status, and transport agent, then download complete PDF report
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={loading || isDownloadingPdf || plans.length === 0}
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Download PDF
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
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
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
            <MultiSelectDropdown
              label="Plan Status"
              options={TRANSPORT_PLAN_STATUS_TABS as any}
              selected={statusFilter}
              onChange={setStatusFilter}
              disabled={loading}
            />
            <MultiSelectDropdown
              label="Transport Agent"
              options={agentOptions}
              selected={agentId}
              onChange={setAgentId}
              disabled={loading}
            />
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

                  const agentObj =
                    p.transport_agent && typeof p.transport_agent === "object"
                      ? (p.transport_agent as Record<string, unknown>)
                      : null;
                  const agentPhone = String(
                    agentObj?.phone || agentObj?.mobile || agentObj?.contact_person_phone || "",
                  );
                  const agentContactName = String(agentObj?.contact_person || "");

                  // Extract driver and vehicle from transport shipments or plan lines
                  const driverNames = Array.from(
                    new Set(
                      orders
                        .map((o) => {
                          const t = o.transport as Record<string, unknown> | null;
                          return String(
                            t?.driver_name ||
                              (o as unknown as Record<string, unknown>).driver_name ||
                              "",
                          );
                        })
                        .filter(Boolean),
                    ),
                  ).join(", ");
                  const driverMobiles = Array.from(
                    new Set(
                      orders
                        .map((o) => {
                          const t = o.transport as Record<string, unknown> | null;
                          return String(
                            t?.driver_mobile ||
                              t?.driver_phone ||
                              (o as unknown as Record<string, unknown>).driver_mobile ||
                              (o as unknown as Record<string, unknown>).driver_phone ||
                              "",
                          );
                        })
                        .filter(Boolean),
                    ),
                  ).join(", ");
                  const vehicleNos = Array.from(
                    new Set(
                      orders
                        .map((o) => {
                          const t = o.transport as Record<string, unknown> | null;
                          return String(
                            t?.vehicle_number ||
                              t?.vehicle_no ||
                              (o as unknown as Record<string, unknown>).vehicle_number ||
                              (o as unknown as Record<string, unknown>).vehicle_no ||
                              "",
                          );
                        })
                        .filter(Boolean),
                    ),
                  ).join(", ");

                  return (
                    <section key={planIdOf(p)} className="bg-white dark:bg-slate-900">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-950/80">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {formatPlanDate(p.plan_date)}
                        </h3>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          Agent: {agentLabel(p.transport_agent)}
                        </span>
                        {agentPhone || agentContactName ? (
                          <span className="text-xs text-slate-500 font-mono">
                            Contact: {agentContactName ? `${agentContactName} ` : ""}{agentPhone ? `(${agentPhone})` : ""}
                          </span>
                        ) : null}
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Vehicle: <span className="font-mono">{vehicleNos || "Not assigned"}</span>
                        </span>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Driver: {driverNames || (driverMobiles ? "" : "Not assigned")} {driverMobiles ? `(${driverMobiles})` : ""}
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
                                <th className="px-3 py-2 font-semibold">Party City</th>
                                <th className="px-3 py-2 font-semibold">Dispatch #</th>
                                <th className="px-3 py-2 font-semibold">Invoice / Bill #</th>
                                <th className="px-3 py-2 font-semibold">LR #</th>
                                <th className="px-3 py-2 font-semibold">Pkg / Wt</th>
                                <th className="px-3 py-2 font-semibold">Items</th>
                                <th className="px-3 py-2 font-semibold">Qty</th>
                                <th className="px-3 py-2 font-semibold">Total</th>
                                <th className="px-3 py-2 font-semibold">Status</th>
                                <th className="px-3 py-2 font-semibold">Shipment</th>
                                <th className="px-3 py-2 font-semibold">Delivered At</th>
                                <th className="px-3 py-2 font-semibold">Received By</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orders.map((line) => {
                                const lineId = planIdOf(line);
                                const ord = line.order && typeof line.order === "object" ? line.order : null;
                                const ordDispatches = ord && Array.isArray((ord as any).dispatches) ? (ord as any).dispatches : [];
                                const disp = line.dispatch && typeof line.dispatch === "object" ? line.dispatch : null;
                                const transport = line.transport || null;
                                const shipmentStatus = shipmentStatusOf(line);
                                const dispatchNo = ordDispatches.length > 0
                                  ? ordDispatches.map((d: any) => d.dispatch_no).filter(Boolean).join(", ")
                                  : (disp?.dispatch_no || "—");
                                const invoice = ordDispatches.length > 0
                                  ? ordDispatches.map((d: any) => d.bill_number).filter(Boolean).join(", ")
                                  : (disp?.bill_number || "—");
                                const lr = transport?.lr_number || line.lr_number || "—";
                                const pkgs =
                                  transport?.packed_boxes != null || transport?.open_boxes != null
                                    ? Number(transport?.packed_boxes || 0) + Number(transport?.open_boxes || 0)
                                    : line.packages ?? "—";
                                const wt = transport?.weight ?? line.weight ?? "—";
                                const lineRecord = line as unknown as Record<string, unknown>;
                                const deliveredAt = lineRecord.delivered_at ? formatPlanDate(lineRecord.delivered_at) : "—";
                                const receivedBy = String(lineRecord.received_by || "—");

                                const isDelivered = deliveredAt !== "—" || shipmentStatus === "delivered";
                                const isDispatched = !isDelivered && ["dispatched", "in_transit", "out_for_delivery", "picked_up"].includes(shipmentStatus);
                                const statusVal = line.status === "cancelled" ? "cancelled" : isDelivered ? "delivered" : isDispatched ? "dispatched" : (line.status || "pending");

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
                                    <td className="px-3 py-2 text-slate-500 max-w-xs truncate text-[11px] dark:text-slate-400">
                                      {partyCity(line.party || ord?.party)}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                                      {dispatchNo}
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
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 text-[11px] whitespace-normal break-words max-w-[200px]" title={(() => {
                                      if (ordDispatches.length > 0) {
                                        const list: string[] = [];
                                        for (const d of ordDispatches) {
                                          const items = Array.isArray(d.dispatch_items) ? d.dispatch_items : [];
                                          items.forEach((item: any) => {
                                            const name = item.product?.product_name || "Unknown Product";
                                            list.push(`${name} (${item.dispatched_quantity})`);
                                          });
                                        }
                                        return list.join(", ");
                                      } else {
                                        const items = disp && Array.isArray((disp as any).dispatch_items) ? (disp as any).dispatch_items : [];
                                        return items.map((item: any) => {
                                          const name = item.product?.product_name || "Unknown Product";
                                          return `${name} (${item.dispatched_quantity})`;
                                        }).join(", ");
                                      }
                                    })()}>
                                      {(() => {
                                        if (ordDispatches.length > 0) {
                                          const list: string[] = [];
                                          for (const d of ordDispatches) {
                                            const items = Array.isArray(d.dispatch_items) ? d.dispatch_items : [];
                                            items.forEach((item: any) => {
                                              const name = item.product?.product_name || "Unknown Product";
                                              list.push(`${name} (${item.dispatched_quantity})`);
                                            });
                                          }
                                          return list.join(", ") || "—";
                                        } else {
                                          const items = disp && Array.isArray((disp as any).dispatch_items) ? (disp as any).dispatch_items : [];
                                          return items.map((item: any) => {
                                            const name = item.product?.product_name || "Unknown Product";
                                            return `${name} (${item.dispatched_quantity})`;
                                          }).join(", ") || "—";
                                        }
                                      })()}
                                    </td>
                                    <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                                      {(() => {
                                        let qty = 0;
                                        if (ordDispatches.length > 0) {
                                          for (const d of ordDispatches) {
                                            const items = Array.isArray(d.dispatch_items) ? d.dispatch_items : [];
                                            qty += items.reduce((sum: number, item: any) => sum + (Number(item.dispatched_quantity) || 0), 0);
                                          }
                                        } else {
                                          const items = disp && Array.isArray((disp as any).dispatch_items) ? (disp as any).dispatch_items : [];
                                          qty = items.reduce((sum: number, item: any) => sum + (Number(item.dispatched_quantity) || 0), 0);
                                        }
                                        return qty || "—";
                                      })()}
                                    </td>
                                    <td className="px-3 py-2 font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                      {ord?.grand_total != null ? formatMoney(Number(ord.grand_total)) : "—"}
                                    </td>
                                    <td className="px-3 py-2">
                                      {renderOrderStatusBadge(statusVal)}
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
                                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                      {deliveredAt}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                      {receivedBy}
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
