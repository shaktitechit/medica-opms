"use client";

import { useMemo } from "react";
import { DashboardCard } from "@/components/widgets";
import { useListTransportsQuery, useListTransportAgentsQuery } from "@/store/api";

/* ─── Status pipeline ─────────────────────────────────────────────────────── */

const STATUS_PIPELINE = [
  { key: "in_transit",       label: "In Transit",       color: "blue"    },
  { key: "out_for_delivery", label: "Out for Delivery", color: "amber"   },
  { key: "delivered",        label: "Delivered",        color: "emerald" },
  { key: "returned",         label: "Returned",         color: "rose"    },
] as const;

const TERMINAL_STATUSES = ["delivered", "returned", "delivery_failed"];

function statusBadgeClass(status: string): string {
  if (status === "delivered")
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400";
  if (status === "returned" || status === "delivery_failed")
    return "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400";
  if (status === "in_transit" || status === "out_for_delivery")
    return "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400";
  return "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400";
}

function formatAgentType(t: unknown): string {
  const s = String(t || "").toLowerCase();
  if (s === "internal_fleet") return "Internal Fleet";
  if (s === "third_party") return "Third Party";
  return s.replace(/_/g, " ");
}

type TransportsTabProps = {
  orderId: string;
  detail: Record<string, any> | null;
  refetchOrder?: () => void;
};

function pickList(raw: unknown): Record<string, any>[] {
  if (Array.isArray(raw)) return raw as Record<string, any>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, any>[];
    if (Array.isArray(o.data)) return o.data as Record<string, any>[];
  }
  return [];
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export function TransportsTab({ orderId }: TransportsTabProps) {
  const transportsQ = useListTransportsQuery({ order: orderId });
  const transportAgentsQ = useListTransportAgentsQuery({});

  const transports = useMemo(() => pickList(transportsQ.data), [transportsQ.data]);
  const transportAgents = useMemo(() => pickList(transportAgentsQ.data), [transportAgentsQ.data]);

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Recorded Transport Logistics"
        description="View details of transporters, vehicles, drivers, route assignments, and current shipment status."
      >
        {transportsQ.isLoading || transportAgentsQ.isLoading ? (
          <p className="text-sm text-slate-500 font-sans">Loading transports...</p>
        ) : transports.length === 0 ? (
          <p className="text-sm text-slate-500 font-sans">No transport arrangements recorded yet.</p>
        ) : (
          <div className="space-y-6 font-sans">
            {transports.map((tr: any) => {
              const trId = String(tr._id ?? tr.id ?? "");
              const shipmentStatus = String(tr.shipment_status ?? tr.status ?? "created");
              const vehicleNumber = tr.vehicle_number ?? tr.vehicle_no;
              const driverMobile = tr.driver_mobile ?? tr.driver_phone;
              const isTerminal = TERMINAL_STATUSES.includes(shipmentStatus);

              return (
                <div
                  key={trId}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 animate-fadeIn"
                >
                  {/* Header */}
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-white/5">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
                          {tr.shipment_no || vehicleNumber || "Transport Shipment"}
                        </h4>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(
                            shipmentStatus
                          )}`}
                        >
                          {shipmentStatus.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Dispatch Date: {formatDate(tr.dispatch_date)}
                      </p>
                    </div>
                  </div>

                  {/* Progress Pipeline */}
                  {!isTerminal && (
                    <>
                      <div className="mt-3 mb-1 flex items-center gap-1">
                        {STATUS_PIPELINE.map((step, idx) => {
                          const stepOrder = STATUS_PIPELINE.findIndex(
                            (s) => s.key === shipmentStatus
                          );
                          const isDone = idx <= stepOrder && stepOrder >= 0;
                          return (
                            <div
                              key={step.key}
                              className="flex items-center gap-1 flex-1 last:flex-none"
                            >
                              <div
                                className={`h-1.5 w-full rounded-full transition-colors ${
                                  isDone
                                    ? "bg-emerald-500"
                                    : "bg-slate-200 dark:bg-slate-700"
                                }`}
                              />
                              {idx === STATUS_PIPELINE.length - 1 && (
                                <div
                                  className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                    isDone
                                      ? "bg-emerald-500"
                                      : "bg-slate-200 dark:bg-slate-700"
                                  }`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-1 mb-3 flex justify-between text-2xs font-semibold uppercase tracking-wider text-slate-400 px-0.5">
                        {STATUS_PIPELINE.map((s) => (
                          <span
                            key={s.key}
                            className={
                              shipmentStatus === s.key
                                ? "text-slate-700 dark:text-slate-200"
                                : ""
                            }
                          >
                            {s.label}
                          </span>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Details Grid */}
                  <div className="grid gap-6 mt-4 sm:grid-cols-3">
                    <div className="space-y-4">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Transporter Info
                      </h5>
                      <div>
                        <span className="block text-2xs text-slate-400">Type</span>
                        <span className="text-sm font-semibold capitalize text-slate-800 dark:text-slate-200">
                          {tr.transporter_type}
                        </span>
                      </div>
                      {tr.transporter_type === "external" ? (
                        <>
                          <div>
                            <span className="block text-2xs text-slate-400">Transporter Name</span>
                            <span className="text-sm text-slate-800 dark:text-slate-200">
                              {tr.transporter_name || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="block text-2xs text-slate-400">Phone</span>
                            <span className="text-sm text-slate-800 dark:text-slate-200">
                              {tr.transporter_phone || "—"}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs italic text-slate-400 font-sans">Internal fleet delivery</div>
                      )}

                      {(() => {
                        const agentId =
                          tr.transport_agent && typeof tr.transport_agent === "object"
                            ? String(tr.transport_agent._id ?? tr.transport_agent.id ?? "")
                            : typeof tr.transport_agent === "string"
                              ? tr.transport_agent
                              : "";

                        const agentObj: Record<string, any> | null =
                          transportAgents.find(
                            (a) => String(a._id ?? a.id ?? "") === agentId
                          ) ||
                          (tr.transport_agent && typeof tr.transport_agent === "object"
                            ? (tr.transport_agent as Record<string, any>)
                            : null);

                        if (agentObj) {
                          return (
                            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/5 space-y-1">
                              <span className="block text-2xs text-slate-400">Linked Agent</span>
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                                {String(agentObj.agent_name || "—")}
                              </span>
                              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 block">
                                Code: {String(agentObj.agent_code || "—")}
                              </span>
                              {agentObj.agent_type && (
                                <span className="text-2xs text-slate-500 capitalize block">
                                  Type: {formatAgentType(agentObj.agent_type)}
                                </span>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    <div className="space-y-4">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Driver & Vehicle Details
                      </h5>
                      <div>
                        <span className="block text-2xs text-slate-400">Vehicle Number</span>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase">
                          {vehicleNumber || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-2xs text-slate-400">Driver Name</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200">
                          {tr.driver_name || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-2xs text-slate-400">Driver Phone</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200">
                          {driverMobile || "—"}
                        </span>
                      </div>
                      {tr.weight !== undefined && tr.weight !== null && (
                        <div>
                          <span className="block text-2xs text-slate-400">Shipment Weight</span>
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {tr.weight} {tr.weight_unit || "Kg"}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Locations & Dates
                      </h5>
                      <div>
                        <span className="block text-2xs text-slate-400">Route</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200 block">
                          From: {tr.source_location || "—"}
                        </span>
                        <span className="text-sm text-slate-800 dark:text-slate-200 block mt-0.5">
                          To: {tr.destination_location || "—"}
                        </span>
                      </div>
                      {tr.route_details && (
                        <div>
                          <span className="block text-2xs text-slate-400">Route Details</span>
                          <span className="text-sm text-slate-800 dark:text-slate-200">
                            {tr.route_details}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="block text-2xs text-slate-400">Expected Delivery</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200">
                          {formatDate(tr.expected_delivery_date)}
                        </span>
                      </div>
                      {tr.actual_delivery_date && (
                        <div>
                          <span className="block text-2xs text-slate-400">Delivered At</span>
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            {formatDate(tr.actual_delivery_date)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {tr.remarks && (
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 space-y-2">
                      <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Remarks History
                      </span>
                      <div className="space-y-2">
                        {String(tr.remarks)
                          .split("\n")
                          .filter((line) => line.trim().length > 0)
                          .map((line, idx) => {
                            const match = line.match(/^\[(.*?)\]\s*\[(.*?)\]:\s*(.*)$/);
                            if (match) {
                              const [, timeStr, statusLabel, text] = match;
                              return (
                                <div key={idx} className="text-xs font-sans flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2">
                                  <span className="text-2xs text-slate-400 font-mono shrink-0 mt-0.5">{timeStr}</span>
                                  <span className="inline-flex items-center rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-2xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wide shrink-0">
                                    {statusLabel}
                                  </span>
                                  <span className="text-slate-700 dark:text-slate-300 italic">{text}</span>
                                </div>
                              );
                            }
                            return (
                              <p key={idx} className="text-xs text-slate-700 dark:text-slate-300 italic">
                                {line}
                              </p>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

export default TransportsTab;
