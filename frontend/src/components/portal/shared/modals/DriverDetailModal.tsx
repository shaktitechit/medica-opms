"use client";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { useCallback, useEffect, useState } from "react";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCreateDriverMutation,
  useGetDriverQuery,
  usePatchDriverMutation,
  useListVehiclesQuery,
  useListTransportAgentsQuery,
  useCreateAttachmentMutation,
  useListAttachmentsQuery,
  useDeleteAttachmentMutation,
  useLazyGetFileViewQuery,
} from "@/store/api";
import { idFromRef, transportAgentLabel } from "../fleetDisplay";

export type DriverDetailModalProps = {
  driverId: string | null;
  create?: boolean;
  defaultTransportAgentId?: string;
  onClose: () => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

function stringField(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function formatDateForInput(dateVal: unknown): string {
  if (!dateVal) return "";
  const d = new Date(String(dateVal));
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
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

type VehicleRow = {
  _id?: string;
  id?: string;
  vehicle_no?: string;
};

export function DriverDetailModal({
  driverId,
  create = false,
  defaultTransportAgentId,
  onClose,
}: DriverDetailModalProps) {
  const isCreate = create === true;
  const open = isCreate || (driverId != null && driverId !== "");
  const skipGet = !open || isCreate || !driverId;

  const { data, isFetching, isError, refetch } = useGetDriverQuery(
    driverId ?? "",
    { skip: skipGet },
  );

  const { data: vehiclesData } = useListVehiclesQuery({}, { skip: !open });
  const vehicles = pickList(vehiclesData) as VehicleRow[];

  const { data: agentsData } = useListTransportAgentsQuery(
    { is_active: "true" },
    { skip: !open },
  );
  const transportAgents = pickList(agentsData);

  const { data: attachmentsData, refetch: refetchAttachments } = useListAttachmentsQuery(
    { entity_type: "driver", entity_id: driverId ?? "" },
    { skip: !driverId || isCreate }
  );
  const attachments = pickList(attachmentsData);

  const [createDriver, { isLoading: isCreating }] = useCreateDriverMutation();
  const [patchDriver, { isLoading: isPatching }] = usePatchDriverMutation();
  const [createAttachment, { isLoading: isUploading }] = useCreateAttachmentMutation();
  const [deleteAttachment] = useDeleteAttachmentMutation();
  const [triggerFileView] = useLazyGetFileViewQuery();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [alternate_phone, setAlternatePhone] = useState("");
  const [transport_agent, setTransportAgent] = useState("");
  const [license_no, setLicenseNo] = useState("");
  const [license_type, setLicenseType] = useState("");
  const [license_expiry, setLicenseExpiry] = useState("");
  const [assigned_vehicle, setAssignedVehicle] = useState("");
  const [status, setStatus] = useState("available");
  const [remarks, setRemarks] = useState("");
  const [is_active, setIsActive] = useState(true);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const detail =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setUploadFile(null);
      return;
    }
    if (!isCreate) {
      setEditing(false);
    }
  }, [open, driverId, isCreate]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const hydrateFromDetail = useCallback(() => {
    if (!detail) return;
    setName(stringField(detail.name));
    setPhone(stringField(detail.phone));
    setAlternatePhone(stringField(detail.alternate_phone));
    setTransportAgent(idFromRef(detail.transport_agent));
    setLicenseNo(stringField(detail.license_no));
    setLicenseType(stringField(detail.license_type));
    setLicenseExpiry(formatDateForInput(detail.license_expiry));

    const v = detail.assigned_vehicle;
    if (v && typeof v === "object") {
      setAssignedVehicle(stringField((v as Record<string, unknown>)._id || (v as Record<string, unknown>).id));
    } else {
      setAssignedVehicle(stringField(v));
    }

    setStatus(stringField(detail.status) || "available");
    setRemarks(stringField(detail.remarks));
    setIsActive(detail.is_active !== false);
  }, [detail]);

  const startEdit = useCallback(() => {
    hydrateFromDetail();
    setEditing(true);
  }, [hydrateFromDetail]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setUploadFile(null);
    if (detail) hydrateFromDetail();
  }, [detail, hydrateFromDetail]);

  const resetCreateForm = useCallback(() => {
    setName("");
    setPhone("");
    setAlternatePhone("");
    setTransportAgent(defaultTransportAgentId ?? "");
    setLicenseNo("");
    setLicenseType("");
    setLicenseExpiry("");
    setAssignedVehicle("");
    setStatus("available");
    setRemarks("");
    setIsActive(true);
    setUploadFile(null);
  }, []);

  useEffect(() => {
    if (isCreate && open) {
      resetCreateForm();
      setEditing(true);
    }
  }, [isCreate, open, resetCreateForm]);

  useEffect(() => {
    if (detail && !editing) {
      hydrateFromDetail();
    }
  }, [detail, editing, hydrateFromDetail]);

  const validate = useCallback((): boolean => {
    if (!name.trim()) {
      toast.error("Name is required.");
      return false;
    }
    if (!phone.trim()) {
      toast.error("Phone is required.");
      return false;
    }
    if (!transport_agent.trim()) {
      toast.error("Transport agent is required.");
      return false;
    }
    return true;
  }, [name, phone, transport_agent]);

  const buildPayload = useCallback((): Record<string, unknown> => {
    return {
      name: name.trim(),
      phone: phone.trim(),
      alternate_phone: alternate_phone.trim() || undefined,
      transport_agent,
      license_no: license_no.trim(),
      license_type: license_type || undefined,
      license_expiry: license_expiry ? new Date(license_expiry).toISOString() : null,
      assigned_vehicle: assigned_vehicle || null,
      status: status || "available",
      remarks: remarks.trim() || undefined,
      is_active,
    };
  }, [
    name,
    phone,
    alternate_phone,
    transport_agent,
    license_no,
    license_type,
    license_expiry,
    assigned_vehicle,
    status,
    remarks,
    is_active,
  ]);

  const handleCreate = useCallback(async () => {
    if (!validate()) return;
    try {
      const res = (await createDriver(buildPayload()).unwrap()) as any;
      const createdId = res._id || res.id;
      if (uploadFile && createdId) {
        const fd = new FormData();
        fd.append("file", uploadFile);
        fd.append("entity_type", "driver");
        fd.append("entity_id", createdId);
        fd.append("remarks", "Uploaded during driver creation");
        await createAttachment(fd).unwrap();
      }
      toast.success(mutationSuccessCopy("createDriver"));
      onClose();
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [buildPayload, createDriver, uploadFile, createAttachment, onClose, validate]);

  const handleSave = useCallback(async () => {
    if (!driverId || !validate()) return;
    try {
      await patchDriver({ id: driverId, patch: buildPayload() }).unwrap();
      toast.success(mutationSuccessCopy("patchDriver"));
      await refetch();
      setEditing(false);
      setUploadFile(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [buildPayload, driverId, patchDriver, refetch, validate]);

  const handleUploadAdditionalDocument = async () => {
    if (!uploadFile || !driverId) return;
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("entity_type", "driver");
      fd.append("entity_id", driverId);
      fd.append("remarks", "Uploaded from driver details panel");
      await createAttachment(fd).unwrap();
      toast.success("Document uploaded successfully.");
      setUploadFile(null);
      const fileInput = document.getElementById("drv-edit-file") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      refetchAttachments();
    } catch (err) {
      toast.error("Failed to upload document.");
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    try {
      await deleteAttachment(attId).unwrap();
      toast.success("Document deleted successfully.");
      refetchAttachments();
    } catch (err) {
      toast.error("Failed to delete document.");
    }
  };

  const handleViewFile = async (url: string) => {
    try {
      const match = url.match(/\/files\/([^\/]+)\/view/);
      const fileId = match ? match[1] : url;
      const blob = await triggerFileView(fileId).unwrap();
      window.open(window.URL.createObjectURL(blob), "_blank");
    } catch {
      toast.error("Failed to view document.");
    }
  };

  if (!open) return null;

  const busy = isCreating || isPatching || isUploading;
  const displayName =
    detail && typeof detail.name === "string"
      ? detail.name
      : name || "Driver";

  const showForm = isCreate || editing;
  const showReadOnly = !isCreate && !editing && detail;

  let assignedVehicleNo = "—";
  if (detail?.assigned_vehicle) {
    const av = detail.assigned_vehicle;
    if (typeof av === "object") {
      assignedVehicleNo = stringField((av as Record<string, unknown>).vehicle_no) || "—";
    } else {
      const matched = vehicles.find((v) => v._id === av || v.id === av);
      assignedVehicleNo = matched?.vehicle_no || String(av);
    }
  }

  return (
    <LargeModalPortal>
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-modal-title"
        className="flex max-h-[min(92dvh,680px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/90 px-5 py-4 dark:border-white/10">
          <div>
            <h2
              id="driver-modal-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              {isCreate ? "Add driver" : editing ? "Edit driver" : "Driver"}
            </h2>
            {!isCreate && detail ? (
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                {stringField(detail.driver_code) ? (
                  <span className="font-mono text-xs">{stringField(detail.driver_code)}</span>
                ) : null}
                {stringField(detail.driver_code) ? " · " : null}
                {displayName}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isCreate && !editing && detail ? (
              <button
                type="button"
                onClick={startEdit}
                disabled={busy || isFetching}
                className="rounded-lg border border-slate-200/95 px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
              >
                Edit
              </button>
            ) : null}
            {!isCreate && editing ? (
              <>
                <button type="button" onClick={cancelEdit} disabled={busy} className={btnSecondaryClass}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={busy}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {isPatching ? "Saving…" : "Save changes"}
                </button>
              </>
            ) : null}
            {isCreate ? (
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={busy}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                {isCreating ? "Creating…" : "Create driver"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!isCreate && isFetching && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          )}
          {!isCreate && isError && (
            <p className="text-sm text-rose-600 dark:text-rose-400">Could not load driver.</p>
          )}

          {showReadOnly ? (
            <div className="space-y-6">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Driver code</dt>
                  <dd className="font-mono text-slate-900 dark:text-slate-100">
                    {stringField(detail.driver_code) || "—"}
                  </dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Transport agent</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {transportAgentLabel(detail.transport_agent)}
                  </dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Name</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{stringField(detail.name) || "—"}</dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Phone</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{stringField(detail.phone) || "—"}</dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Alternate phone</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {stringField(detail.alternate_phone) || "—"}
                  </dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>License No.</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{stringField(detail.license_no) || "—"}</dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>License type</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {stringField(detail.license_type) || "—"}
                  </dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>License Expiry</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{formatDateReadOnly(detail.license_expiry)}</dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Assigned Vehicle</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{assignedVehicleNo}</dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Status</dt>
                  <dd className="capitalize text-slate-900 dark:text-slate-100">
                    {stringField(detail.status) || "—"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Active</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {detail.is_active !== false ? "Yes" : "No"}
                  </dd>
                </div>
              </dl>

              {attachments.length > 0 && (
                <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Documents
                  </h3>
                  <div className="space-y-2">
                    {attachments.map((att: any) => {
                      return (
                        <div
                          key={att._id || att.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/40 dark:border-white/5"
                        >
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate max-w-[280px]" title={att.original_name || att.file_name}>
                            {att.original_name || att.file_name}
                          </span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => att.url && void handleViewFile(att.url)}
                              className="text-xs text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => att._id && void handleDeleteAttachment(att._id)}
                              className="text-xs text-rose-600 underline hover:text-rose-700 dark:text-rose-450"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {showForm ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {isCreate ? (
                <div className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                  Driver code will be assigned automatically when you save (for example DR0001).
                </div>
              ) : stringField(detail?.driver_code) ? (
                <div className="sm:col-span-2">
                  <label className={labelClass}>Driver code</label>
                  <p className={`${inputClass} font-mono uppercase bg-slate-50 dark:bg-slate-900/80`}>
                    {stringField(detail?.driver_code)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Assigned by the system and cannot be changed.
                  </p>
                </div>
              ) : null}
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="drv-agent" className={labelClass}>
                  Transport agent <span className="text-rose-600">*</span>
                </label>
                <select
                  id="drv-agent"
                  value={transport_agent}
                  onChange={(e) => setTransportAgent(e.target.value)}
                  className={inputClass}
                  required
                >
                  <option value="">Select transport agent</option>
                  {transportAgents.map((a) => {
                    const row = a as Record<string, unknown>;
                    const id = String(row._id ?? row.id ?? "");
                    return (
                      <option key={id} value={id}>
                        {transportAgentLabel(row)}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="drv-name" className={labelClass}>
                  Name <span className="text-rose-600">*</span>
                </label>
                <input
                  id="drv-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="drv-phone" className={labelClass}>
                  Phone <span className="text-rose-600">*</span>
                </label>
                <input
                  id="drv-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="drv-alt-phone" className={labelClass}>
                  Alternate phone
                </label>
                <input
                  id="drv-alt-phone"
                  value={alternate_phone}
                  onChange={(e) => setAlternatePhone(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="drv-lic" className={labelClass}>
                  License Number
                </label>
                <input
                  id="drv-lic"
                  value={license_no}
                  onChange={(e) => setLicenseNo(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="drv-lic-type" className={labelClass}>
                  License type
                </label>
                <select
                  id="drv-lic-type"
                  value={license_type}
                  onChange={(e) => setLicenseType(e.target.value)}
                  className={inputClass}
                >
                  <option value="">—</option>
                  <option value="LMV">LMV</option>
                  <option value="HMV">HMV</option>
                  <option value="MCWG">MCWG</option>
                  <option value="TRANSPORT">Transport</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="drv-lic-exp" className={labelClass}>
                  License Expiry
                </label>
                <input
                  id="drv-lic-exp"
                  type="date"
                  value={license_expiry}
                  onChange={(e) => setLicenseExpiry(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="drv-veh" className={labelClass}>
                  Assigned Vehicle
                </label>
                <select
                  id="drv-veh"
                  value={assigned_vehicle}
                  onChange={(e) => setAssignedVehicle(e.target.value)}
                  className={inputClass}
                >
                  <option value="">No Vehicle Assigned</option>
                  {vehicles.map((v) => {
                    const id = v._id || v.id || "";
                    return (
                      <option key={id} value={id}>
                        {v.vehicle_no || "Unnamed Vehicle"}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="drv-status" className={labelClass}>
                  Status
                </label>
                <select
                  id="drv-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputClass}
                >
                  <option value="available">Available</option>
                  <option value="assigned">Assigned</option>
                  <option value="on_trip">On trip</option>
                  <option value="leave">Leave</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="drv-remarks" className={labelClass}>
                  Remarks
                </label>
                <textarea
                  id="drv-remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  className={inputClass}
                />
              </div>

              <div className="flex items-center gap-2 sm:col-span-2 pt-2">
                <input
                  id="drv-active"
                  type="checkbox"
                  checked={is_active}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-350"
                />
                <label htmlFor="drv-active" className={labelClass}>
                  Active
                </label>
              </div>

              {isCreate && (
                <div className="space-y-1.5 sm:col-span-2 pt-2 border-t border-slate-100 dark:border-white/5">
                  <label htmlFor="drv-file" className={labelClass}>
                    Upload Driver Document (Optional)
                  </label>
                  <input
                    id="drv-file"
                    type="file"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-800 dark:file:text-slate-200"
                  />
                </div>
              )}

              {!isCreate && editing && (
                <div className="sm:col-span-2 pt-4 border-t border-slate-100 dark:border-white/5 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Document Uploads
                  </h3>
                  {attachments.length > 0 && (
                    <div className="space-y-2">
                      {attachments.map((att: any) => {
                        return (
                          <div
                            key={att._id || att.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/40 dark:border-white/5"
                          >
                            <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate max-w-[280px]" title={att.original_name || att.file_name}>
                              {att.original_name || att.file_name}
                            </span>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => att.url && void handleViewFile(att.url)}
                                className="text-xs text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => att._id && void handleDeleteAttachment(att._id)}
                                className="text-xs text-rose-600 underline hover:text-rose-700 dark:text-rose-45"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label htmlFor="drv-edit-file" className={labelClass}>
                      Upload New Document
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="drv-edit-file"
                        type="file"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-800 dark:file:text-slate-200"
                      />
                      {uploadFile && (
                        <button
                          type="button"
                          onClick={() => void handleUploadAdditionalDocument()}
                          disabled={busy}
                          className="rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50"
                        >
                          Upload
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
    </LargeModalPortal>
  );
}
