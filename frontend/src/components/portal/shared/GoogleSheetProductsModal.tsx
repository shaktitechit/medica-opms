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
  Link2,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from "lucide-react";
import {
  useListProductsQuery,
  usePatchProductMutation,
  useCreateProductMutation,
  useDeleteProductMutation,
  useBulkDeleteProductsMutation,
  useGetProductMetaOptionsQuery
} from "@/store/api";
import { toast } from "@/lib/toast";

export type GoogleSheetProductsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

type ProductRef = string | { _id?: string; name?: string } | null | undefined;

type ProductRow = {
  _id: string;
  product_name: string;
  generic_name?: string;
  sku?: string;
  product_group?: ProductRef;
  product_subgroup?: ProductRef;
  brand?: ProductRef;
  manufacturer?: ProductRef;
  unit: "pcs" | "box" | "kg" | "ltr" | "meter" | "set" | "kit" | "bottle";
  base_price: number;
  minimum_sale_rate: number;
  mrp?: number;
  gst_percent?: number;
  warranty_months?: number;
  aliases?: string[] | string;
  tags?: string[] | string;
  description?: string;
  is_active: boolean;
  is_featured: boolean;
};

/** Resolve product ref fields that may be a legacy string or `{ name }` object. */
function refName(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (name != null && name !== "") return String(name);
    return "";
  }
  return "";
}

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
  { key: "product_group", label: "Product Group", headerLetter: "F", type: "text" },
  { key: "product_subgroup", label: "Product Subgroup", headerLetter: "G", type: "text" },
  { key: "base_price", label: "Base Price*", headerLetter: "H", type: "number" },
  { key: "minimum_sale_rate", label: "Min Sale Rate*", headerLetter: "I", type: "number" },
  { key: "mrp", label: "MRP", headerLetter: "J", type: "number" },
  { key: "gst_percent", label: "GST %", headerLetter: "K", type: "number" },
  { key: "unit", label: "Unit", headerLetter: "L", type: "select", options: ["pcs", "box", "kg", "ltr", "meter", "set", "kit", "bottle"] },
  { key: "warranty_months", label: "Warranty Months", headerLetter: "M", type: "number" },
  { key: "aliases", label: "Aliases", headerLetter: "N", type: "text" },
  { key: "tags", label: "Tags", headerLetter: "O", type: "text" },
  { key: "description", label: "Description", headerLetter: "P", type: "text" },
  { key: "is_active", label: "Active", headerLetter: "Q", type: "boolean" },
  { key: "is_featured", label: "Featured", headerLetter: "R", type: "boolean" },
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
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: keyof ProductRow;
    direction: "asc" | "desc";
  } | null>(null);

  // Filter panel toggle & criteria states
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [filterActiveStatus, setFilterActiveStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterFeaturedStatus, setFilterFeaturedStatus] = useState<"all" | "featured" | "not_featured">("all");
  const [filterGstRate, setFilterGstRate] = useState<string>("all");
  const [filterUnit, setFilterUnit] = useState<string>("all");
  const [filterMinPrice, setFilterMinPrice] = useState<string>("");
  const [filterMaxPrice, setFilterMaxPrice] = useState<string>("");
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterManufacturer, setFilterManufacturer] = useState<string>("all");
  const [filterProductGroup, setFilterProductGroup] = useState<string>("all");
  const [filterProductSubgroup, setFilterProductSubgroup] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");

  const uniqueGstRates = useMemo(() => {
    const rates = new Set<number>();
    localRows.forEach(r => {
      if (r.gst_percent !== undefined && r.gst_percent !== null) {
        rates.add(r.gst_percent);
      }
    });
    return Array.from(rates).sort((a, b) => a - b);
  }, [localRows]);

  const uniqueBrands = useMemo(() => {
    const values = new Set<string>();
    localRows.forEach(r => {
      const b = refName(r.brand).trim();
      if (b) values.add(b);
    });
    return Array.from(values).sort();
  }, [localRows]);

  const uniqueManufacturers = useMemo(() => {
    const values = new Set<string>();
    localRows.forEach(r => {
      const m = refName(r.manufacturer).trim();
      if (m) values.add(m);
    });
    return Array.from(values).sort();
  }, [localRows]);

  const uniqueProductGroups = useMemo(() => {
    const values = new Set<string>();
    localRows.forEach(r => {
      const pg = refName(r.product_group).trim();
      if (pg) values.add(pg);
    });
    return Array.from(values).sort();
  }, [localRows]);

  const uniqueProductSubgroups = useMemo(() => {
    const values = new Set<string>();
    localRows.forEach(r => {
      const psg = refName(r.product_subgroup).trim();
      if (psg) values.add(psg);
    });
    return Array.from(values).sort();
  }, [localRows]);

  const uniqueTags = useMemo(() => {
    const values = new Set<string>();
    localRows.forEach(r => {
      if (Array.isArray(r.tags)) {
        r.tags.forEach(t => {
          if (t?.trim()) values.add(t.trim());
        });
      } else if (typeof r.tags === "string") {
        r.tags.split(",").forEach(t => {
          const trimmed = t.trim();
          if (trimmed) values.add(trimmed);
        });
      }
    });
    return Array.from(values).sort();
  }, [localRows]);

  const hasActiveFilters = useMemo(() => {
    return (
      filterActiveStatus !== "all" ||
      filterFeaturedStatus !== "all" ||
      filterGstRate !== "all" ||
      filterUnit !== "all" ||
      filterMinPrice.trim() !== "" ||
      filterMaxPrice.trim() !== "" ||
      filterBrand !== "all" ||
      filterManufacturer !== "all" ||
      filterProductGroup !== "all" ||
      filterProductSubgroup !== "all" ||
      filterTag !== "all"
    );
  }, [
    filterActiveStatus,
    filterFeaturedStatus,
    filterGstRate,
    filterUnit,
    filterMinPrice,
    filterMaxPrice,
    filterBrand,
    filterManufacturer,
    filterProductGroup,
    filterProductSubgroup,
    filterTag
  ]);

  const handleClearFilters = () => {
    setFilterActiveStatus("all");
    setFilterFeaturedStatus("all");
    setFilterGstRate("all");
    setFilterUnit("all");
    setFilterMinPrice("");
    setFilterMaxPrice("");
    setFilterBrand("all");
    setFilterManufacturer("all");
    setFilterProductGroup("all");
    setFilterProductSubgroup("all");
    setFilterTag("all");
  };


  // Resizable columns width state
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    product_name: 180,
    sku: 120,
    generic_name: 150,
    brand: 120,
    manufacturer: 150,
    product_group: 120,
    product_subgroup: 120,
    base_price: 100,
    minimum_sale_rate: 120,
    mrp: 100,
    gst_percent: 80,
    unit: 90,
    warranty_months: 120,
    aliases: 150,
    tags: 150,
    description: 200,
    is_active: 80,
    is_featured: 90,
  });

  const handleResizeStart = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[colKey] || 120;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(60, startWidth + deltaX);
      setColWidths(prev => ({
        ...prev,
        [colKey]: newWidth
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const totalWidth = useMemo(() => {
    const columnsSum = COLUMNS.reduce((sum, col) => sum + (colWidths[col.key] || 120), 0);
    return 48 + 48 + 64 + columnsSum; // 48px row numbers, 48px checkbox, 64px delete column
  }, [colWidths]);

  // RTK Queries & Mutations
  const { data, isLoading, isError, refetch } = useListProductsQuery(
    { paginate: "false" },
    { skip: !isOpen }
  );

  const { data: metaOptions } = useGetProductMetaOptionsQuery(undefined, { skip: !isOpen });
  const [patchProduct] = usePatchProductMutation();
  const [createProduct, { isLoading: isCreating }] = useCreateProductMutation();
  const [deleteProduct, { isLoading: isDeleting }] = useDeleteProductMutation();
  const [bulkDeleteProducts, { isLoading: isBulkDeleting }] = useBulkDeleteProductsMutation();

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
        const key = selectedCell.colKey;
        const valStr =
          key === "brand" ||
          key === "manufacturer" ||
          key === "product_group" ||
          key === "product_subgroup"
            ? refName(val)
            : val !== undefined && val !== null
              ? String(val)
              : "";
        setFormulaValue(valStr);
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
    if (
      colKey === "base_price" ||
      colKey === "mrp" ||
      colKey === "gst_percent" ||
      colKey === "minimum_sale_rate" ||
      colKey === "warranty_months"
    ) {
      parsedVal = val === "" ? undefined : Number(val);
      if (parsedVal !== undefined && isNaN(parsedVal)) {
        toast.error("Invalid number value entered");
        return;
      }
    } else if (colKey === "aliases" || colKey === "tags") {
      if (typeof val === "string") {
        parsedVal = val.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      } else if (Array.isArray(val)) {
        parsedVal = val.map(s => String(s ?? "").trim().toLowerCase()).filter(Boolean);
      } else {
        parsedVal = [];
      }
    }

    // Helper to check equality (handles arrays and primitive values)
    const areEqual = (a: any, b: any) => {
      if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => v === b[i]);
      }
      return a === b;
    };

    // Don't patch if value didn't change
    const orig = originalRow[colKey];
    const origVal =
      colKey === "brand" ||
      colKey === "manufacturer" ||
      colKey === "product_group" ||
      colKey === "product_subgroup"
        ? refName(orig)
        : orig;
    if (areEqual(origVal, parsedVal)) return;

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

  // Filtered rows for virtual sheet search and filter panel criteria
  const filteredRows = useMemo(() => {
    let rows = [...localRows];

    // 1. Text Search Query Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        r =>
          r.product_name?.toLowerCase().includes(query) ||
          r.sku?.toLowerCase().includes(query) ||
          r.generic_name?.toLowerCase().includes(query) ||
          refName(r.brand).toLowerCase().includes(query) ||
          refName(r.manufacturer).toLowerCase().includes(query) ||
          refName(r.product_group).toLowerCase().includes(query) ||
          refName(r.product_subgroup).toLowerCase().includes(query) ||
          r.description?.toLowerCase().includes(query) ||
          (Array.isArray(r.aliases) ? r.aliases.join(", ") : String(r.aliases || "")).toLowerCase().includes(query) ||
          (Array.isArray(r.tags) ? r.tags.join(", ") : String(r.tags || "")).toLowerCase().includes(query)
      );
    }

    // 2. Active Status Filter
    if (filterActiveStatus !== "all") {
      const wantActive = filterActiveStatus === "active";
      rows = rows.filter(r => r.is_active === wantActive);
    }

    // 2b. Featured Status Filter
    if (filterFeaturedStatus !== "all") {
      const wantFeatured = filterFeaturedStatus === "featured";
      rows = rows.filter(r => (r.is_featured === true) === wantFeatured);
    }

    // 3. GST Rate Filter
    if (filterGstRate !== "all") {
      const gstVal = parseFloat(filterGstRate);
      rows = rows.filter(r => r.gst_percent === gstVal);
    }

    // 4. Unit Filter
    if (filterUnit !== "all") {
      rows = rows.filter(r => r.unit === filterUnit);
    }

    // 5. Min Price Filter
    if (filterMinPrice.trim()) {
      const minVal = parseFloat(filterMinPrice);
      if (!isNaN(minVal)) {
        rows = rows.filter(r => (r.base_price ?? 0) >= minVal);
      }
    }

    // 6. Max Price Filter
    if (filterMaxPrice.trim()) {
      const maxVal = parseFloat(filterMaxPrice);
      if (!isNaN(maxVal)) {
        rows = rows.filter(r => (r.base_price ?? 0) <= maxVal);
      }
    }

    // 7. Brand Filter
    if (filterBrand !== "all") {
      rows = rows.filter(r => refName(r.brand).trim() === filterBrand);
    }

    // 8. Manufacturer Filter
    if (filterManufacturer !== "all") {
      rows = rows.filter(r => refName(r.manufacturer).trim() === filterManufacturer);
    }

    // 9. Product Group Filter
    if (filterProductGroup !== "all") {
      rows = rows.filter(r => refName(r.product_group).trim() === filterProductGroup);
    }

    // 10. Product Subgroup Filter
    if (filterProductSubgroup !== "all") {
      rows = rows.filter(r => refName(r.product_subgroup).trim() === filterProductSubgroup);
    }

    // 11. Tag Filter
    if (filterTag !== "all") {
      rows = rows.filter(r => {
        if (Array.isArray(r.tags)) {
          return r.tags.includes(filterTag);
        } else if (typeof r.tags === "string") {
          return r.tags.split(",").map(t => t.trim()).includes(filterTag);
        }
        return false;
      });
    }

    // Apply sorting
    if (sortConfig) {
      const refKeys = new Set(["brand", "manufacturer", "product_group", "product_subgroup"]);
      rows.sort((a, b) => {
        const rawA = a[sortConfig.key];
        const rawB = b[sortConfig.key];
        const valA = refKeys.has(sortConfig.key) ? refName(rawA) : rawA;
        const valB = refKeys.has(sortConfig.key) ? refName(rawB) : rawB;

        if (valA == null || valA === "") return sortConfig.direction === "asc" ? 1 : -1;
        if (valB == null || valB === "") return sortConfig.direction === "asc" ? -1 : 1;

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();

        if (strA < strB) return sortConfig.direction === "asc" ? -1 : 1;
        if (strA > strB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return rows;
  }, [
    localRows,
    searchQuery,
    filterActiveStatus,
    filterFeaturedStatus,
    filterGstRate,
    filterUnit,
    filterMinPrice,
    filterMaxPrice,
    filterBrand,
    filterManufacturer,
    filterProductGroup,
    filterProductSubgroup,
    filterTag,
    sortConfig
  ]);

  const selectedCount = useMemo(() => {
    return Object.keys(selectedIds).filter(id => selectedIds[id] && localRows.some(r => r._id === id)).length;
  }, [selectedIds, localRows]);

  const isAllSelected = useMemo(() => {
    if (filteredRows.length === 0) return false;
    return filteredRows.every(r => selectedIds[r._id]);
  }, [filteredRows, selectedIds]);

  const handleToggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = { ...prev };
      if (isAllSelected) {
        filteredRows.forEach(r => {
          delete next[r._id];
        });
      } else {
        filteredRows.forEach(r => {
          next[r._id] = true;
        });
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Object.keys(selectedIds).filter(id => selectedIds[id] && localRows.some(r => r._id === id));
    if (idsToDelete.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${idsToDelete.length} selected products?`)) return;

    try {
      await bulkDeleteProducts(idsToDelete).unwrap();
      toast.success(`Successfully deleted ${idsToDelete.length} products`);
      setSelectedIds({});
      refetch();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to delete selected products");
    }
  };

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
    if (key === "featured") key = "is_featured";
    if (key === "minimum_sale_rate" || key === "min_sale_rate" || key === "min_rate") key = "minimum_sale_rate";
    if (key === "warranty_months" || key === "warranty") key = "warranty_months";
    
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
        const stringified =
          col.key === "brand" ||
          col.key === "manufacturer" ||
          col.key === "product_group" ||
          col.key === "product_subgroup"
            ? refName(val)
            : val !== undefined && val !== null
              ? String(val)
              : "";
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
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans" role="dialog" aria-modal="true">
      {/* Top Main Google Sheets-Style Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-900 px-4 py-2.5 shrink-0 select-none">
        <div className="flex items-center gap-3">
          {/* Sheets Premium Logo */}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-semibold text-lg shadow shadow-emerald-500/20">
            📊
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wide text-slate-900 dark:text-slate-100">
                Product Inventory Spreadsheet
              </span>
              {/* Sync Status Badge */}
              <div className="flex items-center gap-1 text-[11px] rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 border border-slate-200 dark:border-slate-700 text-slate-550 dark:text-slate-400">
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
            <div className="mt-1 flex items-center gap-3.5 text-xs text-slate-500 dark:text-slate-400">
              <button onClick={exportToCSV} className="hover:text-slate-900 dark:hover:text-slate-100 transition">File (Export CSV)</button>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <button onClick={() => void refetch()} className="hover:text-slate-900 dark:hover:text-slate-100 transition flex items-center gap-1">
                🔄 Reload
              </button>
            </div>
          </div>
        </div>

        {/* Tabs Control & Close */}
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab("virtual")}
              className={`rounded-md px-3.5 py-1 text-xs font-semibold transition ${activeTab === "virtual"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
            >
              Virtual Sheet (Instant)
            </button>
            <button
              onClick={() => setActiveTab("real")}
              className={`rounded-md px-3.5 py-1 text-xs font-semibold transition ${activeTab === "real"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
            >
              Real Google Sheet Connection
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition"
            title="Exit full screen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Grid View */}
      {activeTab === "virtual" ? (
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-950">
          {/* Sheets Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-2 shrink-0">
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
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
              {selectedCount > 0 && (
                <button
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-750 active:scale-[0.98] px-3.5 py-1.5 text-xs font-bold text-white shadow shadow-rose-500/10 transition disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Selected ({selectedCount})</span>
                </button>
              )}
            </div>

            {/* Filter Search & Dropdown Controls */}
            <div className="flex items-center gap-2 relative">
              {/* Search input */}
              <div className="relative w-60">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400 dark:text-slate-555 pointer-events-none">
                  <Search className="h-3.5 w-3.5" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search cell values in spreadsheet..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              {/* Filters Toggle Button */}
              <button
                onClick={() => setIsFilterPanelOpen(prev => !prev)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition relative ${
                  isFilterPanelOpen || hasActiveFilters
                    ? "border-emerald-500 bg-emerald-50/10 text-emerald-600 dark:text-emerald-400"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Filters</span>
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                )}
              </button>

              {/* Clear Filters helper */}
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-600 px-1 py-1.5 transition"
                  title="Clear all active filters"
                >
                  Clear
                </button>
              )}

              {/* Filter Panel Dropdown Popover */}
              {isFilterPanelOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsFilterPanelOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-4 z-50 space-y-4 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">Sheet Filters</span>
                      <button
                        onClick={handleClearFilters}
                        disabled={!hasActiveFilters}
                        className="text-[10px] text-slate-400 hover:text-emerald-500 disabled:opacity-50 transition"
                      >
                        Reset All
                      </button>
                    </div>
                    {/* Filter fields list */}
                    <div className="space-y-3 select-none max-h-[380px] overflow-y-auto pr-1">
                      {/* Status select */}
                      <div>
                        <label className="block font-medium text-slate-500 dark:text-slate-400 mb-1">Product Status</label>
                        <select
                          value={filterActiveStatus}
                          onChange={e => setFilterActiveStatus(e.target.value as any)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All statuses</option>
                          <option value="active">Active Only</option>
                          <option value="inactive">Inactive Only</option>
                        </select>
                      </div>

                      {/* Featured select */}
                      <div>
                        <label className="block font-medium text-slate-500 dark:text-slate-400 mb-1">Featured</label>
                        <select
                          value={filterFeaturedStatus}
                          onChange={e => setFilterFeaturedStatus(e.target.value as any)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All products</option>
                          <option value="featured">Featured Only</option>
                          <option value="not_featured">Not Featured</option>
                        </select>
                      </div>

                      {/* GST select */}
                      <div>
                        <label className="block font-medium text-slate-550 dark:text-slate-400 mb-1">GST Rate</label>
                        <select
                          value={filterGstRate}
                          onChange={e => setFilterGstRate(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All rates</option>
                          {uniqueGstRates.map(rate => (
                            <option key={rate} value={String(rate)}>{rate}%</option>
                          ))}
                        </select>
                      </div>

                      {/* Unit select */}
                      <div>
                        <label className="block font-medium text-slate-550 dark:text-slate-400 mb-1">Unit of Measure</label>
                        <select
                          value={filterUnit}
                          onChange={e => setFilterUnit(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All units</option>
                          {COLUMNS.find(c => c.key === "unit")?.options?.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>

                      {/* Brand select */}
                      <div>
                        <label className="block font-medium text-slate-550 dark:text-slate-400 mb-1">Brand</label>
                        <select
                          value={filterBrand}
                          onChange={e => setFilterBrand(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All brands</option>
                          {uniqueBrands.map(b => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>

                      {/* Manufacturer select */}
                      <div>
                        <label className="block font-medium text-slate-550 dark:text-slate-400 mb-1">Manufacturer</label>
                        <select
                          value={filterManufacturer}
                          onChange={e => setFilterManufacturer(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All manufacturers</option>
                          {uniqueManufacturers.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>

                      {/* Product Group select */}
                      <div>
                        <label className="block font-medium text-slate-550 dark:text-slate-400 mb-1">Product Group</label>
                        <select
                          value={filterProductGroup}
                          onChange={e => setFilterProductGroup(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All groups</option>
                          {uniqueProductGroups.map(pg => (
                            <option key={pg} value={pg}>{pg}</option>
                          ))}
                        </select>
                      </div>

                      {/* Product Subgroup select */}
                      <div>
                        <label className="block font-medium text-slate-550 dark:text-slate-400 mb-1">Product Subgroup</label>
                        <select
                          value={filterProductSubgroup}
                          onChange={e => setFilterProductSubgroup(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        >
                          <option value="all">All subgroups</option>
                          {uniqueProductSubgroups.map(psg => (
                            <option key={psg} value={psg}>{psg}</option>
                          ))}
                        </select>
                      </div>

                      {/* Tag select */}
                      <div>
                        <label className="block font-medium text-slate-550 dark:text-slate-400 mb-1">Tag</label>
                        <select
                          value={filterTag}
                          onChange={e => setFilterTag(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 font-mono text-[11px]"
                        >
                          <option value="all">All tags</option>
                          {uniqueTags.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      {/* Base Price range inputs */}
                      <div>
                        <label className="block font-medium text-slate-550 dark:text-slate-400 mb-1">Base Price Range</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={filterMinPrice}
                            onChange={e => setFilterMinPrice(e.target.value)}
                            placeholder="Min"
                            className="w-1/2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-center"
                          />
                          <span className="text-slate-400">—</span>
                          <input
                            type="number"
                            value={filterMaxPrice}
                            onChange={e => setFilterMaxPrice(e.target.value)}
                            placeholder="Max"
                            className="w-1/2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 text-center"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          {/* Formula Bar */}
          <div className="flex items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-1.5 text-xs select-none shrink-0 font-mono">
            <span className="text-slate-450 dark:text-slate-550 font-semibold select-none pr-3 select-none">fx</span>
            <span className="text-slate-300 dark:text-slate-700 px-1 border-r border-slate-200 dark:border-slate-700 mr-3">|</span>
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
              className="flex-1 bg-transparent text-slate-800 dark:text-slate-200 outline-none placeholder-slate-400 dark:placeholder-slate-650"
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

            <table className="text-left text-xs border-collapse table-fixed" style={{ width: totalWidth }}>
              {/* Header row: Column Letters */}
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 z-20 text-slate-550 dark:text-slate-400 font-semibold font-mono">
                <tr>
                  <th className="w-12 px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 text-center select-none bg-slate-150 dark:bg-slate-850" style={{ width: 48, minWidth: 48, maxWidth: 48 }}></th>
                  <th className="w-12 px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 text-center select-none bg-slate-150 dark:bg-slate-850" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      className="h-4 w-4 rounded border-slate-350 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                    />
                  </th>
                  <th className="w-16 px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 text-center select-none bg-slate-150 dark:bg-slate-850" style={{ width: 64, minWidth: 64, maxWidth: 64 }}>Del</th>
                  {COLUMNS.map(col => {
                    const isSortable = col.key === "product_name";
                    const isSorted = sortConfig?.key === col.key;
                    const isAsc = sortConfig?.direction === "asc";

                    return (
                      <th
                        key={col.key}
                        style={{ width: colWidths[col.key] || 120, minWidth: colWidths[col.key] || 120, maxWidth: colWidths[col.key] || 120 }}
                        className={`px-3 py-1.5 border-r border-slate-200 dark:border-slate-700 text-center select-none bg-slate-150 dark:bg-slate-850 relative group/header ${
                          isSortable ? "cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800" : ""
                        }`}
                        onClick={() => {
                          if (isSortable) {
                            setSortConfig(prev => {
                              if (!prev || prev.key !== col.key) {
                                return { key: col.key, direction: "asc" };
                              }
                              if (prev.direction === "asc") {
                                return { key: col.key, direction: "desc" };
                              }
                              return null; // unsorted
                            });
                          }
                        }}
                      >
                        <div className="flex items-center justify-center gap-1.5 w-full">
                          <div className="flex-1 min-w-0">
                            {col.headerLetter}
                            <span className="block text-[10px] uppercase font-sans text-slate-400 dark:text-slate-500 font-bold tracking-wider mt-0.5 truncate">
                              {col.label}
                            </span>
                          </div>
                          {isSortable && (
                            <span className="shrink-0 text-slate-400 dark:text-slate-555">
                              {isSorted ? (
                                isAsc ? <ArrowUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <ArrowDown className="h-3.5 w-3.5 text-emerald-650 dark:text-emerald-400" />
                              ) : (
                                <ArrowUpDown className="h-3.5 w-3.5 opacity-0 group-hover/header:opacity-100 transition duration-150" />
                              )}
                            </span>
                          )}
                        </div>
                        {/* Resize Handle */}
                        <div
                          onMouseDown={e => {
                            e.stopPropagation(); // Prevent trigger sort on resize
                            handleResizeStart(col.key, e);
                          }}
                          className="absolute top-0 right-0 bottom-0 w-1 hover:w-1.5 hover:bg-emerald-500 dark:hover:bg-emerald-400 cursor-col-resize active:bg-emerald-600 z-30 transition-all select-none"
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredRows.map((row, rowIdx) => {
                  const isSavingRow = !!savingRows[row._id];
                  return (
                    <tr
                      key={row._id}
                      className={`bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition group ${
                        isSavingRow ? "bg-emerald-500/5 dark:bg-emerald-950/10" : ""
                      }`}
                    >
                      {/* Left Header Row Number */}
                      <td className="w-12 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 font-mono text-center text-slate-450 dark:text-slate-500 select-none font-bold py-1.5 sticky left-0 z-10" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>
                        {rowIdx + 1}
                      </td>

                      {/* Selection Checkbox */}
                      <td className="w-12 border-r border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/40 text-center py-1" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>
                        <input
                          type="checkbox"
                          checked={!!selectedIds[row._id]}
                          onChange={e => {
                            setSelectedIds(prev => ({
                              ...prev,
                              [row._id]: e.target.checked
                            }));
                          }}
                          className="h-4 w-4 rounded border-slate-350 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                        />
                      </td>

                      {/* Row Delete Button */}
                      <td className="w-16 border-r border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/40 text-center py-1" style={{ width: 64, minWidth: 64, maxWidth: 64 }}>
                        <button
                          onClick={() => handleDeleteRow(row._id)}
                          disabled={isDeleting}
                          className="p-1 rounded hover:bg-rose-500/20 text-rose-600 hover:text-rose-400 transition"
                          title="Delete row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>

                      {/* Spreadsheet Columns */}
                      {COLUMNS.map(col => {
                        const rawCellVal = row[col.key];
                        const cellVal =
                          col.key === "brand" ||
                          col.key === "manufacturer" ||
                          col.key === "product_group" ||
                          col.key === "product_subgroup"
                            ? refName(rawCellVal)
                            : rawCellVal;
                        const isSelected = selectedCell?.productId === row._id && selectedCell?.colKey === col.key;
                        const isReadonly = col.readonly;

                        return (
                          <td
                            key={col.key}
                            onClick={() => setSelectedCell({ productId: row._id, colKey: col.key })}
                            style={{ width: colWidths[col.key] || 120, minWidth: colWidths[col.key] || 120, maxWidth: colWidths[col.key] || 120 }}
                            className={`border-r border-slate-200 dark:border-slate-800 p-0 text-slate-800 dark:text-slate-200 transition duration-75 relative ${
                              isReadonly ? "bg-slate-50/50 dark:bg-slate-900/30 text-slate-400 dark:text-slate-500 font-mono text-[10px]" : "cursor-cell hover:bg-slate-100/50 dark:hover:bg-slate-850/50"
                            } ${
                              isSelected ? "ring-2 ring-emerald-500 ring-inset bg-emerald-50/5 dark:bg-slate-850/90 z-10" : ""
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
                                        const key = col.key;
                                        setLocalRows(prev =>
                                          prev.map(r => r._id === row._id ? { ...r, [key]: e.target.checked } : r)
                                        );
                                        saveCell(row._id, key, e.target.checked);
                                      }}
                                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-offset-transparent cursor-pointer"
                                    />
                                  </div>
                                ) : ["product_group", "product_subgroup", "brand", "manufacturer"].includes(col.key) ? (
                                  <select
                                    value={String(cellVal || "")}
                                    onChange={e => {
                                      const newVal = e.target.value;
                                      setLocalRows(prev =>
                                        prev.map(r => r._id === row._id ? { ...r, [col.key]: newVal } : r)
                                      );
                                      saveCell(row._id, col.key, newVal);
                                    }}
                                    className="w-full bg-transparent border-none outline-none focus:ring-0 text-xs px-3 py-2 text-slate-800 dark:text-slate-100 cursor-pointer"
                                  >
                                    <option value="" className="bg-white dark:bg-slate-900 text-slate-400">-- None --</option>
                                    {col.key === "product_group" && metaOptions?.groups?.map(g => (
                                      <option key={g._id} value={g.name} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                                        {g.name}
                                      </option>
                                    ))}
                                    {col.key === "product_subgroup" && metaOptions?.subgroups?.map(sg => (
                                      <option key={sg._id} value={sg.name} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                                        {sg.name}
                                      </option>
                                    ))}
                                    {col.key === "brand" && metaOptions?.brands?.map(b => (
                                      <option key={b._id} value={b.name} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                                        {b.name}
                                      </option>
                                    ))}
                                    {col.key === "manufacturer" && metaOptions?.manufacturers?.map(m => (
                                      <option key={m._id} value={m.name} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                                        {m.name}
                                      </option>
                                    ))}
                                  </select>
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
                                    className="w-full bg-transparent border-none outline-none focus:ring-0 text-xs px-3 py-2 text-slate-800 dark:text-slate-100 cursor-pointer capitalize"
                                  >
                                    {col.options?.map(opt => (
                                      <option key={opt} value={opt} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type={col.type === "number" ? "number" : "text"}
                                    list={
                                      col.key === "product_group" ? "grid-group-options" :
                                      col.key === "product_subgroup" ? "grid-subgroup-options" :
                                      col.key === "brand" ? "grid-brand-options" :
                                      col.key === "manufacturer" ? "grid-manufacturer-options" : undefined
                                    }
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
                                    className="w-full h-full bg-transparent border-none outline-none focus:ring-0 text-xs px-3 py-2 text-slate-800 dark:text-slate-200"
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
          <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-2 shrink-0 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 select-none">
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
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 space-y-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Link2 className="h-5 w-5 text-emerald-500" />
                <span>Link a Real Google Sheet URL</span>
              </h3>
              <p className="text-xs text-slate-650 dark:text-slate-400 max-w-2xl leading-relaxed">
                Paste your Google Sheet link here. We will parse it and embed it so you can edit it directly from this popup modal. Updates from the sheet will be synced back to the backend in real-time.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={realSheetUrl}
                  onChange={e => handleSaveRealSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/30"
                />
                {realSheetUrl && (
                  <a
                    href={realSheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition"
                  >
                    <span>Open Sheet</span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            {/* Embedded Iframe */}
            {googleSheetEmbedUrl ? (
              <div className="border border-slate-200 dark:border-slate-850 rounded-xl overflow-hidden shadow-xl bg-white dark:bg-slate-900">
                <div className="bg-slate-100 dark:bg-slate-850 px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Google Sheet Embedded View</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Iframe loading via Google Docs URL</span>
                </div>
                <iframe
                  src={googleSheetEmbedUrl}
                  className="w-full h-[450px] border-none bg-white"
                  title="Google Sheet Embedded View"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl py-12 px-4 text-center bg-white dark:bg-slate-900/30">
                <div className="text-slate-400 dark:text-slate-650 mb-3 text-3xl">📁</div>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Google Sheet URL connected</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                  Paste your spreadsheet link above to enable the embedded preview panel in this tab.
                </p>
              </div>
            )}

            {/* Setup Instructions */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-lg space-y-5">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <Info className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                <span>Webhooks Setup Guide (How to Sync Google Sheet {"->"} Backend)</span>
              </h3>

              <div className="space-y-4 text-xs leading-relaxed text-slate-600 dark:text-slate-350">
                <div className="space-y-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">1. Sheet Columns Setup</span>
                  <p>
                    Set the headers in Row 1 of your spreadsheet exactly as follows (column order doesn't matter, but names must match):
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1.5 font-mono text-[10px]">
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Product ID</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Product Name*</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">SKU</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Generic Name</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Brand</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Manufacturer</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Product Group</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Product Subgroup</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Base Price*</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Min Sale Rate*</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">MRP</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">GST %</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Unit</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Warranty Months</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Aliases</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Tags</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Description</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Active</div>
                    <div className="bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-850 p-1.5 rounded text-center text-slate-700 dark:text-slate-300">Featured</div>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-1">
                    * Asterisks denote fields required by the database engine.
                  </span>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">2. Google Apps Script Configuration</span>
                  <p>
                    Open your sheet, select <strong className="text-slate-800 dark:text-slate-200">Extensions &gt; Apps Script</strong>, clear the editor, and copy-paste the code snippet below:
                  </p>

                  {/* Copy Script Container */}
                  <div className="relative border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-950 font-mono text-[11px] leading-normal text-slate-700 dark:text-slate-300">
                    <div className="bg-slate-100 dark:bg-slate-850 px-4 py-2 flex justify-between items-center text-xs select-none">
                      <span className="font-semibold text-slate-500 dark:text-slate-450">GoogleAppsScriptCode.js</span>
                      <button
                        onClick={copyScriptCode}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-250 border border-slate-200 dark:border-slate-700 transition active:scale-95"
                      >
                        {copiedScript ? <Check className="h-3.5 w-3.5 text-emerald-505" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedScript ? "Copied!" : "Copy Code"}</span>
                      </button>
                    </div>
                    <pre className="p-4 overflow-x-auto max-h-60 select-all border-t border-slate-200 dark:border-slate-800">
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
    if (key === "featured") key = "is_featured";
    if (key === "minimum_sale_rate" || key === "min_sale_rate" || key === "min_rate") key = "minimum_sale_rate";
    if (key === "warranty_months" || key === "warranty") key = "warranty_months";
    
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
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">3. Setup onEdit Trigger</span>
                  <p>
                    Inside the Google Apps Script panel, click on the Clock icon (<strong className="text-slate-800 dark:text-slate-200">Triggers</strong>) in the left sidebar. Add a trigger:
                  </p>
                  <ul className="list-disc list-inside pl-2 space-y-1 text-slate-500 dark:text-slate-400">
                    <li>Choose function: <code className="font-mono text-emerald-600 dark:text-emerald-400">onEdit</code></li>
                    <li>Choose deployment: <code className="font-mono">Head</code></li>
                    <li>Event source: <code className="font-mono text-emerald-600 dark:text-emerald-400">From spreadsheet</code></li>
                    <li>Event type: <code className="font-mono text-emerald-600 dark:text-emerald-400">On edit</code></li>
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
