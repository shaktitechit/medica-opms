"use client";

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";

export type ResolveFlagModalProps = {
  /** When non-null, modal is visible */
  open: boolean;
  subtitle: string;
  resolutionNote: string;
  onResolutionNoteChange: (v: string) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onConfirm: () => void;
  isBusy: boolean;
};

/** Shared popup for resolving an order flag (note + optional attachment upload). */
export function ResolveFlagModal({
  open,
  subtitle,
  resolutionNote,
  onResolutionNoteChange,
  file,
  onFileChange,
  onClose,
  onConfirm,
  isBusy,
}: ResolveFlagModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/5">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Resolve Flag</h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="resolve-flag-note" className={labelClass}>
              Resolution Note
            </label>
            <textarea
              id="resolve-flag-note"
              rows={3}
              value={resolutionNote}
              onChange={(e) => onResolutionNoteChange(e.target.value)}
              className={inputClass}
              placeholder="Describe how this issue was resolved..."
              disabled={isBusy}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="resolve-flag-file" className={labelClass}>
              Attachment <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 dark:border-white/10 dark:bg-slate-950/30">
              <input
                id="resolve-flag-file"
                type="file"
                disabled={isBusy}
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 dark:text-slate-400 dark:file:bg-blue-900/20 dark:file:text-blue-400"
              />
              {file ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium">{file.name}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-lg border border-slate-200/95 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onConfirm()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {isBusy ? "Resolving…" : "Confirm resolve"}
          </button>
        </div>
      </div>
    </div>
  );
}
