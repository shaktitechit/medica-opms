"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  X,
  Cloud,
  Plus,
  Trash2,
  Copy,
  Check,
  Search,
  Download,
  Info,
  ExternalLink,
  HelpCircle,
  FileText,
  RefreshCw,
  Link2
} from "lucide-react";
import {
  useListProductsQuery,
  usePatchProductMutation,
  useCreateProductMutation,
  useDeleteProductMutation
} from "@/store/api";
import { toast } from "@/lib/toast";

export type GoogleSheetProductsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

type ProductRow = {
  _id: string;
  product_name: string;
  generic_name?: string;
  sku?: string;
  product_group?: string;
  product_subgroup?: string;
  brand?: string;
  manufacturer?: string;
  unit: "pcs" | "box" | "kg" | "ltr" | "meter" | "set" | "kit" | "bottle";
  base_price: number;
  mrp?: number;
  gst_percent?: number;
  is_active: boolean;
};

type SelectedCell = {
  productId: string;
  colKey: keyof ProductRow;
} | null;

const COLUMNS: { key: keyof ProductRow; label: string; headerLetter: string; readonly?: boolean; type?: "text" | "number" | "select" | "boolean"; options?: string[] }[] = [
  { key: "product_name", label: "Product Name*", headerLetter: "A", type: "text" },
  { key: "sku", label: "SKU", headerLetter: "B", type: "text" },
  { key: "generic_name", label: "Generic Name", headerLetter: "C", type: "text" },
  { key: "brand", label: "Brand", headerLetter: "D", type: "text" },
  { key: "manufacturer", label: "Manufacturer", headerLetter: "E", type: "text" },
  { key: "base_price", label: "Base Price*", headerLetter: "F", type: "number" },
  { key: "mrp", label: "MRP", headerLetter: "G", type: "number" },
  { key: "gst_percent", label: "GST %", headerLetter: "H", type: "number" },
  { key: "unit", label: "Unit", headerLetter: "I", type: "select", options: ["pcs", "box", "kg", "ltr", "meter", "set", "kit", "bottle"] },
  { key: "is_active", label: "Active", headerLetter: "J", type: "boolean" }
];

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

export function GoogleSheetProductsModal({
  isOpen,
  onClose,
  onSuccess
}: GoogleSheetProductsModalProps) {
  const [activeTab, setActiveTab] = useState<"virtual" | "real">("virtual");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);
  const [formulaValue, setFormulaValue] = useState("");
  const [localRows, setLocalRows] = useState<ProductRow[]>([]);
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [realSheetUrl, setRealSheetUrl] = useState("");
  const [copiedScript, setCopiedScript] = useState(false);

  // RTK Queries & Mutations
  const { data, isLoading, isError, refetch } = useListProductsQuery(
    { paginate: "false" },
    { skip: !isOpen }
  );

  const [patchProduct] = usePatchProductMutation();
  const [createProduct, { isLoading: isCreating }] = useCreateProductMutation();
  const [deleteProduct, { isLoading: isDeleting }] = useDeleteProductMutation();

  const fetchedProducts = useMemo(() => {
    return (pickList(data) as ProductRow[]).filter(Boolean);
  }, [data]);

  // Load backend products into local state when queried
  useEffect(() => {
    if (fetchedProducts.length > 0) {
      setLocalRows(fetchedProducts);
    }
  }, [fetchedProducts]);

  // Load real sheet URL from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("medica_linked_google_sheet_url") || "";
      setRealSheetUrl(saved);
    }
  }, []);

  const handleSaveRealSheetUrl = (url: string) => {
    setRealSheetUrl(url);
    if (typeof window !== "undefined") {
      localStorage.setItem("medica_linked_google_sheet_url", url);
    }
    toast.success("Google Sheet URL updated!");
  };

  // Sync formula bar input back to selected cell
  useEffect(() => {
    if (selectedCell) {
      const row = localRows.find(r => r._id === selectedCell.productId);
      if (row) {
        const val = row[selectedCell.colKey];
        setFormulaValue(val !== undefined && val !== null ? String(val) : "");
      }
    } else {
      setFormulaValue("");
    }
  }, [selectedCell, localRows]);

  // Close modal with escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalStyle;
    };
  }, [isOpen, onClose]);

  // Helper to extract sheet ID for embedding
  const googleSheetEmbedUrl = useMemo(() => {
    if (!realSheetUrl) return null;
    const match = realSheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/htmlembed?widget=true&headers=false`;
    }
    return null;
  }, [realSheetUrl]);

  // Handle cell edit save to server
  const saveCell = useCallback(async (productId: string, colKey: keyof ProductRow, val: any) => {
    const originalRow = fetchedProducts.find(r => r._id === productId);
    if (!originalRow) return;

    let parsedVal = val;
    if (colKey === "base_price" || colKey === "mrp" || colKey === "gst_percent") {
      parsedVal = val === "" ? undefined : Number(val);
      if (parsedVal !== undefined && isNaN(parsedVal)) {
        toast.error("Invalid number value entered");
        return;
      }
    }

    // Don't patch if value didn't change
    if (originalRow[colKey] === parsedVal) return;

    setSavingRows(prev => ({ ...prev, [productId]: true }));
    try {
      await patchProduct({
        id: productId,
        patch: { [colKey]: parsedVal }
      }).unwrap();

      // Update local row state
      setLocalRows(prev =>
        prev.map(row => (row._id === productId ? { ...row, [colKey]: parsedVal } : row))
      );
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to sync update to server");
      // Revert local state to fetched data
      setLocalRows(fetchedProducts);
    } finally {
      setSavingRows(prev => ({ ...prev, [productId]: false }));
    }
  }, [fetchedProducts, patchProduct]);

  // Add a product row
  const handleAddRow = async () => {
    try {
      const result = await createProduct({
        product_name: "New Product",
        base_price: 0,
        minimum_sale_rate: 0,
        unit: "pcs"
      }).unwrap();

      toast.success("Added new product row!");
      refetch();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error("Failed to create product");
    }
  };

  // Delete a product row
  const handleDeleteRow = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      await deleteProduct(productId).unwrap();
      toast.success("Product deleted successfully");
      refetch();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error("Failed to delete product");
    }
  };

  // Filtered rows for virtual sheet search
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return localRows;
    const query = searchQuery.toLowerCase().trim();
    return localRows.filter(
      r =>
        r.product_name?.toLowerCase().includes(query) ||
        r.sku?.toLowerCase().includes(query) ||
        r.generic_name?.toLowerCase().includes(query) ||
        r.brand?.toLowerCase().includes(query) ||
        r.manufacturer?.toLowerCase().includes(query)
    );
  }, [localRows, searchQuery]);

  // Copy apps script code
  const copyScriptCode = () => {
    const code = `/**
 * Google Sheets App Script for OPMS Product Live-Sync
 * Paste this inside Extensions -> Apps Script in your Google Sheet.
 */

// Configuration
var BACKEND_WEBHOOK_URL = "${typeof window !== "undefined" ? window.location.origin : "http://localhost:5000"}/api/products/google-sheet-webhook?secret=medica-gsheet-sync-secret";

function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var row = range.getRow();
  
  // Skip header row
  if (row === 1) return;
  
  // Get all header labels
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  // Get all edited row values
  var rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  var payload = {};
  for (var i = 0; i < headers.length; i++) {
    var rawHeader = headers[i].toString().trim().toLowerCase();
    var key = rawHeader
      .replace(/\\*/g, "") // remove required asterisks
      .replace(/[^a-z0-9_]/g, "_") // sanitize spaces to underscores
      .replace(/__+/g, "_")
      .trim();
      
    // Handle mapping standard field names
    if (key === "product_id" || key === "id") key = "_id";
    if (key === "product_name" || key === "name") key = "product_name";
    if (key === "generic_name" || key === "generic") key = "generic_name";
    if (key === "base_price" || key === "price") key = "base_price";
    if (key === "gst_" || key === "gst_rate") key = "gst_percent";
    if (key === "active") key = "is_active";
    
    payload[key] = rowData[i];
  }
  
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(BACKEND_WEBHOOK_URL, options);
    var resText = response.getContentText();
    var code = response.getResponseCode();
    
    if (code === 200 || code === 201) {
      var resData = JSON.parse(resText);
      if (resData.success && resData.data && resData.data._id && !rowData[0]) {
        // Automatically write back the new MongoDB _id to Column A (Product ID)
        sheet.getRange(row, 1).setValue(resData.data._id);
      }
    }
  } catch (err) {
    Logger.log("Sync error: " + err.toString());
  }
}`;
    navigator.clipboard.writeText(code);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
    toast.success("Script copied to clipboard!");
  };

  // Trigger export of current sheet view
  const exportToCSV = () => {
    if (localRows.length === 0) return;
    const headers = COLUMNS.map(c => c.label).join(",");
    const csvRows = localRows.map(row => {
      return COLUMNS.map(col => {
        const val = row[col.key];
        const stringified = val !== undefined && val !== null ? String(val) : "";
        return `"${stringified.replace(/"/g, '""')}"`;
      }).join(",");
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...csvRows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `medica_products_sync_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  const isSavingAny = Object.values(savingRows).some(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 text-slate-100 font-sans" role="dialog" aria-modal="true">
      {/* Top Main Google Sheets-Style Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-2.5 shrink-0 select-none">
        <div className="flex items-center gap-3">
          {/* Sheets Premium Logo */}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-semibold text-lg shadow shadow-emerald-500/20">
            📊
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wide text-slate-100">
                Product Inventory Spreadsheet
              </span>
              {/* Sync Status Badge */}
              <div className="flex items-center gap-1 text-[11px] rounded bg-slate-800 px-2 py-0.5 border border-slate-700 text-slate-400">
                {isSavingAny ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin text-blue-400" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="h-3 w-3 text-emerald-400" />
                    <span>Saved to Cloud</span>
                  </>
                )}
              </div>
            </div>
            {/* Nav Menus Mock */}
            <div className="mt-1 flex items-center gap-3.5 text-xs text-slate-400">
              <button onClick={exportToCSV} className="hover:text-slate-100 transition">File (Export CSV)</button>
              <span className="text-slate-700">|</span>
              <button onClick={() => void refetch()} className="hover:text-slate-100 transition flex items-center gap-1">
                🔄 Reload
              </button>
            </div>
          </div>
        </div>

        {/* Tabs Control & Close */}
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg bg-slate-800 p-1 border border-slate-700">
            <button
              onClick={() => setActiveTab("virtual")}
              className={`rounded-md px-3.5 py-1 text-xs font-semibold transition ${activeTab === "virtual"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-100"
                }`}
            >
              Virtual Sheet (Instant)
            </button>
            <button
              onClick={() => setActiveTab("real")}
              className={`rounded-md px-3.5 py-1 text-xs font-semibold transition ${activeTab === "real"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-100"
                }`}
            >
              Real Google Sheet Connection
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
            title="Exit full screen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Grid View */}
      {activeTab === "virtual" ? (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
          {/* Sheets Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-slate-900 px-4 py-2 shrink-0">
            {/* Toolbar Buttons */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleAddRow}
                disabled={isCreating}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] px-3.5 py-1.5 text-xs font-bold text-white shadow shadow-emerald-500/10 transition disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Row</span>
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-850 hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

            {/* Filter Search */}
            <div className="relative w-72">
              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-500 pointer-events-none">
                <Search className="h-3.5 w-3.5" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search cell values in spreadsheet..."
                className="w-full rounded-lg border border-slate-700 bg-slate-850 pl-8 pr-3 py-1.5 text-xs text-slate-100 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
          </div>

          {/* Formula Bar */}
          <div className="flex items-center border-b border-slate-800 bg-slate-900 px-4 py-1.5 text-xs select-none shrink-0 font-mono">
            <span className="text-slate-500 font-semibold select-none pr-3 select-none">fx</span>
            <span className="text-slate-600 px-1 border-r border-slate-700 mr-3">|</span>
            <input
              type="text"
              value={formulaValue}
              onChange={e => {
                setFormulaValue(e.target.value);
                if (selectedCell) {
                  // Instant update in local row state
                  setLocalRows(prev =>
                    prev.map(row =>
                      row._id === selectedCell.productId
                        ? { ...row, [selectedCell.colKey]: e.target.value }
                        : row
                    )
                  );
                }
              }}
              onBlur={() => {
                if (selectedCell) {
                  saveCell(selectedCell.productId, selectedCell.colKey, formulaValue);
                }
              }}
              onKeyDown={e => {
                if (e.key === "Enter" && selectedCell) {
                  saveCell(selectedCell.productId, selectedCell.colKey, formulaValue);
                  // Remove selection focus
                  setSelectedCell(null);
                }
              }}
              disabled={!selectedCell || COLUMNS.find(c => c.key === selectedCell.colKey)?.readonly}
              placeholder={selectedCell ? "Enter value..." : "Select a cell to edit its formula/content"}
              className="flex-1 bg-transparent text-slate-200 outline-none placeholder-slate-650"
            />
          </div>

          {/* The Spreadsheet Grid Table */}
          <div className="flex-1 overflow-auto min-h-0 relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-[1px] z-10">
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw className="h-7 w-7 animate-spin text-emerald-500" />
                  <span className="text-sm font-semibold text-slate-400">Loading catalog rows...</span>
                </div>
              </div>
            )}

            <table className="w-full text-left text-xs border-collapse min-w-[1400px]">
              {/* Header row: Column Letters */}
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-700 z-20 text-slate-400 font-semibold font-mono">
                <tr>
                  <th className="w-12 px-2 py-1.5 border-r border-slate-700 text-center select-none bg-slate-850"></th>
                  <th className="w-16 px-2 py-1.5 border-r border-slate-700 text-center select-none bg-slate-850">Del</th>
                  {COLUMNS.map(col => (
                    <th key={col.key} className="px-3 py-1.5 border-r border-slate-700 text-center select-none bg-slate-850">
                      {col.headerLetter}
                      <span className="block text-[10px] uppercase font-sans text-slate-500 font-bold tracking-wider mt-0.5">
                        {col.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {filteredRows.map((row, rowIdx) => {
                  const isSavingRow = !!savingRows[row._id];
                  return (
                    <tr
                      key={row._id}
                      className={`hover:bg-slate-900/40 transition group ${isSavingRow ? "bg-emerald-950/10" : ""
                        }`}
                    >
                      {/* Left Header Row Number */}
                      <td className="w-12 border-r border-slate-800 bg-slate-900/60 font-mono text-center text-slate-500 select-none font-bold py-1.5 sticky left-0 z-10">
                        {rowIdx + 1}
                      </td>

                      {/* Row Delete Button */}
                      <td className="w-16 border-r border-slate-800 bg-slate-900/40 text-center py-1">
                        <button
                          onClick={() => handleDeleteRow(row._id)}
                          disabled={isDeleting}
                          className="p-1 rounded hover:bg-rose-500/20 text-rose-500 hover:text-rose-400 transition"
                          title="Delete row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>

                      {/* Spreadsheet Columns */}
                      {COLUMNS.map(col => {
                        const cellVal = row[col.key];
                        const isSelected = selectedCell?.productId === row._id && selectedCell?.colKey === col.key;
                        const isReadonly = col.readonly;

                        return (
                          <td
                            key={col.key}
                            onClick={() => setSelectedCell({ productId: row._id, colKey: col.key })}
                            className={`border-r border-slate-800 p-0 text-slate-200 min-w-[120px] transition duration-75 relative ${isReadonly ? "bg-slate-900/30 text-slate-500 font-mono text-[10px]" : "cursor-cell hover:bg-slate-850/50"
                              } ${isSelected ? "ring-2 ring-emerald-500 ring-inset bg-slate-850/90 z-10" : ""
                              }`}
                          >
                            {/* Readonly View */}
                            {isReadonly ? (
                              <div className="px-3 py-2 truncate max-w-[200px]" title={String(cellVal || "")}>
                                {cellVal ? String(cellVal) : "—"}
                              </div>
                            ) : (
                              /* Editable Cells */
                              <div className="w-full h-full flex items-center justify-between">
                                {col.type === "boolean" ? (
                                  <div className="w-full flex justify-center py-2">
                                    <input
                                      type="checkbox"
                                      checked={!!cellVal}
                                      onChange={e => {
                                        setLocalRows(prev =>
                                          prev.map(r => r._id === row._id ? { ...r, is_active: e.target.checked } : r)
                                        );
                                        saveCell(row._id, "is_active", e.target.checked);
                                      }}
                                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-offset-transparent cursor-pointer"
                                    />
                                  </div>
                                ) : col.type === "select" ? (
                                  <select
                                    value={String(cellVal || "pcs")}
                                    onChange={e => {
                                      const newVal = e.target.value as any;
                                      setLocalRows(prev =>
                                        prev.map(r => r._id === row._id ? { ...r, unit: newVal } : r)
                                      );
                                      saveCell(row._id, "unit", newVal);
                                    }}
                                    className="w-full bg-transparent border-none outline-none focus:ring-0 text-xs px-3 py-2 text-slate-100 cursor-pointer capitalize"
                                  >
                                    {col.options?.map(opt => (
                                      <option key={opt} value={opt} className="bg-slate-900 text-slate-100">
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type={col.type === "number" ? "number" : "text"}
                                    value={cellVal !== undefined && cellVal !== null ? String(cellVal) : ""}
                                    onChange={e => {
                                      const rawVal = e.target.value;
                                      setLocalRows(prev =>
                                        prev.map(r => r._id === row._id ? { ...r, [col.key]: rawVal } : r)
                                      );
                                    }}
                                    onBlur={e => saveCell(row._id, col.key, e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") {
                                        saveCell(row._id, col.key, (e.target as HTMLInputElement).value);
                                        // Move focus down or blur
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}
                                    className="w-full h-full bg-transparent border-none outline-none focus:ring-0 text-xs px-3 py-2 text-slate-200"
                                  />
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Grid Footer Bar */}
          <div className="border-t border-slate-800 bg-slate-900 px-4 py-2 shrink-0 flex items-center justify-between text-xs text-slate-400 select-none">
            <div>
              Total Products: <span className="font-semibold text-slate-200">{localRows.length}</span>
              {searchQuery && (
                <span className="ml-3 text-slate-500">
                  (filtered to {filteredRows.length} matching rows)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span>All updates sync live directly to MongoDB backend.</span>
            </div>
          </div>
        </div>
      ) : (
        /* Connect Real Google Sheet View */
        <div className="flex-1 overflow-y-auto bg-slate-950 p-6 space-y-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Link2 className="h-5 w-5 text-emerald-500" />
                <span>Link a Real Google Sheet URL</span>
              </h3>
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                Paste your Google Sheet link here. We will parse it and embed it so you can edit it directly from this popup modal. Updates from the sheet will be synced back to the backend in real-time.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={realSheetUrl}
                  onChange={e => handleSaveRealSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-850 px-3.5 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/30"
                />
                {realSheetUrl && (
                  <a
                    href={realSheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 px-4 py-2 text-sm font-semibold text-slate-200 transition"
                  >
                    <span>Open Sheet</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            {/* Embedded Iframe */}
            {googleSheetEmbedUrl ? (
              <div className="border border-slate-850 rounded-xl overflow-hidden shadow-xl bg-slate-900">
                <div className="bg-slate-850 px-4 py-2 border-b border-slate-800 flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-300">Google Sheet Embedded View</span>
                  <span className="text-[10px] text-slate-500">Iframe loading via Google Docs URL</span>
                </div>
                <iframe
                  src={googleSheetEmbedUrl}
                  className="w-full h-[450px] border-none bg-white"
                  title="Google Sheet Embedded View"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-800 rounded-xl py-12 px-4 text-center bg-slate-900/30">
                <div className="text-slate-650 mb-3 text-3xl">📁</div>
                <h4 className="text-sm font-bold text-slate-300">No Google Sheet URL connected</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                  Paste your spreadsheet link above to enable the embedded preview panel in this tab.
                </p>
              </div>
            )}

            {/* Setup Instructions */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-5">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
                <Info className="h-5 w-5 text-blue-400" />
                <span>Webhooks Setup Guide (How to Sync Google Sheet {"->"} Backend)</span>
              </h3>

              <div className="space-y-4 text-xs leading-relaxed text-slate-350">
                <div className="space-y-2">
                  <span className="font-bold text-slate-200 block">1. Sheet Columns Setup</span>
                  <p>
                    Set the headers in Row 1 of your spreadsheet exactly as follows (column order doesn't matter, but names must match):
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1.5 font-mono text-[10px]">
                    <div className="bg-slate-850 border border-slate-850 p-1.5 rounded text-center">Product ID</div>
                    <div className="bg-slate-850 border border-slate-850 p-1.5 rounded text-center">Product Name*</div>
                    <div className="bg-slate-850 border border-slate-850 p-1.5 rounded text-center">SKU</div>
                    <div className="bg-slate-850 border border-slate-850 p-1.5 rounded text-center">Generic Name</div>
                    <div className="bg-slate-850 border border-slate-850 p-1.5 rounded text-center">Brand</div>
                    <div className="bg-slate-850 border border-slate-850 p-1.5 rounded text-center">Manufacturer</div>
                    <div className="bg-slate-850 border border-slate-850 p-1.5 rounded text-center">Base Price*</div>
                    <div className="bg-slate-850 border border-slate-850 p-1.5 rounded text-center">MRP</div>
                    <div className="bg-slate-850 border border-slate-850 p-1.5 rounded text-center">GST %</div>
                    <div className="bg-slate-850 border border-slate-850 p-1.5 rounded text-center">Unit</div>
                    <div className="bg-slate-850 border border-slate-850 p-1.5 rounded text-center">Active</div>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    * Asterisks denote fields required by the database engine.
                  </span>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="font-bold text-slate-200 block">2. Google Apps Script Configuration</span>
                  <p>
                    Open your sheet, select <strong className="text-slate-200">Extensions &gt; Apps Script</strong>, clear the editor, and copy-paste the code snippet below:
                  </p>

                  {/* Copy Script Container */}
                  <div className="relative border border-slate-800 rounded-lg overflow-hidden bg-slate-950 font-mono text-[11px] leading-normal text-slate-300">
                    <div className="bg-slate-850 px-4 py-2 flex justify-between items-center text-xs select-none">
                      <span className="font-semibold text-slate-450">GoogleAppsScriptCode.js</span>
                      <button
                        onClick={copyScriptCode}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-250 transition active:scale-95"
                      >
                        {copiedScript ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedScript ? "Copied!" : "Copy Code"}</span>
                      </button>
                    </div>
                    <pre className="p-4 overflow-x-auto max-h-60 select-all">
                      {`function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var range = e.range;
  var row = range.getRow();
  
  if (row === 1) return; // skip header
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  var payload = {};
  for (var i = 0; i < headers.length; i++) {
    var rawHeader = headers[i].toString().trim().toLowerCase();
    var key = rawHeader.replace(/\\*/g, "").replace(/[^a-z0-9_]/g, "_").replace(/__+/g, "_").trim();
    
    if (key === "product_id" || key === "id") key = "_id";
    if (key === "product_name" || key === "name") key = "product_name";
    if (key === "generic_name" || key === "generic") key = "generic_name";
    if (key === "base_price" || key === "price") key = "base_price";
    if (key === "gst_" || key === "gst_rate") key = "gst_percent";
    if (key === "active") key = "is_active";
    
    payload[key] = rowData[i];
  }
  
  var backendUrl = "${typeof window !== "undefined" ? window.location.origin : "http://localhost:5000"}/api/products/google-sheet-webhook?secret=medica-gsheet-sync-secret";
  
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(backendUrl, options);
    if (response.getResponseCode() === 200 || response.getResponseCode() === 201) {
      var resData = JSON.parse(response.getContentText());
      if (resData.success && resData.data && resData.data._id && !rowData[0]) {
        sheet.getRange(row, 1).setValue(resData.data._id);
      }
    }
  } catch (err) {
    Logger.log(err.toString());
  }
}`}
                    </pre>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="font-bold text-slate-200 block">3. Setup onEdit Trigger</span>
                  <p>
                    Inside the Google Apps Script panel, click on the Clock icon (<strong className="text-slate-200">Triggers</strong>) in the left sidebar. Add a trigger:
                  </p>
                  <ul className="list-disc list-inside pl-2 space-y-1 text-slate-400">
                    <li>Choose function: <code className="font-mono text-emerald-400">onEdit</code></li>
                    <li>Choose deployment: <code className="font-mono">Head</code></li>
                    <li>Event source: <code className="font-mono text-emerald-400">From spreadsheet</code></li>
                    <li>Event type: <code className="font-mono text-emerald-400">On edit</code></li>
                  </ul>
                  <p className="mt-1">
                    Save the trigger and authorize the Google Script. Now, updates/new lines created in your Google Sheet will sync live to your OPMS database!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
