"use client";

import { useMemo } from "react";
import { DashboardCard } from "@/components/widgets";
import { useAppSelector } from "@/store";
import { useDeleteAttachmentMutation } from "@/store/api";
import { toast } from "@/lib/toast";

type AttachmentsTabProps = {
  orderId: string;
  attachments: any[];
  isLoading: boolean;
  onUploadClick?: () => void;
};

const DEPARTMENT_LABELS: Record<string, string> = {
  admin: "Administration",
  sales: "Sales Department",
  finance: "Finance & Accounts",
  dispatch: "Dispatch & Warehouse",
  other: "Other Attachments",
};

const DEPARTMENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  admin: { bg: "bg-purple-50 dark:bg-purple-950/20", text: "text-purple-700 dark:text-purple-400", border: "border-purple-100 dark:border-purple-950/30" },
  sales: { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-100 dark:border-emerald-950/30" },
  finance: { bg: "bg-blue-50 dark:bg-blue-950/20", text: "text-blue-700 dark:text-blue-400", border: "border-blue-100 dark:border-blue-950/30" },
  dispatch: { bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-400", border: "border-amber-100 dark:border-amber-950/30" },
  other: { bg: "bg-slate-50 dark:bg-slate-950/20", text: "text-slate-700 dark:text-slate-400", border: "border-slate-100 dark:border-slate-950/30" },
};

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileIcon(mime: string) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("pdf")) {
    return (
      <svg className="h-6 w-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }
  if (m.includes("image") || m.includes("png") || m.includes("jpg") || m.includes("jpeg")) {
    return (
      <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (m.includes("word") || m.includes("officedocument") || m.includes("msword")) {
    return (
      <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  if (m.includes("excel") || m.includes("spreadsheet") || m.includes("csv")) {
    return (
      <svg className="h-6 w-6 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  return (
    <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

export function AttachmentsTab({ orderId, attachments, isLoading, onUploadClick }: AttachmentsTabProps) {
  const token = useAppSelector((s) => s.auth.token);
  const [deleteAttachment, { isLoading: isDeleting }] = useDeleteAttachmentMutation();

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {
      sales: [],
      finance: [],
      dispatch: [],
      admin: [],
      other: [],
    };

    for (const att of attachments) {
      let dept = att.uploaded_by?.department as string | undefined;
      if (dept === "transport") dept = "dispatch";
      if (dept === "collection") dept = "finance";
      const key = dept && groups[dept] !== undefined ? dept : "other";
      groups[key].push(att);
    }

    return Object.entries(groups).filter(([_, list]) => list.length > 0);
  }, [attachments]);

  const handleDownload = async (fileUrl: string, fileName: string) => {
    try {
      const response = await fetch(fileUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download file");
    }
  };

  const handleView = async (fileUrl: string) => {
    try {
      const response = await fetch(fileUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to view file");
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } catch (error) {
      console.error("View failed:", error);
      toast.error("Failed to view file");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      await deleteAttachment(id).unwrap();
      toast.success("Attachment deleted successfully");
    } catch (err) {
      toast.error("Failed to delete attachment");
    }
  };

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading attachments...</p>;
  }

  if (attachments.length === 0) {
    return (
      <DashboardCard title="Attachments" description="Documents and files uploaded for this order.">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <svg className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 13h6m-3-3v6m-9 1V4a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-200">No attachments</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Get started by uploading a file to this order.</p>
          {onUploadClick && (
            <button
              type="button"
              onClick={onUploadClick}
              className="mt-4 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              Upload Attachment
            </button>
          )}
        </div>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/90 dark:border-white/10 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200">Order Attachments</h3>
          <p className="text-xs text-slate-500">Documents and files uploaded for this order.</p>
        </div>
        {onUploadClick && (
          <button
            type="button"
            onClick={onUploadClick}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            Upload Attachment
          </button>
        )}
      </div>
      {grouped.map(([deptKey, list]) => {
        const colors = DEPARTMENT_COLORS[deptKey] || DEPARTMENT_COLORS.other;
        const label = DEPARTMENT_LABELS[deptKey] || DEPARTMENT_LABELS.other;

        return (
          <div key={deptKey} className="overflow-hidden rounded-xl border border-slate-200/90 dark:border-white/10 shadow-sm">
            <div className={`flex items-center justify-between border-b border-slate-200/90 dark:border-white/10 px-4 py-3.5 ${colors.bg}`}>
              <div className="flex items-center gap-2">
                <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${colors.text} bg-white/70 dark:bg-slate-950/40 border ${colors.border}`}>
                  {label}
                </span>
                <span className="text-xs text-slate-500 font-medium">({list.length} file{list.length > 1 ? "s" : ""})</span>
              </div>
            </div>
            
            <div className="divide-y divide-slate-100 bg-white dark:divide-white/5 dark:bg-slate-900">
              {list.map((att) => (
                <div key={att._id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 transition hover:bg-slate-50/50 dark:hover:bg-white/5">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 flex-shrink-0">
                      {getFileIcon(att.mime_type)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate max-w-lg" title={att.original_name}>
                        {att.original_name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {att.uploaded_by?.name || att.uploaded_by?.username || "System"}
                        </span>
                        <span>&bull;</span>
                        <span>{formatBytes(att.size)}</span>
                        <span>&bull;</span>
                        <span>{formatDate(att.createdAt)}</span>
                      </div>
                      {att.remarks && att.remarks.trim() && (
                        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-950/40 px-2.5 py-1 rounded-md border border-slate-100 dark:border-white/5 inline-block">
                          <span className="font-semibold not-italic text-slate-500 mr-1">Remark:</span> {att.remarks}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleView(att.url)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition dark:border-white/10 dark:text-slate-300 dark:bg-slate-950 dark:hover:bg-white/5"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(att.url, att.original_name)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition dark:border-white/10 dark:text-slate-300 dark:bg-slate-950 dark:hover:bg-white/5"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleDelete(att._id, att.original_name)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 bg-white hover:bg-rose-50 transition dark:border-rose-950/30 dark:text-rose-400 dark:bg-slate-950 dark:hover:bg-rose-950/20 disabled:opacity-50"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
export default AttachmentsTab;
