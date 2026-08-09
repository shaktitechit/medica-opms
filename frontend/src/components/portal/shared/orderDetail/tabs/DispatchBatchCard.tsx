"use client";

import type { ReactNode } from "react";
import { formatAgentType } from "@/components/portal/shared/fleetDisplay";

type DispatchBatchCardProps = {
  dispatch: Record<string, any>;
  orderItems?: Record<string, any>[];
  transports?: Record<string, any>[];
  transportAgents?: Record<string, any>[];
  userNameById?: Record<string, string>;
  formatDate: (v: unknown) => string;
  actions?: ReactNode;
  footer?: ReactNode;
};

export function DispatchBatchCard({
  dispatch: disp,
  orderItems = [],
  transports = [],
  transportAgents = [],
  userNameById = {},
  formatDate,
  actions,
  footer,
}: DispatchBatchCardProps) {
  const dispId = String(disp._id ?? disp.id ?? "");
  const dispatchStatus = String(
    disp.dispatch_status ?? disp.status ?? "partially_dispatched",
  );
  const dispatchItems = Array.isArray(disp.dispatch_items)
    ? disp.dispatch_items
    : disp.items || [];

  const packedByVal = disp.packed_by;
  const dispatchedByVal = disp.dispatched_by;
  const packedByName =
    typeof packedByVal === "object" && packedByVal !== null
      ? packedByVal.name || packedByVal.username || ""
      : typeof packedByVal === "string"
        ? userNameById[packedByVal] || packedByVal
        : "";
  const dispatchedByName =
    typeof dispatchedByVal === "object" && dispatchedByVal !== null
      ? dispatchedByVal.name || dispatchedByVal.username || ""
      : typeof dispatchedByVal === "string"
        ? userNameById[dispatchedByVal] || dispatchedByVal
        : "";

  const dispatchTransports = transports.filter((tr) => {
    const trDispatchId =
      typeof tr.dispatch === "object" && tr.dispatch !== null
        ? String(tr.dispatch._id ?? tr.dispatch.id ?? "")
        : String(tr.dispatch ?? "");
    return trDispatchId === dispId;
  });
  const activeTransport = dispatchTransports.find((tr) => {
    const status = String(tr.shipment_status ?? tr.status ?? "");
    return status !== "returned";
  });
  const transport =
    activeTransport || dispatchTransports[dispatchTransports.length - 1];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-white/5">
        <div>
          <div className="flex items-center gap-3">
            <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
              {disp.dispatch_no || "Batch Details"}
            </h4>
            {disp.finance_approval ? (
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono">
                Release:{" "}
                {typeof disp.finance_approval === "object"
                  ? disp.finance_approval.approval_no
                  : disp.finance_approval}
              </span>
            ) : null}
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                dispatchStatus === "cancelled"
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400"
                  : dispatchStatus === "fully_dispatched"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
              }`}
            >
              {dispatchStatus.replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Dispatch Date: {formatDate(disp.dispatched_at ?? disp.dispatch_date)}
          </p>
        </div>
        {actions}
      </div>

      <div className="grid gap-6 mt-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
            Dispatched Items
          </h5>
          <div className="overflow-x-auto rounded-lg border border-slate-200/60 dark:border-white/5">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-medium">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-center w-24">Ordered</th>
                  <th className="px-3 py-2 text-right w-24">This Batch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {dispatchItems.map((item: any, idx: number) => {
                  const matchItem = orderItems.find(
                    (oi: any) =>
                      String(oi._id ?? oi.id ?? "") ===
                      String(item.order_item_id),
                  );
                  const productName =
                    matchItem?.product_name ||
                    item.product_name ||
                    item.product?.product_name ||
                    "—";
                  const orderedQty = matchItem
                    ? (matchItem.ordered_quantity ?? matchItem.quantity ?? 0)
                    : (item.ordered_quantity ?? "—");
                  return (
                    <tr
                      key={String(item.order_item_id || idx)}
                      className="bg-white dark:bg-slate-900"
                    >
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                        {productName}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">
                        {orderedQty}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-600 dark:text-blue-400">
                        {item.dispatched_quantity ??
                          item.dispatch_quantity ??
                          "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3 rounded-lg bg-slate-50/50 p-4 border border-slate-100 dark:bg-slate-950/10 dark:border-white/5 text-xs">
          <div>
            <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Warehouse Location
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {disp.warehouse_location || disp.warehouse || "—"}
            </span>
          </div>
          <div>
            <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Remarks
            </span>
            <span className="italic text-slate-800 dark:text-slate-200">
              {disp.remarks || "No remarks"}
            </span>
          </div>
          {packedByName ? (
            <div>
              <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                Packed By
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {packedByName}{" "}
                {disp.packed_at ? `on ${formatDate(disp.packed_at)}` : ""}
              </span>
            </div>
          ) : null}
          {dispatchedByName ? (
            <div>
              <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                Dispatched By
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {dispatchedByName}{" "}
                {disp.dispatched_at
                  ? `on ${formatDate(disp.dispatched_at)}`
                  : ""}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {transport ? (
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-white/5">
          <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
            Associated Transit Logistics
          </h5>
          <div className="grid gap-4 rounded-lg bg-slate-50/50 p-4 border border-slate-100 dark:bg-slate-950/20 dark:border-white/5 sm:grid-cols-3 text-xs">
            <div>
              <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">
                Transport Agent
              </span>
              {(() => {
                const agentId =
                  transport.transport_agent &&
                  typeof transport.transport_agent === "object"
                    ? String(
                        transport.transport_agent._id ??
                          transport.transport_agent.id ??
                          "",
                      )
                    : typeof transport.transport_agent === "string"
                      ? transport.transport_agent
                      : "";
                const agentObj =
                  transportAgents.find(
                    (a) => String(a._id ?? a.id ?? "") === agentId,
                  ) ||
                  (transport.transport_agent &&
                  typeof transport.transport_agent === "object"
                    ? transport.transport_agent
                    : null);
                if (!agentObj) return <span className="font-semibold">—</span>;
                return (
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {String(agentObj.agent_name || "—")}
                    {agentObj.agent_type
                      ? ` (${formatAgentType(agentObj.agent_type)})`
                      : ""}
                  </span>
                );
              })()}
            </div>
            <div>
              <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">
                Vehicle
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase">
                {transport.vehicle_number ?? transport.vehicle_no ?? "—"}
              </span>
            </div>
            <div>
              <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">
                Shipment Status
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
                {String(transport.shipment_status ?? transport.status ?? "—").replace(
                  /_/g,
                  " ",
                )}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {footer}
    </div>
  );
}
