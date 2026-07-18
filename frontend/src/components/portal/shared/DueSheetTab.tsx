"use client";

import { LargeModalPortal } from "./LargeModalPortal";
import { useEffect, useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import {
  FilePreviewModal,
  useFilePreview,
  type PreviewFile,
} from "@/components/portal/shared/FilePreviewModal";
import { publicApiOrigin } from "@/lib/env";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/store";
import {
  useCreateOrderDueSheetMutation,
  useDeleteOrderDueSheetMutation,
  useListOrderDueSheetsQuery,
  useReplaceOrderDueSheetDocumentMutation,
} from "@/store/api";

type DueSheetTabProps = {
  orderId: string;
  onUploadSuccess?: () => void;
};

type DueSheetRow = Record<string, unknown>;

const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

function pickList(raw: unknown): DueSheetRow[] {
  if (Array.isArray(raw)) return raw as DueSheetRow[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as DueSheetRow[];
    if (Array.isArray(o.data)) return o.data as DueSheetRow[];
  }
  return [];
}

function resolveFileUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${publicApiOrigin()}${normalized}`;
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

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

function documentMeta(document: unknown): {
  name: string;
  url: string;
  mime: string;
  size: number;
} | null {
  if (!document || typeof document !== "object") return null;
  const doc = document as Record<string, unknown>;
  const url = String(doc.url ?? "");
  if (!url) return null;
  return {
    name: String(doc.original_name ?? doc.file_name ?? "Due sheet"),
    url: resolveFileUrl(url),
    mime: String(doc.mime_type ?? ""),
    size: Number(doc.size ?? 0),
  };
}

function statusBadge(status: unknown, isCurrent: boolean) {
  const normalized = String(status || "active").toLowerCase();
  if (isCurrent && normalized === "active") {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400">
        Current
      </span>
    );
  }
  if (normalized === "superseded") {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-600/10 dark:bg-amber-500/10 dark:text-amber-400">
        Superseded
      </span>
    );
  }
  if (normalized === "archived") {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-white/5 dark:text-slate-400">
        Archived
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 ring-1 ring-inset ring-blue-600/10 dark:bg-blue-500/10 dark:text-blue-400">
      Active
    </span>
  );
}

function userLabel(value: unknown): string {
  if (!value || typeof value !== "object") return "—";
  const row = value as Record<string, unknown>;
  return String(row.name ?? row.username ?? "—");
}

export function DueSheetTab({ orderId, onUploadSuccess }: DueSheetTabProps) {
  const token = useAppSelector((s) => s.auth.token);
  const {
    previewDoc,
    previewBlobUrl,
    previewLoading,
    openPreview,
    closePreview,
  } = useFilePreview(token);
  const dueSheetsQ = useListOrderDueSheetsQuery({ order: orderId });
  const [createDueSheet, { isLoading: isCreating }] = useCreateOrderDueSheetMutation();
  const [replaceDocument, { isLoading: isReplacing }] =
    useReplaceOrderDueSheetDocumentMutation();
  const [deleteDueSheet, { isLoading: isDeleting }] = useDeleteOrderDueSheetMutation();

  const dueSheets = useMemo(() => pickList(dueSheetsQ.data), [dueSheetsQ.data]);
  const currentSheet = useMemo(
    () =>
      dueSheets.find(
        (row) => row.is_current === true && String(row.status || "active") === "active",
      ) ?? dueSheets[0] ?? null,
    [dueSheets],
  );

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadRemarks, setUploadRemarks] = useState("");
  const [uploadSheetDate, setUploadSheetDate] = useState("");

  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  useEffect(() => {
    const handleGlobalPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const pastedFile = new File([blob], `screenshot_${Date.now()}.png`, {
              type: "image/png",
            });
            if (isUploadModalOpen) {
              setUploadFile(pastedFile);
              toast.success("Screenshot pasted successfully!");
              event.preventDefault();
            } else if (replaceTargetId) {
              setReplaceFile(pastedFile);
              toast.success("Screenshot pasted to replace document!");
              event.preventDefault();
            }
            break;
          }
        }
      }
    };

    if (isUploadModalOpen || replaceTargetId) {
      window.addEventListener("paste", handleGlobalPaste);
    }
    return () => {
      window.removeEventListener("paste", handleGlobalPaste);
    };
  }, [isUploadModalOpen, replaceTargetId]);

  const handleView = (doc: PreviewFile) => {
    void openPreview(doc);
  };

  const handleDownload = async (fileUrl: string, fileName: string) => {
    try {
      const response = await fetch(fileUrl, {
        headers: { Authorization: `Bearer ${token}` },
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
      toast.error("Failed to download file");
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.error("Please select a due sheet file");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("order", orderId);
      formData.append("document", uploadFile);
      if (uploadRemarks.trim()) formData.append("remarks", uploadRemarks.trim());
      if (uploadSheetDate) {
        formData.append("sheet_date", new Date(uploadSheetDate).toISOString());
      }

      await createDueSheet(formData).unwrap();
      toast.success("Due sheet uploaded successfully");
      setUploadFile(null);
      setUploadRemarks("");
      setUploadSheetDate("");
      setIsUploadModalOpen(false);
      dueSheetsQ.refetch();
      onUploadSuccess?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceTargetId || !replaceFile) {
      toast.error("Please select a file to replace");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("document", replaceFile);
      await replaceDocument({ id: replaceTargetId, body: formData }).unwrap();
      toast.success("Due sheet document replaced");
      setReplaceTargetId(null);
      setReplaceFile(null);
      dueSheetsQ.refetch();
      onUploadSuccess?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const handleDelete = async (id: string, sheetNo: string) => {
    if (!confirm(`Delete due sheet ${sheetNo}?`)) return;
    try {
      await deleteDueSheet(id).unwrap();
      toast.success("Due sheet deleted");
      dueSheetsQ.refetch();
      onUploadSuccess?.();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  if (dueSheetsQ.isLoading || dueSheetsQ.isFetching) {
    return <p className="text-sm text-slate-500">Loading due sheets...</p>;
  }

  return (
    <div className="space-y-6">
      <FilePreviewModal
        doc={previewDoc}
        blobUrl={previewBlobUrl}
        loading={previewLoading}
        onClose={closePreview}
        onDownload={(doc) => void handleDownload(doc.url, doc.name)}
        subtitle="Due sheet preview"
      />

      {isUploadModalOpen && (
        <LargeModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Upload Due Sheet
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setUploadFile(null);
                  setUploadRemarks("");
                  setUploadSheetDate("");
                }}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-white/5"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="mt-4 space-y-4">
              <div className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-250 p-6 transition hover:bg-slate-50/50 dark:border-slate-700 dark:hover:bg-white/5">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setUploadFile(e.target.files[0]);
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Upload due sheet document
                </p>
                <p className="text-xs text-slate-500">PDF, image, or office file</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Or paste a screenshot directly (Ctrl+V / Cmd+V)
                </p>
              </div>

              {uploadFile && (
                <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-slate-950">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {uploadFile.name}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadFile(null)}
                    className="text-xs font-semibold text-rose-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Sheet Date (Optional)
                </label>
                <input
                  type="date"
                  value={uploadSheetDate}
                  onChange={(e) => setUploadSheetDate(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Remarks (Optional)
                </label>
                <textarea
                  value={uploadRemarks}
                  onChange={(e) => setUploadRemarks(e.target.value)}
                  rows={2}
                  className="mt-1.5 w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                  placeholder="Notes about this due sheet..."
                />
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setIsUploadModalOpen(false)} className={btnSecondaryClass}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !uploadFile}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {isCreating ? "Uploading..." : "Upload Due Sheet"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </LargeModalPortal>
      )}

      {replaceTargetId && (
        <LargeModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Replace Document
            </h3>
            <form onSubmit={handleReplaceSubmit} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setReplaceFile(e.target.files[0]);
                  }}
                  className="w-full text-sm text-slate-700 dark:text-slate-300"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Or paste a screenshot directly (Ctrl+V / Cmd+V)
                </p>
              </div>

              {replaceFile && (
                <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-slate-955">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {replaceFile.name}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {(replaceFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplaceFile(null)}
                    className="text-xs font-semibold text-rose-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setReplaceTargetId(null);
                    setReplaceFile(null);
                  }}
                  className={btnSecondaryClass}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReplacing || !replaceFile}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isReplacing ? "Replacing..." : "Replace"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </LargeModalPortal>
      )}

      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Order Due Sheet</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upload and manage the official due sheet document for this order.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsUploadModalOpen(true)}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]"
        >
          Upload Due Sheet
        </button>
      </div>

      {currentSheet && (
        <DashboardCard title="Current Due Sheet" description="Latest active due sheet for this order.">
          {(() => {
            const doc = documentMeta(currentSheet.document);
            const sheetNo = String(currentSheet.due_sheet_no ?? "—");
            return (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{sheetNo}</span>
                      {statusBadge(currentSheet.status, Boolean(currentSheet.is_current))}
                      <span className="text-xs text-slate-500">
                        Rev {Number(currentSheet.revision_number || 1)}
                      </span>
                    </div>
                    {doc && (
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200" title={doc.name}>
                        {doc.name}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>Sheet date: {formatDate(currentSheet.sheet_date)}</span>
                      <span>Uploaded: {formatDate(currentSheet.createdAt)}</span>
                      <span>By: {userLabel(currentSheet.created_by)}</span>
                      {doc?.size ? <span>{formatBytes(doc.size)}</span> : null}
                    </div>
                    {currentSheet.remarks ? (
                      <p className="text-xs italic text-slate-600 dark:text-slate-300">
                        {String(currentSheet.remarks)}
                      </p>
                    ) : null}
                  </div>

                  {doc && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleView(doc)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(doc.url, doc.name)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-300"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplaceTargetId(String(currentSheet._id))}
                        className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:bg-slate-950 dark:text-blue-400"
                      >
                        Replace
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </DashboardCard>
      )}

      <DashboardCard
        title="Due Sheet History"
        description={
          dueSheets.length === 0
            ? "No due sheets uploaded yet."
            : `${dueSheets.length} version${dueSheets.length === 1 ? "" : "s"} on record.`
        }
      >
        {dueSheets.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <svg className="h-12 w-12 text-slate-300 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-2 text-sm text-slate-500">Upload the first due sheet for this order.</p>
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="mt-4 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Upload Due Sheet
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {dueSheets.map((sheet) => {
              const doc = documentMeta(sheet.document);
              const id = String(sheet._id ?? "");
              const sheetNo = String(sheet.due_sheet_no ?? "—");
              return (
                <div
                  key={id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{sheetNo}</span>
                      {statusBadge(sheet.status, Boolean(sheet.is_current))}
                      <span className="text-xs text-slate-500">Rev {Number(sheet.revision_number || 1)}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">
                      {doc?.name ?? "No document linked"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {formatDate(sheet.sheet_date)} · {userLabel(sheet.created_by)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {doc && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleView(doc)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-white/10 dark:text-slate-300"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(doc.url, doc.name)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-white/10 dark:text-slate-300"
                        >
                          Download
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleDelete(id, sheetNo)}
                      className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
