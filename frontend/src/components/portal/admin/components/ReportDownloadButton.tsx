"use client";

import { Download } from "lucide-react";

interface ReportDownloadButtonProps {
  onDownload: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
}

export default function ReportDownloadButton({
  onDownload,
  disabled = false,
  size = "sm",
  label = "Download",
}: ReportDownloadButtonProps) {
  const btnClass =
    size === "sm"
      ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
      : "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer";

  return (
    <button
      type="button"
      onClick={onDownload}
      disabled={disabled}
      className={btnClass}
      title="Download CSV"
    >
      <Download className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      <span>{label}</span>
    </button>
  );
}
