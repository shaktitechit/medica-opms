"use client";

import { useCallback, useEffect, useState } from "react";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCreateVehicleMutation,
  useGetVehicleQuery,
  usePatchVehicleMutation,
  useCreateAttachmentMutation,
  useListAttachmentsQuery,
  useDeleteAttachmentMutation,
  useLazyGetFileViewQuery,
  useListTransportAgentsQuery,
} from "@/store/api";
import {
  formatVehicleCapacity,
  idFromRef,
  transportAgentLabel,
} from "../fleetDisplay";

export type VehicleDetailModalProps = {
  vehicleId: string | null;
  create?: boolean;
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

export function VehicleDetailModal({
  vehicleId,
  create = false,
  onClose,
}: VehicleDetailModalProps) {
  const isCreate = create === true;
  const open = isCreate || (vehicleId != null && vehicleId !== "");
  const skipGet = !open || isCreate || !vehicleId;

  const { data, isFetching, isError, refetch } = useGetVehicleQuery(
    vehicleId ?? "",
    { skip: skipGet },
  );

  const { data: agentsData } = useListTransportAgentsQuery(
    { is_active: "true" },
    { skip: !open },
  );
  const transportAgents = pickList(agentsData);

  const { data: attachmentsData, refetch: refetchAttachments } = useListAttachmentsQuery(
    { entity_type: "vehicle", entity_id: vehicleId ?? "" },
    { skip: !vehicleId || isCreate }
  );
  const attachments = pickList(attachmentsData);

  const [createVehicle, { isLoading: isCreating }] = useCreateVehicleMutation();
  const [patchVehicle, { isLoading: isPatching }] = usePatchVehicleMutation();
  const [createAttachment, { isLoading: isUploading }] = useCreateAttachmentMutation();
  const [deleteAttachment] = useDeleteAttachmentMutation();
  const [triggerFileView] = useLazyGetFileViewQuery();

  const [editing, setEditing] = useState(false);
  const [vehicle_no, setVehicleNo] = useState("");
  const [transport_agent, setTransportAgent] = useState("");
  const [vehicle_type, setVehicleType] = useState("pickup");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [capacity_kg, setCapacityKg] = useState("");
  const [capacity_cft, setCapacityCft] = useState("");
  const [ownership_type, setOwnershipType] = useState("owned");
  const [status, setStatus] = useState("available");
  const [insurance_expiry, setInsuranceExpiry] = useState("");
  const [fitness_expiry, setFitnessExpiry] = useState("");
  const [pollution_expiry, setPollutionExpiry] = useState("");
  const [registration_expiry, setRegistrationExpiry] = useState("");
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
  }, [open, vehicleId, isCreate]);

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
    setVehicleNo(stringField(detail.vehicle_no));
    setTransportAgent(idFromRef(detail.transport_agent));
    setVehicleType(stringField(detail.vehicle_type) || "pickup");
    setMake(stringField(detail.make));
    setModel(stringField(detail.model));
    setCapacityKg(
      detail.capacity_kg != null && detail.capacity_kg !== ""
        ? String(detail.capacity_kg)
        : "",
    );
    setCapacityCft(
      detail.capacity_cft != null && detail.capacity_cft !== ""
        ? String(detail.capacity_cft)
        : "",
    );
    setOwnershipType(stringField(detail.ownership_type) || "owned");
    setStatus(stringField(detail.status) || "available");
    setInsuranceExpiry(formatDateForInput(detail.insurance_expiry));
    setFitnessExpiry(formatDateForInput(detail.fitness_expiry));
    setPollutionExpiry(formatDateForInput(detail.pollution_expiry));
    setRegistrationExpiry(formatDateForInput(detail.registration_expiry));
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
    setVehicleNo("");
    setTransportAgent("");
    setVehicleType("pickup");
    setMake("");
    setModel("");
    setCapacityKg("");
    setCapacityCft("");
    setOwnershipType("owned");
    setStatus("available");
    setInsuranceExpiry("");
    setFitnessExpiry("");
    setPollutionExpiry("");
    setRegistrationExpiry("");
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
    if (!vehicle_no.trim()) {
      toast.error("Vehicle registration number is required.");
      return false;
    }
    return true;
  }, [vehicle_no]);

  const buildPayload = useCallback((): Record<string, unknown> => {
    return {
      vehicle_no: vehicle_no.trim().toUpperCase(),
      transport_agent: transport_agent || undefined,
      vehicle_type: vehicle_type || "pickup",
      make: make.trim() || undefined,
      model: model.trim() || undefined,
      capacity_kg: capacity_kg.trim() ? Number(capacity_kg) : undefined,
      capacity_cft: capacity_cft.trim() ? Number(capacity_cft) : undefined,
      ownership_type: ownership_type || "owned",
      status: status || "available",
      insurance_expiry: insurance_expiry ? new Date(insurance_expiry).toISOString() : null,
      fitness_expiry: fitness_expiry ? new Date(fitness_expiry).toISOString() : null,
      pollution_expiry: pollution_expiry ? new Date(pollution_expiry).toISOString() : null,
      registration_expiry: registration_expiry
        ? new Date(registration_expiry).toISOString()
        : null,
      remarks: remarks.trim() || undefined,
      is_active,
    };
  }, [
    vehicle_no,
    transport_agent,
    vehicle_type,
    make,
    model,
    capacity_kg,
    capacity_cft,
    ownership_type,
    status,
    insurance_expiry,
    fitness_expiry,
    pollution_expiry,
    registration_expiry,
    remarks,
    is_active,
  ]);

  const handleCreate = useCallback(async () => {
    if (!validate()) return;
    try {
      const res = (await createVehicle(buildPayload()).unwrap()) as any;
      const createdId = res._id || res.id;
      if (uploadFile && createdId) {
        const fd = new FormData();
        fd.append("file", uploadFile);
        fd.append("entity_type", "vehicle");
        fd.append("entity_id", createdId);
        fd.append("remarks", "Uploaded during vehicle creation");
        await createAttachment(fd).unwrap();
      }
      toast.success(mutationSuccessCopy("createVehicle"));
      onClose();
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [buildPayload, createVehicle, uploadFile, createAttachment, onClose, validate]);

  const handleSave = useCallback(async () => {
    if (!vehicleId || !validate()) return;
    try {
      await patchVehicle({ id: vehicleId, patch: buildPayload() }).unwrap();
      toast.success(mutationSuccessCopy("patchVehicle"));
      await refetch();
      setEditing(false);
      setUploadFile(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [buildPayload, vehicleId, patchVehicle, refetch, validate]);

  const handleUploadAdditionalDocument = async () => {
    if (!uploadFile || !vehicleId) return;
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("entity_type", "vehicle");
      fd.append("entity_id", vehicleId);
      fd.append("remarks", "Uploaded from vehicle details panel");
      await createAttachment(fd).unwrap();
      toast.success("Document uploaded successfully.");
      setUploadFile(null);
      const fileInput = document.getElementById("veh-edit-file") as HTMLInputElement;
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
    detail && typeof detail.vehicle_no === "string"
      ? detail.vehicle_no
      : vehicle_no || "Vehicle";

  const showForm = isCreate || editing;
  const showReadOnly = !isCreate && !editing && detail;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vehicle-modal-title"
        className="flex max-h-[min(92dvh,750px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/90 px-5 py-4 dark:border-white/10">
          <div>
            <h2
              id="vehicle-modal-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              {isCreate ? "Add vehicle" : editing ? "Edit vehicle" : "Vehicle"}
            </h2>
            {!isCreate && detail ? (
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
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
                {isCreating ? "Creating…" : "Create vehicle"}
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
            <p className="text-sm text-rose-600 dark:text-rose-400">Could not load vehicle.</p>
          )}

          {showReadOnly ? (
            <div className="space-y-6">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Vehicle Number</dt>
                  <dd className="font-mono font-medium text-slate-900 dark:text-slate-100 uppercase">{stringField(detail.vehicle_no) || "—"}</dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Transport agent</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {transportAgentLabel(detail.transport_agent)}
                  </dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Vehicle Type</dt>
                  <dd className="capitalize text-slate-900 dark:text-slate-100">{stringField(detail.vehicle_type) || "—"}</dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Make / Model</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {[stringField(detail.make), stringField(detail.model)].filter(Boolean).join(" ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Capacity</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {formatVehicleCapacity(detail)}
                  </dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Ownership Type</dt>
                  <dd className="capitalize text-slate-900 dark:text-slate-100">{stringField(detail.ownership_type) || "—"}</dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Status</dt>
                  <dd className="capitalize text-slate-900 dark:text-slate-100">{stringField(detail.status) || "—"}</dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Insurance Expiry</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{formatDateReadOnly(detail.insurance_expiry)}</dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Fitness Expiry</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{formatDateReadOnly(detail.fitness_expiry)}</dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Pollution Expiry</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{formatDateReadOnly(detail.pollution_expiry)}</dd>
                </div>
                <div>
                  <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Registration Expiry</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {formatDateReadOnly(detail.registration_expiry)}
                  </dd>
                </div>
                {stringField(detail.remarks) ? (
                  <div className="sm:col-span-2">
                    <dt className={`${labelClass} text-slate-500 dark:text-slate-400`}>Remarks</dt>
                    <dd className="text-slate-900 dark:text-slate-100">{stringField(detail.remarks)}</dd>
                  </div>
                ) : null}
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
                              className="text-xs text-rose-600 underline hover:text-rose-700 dark:text-rose-45"
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
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="veh-no" className={labelClass}>
                  Vehicle Registration Number <span className="text-rose-600">*</span>
                </label>
                <input
                  id="veh-no"
                  value={vehicle_no}
                  onChange={(e) => setVehicleNo(e.target.value)}
                  placeholder="e.g. MH12AB1234"
                  className={`${inputClass} font-mono uppercase`}
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="veh-agent" className={labelClass}>
                  Transport agent
                </label>
                <select
                  id="veh-agent"
                  value={transport_agent}
                  onChange={(e) => setTransportAgent(e.target.value)}
                  className={inputClass}
                >
                  <option value="">None</option>
                  {transportAgents.map((a) => {
                    const row = a as Record<string, unknown>;
                    const id = String(row._id ?? row.id ?? "");
                    const label = transportAgentLabel(row);
                    return (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="veh-type" className={labelClass}>
                  Vehicle Type
                </label>
                <select
                  id="veh-type"
                  value={vehicle_type}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className={inputClass}
                >
                  <option value="bike">Bike</option>
                  <option value="three_wheeler">Three wheeler</option>
                  <option value="pickup">Pickup</option>
                  <option value="mini_truck">Mini truck</option>
                  <option value="truck">Truck</option>
                  <option value="container">Container</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="veh-make" className={labelClass}>
                  Make
                </label>
                <input
                  id="veh-make"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="veh-model" className={labelClass}>
                  Model
                </label>
                <input
                  id="veh-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="veh-cap-kg" className={labelClass}>
                  Capacity (kg)
                </label>
                <input
                  id="veh-cap-kg"
                  type="number"
                  min={0}
                  value={capacity_kg}
                  onChange={(e) => setCapacityKg(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="veh-cap-cft" className={labelClass}>
                  Capacity (cft)
                </label>
                <input
                  id="veh-cap-cft"
                  type="number"
                  min={0}
                  value={capacity_cft}
                  onChange={(e) => setCapacityCft(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="veh-owner" className={labelClass}>
                  Ownership Type
                </label>
                <select
                  id="veh-owner"
                  value={ownership_type}
                  onChange={(e) => setOwnershipType(e.target.value)}
                  className={inputClass}
                >
                  <option value="owned">Owned</option>
                  <option value="attached">Attached</option>
                  <option value="rented">Rented</option>
                  <option value="third_party">Third party</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="veh-status" className={labelClass}>
                  Status
                </label>
                <select
                  id="veh-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputClass}
                >
                  <option value="available">Available</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_transit">In transit</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="veh-ins" className={labelClass}>
                  Insurance Expiry
                </label>
                <input
                  id="veh-ins"
                  type="date"
                  value={insurance_expiry}
                  onChange={(e) => setInsuranceExpiry(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="veh-fit" className={labelClass}>
                  Fitness Expiry
                </label>
                <input
                  id="veh-fit"
                  type="date"
                  value={fitness_expiry}
                  onChange={(e) => setFitnessExpiry(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="veh-pol" className={labelClass}>
                  Pollution Certificate Expiry
                </label>
                <input
                  id="veh-pol"
                  type="date"
                  value={pollution_expiry}
                  onChange={(e) => setPollutionExpiry(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="veh-reg" className={labelClass}>
                  Registration Expiry
                </label>
                <input
                  id="veh-reg"
                  type="date"
                  value={registration_expiry}
                  onChange={(e) => setRegistrationExpiry(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="veh-remarks" className={labelClass}>
                  Remarks
                </label>
                <textarea
                  id="veh-remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  className={inputClass}
                />
              </div>

              <div className="flex items-center gap-2 sm:col-span-2 pt-2">
                <input
                  id="veh-active"
                  type="checkbox"
                  checked={is_active}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-350"
                />
                <label htmlFor="veh-active" className={labelClass}>
                  Active
                </label>
              </div>

              {isCreate && (
                <div className="space-y-1.5 sm:col-span-2 pt-2 border-t border-slate-100 dark:border-white/5">
                  <label htmlFor="veh-file" className={labelClass}>
                    Upload Vehicle Document (Optional)
                  </label>
                  <input
                    id="veh-file"
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
                    <label htmlFor="veh-edit-file" className={labelClass}>
                      Upload New Document
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="veh-edit-file"
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
  );
}
