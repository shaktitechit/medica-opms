"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useBulkCreateProductMutation } from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

export type BulkUploadProductsModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type ParsedProduct = {
  product_name: string;
  generic_name: string;
  aliases: string;
  sku: string;
  product_group: string;
  product_subgroup: string;
  brand: string;
  manufacturer: string;
  unit: string;
  base_price: string;
  minimum_sale_rate: string;
  mrp: string;
  gst_percent: string;
  warranty_months: string;
  description: string;
  tags: string;
  // Validation status
  status: "ready" | "invalid";
  reason?: string;
  raw: Record<string, string>;
};

const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

export function BulkUploadProductsModal({
  open,
  onClose,
  onSuccess,
}: BulkUploadProductsModalProps) {
  const [bulkCreateProduct, { isLoading }] = useBulkCreateProductMutation();
  const [file, setFile] = useState<File | null>(null);
  const [parsedProducts, setParsedProducts] = useState<ParsedProduct[]>([]);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setParsedProducts([]);
      setDragActive(false);
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
  }, [open, isLoading, onClose]);

  // Client-side CSV Parser
  const parseCSV = (text: string): ParsedProduct[] => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0 || !lines[0].trim()) return [];

    const headers = lines[0].split(",").map((h) =>
      h.trim().replace(/^["']|["']$/g, "").toLowerCase()
    );
    
    const parsed: ParsedProduct[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      const raw: Record<string, string> = {};
      headers.forEach((header, idx) => {
        let val = values[idx] || "";
        val = val.replace(/^["']|["']$/g, "");
        raw[header] = val;
      });

      // Map to columns
      const name = raw.product_name || raw.name || "";
      const generic_name = raw.generic_name || raw.generic || "";
      const aliases = raw.aliases || "";
      const priceRaw = raw.base_price || raw.default_price || raw.price || "";
      const minSaleRaw = raw.minimum_sale_rate || raw.min_sale_rate || priceRaw;
      const sku = raw.sku || "";
      const product_group = raw.product_group || raw.group || raw.category || "";
      const product_subgroup = raw.product_subgroup || raw.subgroup || "";
      const brand = raw.brand || "";
      const manufacturer = raw.manufacturer || "";
      const unit = raw.unit || "pcs";
      const mrp = raw.mrp || "";
      const gst = raw.gst_percent || raw.gst_rate || "18";
      const warranty_months = raw.warranty_months || raw.warranty || "";
      const desc = raw.description || raw.desc || "";
      const tags = raw.tags || "";

      // Validate
      let status: "ready" | "invalid" = "ready";
      let reason = "";

      if (!name.trim()) {
        status = "invalid";
        reason = "Missing name";
      } else {
        const p = Number(priceRaw);
        if (priceRaw === "" || !Number.isFinite(p) || p < 0) {
          status = "invalid";
          reason = "Invalid base price";
        } else {
          const msr = Number(minSaleRaw);
          if (minSaleRaw === "" || !Number.isFinite(msr) || msr < 0) {
            status = "invalid";
            reason = "Invalid min sale rate";
          } else {
            const gstVal = Number(gst);
            if (gst !== "" && (!Number.isFinite(gstVal) || gstVal < 0 || gstVal > 100)) {
              status = "invalid";
              reason = "GST percent must be 0-100";
            } else if (mrp !== "" && (isNaN(Number(mrp)) || Number(mrp) < 0)) {
              status = "invalid";
              reason = "MRP must be non-negative";
            } else if (warranty_months !== "" && (isNaN(Number(warranty_months)) || Number(warranty_months) < 0 || !Number.isInteger(Number(warranty_months)))) {
              status = "invalid";
              reason = "Warranty must be non-negative integer";
            } else if (unit && !["pcs", "box", "kg", "ltr", "meter", "set", "kit", "bottle"].includes(unit.toLowerCase())) {
              status = "invalid";
              reason = "Invalid unit value";
            }
          }
        }
      }

      parsed.push({
        product_name: name,
        generic_name,
        aliases,
        sku,
        product_group,
        product_subgroup,
        brand,
        manufacturer,
        unit,
        base_price: priceRaw,
        minimum_sale_rate: minSaleRaw,
        mrp,
        gst_percent: gst,
        warranty_months,
        description: desc,
        tags,
        status,
        reason,
        raw,
      });
    }

    return parsed;
  };

  const handleFileChange = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      try {
        if (selectedFile.name.endsWith(".json")) {
          const json = JSON.parse(text);
          const list = Array.isArray(json) ? json : [json];
          const mapped: ParsedProduct[] = list.map((item: any) => {
            const name = String(item.product_name ?? item.name ?? "").trim();
            const price = String(item.base_price ?? item.default_price ?? item.price ?? "");
            const minSaleRaw = String(item.minimum_sale_rate ?? item.min_sale_rate ?? price);
            const generic_name = String(item.generic_name ?? item.generic ?? "");
            const aliases = Array.isArray(item.aliases) ? item.aliases.join(", ") : String(item.aliases ?? "");
            const sku = String(item.sku ?? "");
            const product_group = String(item.product_group ?? item.group ?? item.category ?? "");
            const product_subgroup = String(item.product_subgroup ?? item.subgroup ?? "");
            const brand = String(item.brand ?? "");
            const manufacturer = String(item.manufacturer ?? "");
            const unit = String(item.unit ?? "pcs");
            const mrp = String(item.mrp ?? "");
            const gst = String(item.gst_percent ?? item.gst_rate ?? "18");
            const warranty_months = String(item.warranty_months ?? item.warranty ?? "");
            const desc = String(item.description ?? item.desc ?? "");
            const tags = Array.isArray(item.tags) ? item.tags.join(", ") : String(item.tags ?? "");

            let status: "ready" | "invalid" = "ready";
            let reason = "";

            if (!name) {
              status = "invalid";
              reason = "Missing name";
            } else {
              const p = Number(price);
              if (price === "" || !Number.isFinite(p) || p < 0) {
                status = "invalid";
                reason = "Invalid base price";
              } else {
                const msr = Number(minSaleRaw);
                if (minSaleRaw === "" || !Number.isFinite(msr) || msr < 0) {
                  status = "invalid";
                  reason = "Invalid min sale rate";
                } else {
                  const gstVal = Number(gst);
                  if (gst !== "" && (!Number.isFinite(gstVal) || gstVal < 0 || gstVal > 100)) {
                    status = "invalid";
                    reason = "GST percent must be 0-100";
                  } else if (mrp !== "" && (isNaN(Number(mrp)) || Number(mrp) < 0)) {
                    status = "invalid";
                    reason = "MRP must be non-negative";
                  } else if (warranty_months !== "" && (isNaN(Number(warranty_months)) || Number(warranty_months) < 0 || !Number.isInteger(Number(warranty_months)))) {
                    status = "invalid";
                    reason = "Warranty must be non-negative integer";
                  } else if (unit && !["pcs", "box", "kg", "ltr", "meter", "set", "kit", "bottle"].includes(unit.toLowerCase())) {
                    status = "invalid";
                    reason = "Invalid unit value";
                  }
                }
              }
            }

            return {
              product_name: name,
              generic_name,
              aliases,
              sku,
              product_group,
              product_subgroup,
              brand,
              manufacturer,
              unit,
              base_price: price,
              minimum_sale_rate: minSaleRaw,
              mrp,
              gst_percent: gst,
              warranty_months,
              description: desc,
              tags,
              status,
              reason,
              raw: item,
            };
          });
          setParsedProducts(mapped);
        } else {
          // Parse as CSV
          const mapped = parseCSV(text);
          setParsedProducts(mapped);
        }
      } catch (err) {
        toast.error("Failed to parse file. Ensure it is valid CSV or JSON.");
        setFile(null);
        setParsedProducts([]);
      }
    };
    reader.readAsText(selectedFile);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileChange(e.dataTransfer.files[0]);
      }
    },
    [handleFileChange]
  );

  const downloadTemplate = useCallback(() => {
    const csvContent =
      "product_name,generic_name,aliases,sku,product_group,product_subgroup,brand,manufacturer,unit,base_price,minimum_sale_rate,mrp,gst_percent,warranty_months,description,tags\n" +
      '"Surgical Mask Box","Disposable surgical masks","face mask, 3-ply mask","MSK-001","Consumables","Face Masks","Asep","Pfizer","box","450.00","400.00","499.00","12","24","High-quality surgical masks","surgical,mask,covid"\n' +
      '"Paracetamol 500mg","Paracetamol IP","pcm, acetaminophen","PAR-500","Tablets","Analgesics","Crocin","GSK","pcs","12.50","10.00","15.00","18","36","Pain reliever","tablet,pain,fever"';
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "medica_products_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Compute stats
  const stats = useMemo(() => {
    const total = parsedProducts.length;
    const ready = parsedProducts.filter((p) => p.status === "ready").length;
    const invalid = total - ready;
    return { total, ready, invalid };
  }, [parsedProducts]);

  const handleUpload = useCallback(async () => {
    const validPayload = parsedProducts
      .filter((p) => p.status === "ready")
      .map((p) => ({
        product_name: p.product_name,
        generic_name: p.generic_name || undefined,
        aliases: p.aliases ? p.aliases.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        sku: p.sku || undefined,
        product_group: p.product_group || undefined,
        product_subgroup: p.product_subgroup || undefined,
        brand: p.brand || undefined,
        manufacturer: p.manufacturer || undefined,
        unit: p.unit || undefined,
        base_price: Number(p.base_price),
        minimum_sale_rate: Number(p.minimum_sale_rate),
        mrp: p.mrp ? Number(p.mrp) : undefined,
        gst_percent: Number(p.gst_percent),
        warranty_months: p.warranty_months ? Number(p.warranty_months) : undefined,
        description: p.description || undefined,
        tags: p.tags ? p.tags.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      }));

    if (validPayload.length === 0) {
      toast.error("No valid products to upload.");
      return;
    }

    try {
      await bulkCreateProduct(validPayload).unwrap();
      toast.success(`Successfully imported ${validPayload.length} products!`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  }, [parsedProducts, bulkCreateProduct, onSuccess, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={() => !isLoading && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-upload-title"
        className="flex max-h-[min(90dvh,750px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200/90 px-5 py-4 dark:border-white/10">
          <div>
            <h2
              id="bulk-upload-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              Bulk Upload Products
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Upload catalog data via CSV or JSON file format.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6">
          {/* Top Info & Template Download */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3.5 dark:border-blue-950/40 dark:bg-blue-950/10">
            <div className="text-xs text-blue-800 dark:text-blue-300 max-w-xl space-y-1">
              <span className="font-semibold block">How it works:</span>
              <p>
                First row must contain header columns: <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded dark:bg-blue-950">product_name</code> (required), <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded dark:bg-blue-950">base_price</code> (required), <code className="font-mono bg-blue-100/80 px-1 py-0.5 rounded dark:bg-blue-950">minimum_sale_rate</code> (required), unit, SKU, brand, manufacturer, and other optional product attributes.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="rounded-lg bg-blue-600/90 hover:bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition"
            >
              Download Template CSV
            </button>
          </div>

          {/* File Dropzone */}
          {!file ? (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-12 px-4 transition ${
                dragActive
                  ? "border-blue-500 bg-blue-50/30 dark:border-blue-500/80 dark:bg-blue-950/10"
                  : "border-slate-300 dark:border-white/15 dark:hover:border-slate-700 hover:border-slate-400 cursor-pointer"
              }`}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-400 dark:text-slate-600 mb-4 border border-slate-200/50 dark:border-white/5">
                📄
              </div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Drag & drop files here, or <span className="text-blue-600 dark:text-blue-400 underline">browse</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Supports CSV or JSON (max 5MB)
              </p>
            </div>
          ) : (
            /* Selected File Summary & Preview Grid */
            <div className="space-y-4">
              <div className="flex items-center justify-between border border-slate-200/90 rounded-lg p-3 dark:border-white/10 dark:bg-slate-950/30">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📄</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setParsedProducts([]);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-505 dark:hover:bg-white/5 dark:hover:text-slate-200"
                >
                  Clear File
                </button>
              </div>

              {/* Status summary */}
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="text-slate-600 dark:text-slate-400">
                  Total Parsed: <span className="text-slate-900 dark:text-slate-100 font-bold">{stats.total}</span>
                </span>
                <span className="text-green-600 dark:text-green-400">
                  ● Ready: <span className="font-bold">{stats.ready}</span>
                </span>
                {stats.invalid > 0 && (
                  <span className="text-rose-600 dark:text-rose-400">
                    ● Invalid (skipped): <span className="font-bold">{stats.invalid}</span>
                  </span>
                )}
              </div>

              {/* Preview Table */}
              <div className="overflow-x-auto rounded-lg border border-slate-200/90 dark:border-white/10 max-h-[300px]">
                <table className="w-full text-left text-xs min-w-[1200px]">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-b border-slate-200/90 dark:border-white/10">
                    <tr>
                      <th className="px-3 py-2 font-medium">Product Name</th>
                      <th className="px-3 py-2 font-medium">Generic Name</th>
                      <th className="px-3 py-2 font-medium">SKU</th>
                      <th className="px-3 py-2 font-medium">Unit</th>
                      <th className="px-3 py-2 font-medium">Base Price</th>
                      <th className="px-3 py-2 font-medium">Min Sale Rate</th>
                      <th className="px-3 py-2 font-medium">MRP</th>
                      <th className="px-3 py-2 font-medium">GST %</th>
                      <th className="px-3 py-2 font-medium">Warranty</th>
                      <th className="px-3 py-2 font-medium">Group</th>
                      <th className="px-3 py-2 font-medium">Subgroup</th>
                      <th className="px-3 py-2 font-medium">Brand</th>
                      <th className="px-3 py-2 font-medium">Manufacturer</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                    {parsedProducts.map((p, idx) => (
                      <tr
                        key={idx}
                        className={`bg-white dark:bg-slate-900 ${
                          p.status === "invalid"
                            ? "bg-rose-50/20 dark:bg-rose-950/5"
                            : ""
                        }`}
                      >
                        <td className={`px-3 py-2 font-medium max-w-[180px] truncate ${p.status === "invalid" && !p.product_name ? "text-rose-600 bg-rose-50/30 dark:text-rose-400" : "text-slate-900 dark:text-slate-100"}`}>
                          {p.product_name || "— (Missing)"}
                        </td>
                        <td className="px-3 py-2 max-w-[120px] truncate">
                          {p.generic_name || "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] max-w-[120px] truncate">
                          {p.sku || "—"}
                        </td>
                        <td className="px-3 py-2 capitalize">
                          {p.unit || "—"}
                        </td>
                        <td className={`px-3 py-2 tabular-nums ${p.status === "invalid" && (p.base_price === "" || isNaN(Number(p.base_price)) || Number(p.base_price) < 0) ? "text-rose-600 bg-rose-50/30 dark:text-rose-400" : ""}`}>
                          {p.base_price || "— (Invalid)"}
                        </td>
                        <td className={`px-3 py-2 tabular-nums ${p.status === "invalid" && (p.minimum_sale_rate === "" || isNaN(Number(p.minimum_sale_rate)) || Number(p.minimum_sale_rate) < 0) ? "text-rose-600 bg-rose-50/30 dark:text-rose-400" : ""}`}>
                          {p.minimum_sale_rate || "— (Invalid)"}
                        </td>
                        <td className={`px-3 py-2 tabular-nums ${p.status === "invalid" && p.mrp !== "" && (isNaN(Number(p.mrp)) || Number(p.mrp) < 0) ? "text-rose-600 bg-rose-50/30 dark:text-rose-400" : ""}`}>
                          {p.mrp || "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {p.gst_percent}%
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {p.warranty_months ? `${p.warranty_months}m` : "—"}
                        </td>
                        <td className="px-3 py-2 max-w-[120px] truncate">
                          {p.product_group || "—"}
                        </td>
                        <td className="px-3 py-2 max-w-[120px] truncate">
                          {p.product_subgroup || "—"}
                        </td>
                        <td className="px-3 py-2 max-w-[120px] truncate">
                          {p.brand || "—"}
                        </td>
                        <td className="px-3 py-2 max-w-[120px] truncate">
                          {p.manufacturer || "—"}
                        </td>
                        <td className="px-3 py-2">
                          {p.status === "ready" ? (
                            <span className="inline-flex items-center gap-1 rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-950/30 dark:text-green-400">
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-400" title={p.reason}>
                              Skipped: {p.reason}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200/90 px-5 py-3.5 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className={btnSecondaryClass}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={isLoading || parsedProducts.length === 0 || stats.ready === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            {isLoading ? "Uploading…" : `Upload Products (${stats.ready})`}
          </button>
        </div>
      </div>
    </div>
  );
}
