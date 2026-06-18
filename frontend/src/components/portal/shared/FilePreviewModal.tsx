"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";

export type PreviewFile = {
  name: string;
  url: string;
  mime: string;
};

export function isPdfPreview(mime: string, name: string): boolean {
  const m = mime.toLowerCase();
  const n = name.toLowerCase();
  return m.includes("pdf") || n.endsWith(".pdf");
}

export function isImagePreview(mime: string, name: string): boolean {
  const m = mime.toLowerCase();
  const n = name.toLowerCase();
  return (
    m.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n)
  );
}

type FilePreviewModalProps = {
  doc: PreviewFile | null;
  blobUrl: string | null;
  loading: boolean;
  onClose: () => void;
  onDownload?: (doc: PreviewFile) => void;
  subtitle?: string;
};

export function FilePreviewModal({
  doc,
  blobUrl,
  loading,
  onClose,
  onDownload,
  subtitle = "File preview",
}: FilePreviewModalProps) {
  if (!doc) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-[min(90vh,820px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${doc.name}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
              {doc.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {blobUrl && onDownload && (
              <button
                type="button"
                onClick={() => onDownload(doc)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Download
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
              aria-label="Close preview"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto bg-slate-100 dark:bg-slate-950">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-500">
              <svg className="h-8 w-8 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading preview...
            </div>
          )}

          {!loading && blobUrl && isPdfPreview(doc.mime, doc.name) && (
            <iframe
              title={doc.name}
              src={blobUrl}
              className="h-full min-h-[70vh] w-full border-0 bg-white"
            />
          )}

          {!loading && blobUrl && isImagePreview(doc.mime, doc.name) && (
            <div className="flex h-full min-h-[50vh] items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={blobUrl}
                alt={doc.name}
                className="max-h-full max-w-full object-contain shadow-sm"
              />
            </div>
          )}

          {!loading &&
            blobUrl &&
            !isPdfPreview(doc.mime, doc.name) &&
            !isImagePreview(doc.mime, doc.name) && (
              <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
                <svg className="h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Inline preview is not available for this file type.
                </p>
                {onDownload && (
                  <button
                    type="button"
                    onClick={() => onDownload(doc)}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Download to open
                  </button>
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

export function useFilePreview(token: string | null | undefined) {
  const [previewDoc, setPreviewDoc] = useState<PreviewFile | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewBlobRef = useRef<string | null>(null);

  const closePreview = useCallback(() => {
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current);
      previewBlobRef.current = null;
    }
    setPreviewBlobUrl(null);
    setPreviewDoc(null);
    setPreviewLoading(false);
  }, []);

  useEffect(() => () => {
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current);
    }
  }, []);

  const openPreview = useCallback(
    async (doc: PreviewFile) => {
      setPreviewDoc(doc);
      setPreviewLoading(true);
      setPreviewBlobUrl(null);

      try {
        const response = await fetch(doc.url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error("Failed to view file");
        const blob = await response.blob();
        if (previewBlobRef.current) {
          URL.revokeObjectURL(previewBlobRef.current);
        }
        const blobUrl = URL.createObjectURL(blob);
        previewBlobRef.current = blobUrl;
        setPreviewBlobUrl(blobUrl);
      } catch {
        toast.error("Failed to load preview");
        closePreview();
      } finally {
        setPreviewLoading(false);
      }
    },
    [token, closePreview],
  );

  return {
    previewDoc,
    previewBlobUrl,
    previewLoading,
    openPreview,
    closePreview,
  };
}
