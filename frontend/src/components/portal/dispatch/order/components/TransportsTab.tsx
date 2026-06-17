"use client";

import { useRef, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import {
  useCreateAttachmentMutation,
} from "@/store/api";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { OrderDeliveryModal } from "./OrderDeliveryModal";

/* ─── Status pipeline ─────────────────────────────────────────────────────── */

const STATUS_PIPELINE = [
  { key: "in_transit",       label: "In Transit",       color: "blue"    },
  { key: "out_for_delivery", label: "Out for Delivery", color: "amber"   },
  { key: "delivered",        label: "Delivered",        color: "emerald" },
  { key: "returned",         label: "Returned",         color: "rose"    },
] as const;

type PipelineStatus = (typeof STATUS_PIPELINE)[number]["key"];

const TERMINAL_STATUSES = ["delivered", "returned", "delivery_failed"];

const NEXT_STATUS_MAP: Record<string, PipelineStatus | null> = {
  created:              "in_transit",
  transporter_assigned: "in_transit",
  vehicle_assigned:     "in_transit",
  pickup_pending:       "in_transit",
  picked_up:            "in_transit",
  in_transit:           "out_for_delivery",
  out_for_delivery:     "delivered",
  delivered:            null,
  delivery_failed:      null,
  returned:             null,
};

function statusBadgeClass(status: string): string {
  if (status === "delivered")
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400";
  if (status === "returned" || status === "delivery_failed")
    return "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400";
  if (status === "in_transit" || status === "out_for_delivery")
    return "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400";
  return "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400";
}

function formatOptionalCount(value: unknown): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "—";
}

/* ─── Props ───────────────────────────────────────────────────────────────── */

interface TransportsTabProps {
  transports: any[];
  isFetching: boolean;
  isPatchingTransport: boolean;
  onUpdateStatus: (
    transportId: string,
    nextStatus: string,
    remarks?: string,
    suppressToast?: boolean,
  ) => void | Promise<{ orderClosed?: boolean } | void>;
  formatDate: (v: unknown) => string;
  orderId: string;
  onRefetch?: () => void;
  dispatches?: any[];
  orderItems?: any[];
}

/* ─── Component ───────────────────────────────────────────────────────────── */

export function TransportsTab({
  transports,
  isFetching,
  isPatchingTransport,
  onUpdateStatus,
  formatDate,
  orderId,
  onRefetch,
  dispatches = [],
  orderItems = [],
}: TransportsTabProps) {
  const [createAttachment, { isLoading: isUploading }] = useCreateAttachmentMutation();

  /* confirmation dialog state */
  const [confirmPending, setConfirmPending] = useState<{
    transportId: string;
    targetStatus: PipelineStatus;
    dispatchId?: string;
  } | null>(null);

  /* form fields inside confirmation modal */
  const [remarks, setRemarks]       = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  const [deliveryModal, setDeliveryModal] = useState<{
    transportId: string;
    dispatchId: string;
  } | null>(null);

  const openConfirm = (
    transportId: string,
    targetStatus: PipelineStatus,
    dispatchId?: string,
  ) => {
    setConfirmPending({ transportId, targetStatus, dispatchId });
    setRemarks("");
    setUploadFile(null);
  };

  const closeConfirm = () => {
    setConfirmPending(null);
    setRemarks("");
    setUploadFile(null);
  };

  const handleConfirm = async () => {
    if (!confirmPending) return;

    /* 1 — update transport status with remarks */
    onUpdateStatus(confirmPending.transportId, confirmPending.targetStatus, remarks.trim() || undefined);

    /* 2 — upload document if provided */
    if (uploadFile) {
      try {
        const fd = new FormData();
        fd.append("file", uploadFile);
        fd.append("entity_type", "order");
        fd.append("entity_id", orderId);
        fd.append(
          "remarks",
          `[${confirmPending.targetStatus.replace(/_/g, " ")}] ${remarks.trim()}`.trim(),
        );
        await createAttachment(fd).unwrap();
        toast.success("Document uploaded successfully.");
        onRefetch?.();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      }
    }

    closeConfirm();
  };

  /* ── render ── */

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Recorded Transport Logistics"
        description="View transporter, vehicle, driver, and route details. Advance shipment status using the action buttons."
      >
        {isFetching ? (
          <p className="text-sm text-slate-500 font-sans">Loading transports...</p>
        ) : transports.length === 0 ? (
          <p className="text-sm text-slate-500 font-sans">
            No transport arrangements recorded yet.
          </p>
        ) : (
          <div className="space-y-6 font-sans">
            {transports.map((tr: any) => {
              const trId          = String(tr._id ?? tr.id ?? "");
              const shipmentStatus = String(tr.shipment_status ?? tr.status ?? "created");
              const vehicleNumber  = tr.vehicle_number ?? tr.vehicle_no;
              const driverMobile   = tr.driver_mobile ?? tr.driver_phone;
              const isTerminal     = TERMINAL_STATUSES.includes(shipmentStatus);

              /* resolve linked dispatch ID */
              const dispatchId: string | undefined =
                tr.dispatch && typeof tr.dispatch === "object"
                  ? String(tr.dispatch._id ?? tr.dispatch.id ?? "")
                  : typeof tr.dispatch === "string"
                    ? tr.dispatch
                    : undefined;

              const nextStatus = NEXT_STATUS_MAP[shipmentStatus] ?? null;

              return (
                <div
                  key={trId}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"
                >
                  {/* ── Header ── */}
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-white/5">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
                          {tr.shipment_no || vehicleNumber || "Transport Shipment"}
                        </h4>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(shipmentStatus)}`}
                        >
                          {shipmentStatus.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Dispatch Date: {formatDate(tr.dispatch_date)}
                      </p>
                    </div>

                    {/* ── Action Buttons ── */}
                    <div className="flex flex-wrap items-center gap-2">
                      {isTerminal ? (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                            shipmentStatus === "delivered"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-3 w-3"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {shipmentStatus === "delivered" ? "Delivered" : "Finalized"}
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Next step button */}
                          {nextStatus && (
                            <button
                              type="button"
                              disabled={isPatchingTransport}
                              onClick={() => {
                                if (nextStatus === "delivered") {
                                  if (!dispatchId) {
                                    toast.error("No linked dispatch reference found for this transport shipment.");
                                    return;
                                  }
                                  setDeliveryModal({ transportId: trId, dispatchId });
                                } else {
                                  openConfirm(trId, nextStatus, dispatchId);
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                nextStatus === "in_transit"
                                  ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                                  : nextStatus === "out_for_delivery"
                                    ? "bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400"
                                    : "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                              }`}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                              {STATUS_PIPELINE.find((s) => s.key === nextStatus)?.label ??
                                nextStatus}
                            </button>
                          )}

                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Progress Pipeline ── */}
                  {!isTerminal && (
                    <>
                      <div className="mt-3 mb-1 flex items-center gap-1">
                        {STATUS_PIPELINE.map((step, idx) => {
                          const stepOrder = STATUS_PIPELINE.findIndex(
                            (s) => s.key === shipmentStatus,
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
                      <div className="mt-1 mb-3 flex justify-between text-[9px] font-semibold uppercase tracking-wider text-slate-400 px-0.5">
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

                  {/* ── Details Grid ── */}
                  <div className="grid gap-6 mt-2 sm:grid-cols-3">
                    <div className="space-y-4">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Transporter Info
                      </h5>
                      <div>
                        <span className="block text-[10px] text-slate-400">Type</span>
                        <span className="text-sm font-semibold capitalize text-slate-800 dark:text-slate-200">
                          {tr.transporter_type}
                        </span>
                      </div>
                      {tr.transporter_type === "external" ? (
                        <>
                          <div>
                            <span className="block text-[10px] text-slate-400">
                              Transporter Name
                            </span>
                            <span className="text-sm text-slate-800 dark:text-slate-200">
                              {tr.transporter_name || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400">Phone</span>
                            <span className="text-sm text-slate-800 dark:text-slate-200">
                              {tr.transporter_phone || "—"}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          {tr.transporter_name || tr.transporter_phone ? (
                            <>
                              <div>
                                <span className="block text-[10px] text-slate-400">
                                  Transporter Name
                                </span>
                                <span className="text-sm text-slate-800 dark:text-slate-200">
                                  {tr.transporter_name || "—"}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-400">Phone</span>
                                <span className="text-sm text-slate-800 dark:text-slate-200">
                                  {tr.transporter_phone || "—"}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="text-xs italic text-slate-400">
                              Internal fleet delivery
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="space-y-4">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Driver &amp; Vehicle Details
                      </h5>
                      <div>
                        <span className="block text-[10px] text-slate-400">Vehicle Number</span>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {vehicleNumber || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">Driver Name</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200">
                          {tr.driver_name || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">Driver Phone</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200">
                          {driverMobile || "—"}
                        </span>
                      </div>
                      {tr.weight !== undefined && tr.weight !== null && (
                        <div>
                          <span className="block text-[10px] text-slate-400">Shipment Weight</span>
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {tr.weight} {tr.weight_unit || "Kg"}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="block text-[10px] text-slate-400">Packed Boxes</span>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {formatOptionalCount(tr.packed_boxes)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">Open Boxes</span>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {formatOptionalCount(tr.open_boxes)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">Total Quantity</span>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {formatOptionalCount(tr.total_quantity)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Locations &amp; Dates
                      </h5>
                      <div>
                        <span className="block text-[10px] text-slate-400">Route</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200 block">
                          From: {tr.source_location || "—"}
                        </span>
                        <span className="text-sm text-slate-800 dark:text-slate-200 block mt-0.5">
                          To: {tr.destination_location || "—"}
                        </span>
                      </div>
                      {tr.route_details && (
                        <div>
                          <span className="block text-[10px] text-slate-400">Route Details</span>
                          <span className="text-sm text-slate-800 dark:text-slate-200">
                            {tr.route_details}
                          </span>
                        </div>
                      )}
                      {(tr.lr_number || tr.eway_bill_no || tr.tracking_number) && (
                        <div>
                          <span className="block text-[10px] text-slate-400">LR / E-way / Tracking</span>
                          <span className="text-sm text-slate-800 dark:text-slate-200 font-mono block">
                            LR: {tr.lr_number || "—"}
                          </span>
                          <span className="text-sm text-slate-800 dark:text-slate-200 font-mono block mt-0.5">
                            E-way: {tr.eway_bill_no || "—"}
                          </span>
                          {tr.tracking_number && (
                            <span className="text-sm text-slate-800 dark:text-slate-200 font-mono block mt-0.5">
                              Tracking: {tr.tracking_number}
                            </span>
                          )}
                        </div>
                      )}
                      <div>
                        <span className="block text-[10px] text-slate-400">Expected Delivery</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200">
                          {formatDate(tr.expected_delivery_date)}
                        </span>
                      </div>
                      {tr.actual_delivery_date && (
                        <div>
                          <span className="block text-[10px] text-slate-400">Delivered At</span>
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                            {formatDate(tr.actual_delivery_date)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {tr.remarks && (
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 space-y-2">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
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
                                  <span className="text-[10px] text-slate-400 font-mono shrink-0 mt-0.5">{timeStr}</span>
                                  <span className="inline-flex items-center rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wide shrink-0">
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

      {/* ── Confirmation Modal ── */}
      {confirmPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900 overflow-hidden">
            {/* Modal header */}
            <div
              className={`px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center gap-3 ${
                confirmPending.targetStatus === "returned"
                  ? "bg-rose-50/60 dark:bg-rose-950/20"
                  : confirmPending.targetStatus === "delivered"
                    ? "bg-emerald-50/60 dark:bg-emerald-950/20"
                    : "bg-blue-50/60 dark:bg-blue-950/20"
              }`}
            >
              <div
                className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                  confirmPending.targetStatus === "returned"
                    ? "bg-rose-100 dark:bg-rose-950/50"
                    : confirmPending.targetStatus === "delivered"
                      ? "bg-emerald-100 dark:bg-emerald-950/50"
                      : "bg-blue-100 dark:bg-blue-950/50"
                }`}
              >
                {confirmPending.targetStatus === "returned" ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                ) : confirmPending.targetStatus === "delivered" ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 font-sans">
                  Confirm Status Update
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                  Mark shipment as{" "}
                  <span className="font-semibold capitalize">
                    {confirmPending.targetStatus.replace(/_/g, " ")}
                  </span>
                </p>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4 font-sans">
              {/* Returned warning */}
              {confirmPending.targetStatus === "returned" && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/30 p-3 text-xs text-amber-800 dark:text-amber-300">
                  ⚠️ Marking as <strong>Returned</strong> will open the Create Transport form
                  so you can arrange a re-dispatch for the returned goods.
                </div>
              )}

              {/* Remarks */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Remarks <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={
                    confirmPending.targetStatus === "returned"
                      ? "Describe the reason for return…"
                      : confirmPending.targetStatus === "delivered"
                        ? "Confirm delivery details, recipient name, etc…"
                        : "Add any transit notes…"
                  }
                  className="w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 resize-none"
                />
              </div>

              {/* Document upload */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Supporting Document{" "}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>

                {!uploadFile ? (
                  <div
                    className="relative flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition cursor-pointer"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.[0]) setUploadFile(e.dataTransfer.files[0]);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) setUploadFile(e.target.files[0]);
                      }}
                    />
                    <svg
                      className="mx-auto h-8 w-8 text-slate-350 dark:text-slate-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-blue-600 hover:text-blue-500">
                        Click to upload
                      </span>{" "}
                      or drag &amp; drop
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      PDF, image, or any file up to 50 MB
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-white/5 p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg
                        className="h-5 w-5 text-blue-500 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <div className="min-w-0">
                        <p
                          className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[220px]"
                          title={uploadFile.name}
                        >
                          {uploadFile.name}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUploadFile(null)}
                      className="text-xs text-rose-500 hover:underline font-semibold shrink-0 ml-2"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-white/5 flex justify-end gap-3 font-sans">
              <button
                type="button"
                onClick={closeConfirm}
                className="rounded-lg border border-slate-200/95 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPatchingTransport || isUploading}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  confirmPending.targetStatus === "returned"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : confirmPending.targetStatus === "delivered"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {isPatchingTransport || isUploading ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      <OrderDeliveryModal
        open={deliveryModal !== null}
        onClose={() => setDeliveryModal(null)}
        orderId={orderId}
        transportId={deliveryModal?.transportId ?? ""}
        dispatchId={deliveryModal?.dispatchId ?? ""}
        dispatches={dispatches}
        orderItems={orderItems}
        onRefetch={onRefetch}
      />
    </div>
  );
}
