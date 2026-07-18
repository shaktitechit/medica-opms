"use client";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { useCallback, useEffect, useState } from "react";
import { FileText, X } from "lucide-react";

import { toast } from "@/lib/toast";
import { useCreateAttachmentMutation } from "@/store/api";

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";

export type AddVehicleDocumentModalProps = {
  open: boolean;
  vehicleId: string;
  vehicleLabel?: string;
  onClose: () => void;
  onUploaded?: () => void;
};

export function AddVehicleDocumentModal({
  open,
  vehicleId,
  vehicleLabel,
  onClose,
  onUploaded,
}: AddVehicleDocumentModalProps) {
  const [createAttachment, { isLoading }] = useCreateAttachmentMutation();
  const [file, setFile] = useState<File | null>(null);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!open) {
      setFile(null);
      setRemarks("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, isLoading]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!file) {
        toast.error("Please choose a file to upload.");
        return;
      }
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("entity_type", "vehicle");
        fd.append("entity_id", vehicleId);
        fd.append(
          "remarks",
          remarks.trim() || "Uploaded from vehicle documents tab",
        );
        await createAttachment(fd).unwrap();
        toast.success("Document uploaded successfully.");
        onUploaded?.();
        onClose();
      } catch {
        toast.error("Failed to upload document.");
      }
    },
    [createAttachment, file, onClose, onUploaded, remarks, vehicleId],
  );

  if (!open) return null;

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
        aria-labelledby="add-vehicle-doc-title"
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/90 px-5 py-4 dark:border-white/10">
          <div>
            <h2
              id="add-vehicle-doc-title"
              className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              <FileText className="h-5 w-5 text-blue-500" />
              Add document
            </h2>
            {vehicleLabel ? (
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400 font-mono uppercase">
                {vehicleLabel}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <label htmlFor="veh-doc-file" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              File <span className="text-rose-600">*</span>
            </label>
            <input
              id="veh-doc-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-800 dark:file:text-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="veh-doc-remarks" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Remarks
            </label>
            <textarea
              id="veh-doc-remarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="Optional note about this document…"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500"
            >
              {isLoading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </LargeModalPortal>
  );
}
