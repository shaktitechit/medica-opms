/**
 * @fileoverview Download Leads Preview Modal with Column Selector, Live Table Preview, and Multi-Format Exports.
 * @module components/portal/shared/leads/DownloadLeadsPreviewModal
 */
"use client";

import React, { useState, useMemo } from "react";
import {
  X,
  Download,
  FileSpreadsheet,
  FileText,
  Copy,
  Check,
  CheckSquare,
  Square,
  Columns,
  Eye,
  Info,
} from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import { toast } from "@/lib/toast";
import {
  downloadTableXlsx,
  downloadTablePdf,
  type ExportTableColumn,
  type ExportTableRow,
} from "@/components/portal/shared/exportTableDownloads";
import { LEAD_STATUS_CONFIG, LEAD_PRIORITY_CONFIG } from "./leadUtils";

export type ColumnDef = {
  key: string;
  label: string;
  defaultSelected?: boolean;
  widthPdf?: number;
};

export type DownloadLeadsPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  leads: any[];
  availableColumns: ColumnDef[];
  title?: string;
  subtitle?: string;
};

export function DownloadLeadsPreviewModal({
  open,
  onClose,
  leads,
  availableColumns,
  title = "Download Leads Export Preview",
  subtitle = "Select columns to include, preview live data, and choose your preferred export format.",
}: DownloadLeadsPreviewModalProps) {
  // Column selection state
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    availableColumns.forEach((col) => {
      initial[col.key] = col.defaultSelected !== false;
    });
    return initial;
  });

  const selectedColumns = useMemo(() => {
    return availableColumns.filter((col) => selectedColumnKeys[col.key]);
  }, [availableColumns, selectedColumnKeys]);

  const selectedCount = selectedColumns.length;
  const isAllSelected = selectedCount === availableColumns.length;

  const handleToggleColumn = (key: string) => {
    setSelectedColumnKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelectAll = () => {
    const next: Record<string, boolean> = {};
    availableColumns.forEach((c) => {
      next[c.key] = true;
    });
    setSelectedColumnKeys(next);
  };

  const handleDeselectAll = () => {
    const next: Record<string, boolean> = {};
    availableColumns.forEach((c) => {
      next[c.key] = false;
    });
    setSelectedColumnKeys(next);
  };

  const handleResetDefaults = () => {
    const next: Record<string, boolean> = {};
    availableColumns.forEach((c) => {
      next[c.key] = c.defaultSelected !== false;
    });
    setSelectedColumnKeys(next);
  };

  // Export handlers
  const exportToExcel = () => {
    if (selectedColumns.length === 0) {
      toast.error("Please select at least one column to export");
      return;
    }
    if (leads.length === 0) {
      toast.error("No lead rows to export");
      return;
    }

    const exportCols: ExportTableColumn[] = selectedColumns.map((col) => ({
      key: col.key,
      label: col.label.replace("*", ""),
      width: col.widthPdf || 1,
    }));

    const exportRows: ExportTableRow[] = leads.map((r) => {
      const rowObj: ExportTableRow = {};
      selectedColumns.forEach((col) => {
        const val = r[col.key];
        rowObj[col.key] =
          typeof val === "string" || typeof val === "number"
            ? val
            : val != null
            ? String(val)
            : "—";
      });
      return rowObj;
    });

    const totalQty = leads.reduce((sum, r) => sum + (Number(r.total_quantity) || 0), 0);

    downloadTableXlsx({
      filename: `medica_leads_export_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: "Leads Data",
      title: `Medica OPMS Leads Export (${leads.length} Leads, Total Est. Qty: ${totalQty})`,
      columns: exportCols,
      rows: exportRows,
    });
    toast.success("Excel sheet downloaded successfully!");
    onClose();
  };

  const exportToCSV = () => {
    if (selectedColumns.length === 0) {
      toast.error("Please select at least one column to export");
      return;
    }
    if (leads.length === 0) {
      toast.error("No lead rows to export");
      return;
    }

    const headers = selectedColumns.map((c) => `"${c.label.replace("*", "")}"`).join(",");
    const csvRows = leads.map((row) => {
      return selectedColumns.map((col) => {
        const val: any = row[col.key];
        const stringified = val !== undefined && val !== null ? String(val) : "";
        return `"${stringified.replace(/"/g, '""')}"`;
      }).join(",");
    });

    const totalQty = leads.reduce((sum, r) => sum + (Number(r.total_quantity) || 0), 0);
    const summaryRow = selectedColumns.map((col, idx) => {
      if (idx === 0) return `"SUMMARY (${leads.length} leads)"`;
      if (col.key === "total_quantity") return `"${totalQty}"`;
      return `""`;
    }).join(",");

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers, ...csvRows, "", summaryRow].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `medica_leads_export_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV export downloaded successfully!");
    onClose();
  };

  const exportToPDF = async () => {
    if (selectedColumns.length === 0) {
      toast.error("Please select at least one column to export");
      return;
    }
    if (leads.length === 0) {
      toast.error("No lead rows to export");
      return;
    }

    const exportCols: ExportTableColumn[] = selectedColumns.map((col) => ({
      key: col.key,
      label: col.label.replace("*", ""),
      width: col.widthPdf || 1,
    }));

    const exportRows: ExportTableRow[] = leads.map((r) => {
      const rowObj: ExportTableRow = {};
      selectedColumns.forEach((col) => {
        const rawVal = r[col.key];
        const val: string | number | null =
          typeof rawVal === "string" || typeof rawVal === "number"
            ? rawVal
            : rawVal != null
            ? String(rawVal)
            : "—";

        rowObj[col.key] = val;
      });
      return rowObj;
    });

    const totalQty = leads.reduce((sum, r) => sum + (Number(r.total_quantity) || 0), 0);

    await downloadTablePdf({
      filename: `medica_leads_report_${new Date().toISOString().slice(0, 10)}.pdf`,
      title: "Medica OPMS - Leads Master Export Report",
      subtitle: `Exported on ${new Date().toLocaleDateString("en-IN", {
        dateStyle: "medium",
      })} • ${leads.length} Leads • Total Est. Qty: ${totalQty} units`,
      columns: exportCols,
      rows: exportRows,
    });
    toast.success("PDF report downloaded successfully!");
    onClose();
  };

  const copyToClipboardTSV = () => {
    if (selectedColumns.length === 0) {
      toast.error("Please select at least one column to copy");
      return;
    }
    if (leads.length === 0) return;

    const headers = selectedColumns.map((c) => c.label.replace("*", "")).join("\t");
    const rows = leads.map((r) => {
      return selectedColumns.map((col) => {
        const val = r[col.key];
        return val !== undefined && val !== null ? String(val).replace(/\t|\n/g, " ") : "";
      }).join("\t");
    });
    const tsv = [headers, ...rows].join("\n");
    navigator.clipboard.writeText(tsv);
    toast.success("Copied TSV to clipboard (ready to paste into Google Sheets)!");
    onClose();
  };

  if (!open) return null;

  return (
    <LargeModalPortal>
      <ModalOverlay onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="relative flex flex-col w-full max-w-6xl max-h-[92vh] rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-white/10 dark:bg-slate-900 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 px-6 py-4 shrink-0 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/20">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {subtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Column Selector Panel */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-700/60">
                <div className="flex items-center gap-2">
                  <Columns className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Select Columns to Export ({selectedCount} of {availableColumns.length} Selected)
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <Square className="h-3.5 w-3.5 text-slate-400" />
                    Deselect All
                  </button>
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Checkboxes Grid */}
              <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {availableColumns.map((col) => {
                  const isChecked = Boolean(selectedColumnKeys[col.key]);
                  return (
                    <label
                      key={col.key}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-xs font-medium transition select-none ${
                        isChecked
                          ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm dark:border-emerald-500/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleColumn(col.key)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600"
                      />
                      <span className="truncate">{col.label.replace("*", "")}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Live Data Preview Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-slate-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Live Data Preview ({leads.length} Records)
                  </h3>
                </div>
                <span className="text-[11px] text-slate-500">
                  Showing first {Math.min(leads.length, 10)} of {leads.length} rows
                </span>
              </div>

              {selectedColumns.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/30">
                  <Columns className="mb-2 h-8 w-8 text-slate-400" />
                  <p className="text-sm font-semibold">No columns selected</p>
                  <p className="text-xs text-slate-400">Select at least one column above to preview data</p>
                </div>
              ) : (
                <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 shadow-sm dark:border-slate-700">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <tr>
                        <th className="px-3 py-2 border-r border-slate-200 dark:border-slate-700 text-center w-12">
                          #
                        </th>
                        {selectedColumns.map((col) => (
                          <th
                            key={col.key}
                            className="px-3 py-2 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap"
                          >
                            {col.label.replace("*", "")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {leads.slice(0, 10).map((row, idx) => (
                        <tr
                          key={row._id || idx}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                        >
                          <td className="px-3 py-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono text-slate-400 text-[11px] bg-slate-50/50 dark:bg-slate-800/30">
                            {idx + 1}
                          </td>
                          {selectedColumns.map((col) => {
                            const val = row[col.key];
                            return (
                              <td
                                key={col.key}
                                className="px-3 py-2 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap text-slate-700 dark:text-slate-300"
                              >
                                {col.key === "lead_no" ? (
                                  <span className="font-bold text-blue-600 dark:text-blue-400">
                                    {val || "—"}
                                  </span>
                                ) : col.key === "status" ? (
                                  <span
                                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                      LEAD_STATUS_CONFIG[val as keyof typeof LEAD_STATUS_CONFIG]?.bg || "bg-slate-100"
                                    } ${
                                      LEAD_STATUS_CONFIG[val as keyof typeof LEAD_STATUS_CONFIG]?.text || "text-slate-800"
                                    }`}
                                  >
                                    {LEAD_STATUS_CONFIG[val as keyof typeof LEAD_STATUS_CONFIG]?.label || val}
                                  </span>
                                ) : col.key === "priority" ? (
                                  <span
                                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                      LEAD_PRIORITY_CONFIG[val as keyof typeof LEAD_PRIORITY_CONFIG]?.bg || "bg-slate-100"
                                    } ${
                                      LEAD_PRIORITY_CONFIG[val as keyof typeof LEAD_PRIORITY_CONFIG]?.text || "text-slate-800"
                                    }`}
                                  >
                                    {LEAD_PRIORITY_CONFIG[val as keyof typeof LEAD_PRIORITY_CONFIG]?.label || val}
                                  </span>
                                ) : (
                                  <span>{val !== undefined && val !== null && val !== "" ? String(val) : "—"}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Footer with Multi-format Downloads */}
          <div className="flex flex-wrap items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 px-6 py-4 shrink-0 gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Info className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                All {leads.length} filtered leads will be exported with the {selectedCount} selected columns.
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={copyToClipboardTSV}
                disabled={selectedCount === 0 || leads.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy TSV
              </button>

              <button
                type="button"
                onClick={exportToPDF}
                disabled={selectedCount === 0 || leads.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
              >
                <Download className="h-3.5 w-3.5 text-rose-600" />
                Download PDF
              </button>

              <button
                type="button"
                onClick={exportToCSV}
                disabled={selectedCount === 0 || leads.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
              >
                <FileText className="h-3.5 w-3.5 text-blue-600" />
                Download CSV
              </button>

              <button
                type="button"
                onClick={exportToExcel}
                disabled={selectedCount === 0 || leads.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Download Excel (.xlsx)
              </button>
            </div>
          </div>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}
