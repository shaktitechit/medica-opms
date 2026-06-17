"use client";

import { useCallback, useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import { toast } from "@/lib/toast";
import {
  useListTransportAgentsQuery,
  useListOrderApprovalsQuery,
} from "@/store/api";
import { formatAgentType } from "../../fleetDisplay";
import { groupAccountDispatchesByRelease } from "@/components/portal/account/order/components/accountDispatchAvailability";
import { useAppSelector } from "@/store/hooks";
import { publicApiOrigin } from "@/lib/env";
import { CreateTransportModal } from "./CreateTransportModal";

function pickList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
  }
  return [];
}

function resolveFileUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${publicApiOrigin()}${normalized}`;
}

function billDocumentMeta(
  billDocument: unknown,
): { name: string; url: string } | null {
  if (!billDocument) return null;
  if (typeof billDocument === "object" && billDocument !== null) {
    const doc = billDocument as Record<string, unknown>;
    const url = String(doc.url ?? "");
    const name = String(doc.original_name ?? doc.file_name ?? "Bill document");
    if (url) return { name, url };
  }
  return null;
}

function formatDateOnly(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
}

interface DispatchesTabProps {
  dispatches: any[];
  transports?: any[];
  isFetching: boolean;
  isPatchingDispatch: boolean;
  onUpdateStatus: (dispatchId: string, nextStatus: string) => void;
  formatDate: (v: unknown) => string;
  userNameById?: Record<string, string>;
  orderItems?: any[];
  orderId: string;
  orderStatus: string;
  expectedDeliveryDate?: string;
  shippingAddress?: any;
  onRefetch?: () => void;
}

export function DispatchesTab({
  dispatches,
  transports = [],
  isFetching,
  isPatchingDispatch,
  onUpdateStatus,
  formatDate,
  userNameById,
  orderItems = [],
  orderId,
  orderStatus,
  expectedDeliveryDate,
  shippingAddress,
  onRefetch,
}: DispatchesTabProps) {
  const [createTransportDispatchId, setCreateTransportDispatchId] = useState<string | null>(null);
  const [confirmCancelDispatchId, setConfirmCancelDispatchId] = useState<string | null>(null);

  const transportAgentsQ = useListTransportAgentsQuery({ is_active: "true" });

  const token = useAppSelector((state) => state.auth.token);
  const approvalsQ = useListOrderApprovalsQuery(
    { order: orderId },
    { skip: !orderId },
  );
  const approvals = useMemo(() => pickList(approvalsQ.data), [approvalsQ.data]);

  const releaseGroups = useMemo(
    () => groupAccountDispatchesByRelease(dispatches, approvals),
    [dispatches, approvals],
  );


  const handleViewBillDocument = useCallback(
    async (fileUrl: string) => {
      try {
        const response = await fetch(resolveFileUrl(fileUrl), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error("Failed to view file");
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
      } catch {
        toast.error("Failed to view bill document");
      }
    },
    [token],
  );

  const handleDownloadBillDocument = useCallback(
    async (fileUrl: string, fileName: string) => {
      try {
        const response = await fetch(resolveFileUrl(fileUrl), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error("Failed to download file");
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
      } catch {
        toast.error("Failed to download bill document");
      }
    },
    [token],
  );

  const transportAgents = useMemo(
    () => pickList(transportAgentsQ.data),
    [transportAgentsQ.data],
  );

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Recorded Dispatch Batches"
        description="View dispatch details, dispatched items list, and manage dispatch status."
      >
        {isFetching || approvalsQ.isLoading ? (
          <p className="text-sm text-slate-500 font-sans">Loading dispatches...</p>
        ) : dispatches.length === 0 ? (
          <p className="text-sm text-slate-500 font-sans">No dispatch batches recorded yet.</p>
        ) : (
          <div className="space-y-8 font-sans">
            {releaseGroups.map((group) => {
              const activeReleaseDispatches = group.dispatches.filter((disp) => {
                const status = String(disp.dispatch_status ?? disp.status ?? "partially_dispatched");
                return status !== "cancelled";
              });
              return (
                <div key={group.releaseId} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-white/10">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                        Release {group.releaseNo}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {activeReleaseDispatches.length} dispatch batch
                        {activeReleaseDispatches.length === 1 ? "" : "es"} recorded
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {group.dispatches.map((disp: any) => {
                      const dispId = String(disp._id ?? disp.id ?? "");
                      const dispatchStatus = String(disp.dispatch_status ?? disp.status ?? "partially_dispatched");
                      const dispatchItems = Array.isArray(disp.dispatch_items) ? disp.dispatch_items : disp.items || [];

                      // Resolve packing and dispatch staff names
                      const packedByVal = disp.packed_by;
                      const dispatchedByVal = disp.dispatched_by;

                      const packedByName = typeof packedByVal === "object" && packedByVal !== null
                        ? (packedByVal.name || packedByVal.username || "")
                        : userNameById && typeof packedByVal === "string"
                          ? (userNameById[packedByVal] || packedByVal)
                          : "";

                      const dispatchedByName = typeof dispatchedByVal === "object" && dispatchedByVal !== null
                        ? (dispatchedByVal.name || dispatchedByVal.username || "")
                        : userNameById && typeof dispatchedByVal === "string"
                          ? (userNameById[dispatchedByVal] || dispatchedByVal)
                          : "";

                      // Check if transport records match this dispatch
                      const dispatchTransports = transports.filter((tr) => {
                        const trDispatchId = typeof tr.dispatch === "object" && tr.dispatch !== null
                          ? String(tr.dispatch._id ?? tr.dispatch.id ?? "")
                          : String(tr.dispatch ?? "");
                        return trDispatchId === dispId;
                      });

                      // Find active transport (non-returned)
                      const activeTransport = dispatchTransports.find((tr) => {
                        const status = String(tr.shipment_status ?? tr.status ?? "");
                        return status !== "returned";
                      });

                      // Display active transport if it exists, otherwise display the latest returned transport
                      const transport = activeTransport || dispatchTransports[dispatchTransports.length - 1];
                      const hasTransport = !!activeTransport;

                      const billDoc = billDocumentMeta(disp.bill_document);
                      const billNumber = String(disp.bill_number ?? "").trim();
                      const billingDate = disp.billing_date;

                      return (
                <div
                  key={dispId}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-white/5">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
                          {disp.dispatch_no || "Batch Details"}
                        </h4>
                        {disp.finance_approval && (
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono">
                            Release: {typeof disp.finance_approval === "object" ? disp.finance_approval.approval_no : disp.finance_approval}
                          </span>
                        )}

                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Dispatch Date: {formatDate(disp.dispatched_at ?? disp.dispatch_date)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {dispatchStatus === "cancelled" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          Cancelled
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCreateTransportDispatchId(dispId)}
                            disabled={hasTransport || isPatchingDispatch}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition ${hasTransport
                                ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed"
                                : "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                              }`}
                          >
                            {hasTransport ? (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Transport Created
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M13 16h6a1 1 0 001-1v-4a1 1 0 00-.316-.707l-4-4A1 1 0 0015 6h-2m6 10a2 2 0 100-4 2 2 0 000 4z" />
                                </svg>
                                Create Transport
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setConfirmCancelDispatchId(dispId)}
                            disabled={hasTransport || isPatchingDispatch}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition ${hasTransport
                                ? "bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed"
                                : "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:hover:bg-rose-900/30"
                              }`}
                            title={hasTransport ? "Cannot cancel once a transport assignment exists" : "Cancel this dispatch batch"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
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
                                (oi: any) => String(oi._id ?? oi.id ?? "") === String(item.order_item_id)
                              );
                              const productName = matchItem?.product_name || item.product_name || item.product?.product_name || "—";
                              const orderedQty = matchItem
                                ? (matchItem.ordered_quantity ?? matchItem.quantity ?? 0)
                                : (item.ordered_quantity ?? "—");

                              return (
                                <tr key={String(item.order_item_id || idx)} className="bg-white dark:bg-slate-900">
                                  <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                                    {productName}
                                  </td>
                                  <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">
                                    {orderedQty}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-blue-600 dark:text-blue-400">
                                    {item.dispatched_quantity ?? item.dispatch_quantity ?? "—"}
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
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Bill Number
                        </span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {billNumber || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Billing Date
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {formatDateOnly(billingDate)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Bill Document
                        </span>
                        {billDoc ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleViewBillDocument(billDoc.url)}
                              className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-white/10 dark:text-blue-300 dark:hover:bg-blue-950/30"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDownloadBillDocument(billDoc.url, billDoc.name)}
                              className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                            >
                              Download
                            </button>
                            <span className="block w-full truncate text-[10px] text-slate-500 dark:text-slate-400" title={billDoc.name}>
                              {billDoc.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">—</span>
                        )}
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Warehouse Location
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {disp.warehouse_location || disp.warehouse || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Remarks
                        </span>
                        <span className="italic text-slate-800 dark:text-slate-200">
                          {disp.remarks || "No remarks"}
                        </span>
                      </div>
                      {packedByName && (
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                            Packed By
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {packedByName} {disp.packed_at && `on ${formatDate(disp.packed_at)}`}
                          </span>
                        </div>
                      )}
                      {dispatchedByName && (
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                            Dispatched By
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {dispatchedByName} {disp.dispatched_at && `on ${formatDate(disp.dispatched_at)}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {transport && (
                    <div className="mt-5 border-t border-slate-100 pt-4 dark:border-white/5">
                      <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5 font-sans">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M13 16h6a1 1 0 001-1v-4a1 1 0 00-.316-.707l-4-4A1 1 0 0015 6h-2m6 10a2 2 0 100-4 2 2 0 000 4z" />
                        </svg>
                        Transit & Logistics Details
                      </h5>
                      <div className="grid gap-4 rounded-lg bg-slate-50/50 p-4 border border-slate-100 dark:bg-slate-950/20 dark:border-white/5 sm:grid-cols-3 text-xs font-sans">
                        <div className="space-y-2">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Transport Agent</span>
                            {(() => {
                              const agentId =
                                transport.transport_agent && typeof transport.transport_agent === "object"
                                  ? String(transport.transport_agent._id ?? transport.transport_agent.id ?? "")
                                  : typeof transport.transport_agent === "string"
                                    ? transport.transport_agent
                                    : "";

                              const agentObj: Record<string, unknown> | null =
                                transportAgents.find(
                                  (a) => String(a._id ?? a.id ?? "") === agentId
                                ) ||
                                (transport.transport_agent && typeof transport.transport_agent === "object"
                                  ? (transport.transport_agent as Record<string, unknown>)
                                  : null);

                              if (agentObj) {
                                return (
                                  <>
                                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 block">
                                      {String(agentObj.agent_code || "—")}
                                    </span>
                                    {agentObj.agent_name && (
                                      <span className="text-xs text-slate-600 dark:text-slate-300 block mt-0.5">
                                        {String(agentObj.agent_name)}
                                      </span>
                                    )}
                                    {agentObj.agent_type && (
                                      <span className="text-[10px] text-slate-500 capitalize block mt-0.5">
                                        {formatAgentType(agentObj.agent_type)}
                                      </span>
                                    )}
                                  </>
                                );
                              }
                              return (
                                <span className="font-semibold text-slate-800 dark:text-slate-200 block">—</span>
                              );
                            })()}
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Shipment No</span>
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{transport.shipment_no}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Shipment Status</span>
                            <span className={`inline-flex items-center rounded-full mt-1 px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300`}>
                              {String(transport.shipment_status ?? "created").replace(/_/g, " ").toUpperCase()}
                            </span>
                          </div>
                          {transport.source_location && (
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Source Location</span>
                              <span className="text-slate-800 dark:text-slate-200">{transport.source_location}</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Driver Details</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block">{transport.driver_name || "—"}</span>
                            {(transport.driver_mobile || transport.driver_phone) && (
                              <span className="text-slate-500 block mt-0.5">{transport.driver_mobile || transport.driver_phone}</span>
                            )}
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Vehicle Number</span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100 uppercase">{transport.vehicle_number || transport.vehicle_no || "—"}</span>
                          </div>
                          {(transport.weight !== undefined && transport.weight !== null) && (
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Shipment Weight</span>
                              <span className="font-semibold text-slate-900 dark:text-slate-100">{transport.weight} {transport.weight_unit || "Kg"}</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">LR / E-way Bill</span>
                            <span className="text-slate-800 dark:text-slate-200 font-mono">
                              LR: {transport.lr_number || "—"} / Eway: {transport.eway_bill_no || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Delivery</span>
                            <span className="text-slate-800 dark:text-slate-200">
                              {formatDate(transport.expected_delivery_date)}
                            </span>
                          </div>
                          {transport.tracking_number && (
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Tracking Number</span>
                              <span className="text-slate-800 dark:text-slate-200 font-mono">{transport.tracking_number}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>

      <CreateTransportModal
        open={createTransportDispatchId !== null}
        onClose={() => setCreateTransportDispatchId(null)}
        orderId={orderId}
        dispatchId={createTransportDispatchId ?? ""}
        dispatches={dispatches}
        transports={transports}
        expectedDeliveryDate={expectedDeliveryDate}
        shippingAddress={shippingAddress}
        onCreated={onRefetch}
      />

      {confirmCancelDispatchId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center gap-3 bg-rose-50/60 dark:bg-rose-950/20">
              <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 bg-rose-100 dark:bg-rose-950/50">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 font-sans">
                  Cancel Dispatch Batch?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                  {(() => {
                    const target = dispatches.find(
                      (d) => String(d._id ?? d.id ?? "") === confirmCancelDispatchId,
                    );
                    const label = String(target?.dispatch_no ?? "").trim();
                    return label
                      ? `This will cancel dispatch batch ${label}.`
                      : "This will cancel the selected dispatch batch.";
                  })()}
                </p>
              </div>
            </div>

            <div className="px-6 py-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 font-sans">
                Dispatched quantities will be released back for this order. This action cannot be undone once a transport has been created.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-white/5 flex justify-end gap-3 font-sans text-xs font-medium">
              <button
                type="button"
                onClick={() => setConfirmCancelDispatchId(null)}
                disabled={isPatchingDispatch}
                className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 transition disabled:opacity-50"
              >
                Keep Dispatch
              </button>
              <button
                type="button"
                disabled={isPatchingDispatch}
                onClick={() => {
                  onUpdateStatus(confirmCancelDispatchId, "cancelled");
                  setConfirmCancelDispatchId(null);
                }}
                className="rounded-lg bg-rose-600 px-4 py-2 text-white hover:bg-rose-700 disabled:opacity-50 dark:bg-rose-500 dark:hover:bg-rose-400 transition"
              >
                {isPatchingDispatch ? "Cancelling..." : "Yes, Cancel Batch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
