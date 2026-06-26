"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package,
  Layers,
  Building,
  Coins,
  ExternalLink,
  Trash2,
  Search,
  X,
  RefreshCw,
  LayoutDashboard,
  Plus,
  Upload,
  TableProperties,
} from "lucide-react";

import { ConfirmDeleteProductModal } from "@/components/portal/shared/ConfirmDeleteProductModal";
import { ConfirmBulkDeleteProductsModal } from "@/components/portal/shared/ConfirmBulkDeleteProductsModal";
import { ProductDetailModal } from "@/components/portal/shared/ProductDetailModal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { BulkUploadProductsModal } from "@/components/portal/shared/BulkUploadProductsModal";
import { GoogleSheetProductsModal } from "@/components/portal/shared/GoogleSheetProductsModal";
import {  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeleteProductMutation,
  useListProductsQuery,
  useBulkDeleteProductsMutation,
} from "@/store/api";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { dateFilterSelectClass } from "@/components/portal/shared/orderList/orderListDateFilter";

const btnCompactClass =
  "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer";

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

type ProductRow = {
  _id?: string;
  id?: string;
  product_name?: string;
  generic_name?: string;
  aliases?: string[];
  sku?: string;
  product_group?: string;
  product_subgroup?: string;
  brand?: string;
  manufacturer?: string;
  unit?: string;
  base_price?: number;
  minimum_sale_rate?: number;
  mrp?: number;
  gst_percent?: number;
  warranty_months?: number;
  description?: string;
  tags?: string[];
  is_active?: boolean;
};

function rowKey(row: unknown): string {
  if (row && typeof row === "object") {
    const o = row as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return "";
}

function rowLabel(row: ProductRow, fallbackId: string): string {
  if (typeof row.product_name === "string" && row.product_name.trim())
    return row.product_name.trim();
  if (typeof row.sku === "string" && row.sku.trim()) return row.sku.trim();
  return fallbackId || "Product";
}

function formatMoney(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

export type ListProductsPageProps = {
  /** Portal home path e.g. `/sales` */
  portalHome: string;
};

export default function ListProductsPage({
  portalHome,
}: ListProductsPageProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 350);

    return () => clearTimeout(handler);
  }, [search]);

  const { data, isLoading, isFetching, isError, refetch } = useListProductsQuery({
    paginate: "true",
    page: currentPage.toString(),
    limit: itemsPerPage.toString(),
    search: debouncedSearch,
    group: groupFilter,
    status: statusFilter,
  });

  const products = useMemo(() => pickList(data) as ProductRow[], [data]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [googleSheetOpen, setGoogleSheetOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const [deleteProduct, { isLoading: isDeletingProduct }] =
    useDeleteProductMutation();

  const closeProductModal = useCallback(() => {
    setDetailId(null);
    setCreateOpen(false);
  }, []);

  const openCreate = useCallback(() => {
    setDetailId(null);
    setCreateOpen(true);
  }, []);

  const openView = useCallback((id: string) => {
    setCreateOpen(false);
    setDetailId(id);
  }, []);

  const closeDeleteModal = useCallback(() => setDeleteTarget(null), []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    try {
      await deleteProduct(id).unwrap();
      toast.success(mutationSuccessCopy("deleteProduct"));
      if (detailId === id) closeProductModal();
      setSelectedIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [closeProductModal, deleteProduct, deleteTarget, detailId]);

  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<string[] | null>(null);

  const [bulkDeleteProducts, { isLoading: isBulkDeleting }] = useBulkDeleteProductsMutation();

  const selectedCount = useMemo(() => {
    return Object.keys(selectedIds).filter((id) => selectedIds[id]).length;
  }, [selectedIds]);

  const isAllOnPageSelected = useMemo(() => {
    if (products.length === 0) return false;
    return products.every((p) => {
      const id = rowKey(p);
      return id && !!selectedIds[id];
    });
  }, [products, selectedIds]);

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (isAllOnPageSelected) {
        products.forEach((p) => {
          const id = rowKey(p);
          if (id) {
            delete next[id];
          }
        });
      } else {
        products.forEach((p) => {
          const id = rowKey(p);
          if (id) {
            next[id] = true;
          }
        });
      }
      return next;
    });
  }, [isAllOnPageSelected, products]);

  const closeBulkDeleteModal = useCallback(() => setBulkDeleteTarget(null), []);

  const confirmBulkDelete = useCallback(async () => {
    if (!bulkDeleteTarget || bulkDeleteTarget.length === 0) return;
    try {
      await bulkDeleteProducts(bulkDeleteTarget).unwrap();
      toast.success(`Successfully deleted ${bulkDeleteTarget.length} products`);
      setSelectedIds((prev) => {
        const next = { ...prev };
        bulkDeleteTarget.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      setBulkDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [bulkDeleteProducts, bulkDeleteTarget]);

  // Extract unique groups dynamically from backend paginated response metadata
  const uniqueGroups = useMemo(() => {
    if (data && typeof data === "object" && "groups" in data && Array.isArray((data as any).groups)) {
      return (data as any).groups as string[];
    }
    return [];
  }, [data]);

  // Total matched records from backend pagination
  const totalMatching = useMemo(() => {
    if (data && typeof data === "object" && "total" in data) {
      return Number((data as any).total) || 0;
    }
    return products.length;
  }, [data, products]);

  const totalPages = useMemo(() => {
    if (data && typeof data === "object" && "pages" in data) {
      return Number((data as any).pages) || 1;
    }
    return 1;
  }, [data]);

  const startEntry = totalMatching > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, totalMatching);

  const handleResetFilters = useCallback(() => {
    setSearch("");
    setGroupFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
  }, []);

  const filtersActive =
    search.trim() !== "" || groupFilter !== "all" || statusFilter !== "all";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <PortalBusyOverlay active={isLoading} message="Loading products…" />
      <ConfirmDeleteProductModal
        productId={deleteTarget?.id ?? null}
        productLabel={deleteTarget?.label ?? ""}
        isDeleting={isDeletingProduct}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
      />
      <ConfirmBulkDeleteProductsModal
        isOpen={bulkDeleteTarget !== null}
        selectedCount={bulkDeleteTarget?.length ?? 0}
        isDeleting={isBulkDeleting}
        onClose={closeBulkDeleteModal}
        onConfirm={confirmBulkDelete}
      />
      <ProductDetailModal
        productId={createOpen ? null : detailId}
        create={createOpen}
        onClose={closeProductModal}
      />
      <BulkUploadProductsModal
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => refetch()}
      />
      <GoogleSheetProductsModal
        isOpen={googleSheetOpen}
        onClose={() => setGoogleSheetOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Compact Control Strip */}
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Product Inventory
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className={btnCompactClass}
              title="Reload catalog table"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link href={portalHome} className={btnCompactClass}>
              <LayoutDashboard className="h-3 w-3" />
              Dashboard
            </Link>
            <button type="button" onClick={() => setBulkUploadOpen(true)} className={btnCompactClass}>
              <Upload className="h-3 w-3" />
              Bulk Upload
            </button>
            <button
              type="button"
              onClick={() => setGoogleSheetOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
              <TableProperties className="h-3 w-3" />
              Sheet
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              <Plus className="h-3 w-3" />
              Add Product
            </button>
          </div>
        </div>
      </div>

      {/* Search + filters inline */}
      <div className="relative shrink-0 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-2 md:hidden">
          <div className="relative min-w-0">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
              <Search className="h-3.5 w-3.5" />
            </span>
            <input
              type="text"
              placeholder="Search products…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              className={`${dateFilterSelectClass} min-w-0 flex-1`}
              value={groupFilter}
              onChange={(e) => {
                setGroupFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Product group"
            >
              <option value="all">All Groups</option>
              {uniqueGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              className={`${dateFilterSelectClass} min-w-0 flex-1`}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Product status"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Search by name, generic name, SKU, brand, manufacturer..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            className={`${dateFilterSelectClass} min-w-[9rem] py-2 text-sm`}
            value={groupFilter}
            onChange={(e) => {
              setGroupFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Product group"
          >
            <option value="all">All Groups</option>
            {uniqueGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            className={`${dateFilterSelectClass} min-w-[8.5rem] py-2 text-sm`}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Product status"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          {filtersActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main table card */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {isError && (
          <div className="text-center py-16 px-4">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load catalog
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Please check your database connection and try again.
            </p>
          </div>
        )}

        {!isLoading && !isError && totalMatching === 0 && (
          <div className="text-center py-16 px-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-950 text-xl text-slate-400">
              📦
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-950 dark:text-slate-100">
              No products found
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 max-w-xs mx-auto">
              {products.length === 0
                ? "Get started by adding your first product profile or uploading batch data."
                : "No products match your active filters. Try adjusting your query parameters."}
            </p>
            {products.length === 0 && (
              <button
                type="button"
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 transition"
              >
                ＋ Add Product
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && totalMatching > 0 && (
          <>
          {selectedCount > 0 && (
            <div className="flex items-center justify-between px-5 py-3.5 bg-blue-500/5 dark:bg-blue-500/10 border-b border-blue-100 dark:border-blue-500/20 text-sm">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <span className="font-semibold">{selectedCount}</span>
                <span>products selected</span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedIds({})}
                  className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline font-medium"
                >
                  Clear selection
                </button>
              </div>
              <button
                type="button"
                onClick={() => setBulkDeleteTarget(Object.keys(selectedIds).filter((id) => selectedIds[id]))}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-50 dark:hover:bg-rose-600 text-xs font-semibold shadow-sm transition active:scale-[0.98]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Selected ({selectedCount})</span>
              </button>
            </div>
          )}

          <OrderListPaginationBar
            startEntry={startEntry}
            endEntry={endEntry}
            totalEntries={totalMatching}
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={(value) => {
              setItemsPerPage(value);
              setCurrentPage(1);
            }}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />

          <div className="flex shrink-0 items-center gap-4 border-b border-slate-100 bg-slate-50/50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-white/5 dark:bg-slate-950/20 dark:text-slate-400">
            <div className="flex items-center gap-3 shrink-0">
              <input
                type="checkbox"
                checked={isAllOnPageSelected}
                onChange={toggleSelectAllOnPage}
                className="h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 cursor-pointer"
              />
            </div>
            <div className="flex-1">Product Details</div>
            <div className="hidden lg:block lg:flex-[2.5] max-w-3xl">Attributes & Pricing</div>
            <div className="w-24 text-right">Actions</div>
          </div>

          <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-white/5">
            {products.map((p) => {
              const id = rowKey(p);
              const label = rowLabel(p, id);
              const name = p.product_name || "—";
              const generic = p.generic_name?.trim() || "—";
              const sku = p.sku?.trim() || "—";
              
              const groupPart = p.product_group?.trim() || "";
              const subgroupPart = p.product_subgroup?.trim() || "";
              const groupText = [groupPart, subgroupPart].filter(Boolean).join(" / ") || "—";

              const brandPart = p.brand?.trim() || "";
              const mfrPart = p.manufacturer?.trim() || "";
              const brandText = [brandPart, mfrPart].filter(Boolean).join(" / ") || "—";

              const unit = p.unit || "pcs";
              const basePrice = formatMoney(p.base_price);
              const mrpPrice = formatMoney(p.mrp);
              const gst = Number(p.gst_percent ?? 18);
              const gstStr = Number.isFinite(gst) ? `${gst}%` : "—";
              const active = p.is_active !== false;

              return (
                <div
                  key={id || label}
                  className="flex flex-col justify-between gap-4 p-4 transition duration-150 hover:bg-slate-50/50 dark:hover:bg-white/5 lg:flex-row lg:items-center"
                >
                  <div className="flex items-center gap-3 shrink-0 self-start lg:self-center">
                    <input
                      type="checkbox"
                      checked={!!(id && selectedIds[id])}
                      onChange={(e) => {
                        if (id) {
                          setSelectedIds((prev) => ({
                            ...prev,
                            [id]: e.target.checked,
                          }));
                        }
                      }}
                      className="h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 cursor-pointer"
                    />
                  </div>
                  {/* Left Column: Icon, Product Name, Generic Name, SKU */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/5 dark:text-blue-400 shrink-0">
                      <Package className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate max-w-[280px]">
                          {name}
                        </h3>
                        {/* Unit Badge */}
                        <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-650 ring-1 ring-inset ring-slate-500/10 dark:bg-white/5 dark:text-slate-350 dark:ring-white/10 capitalize">
                          {unit}
                        </span>
                        {/* Status Badge */}
                        {active ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-green-700 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-green-600/10 dark:ring-green-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-slate-500/10 dark:ring-slate-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Inactive
                          </span>
                        )}
                      </div>
                      {/* Generic Name & SKU */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 dark:text-slate-400 text-[11px]">
                        {sku && sku !== "—" && (
                          <span className="font-mono uppercase tracking-wider bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            SKU: {sku}
                          </span>
                        )}
                        {generic && generic !== "—" && (
                          <span className="truncate max-w-[200px]" title={generic}>
                            Generic: {generic}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle Column: Details Grid (Group, Brand/Manufacturer, Prices) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-xs lg:flex-[2.5] max-w-3xl w-full">
                    {/* Brand / Manufacturer */}
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Building className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate" title={brandText}>
                        <span className="text-slate-400 mr-1">Brand:</span>
                        <strong className="font-semibold text-slate-800 dark:text-slate-200">
                          {brandText}
                        </strong>
                      </span>
                    </div>

                    {/* Group / Subgroup */}
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Layers className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate" title={groupText}>
                        <span className="text-slate-400 mr-1">Group:</span>
                        <strong className="font-semibold text-slate-800 dark:text-slate-200">
                          {groupText}
                        </strong>
                      </span>
                    </div>

                    {/* Pricing details */}
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Coins className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate">
                        <span className="text-slate-400 mr-1">Base/MRP:</span>
                        <strong className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                          ₹{basePrice}
                        </strong>
                        <span className="text-[10px] text-slate-400 mx-1">/</span>
                        <strong className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                          ₹{mrpPrice}
                        </strong>
                        <span className="text-[10px] text-slate-400 ml-1.5 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                          {gstStr} GST
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex items-center gap-2 self-start sm:self-end lg:self-auto pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-white/5 w-full lg:w-auto justify-end">
                    <Link
                      href={id ? `${portalHome}/products/${id}` : "#"}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-blue-600 hover:bg-blue-50/50 active:bg-blue-100 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-500/10 text-xs font-semibold transition shadow-sm"
                    >
                      <span>View & Edit</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-250 bg-white text-rose-600 hover:bg-rose-50/50 active:bg-rose-100 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-500/10 text-xs font-semibold disabled:opacity-50 transition shadow-sm"
                      onClick={() => id && setDeleteTarget({ id, label })}
                      disabled={!id || isDeletingProduct}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      {filtersActive && (
        <div className="shrink-0 border-t border-slate-200 bg-white/95 px-4 py-1.5 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-900/95 md:hidden">
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400"
          >
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
