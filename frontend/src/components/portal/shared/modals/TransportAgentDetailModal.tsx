"use client";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { useCallback, useEffect, useState } from "react";
import { mutationRejectedMessage, mutationSuccessCopy } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCreateTransportAgentMutation,
  useGetTransportAgentQuery,
  usePatchTransportAgentMutation,
  useCreateAttachmentMutation,
  useDeleteAttachmentMutation,
  useLazyGetFileViewQuery,
  useListAttachmentsQuery,
} from "@/store/api";

export type TransportAgentDetailModalProps = {
  transportAgentId: string | null;
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

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

export function TransportAgentDetailModal({
  transportAgentId,
  create = false,
  onClose,
}: TransportAgentDetailModalProps) {
  const isCreate = create === true;
  const open = isCreate || (transportAgentId != null && transportAgentId !== "");
  const skipGet = !open || isCreate || !transportAgentId;

  const { data, isFetching, isError, refetch } = useGetTransportAgentQuery(
    transportAgentId ?? "",
    { skip: skipGet },
  );

  const { data: attachmentsData, refetch: refetchAttachments } = useListAttachmentsQuery(
    { entity_type: "transport_agent", entity_id: transportAgentId ?? "" },
    { skip: !transportAgentId || isCreate },
  );
  const attachments = pickList(attachmentsData);

  const [createAgent, { isLoading: isCreating }] = useCreateTransportAgentMutation();
  const [patchAgent, { isLoading: isPatching }] = usePatchTransportAgentMutation();
  const [createAttachment, { isLoading: isUploading }] = useCreateAttachmentMutation();
  const [deleteAttachment] = useDeleteAttachmentMutation();
  const [triggerFileView] = useLazyGetFileViewQuery();

  const [editing, setEditing] = useState(false);
  const [agent_name, setAgentName] = useState("");
  const [agent_type, setAgentType] = useState("third_party");
  const [contact_person, setContactPerson] = useState("");
  const [mobile, setMobile] = useState("");
  const [alternate_mobile, setAlternateMobile] = useState("");
  const [email, setEmail] = useState("");
  const [gst_no, setGstNo] = useState("");
  const [pan_no, setPanNo] = useState("");
  const [status, setStatus] = useState("active");
  const [remarks, setRemarks] = useState("");
  const [is_active, setIsActive] = useState(true);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const detail = data && typeof data === "object" ? (data as Record<string, unknown>) : null;

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setUploadFile(null);
      return;
    }
    if (!isCreate) setEditing(false);
  }, [open, transportAgentId, isCreate]);

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
    setAgentName(stringField(detail.agent_name));
    setAgentType(stringField(detail.agent_type) || "third_party");
    setContactPerson(stringField(detail.contact_person));
    setMobile(stringField(detail.mobile));
    setAlternateMobile(stringField(detail.alternate_mobile));
    setEmail(stringField(detail.email));
    setGstNo(stringField(detail.gst_no));
    setPanNo(stringField(detail.pan_no));
    setStatus(stringField(detail.status) || "active");
    setRemarks(stringField(detail.remarks));
    setIsActive(detail.is_active !== false);
  }, [detail]);

  const resetCreateForm = useCallback(() => {
    setAgentName("");
    setAgentType("third_party");
    setContactPerson("");
    setMobile("");
    setAlternateMobile("");
    setEmail("");
    setGstNo("");
    setPanNo("");
    setStatus("active");
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
    if (detail && !editing) hydrateFromDetail();
  }, [detail, editing, hydrateFromDetail]);

  const validate = useCallback((): boolean => {
    if (!agent_name.trim()) {
      toast.error("Agent name is required.");
      return false;
    }
    return true;
  }, [agent_name]);

  const buildPayload = useCallback((): Record<string, unknown> => {
    return {
      agent_name: agent_name.trim(),
      agent_type,
      contact_person: contact_person.trim() || undefined,
      mobile: mobile.trim() || undefined,
      alternate_mobile: alternate_mobile.trim() || undefined,
      email: email.trim() || undefined,
      gst_no: gst_no.trim().toUpperCase() || undefined,
      pan_no: pan_no.trim().toUpperCase() || undefined,
      status,
      remarks: remarks.trim() || undefined,
      is_active,
    };
  }, [
    agent_name,
    agent_type,
    contact_person,
    mobile,
    alternate_mobile,
    email,
    gst_no,
    pan_no,
    status,
    remarks,
    is_active,
  ]);

  const handleCreate = useCallback(async () => {
    if (!validate()) return;
    try {
      const res = (await createAgent(buildPayload()).unwrap()) as Record<string, unknown>;
      const createdId = String(res._id ?? res.id ?? "");
      if (uploadFile && createdId) {
        const fd = new FormData();
        fd.append("file", uploadFile);
        fd.append("entity_type", "transport_agent");
        fd.append("entity_id", createdId);
        fd.append("remarks", "Uploaded during transport agent creation");
        await createAttachment(fd).unwrap();
      }
      toast.success(mutationSuccessCopy("createTransportAgent"));
      onClose();
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [validate, createAgent, buildPayload, uploadFile, createAttachment, onClose]);

  const handleSave = useCallback(async () => {
    if (!transportAgentId || !validate()) return;
    try {
      await patchAgent({ id: transportAgentId, patch: buildPayload() }).unwrap();
      toast.success(mutationSuccessCopy("patchTransportAgent"));
      await refetch();
      setEditing(false);
      setUploadFile(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [transportAgentId, validate, patchAgent, buildPayload, refetch]);

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

  if (!open) return null;

  const busy = isCreating || isPatching || isUploading;
  const showForm = isCreate || editing;
  const showReadOnly = !isCreate && !editing && detail;

  return (
    <LargeModalPortal>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]" role="presentation" onClick={onClose}>
      <div
        className="w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200/90 px-5 py-4 dark:border-white/10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {isCreate ? "Add transport agent" : (stringField(detail?.agent_name) || "Transport agent")}
          </h2>
          <div className="flex items-center gap-2">
            {!isCreate && !editing ? (
              <button type="button" onClick={() => setEditing(true)} className={btnSecondaryClass}>
                Edit
              </button>
            ) : null}
            {!isCreate && editing ? (
              <>
                <button type="button" onClick={() => { setEditing(false); hydrateFromDetail(); }} className={btnSecondaryClass} disabled={busy}>
                  Cancel
                </button>
                <button type="button" onClick={() => void handleSave()} disabled={busy} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  Save
                </button>
              </>
            ) : null}
            {isCreate ? (
              <button type="button" onClick={() => void handleCreate()} disabled={busy} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                Create
              </button>
            ) : null}
            <button type="button" onClick={onClose} className={btnSecondaryClass} disabled={busy}>
              Close
            </button>
          </div>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-5 py-4">
          {!isCreate && isFetching ? <p className="text-sm text-slate-500">Loading…</p> : null}
          {!isCreate && isError ? <p className="text-sm text-rose-600">Could not load transport agent.</p> : null}

          {showReadOnly ? (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className={labelClass}>Code</dt><dd className="font-mono">{stringField(detail.agent_code) || "—"}</dd></div>
              <div><dt className={labelClass}>Name</dt><dd>{stringField(detail.agent_name) || "—"}</dd></div>
              <div><dt className={labelClass}>Type</dt><dd className="capitalize">{stringField(detail.agent_type).replace(/_/g, " ") || "—"}</dd></div>
              <div><dt className={labelClass}>Status</dt><dd className="capitalize">{stringField(detail.status) || "—"}</dd></div>
              <div><dt className={labelClass}>Mobile</dt><dd>{stringField(detail.mobile) || "—"}</dd></div>
              <div><dt className={labelClass}>Contact person</dt><dd>{stringField(detail.contact_person) || "—"}</dd></div>
              <div><dt className={labelClass}>Email</dt><dd>{stringField(detail.email) || "—"}</dd></div>
              <div><dt className={labelClass}>GST / PAN</dt><dd>{stringField(detail.gst_no) || "—"} / {stringField(detail.pan_no) || "—"}</dd></div>
              <div className="sm:col-span-2"><dt className={labelClass}>Remarks</dt><dd>{stringField(detail.remarks) || "—"}</dd></div>
            </dl>
          ) : null}

          {showForm ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {isCreate ? (
                <div className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                  Agent code will be assigned automatically when you save (for example TA0001).
                </div>
              ) : stringField(detail?.agent_code) ? (
                <div className="sm:col-span-2">
                  <label className={labelClass}>Agent code</label>
                  <p className={`${inputClass} font-mono uppercase bg-slate-50 dark:bg-slate-900/80`}>
                    {stringField(detail?.agent_code)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Assigned by the system and cannot be changed.
                  </p>
                </div>
              ) : null}
              <div className={isCreate ? "" : "sm:col-span-2"}>
                <label className={labelClass}>Name *</label>
                <input className={inputClass} value={agent_name} onChange={(e) => setAgentName(e.target.value)} required />
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <select className={inputClass} value={agent_type} onChange={(e) => setAgentType(e.target.value)}>
                  <option value="internal_fleet">Internal fleet</option>
                  <option value="third_party">Third party</option>
                  <option value="courier">Courier</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="blacklisted">Blacklisted</option>
                </select>
              </div>
              <div><label className={labelClass}>Mobile</label><input className={inputClass} value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
              <div><label className={labelClass}>Alternate mobile</label><input className={inputClass} value={alternate_mobile} onChange={(e) => setAlternateMobile(e.target.value)} /></div>
              <div><label className={labelClass}>Contact person</label><input className={inputClass} value={contact_person} onChange={(e) => setContactPerson(e.target.value)} /></div>
              <div><label className={labelClass}>Email</label><input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><label className={labelClass}>GST No</label><input className={`${inputClass} uppercase`} value={gst_no} onChange={(e) => setGstNo(e.target.value.toUpperCase())} /></div>
              <div><label className={labelClass}>PAN No</label><input className={`${inputClass} uppercase`} value={pan_no} onChange={(e) => setPanNo(e.target.value.toUpperCase())} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Remarks</label><textarea className={inputClass} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <input id="agent-active" type="checkbox" checked={is_active} onChange={(e) => setIsActive(e.target.checked)} />
                <label htmlFor="agent-active" className={labelClass}>Active</label>
              </div>
            </div>
          ) : null}

          {attachments.length > 0 ? (
            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Documents</h3>
              <div className="space-y-2">
                {attachments.map((att: any) => (
                  <div key={att._id || att.id} className="flex items-center justify-between rounded-lg border border-slate-200/40 bg-slate-50 p-2 dark:border-white/5 dark:bg-slate-950/40">
                    <span className="max-w-[320px] truncate text-xs font-medium">{att.original_name || att.file_name}</span>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => att.url && void handleViewFile(att.url)} className="text-xs text-blue-600 underline">View</button>
                      <button type="button" onClick={() => att._id && void handleDeleteAttachment(att._id)} className="text-xs text-rose-600 underline">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
    </LargeModalPortal>
  );
}

