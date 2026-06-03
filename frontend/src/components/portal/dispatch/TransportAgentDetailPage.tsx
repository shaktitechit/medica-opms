"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Edit, Trash2, FileText, Plus, ExternalLink, Building2 } from "lucide-react";

import { mutationRejectedMessage, mutationSuccessCopy } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeleteAttachmentMutation,
  useDeleteTransportAgentMutation,
  useGetTransportAgentQuery,
  useLazyGetFileViewQuery,
  useListAttachmentsQuery,
} from "@/store/api";
import { TransportAgentDetailModal } from "./modals/TransportAgentDetailModal";
import { AddTransportAgentDocumentModal } from "./modals/AddTransportAgentDocumentModal";
import { ConfirmDeleteTransportAgentModal } from "./modals/ConfirmDeleteTransportAgentModal";

const labelClass = "text-xs font-semibold text-slate-500 dark:text-slate-400";
const valueClass = "text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5";

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

export type TransportAgentDetailPageProps = {
  id: string;
};

export default function TransportAgentDetailPage({ id }: TransportAgentDetailPageProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);

  const { data, isFetching, isError, refetch } = useGetTransportAgentQuery(id, { skip: !id });
  const detail = data && typeof data === "object" ? (data as Record<string, unknown>) : null;

  const { data: attachmentsData, refetch: refetchAttachments } = useListAttachmentsQuery(
    { entity_type: "transport_agent", entity_id: id },
    { skip: !id },
  );
  const attachments = useMemo(() => pickList(attachmentsData), [attachmentsData]);

  const [deleteTransportAgent, { isLoading: isDeleting }] = useDeleteTransportAgentMutation();
  const [deleteAttachment] = useDeleteAttachmentMutation();
  const [triggerFileView] = useLazyGetFileViewQuery();

  const handleDelete = useCallback(async () => {
    try {
      await deleteTransportAgent(id).unwrap();
      toast.success(mutationSuccessCopy("deleteTransportAgent"));
      router.push("/dispatch/transport-agents");
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [deleteTransportAgent, id, router]);

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
    return <div className="py-24 text-center text-sm text-slate-500">Loading transport agent…</div>;
  }

  if (isError || !detail) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="text-4xl">⚠️</div>
        <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">Transport agent not found</h2>
        <Link href="/dispatch/transport-agents" className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
          <ArrowLeft className="h-4 w-4" />
          Back to transport agents
        </Link>
      </div>
    );
  }

  const agentName = stringField(detail.agent_name) || "Transport Agent";
  const agentCode = stringField(detail.agent_code);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {editOpen ? (
        <TransportAgentDetailModal transportAgentId={id} onClose={() => { setEditOpen(false); void refetch(); }} />
      ) : null}
      <AddTransportAgentDocumentModal
        open={addDocOpen}
        transportAgentId={id}
        transportAgentLabel={agentName}
        onClose={() => setAddDocOpen(false)}
        onUploaded={() => void refetchAttachments()}
      />
      <ConfirmDeleteTransportAgentModal
        transportAgentId={deleteOpen ? id : null}
        transportAgentLabel={agentName}
        isDeleting={isDeleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />

      <div className="relative overflow-hidden rounded-2xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 p-6 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              <Building2 className="h-7 w-7 text-blue-500" />
              {agentName}
              {agentCode ? <span className="ml-2 font-mono text-xs text-slate-500">{agentCode}</span> : null}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 capitalize">
              {stringField(detail.agent_type).replace(/_/g, " ") || "—"} · {stringField(detail.mobile) || "No mobile"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dispatch/transport-agents" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
              <ArrowLeft className="h-3.5 w-3.5" />
              All transport agents
            </Link>
            <button type="button" onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <Edit className="h-3.5 w-3.5" />
              Edit
            </button>
            <button type="button" onClick={() => setDeleteOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-50">Agent details</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className={labelClass}>Code</dt><dd className={`${valueClass} font-mono`}>{agentCode || "—"}</dd></div>
          <div><dt className={labelClass}>Name</dt><dd className={valueClass}>{agentName}</dd></div>
          <div><dt className={labelClass}>Type</dt><dd className={`${valueClass} capitalize`}>{stringField(detail.agent_type).replace(/_/g, " ") || "—"}</dd></div>
          <div><dt className={labelClass}>Status</dt><dd className={`${valueClass} capitalize`}>{stringField(detail.status) || "—"}</dd></div>
          <div><dt className={labelClass}>Mobile</dt><dd className={valueClass}>{stringField(detail.mobile) || "—"}</dd></div>
          <div><dt className={labelClass}>Alternate Mobile</dt><dd className={valueClass}>{stringField(detail.alternate_mobile) || "—"}</dd></div>
          <div><dt className={labelClass}>Contact Person</dt><dd className={valueClass}>{stringField(detail.contact_person) || "—"}</dd></div>
          <div><dt className={labelClass}>Email</dt><dd className={valueClass}>{stringField(detail.email) || "—"}</dd></div>
          <div><dt className={labelClass}>GST No</dt><dd className={valueClass}>{stringField(detail.gst_no) || "—"}</dd></div>
          <div><dt className={labelClass}>PAN No</dt><dd className={valueClass}>{stringField(detail.pan_no) || "—"}</dd></div>
          <div className="sm:col-span-2"><dt className={labelClass}>Remarks</dt><dd className={valueClass}>{stringField(detail.remarks) || "—"}</dd></div>
        </dl>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Documents</h3>
          <button type="button" onClick={() => setAddDocOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" />
            Add document
          </button>
        </div>
        <div className="p-5">
          {attachments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500 dark:border-white/10">
              No documents yet. Click Add document to upload.
            </p>
          ) : (
            <div className="space-y-2">
              {attachments.map((attRaw) => {
                const att = attRaw as Record<string, unknown>;
                const attId = String(att._id ?? att.id ?? "");
                return (
                  <div key={attId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/40">
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200" title={String(att.original_name ?? att.file_name ?? "")}>
                        {String(att.original_name ?? att.file_name ?? "Document")}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {typeof att.url === "string" ? (
                        <button type="button" onClick={() => void handleViewFile(att.url as string)} className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">
                          View
                        </button>
                      ) : null}
                      {attId ? (
                        <button type="button" onClick={() => void handleDeleteAttachment(attId)} className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400">
                          Delete
                        </button>
                      ) : null}
                      {typeof att.url === "string" ? (
                        <a href={att.url as string} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-slate-600">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

