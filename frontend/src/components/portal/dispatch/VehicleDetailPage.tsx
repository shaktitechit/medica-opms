"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Truck,
  FileText,
  Plus,
  Route,
  ExternalLink,
} from "lucide-react";

import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeleteVehicleMutation,
  useDeleteAttachmentMutation,
  useGetVehicleQuery,
  useLazyGetFileViewQuery,
  useListAttachmentsQuery,
  useListTransportsQuery,
} from "@/store/api";
import { VehicleDetailModal } from "./modals/VehicleDetailModal";
import { ConfirmDeleteVehicleModal } from "./modals/ConfirmDeleteVehicleModal";
import { AddVehicleDocumentModal } from "./modals/AddVehicleDocumentModal";
import { formatVehicleCapacity, transportAgentLabel } from "./fleetDisplay";

const labelClass = "text-xs font-semibold text-slate-500 dark:text-slate-400";
const valueClass = "text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5";

type VehicleTab = "documents" | "transports";

function stringField(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function idFromRef(ref: unknown): string {
  if (typeof ref === "string") return ref.trim();
  if (ref && typeof ref === "object") {
    const o = ref as Record<string, unknown>;
    return String(o._id ?? o.id ?? "").trim();
  }
  return "";
}

function formatDateReadOnly(dateVal: unknown): string {
  if (!dateVal) return "—";
  const d = new Date(String(dateVal));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "available") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-700/10 dark:bg-emerald-950/30 dark:text-emerald-400">
        Available
      </span>
    );
  }
  if (s === "maintenance") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-700/10 dark:bg-amber-950/30 dark:text-amber-400">
        Maintenance
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-700/10 dark:bg-rose-950/30 dark:text-rose-400 capitalize">
      {s.replace(/_/g, " ")}
    </span>
  );
}

function shipmentStatusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "delivered") {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
        Delivered
      </span>
    );
  }
  if (s === "delivery_failed" || s === "returned") {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 capitalize">
        {s.replace(/_/g, " ")}
      </span>
    );
  }
  if (s === "in_transit" || s === "out_for_delivery") {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 capitalize">
        {s.replace(/_/g, " ")}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 capitalize">
      {s.replace(/_/g, " ")}
    </span>
  );
}

export type VehicleDetailPageProps = {
  id: string;
};

export default function VehicleDetailPage({ id }: VehicleDetailPageProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<VehicleTab>("documents");

  const { data, isFetching, isError, refetch } = useGetVehicleQuery(id, {
    skip: !id,
  });

  const detail =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const vehicleNo = stringField(detail?.vehicle_no) || "Vehicle";

  const { data: attachmentsData, refetch: refetchAttachments } =
    useListAttachmentsQuery(
      { entity_type: "vehicle", entity_id: id },
      { skip: !id },
    );
  const attachments = pickList(attachmentsData);

  const { data: transportsData, isFetching: transportsFetching } =
    useListTransportsQuery(
      vehicleNo ? { vehicle_number: vehicleNo } : undefined,
      { skip: !vehicleNo },
    );
  const transports = useMemo(() => pickList(transportsData), [transportsData]);

  const [deleteVehicle, { isLoading: isDeleting }] = useDeleteVehicleMutation();
  const [deleteAttachment] = useDeleteAttachmentMutation();
  const [triggerFileView] = useLazyGetFileViewQuery();

  const handleDelete = useCallback(async () => {
    try {
      await deleteVehicle(id).unwrap();
      toast.success(mutationSuccessCopy("deleteVehicle"));
      router.push("/dispatch/vehicles");
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [deleteVehicle, id, router]);

  const handleViewFile = async (url: string) => {
    try {
      const match = url.match(/\/files\/([^/]+)\/view/);
      const fileId = match ? match[1] : url;
      const blob = await triggerFileView(fileId).unwrap();
      window.open(window.URL.createObjectURL(blob), "_blank");
    } catch {
      toast.error("Failed to view document.");
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    try {
      await deleteAttachment(attId).unwrap();
      toast.success("Document deleted successfully.");
      refetchAttachments();
    } catch {
      toast.error("Failed to delete document.");
    }
  };

  if (isFetching) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          Loading vehicle…
        </p>
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <div className="text-4xl">⚠️</div>
        <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">
          Vehicle not found
        </h2>
        <Link
          href="/dispatch/vehicles"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to vehicles
        </Link>
      </div>
    );
  }

  const statusStr = stringField(detail.status) || "available";

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {editOpen ? (
        <VehicleDetailModal
          vehicleId={id}
          onClose={() => {
            setEditOpen(false);
            void refetch();
            void refetchAttachments();
          }}
        />
      ) : null}

      <AddVehicleDocumentModal
        open={addDocOpen}
        vehicleId={id}
        vehicleLabel={vehicleNo}
        onClose={() => setAddDocOpen(false)}
        onUploaded={() => void refetchAttachments()}
      />

      <ConfirmDeleteVehicleModal
        vehicleId={deleteOpen ? id : null}
        vehicleLabel={vehicleNo}
        isDeleting={isDeleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />

      <div className="relative overflow-hidden rounded-2xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 p-6 dark:from-blue-500/5 dark:to-indigo-500/5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white dark:bg-white dark:text-slate-900">
                Dispatch
              </span>
              {statusBadge(statusStr)}
              {detail.is_active === false ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-400">
                  Inactive
                </span>
              ) : null}
            </div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 font-mono uppercase">
              <Truck className="h-7 w-7 text-blue-500 shrink-0" />
              {vehicleNo}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 capitalize">
              {stringField(detail.vehicle_type).replace(/_/g, " ") || "—"} ·{" "}
              {formatVehicleCapacity(detail as Record<string, unknown>)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dispatch/vehicles"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All vehicles
            </Link>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
            >
              <Edit className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-4">
          Vehicle details
        </h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className={labelClass}>Registration number</dt>
            <dd className={`${valueClass} font-mono uppercase`}>{vehicleNo}</dd>
          </div>
          <div>
            <dt className={labelClass}>Type</dt>
            <dd className={`${valueClass} capitalize`}>
              {stringField(detail.vehicle_type).replace(/_/g, " ") || "—"}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Transport agent</dt>
            <dd className={valueClass}>
              {transportAgentLabel(detail.transport_agent)}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Capacity</dt>
            <dd className={valueClass}>
              {formatVehicleCapacity(detail as Record<string, unknown>)}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Ownership</dt>
            <dd className={`${valueClass} capitalize`}>
              {stringField(detail.ownership_type) || "—"}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Status</dt>
            <dd className="mt-1">{statusBadge(statusStr)}</dd>
          </div>
          <div>
            <dt className={labelClass}>Active</dt>
            <dd className={valueClass}>
              {detail.is_active !== false ? "Yes" : "No"}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Insurance expiry</dt>
            <dd className={valueClass}>
              {formatDateReadOnly(detail.insurance_expiry)}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Fitness expiry</dt>
            <dd className={valueClass}>
              {formatDateReadOnly(detail.fitness_expiry)}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Pollution certificate expiry</dt>
            <dd className={valueClass}>
              {formatDateReadOnly(detail.pollution_expiry)}
            </dd>
          </div>
        </dl>
      </section>

      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
              activeTab === "documents"
                ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <FileText className="h-4 w-4" />
            Documents
            {attachments.length > 0 ? (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-400">
                {attachments.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("transports")}
            className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
              activeTab === "transports"
                ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Route className="h-4 w-4" />
            Transports
            {transports.length > 0 ? (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-400">
                {transports.length}
              </span>
            ) : null}
          </button>
        </div>

        <div className="p-5">
          {activeTab === "documents" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Registration, insurance, fitness, and other vehicle files.
                </p>
                <button
                  type="button"
                  onClick={() => setAddDocOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add document
                </button>
              </div>

              {attachments.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-white/10">
                  No documents yet. Click Add document to upload.
                </p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((attRaw) => {
                    const att = attRaw as Record<string, unknown>;
                    const attId = String(att._id ?? att.id ?? "");
                    return (
                      <div
                        key={attId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/40"
                      >
                        <div className="min-w-0">
                          <span
                            className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block"
                            title={String(
                              att.original_name ?? att.file_name ?? "",
                            )}
                          >
                            {String(
                              att.original_name ?? att.file_name ?? "Document",
                            )}
                          </span>
                          {typeof att.remarks === "string" && att.remarks.trim() ? (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                              {att.remarks}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {typeof att.url === "string" ? (
                            <button
                              type="button"
                              onClick={() => void handleViewFile(att.url as string)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            >
                              View
                            </button>
                          ) : null}
                          {attId ? (
                            <button
                              type="button"
                              onClick={() => void handleDeleteAttachment(attId)}
                              className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400"
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "transports" ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Shipments recorded with vehicle{" "}
                <span className="font-mono font-semibold uppercase">{vehicleNo}</span>.
              </p>

              {transportsFetching ? (
                <div className="flex justify-center py-10">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
              ) : transports.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-white/10">
                  No transport shipments linked to this vehicle yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200/90 dark:ring-white/10">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2.5">Shipment</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5">Driver</th>
                        <th className="px-3 py-2.5">Dispatch date</th>
                        <th className="px-3 py-2.5 text-right">Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {transports.map((rowRaw) => {
                        const tr = rowRaw as Record<string, unknown>;
                        const trId = idFromRef(tr._id ?? tr.id);
                        const shipmentNo = stringField(tr.shipment_no) || "—";
                        const shipmentStatus = stringField(
                          tr.shipment_status ?? tr.status,
                        ) || "created";
                        const driverName = stringField(tr.driver_name) || "—";
                        const driverMobile =
                          stringField(tr.driver_mobile ?? tr.driver_phone) ||
                          "—";
                        const orderId = idFromRef(tr.order);

                        return (
                          <tr
                            key={trId || shipmentNo}
                            className="bg-white dark:bg-slate-900"
                          >
                            <td className="px-3 py-3 font-semibold text-slate-900 dark:text-slate-100">
                              {shipmentNo}
                            </td>
                            <td className="px-3 py-3">
                              {shipmentStatusBadge(shipmentStatus)}
                            </td>
                            <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                              <div>{driverName}</div>
                              {driverMobile !== "—" ? (
                                <div className="text-[10px] text-slate-500 tabular-nums">
                                  {driverMobile}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 tabular-nums text-slate-600 dark:text-slate-400">
                              {formatDateReadOnly(tr.dispatch_date)}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {orderId ? (
                                <Link
                                  href={`/dispatch/order/${orderId}`}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                                >
                                  View order
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
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
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
