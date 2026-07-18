"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package,
  Layers,
  Building,
  Coins,
  ExternalLink,
  Trash2,
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
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeleteProductMutation,
  useListProductsQuery,
  useBulkDeleteProductsMutation,
} from "@/store/api";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { ListEntitySearchPanel } from "@/components/portal/shared/orderList/ListEntitySearchPanel";
import { OrderListBottomTabStrip } from "@/components/portal/shared/orderList/OrderListBottomTabStrip";
import ListProductGroupsPage from "./ListProductGroupsPage";
import ListProductSubgroupsPage from "./ListProductSubgroupsPage";
import ListProductBrandsPage from "./ListProductBrandsPage";
import ListProductManufacturersPage from "./ListProductManufacturersPage";
import GroupProductsPage from "./GroupProductsPage";
import SubgroupProductsPage from "./SubgroupProductsPage";
import BrandProductsPage from "./BrandProductsPage";
import ManufacturerProductsPage from "./ManufacturerProductsPage";

const btnCompactClass =
  "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer";

const PRODUCT_STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
] as const;

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

function renderActiveBadge(active: boolean) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-green-600/10 dark:ring-green-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-slate-500/10 dark:ring-slate-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Inactive
    </span>
  );
}

export type ListProductsPageProps = {
  /** Portal home path e.g. `/sales` */
  portalHome: string;
};

export default function ListProductsPage({
  portalHome,
}: ListProductsPageProps) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "products";

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

  const uniqueGroups = useMemo(() => {
    if (data && typeof data === "object" && "groups" in data && Array.isArray((data as { groups?: unknown }).groups)) {
      return (data as { groups: string[] }).groups;
    }
    return [];
  }, [data]);

  const totalMatching = useMemo(() => {
    if (data && typeof data === "object" && "total" in data) {
      return Number((data as { total?: unknown }).total) || 0;
    }
    return products.length;
  }, [data, products]);

  const totalPages = useMemo(() => {
    if (data && typeof data === "object" && "pages" in data) {
      return Number((data as { pages?: unknown }).pages) || 1;
    }
    return 1;
  }, [data]);

  const startEntry = totalMatching > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, totalMatching);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    setCurrentPage(1);
  }, []);

  const handleGroupChange = useCallback((val: string) => {
    setGroupFilter(val);
    setCurrentPage(1);
  }, []);

  const handleStatusChange = useCallback((val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearch("");
    setGroupFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
  }, []);

  const showReset =
    search.trim() !== "" || groupFilter !== "all" || statusFilter !== "all";

  const groupFilterOptions = useMemo(
    () => [
      { value: "all", label: "All Groups" },
      ...uniqueGroups.map((g) => ({ value: g, label: g })),
    ],
    [uniqueGroups],
  );

  const searchPanelFilters = useMemo(
    () => [
      {
        id: "group",
        value: groupFilter,
        onChange: handleGroupChange,
        ariaLabel: "Product group",
        label: "Group",
        options: groupFilterOptions,
      },
      {
        id: "status",
        value: statusFilter,
        onChange: handleStatusChange,
        ariaLabel: "Product status",
        label: "Status",
        options: [
          { value: "all", label: "All Statuses" },
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
    ],
    [groupFilter, groupFilterOptions, handleGroupChange, handleStatusChange, statusFilter],
  );

  const bottomStripGroupOptions = useMemo(
    () => [{ value: "all", label: "All" }, ...uniqueGroups.map((g) => ({ value: g, label: g }))],
    [uniqueGroups],
  );

  if (view === "groups") {
    return <ListProductGroupsPage portalHome={portalHome} />;
  }
  if (view === "subgroups") {
    return <ListProductSubgroupsPage portalHome={portalHome} />;
  }
  if (view === "brands") {
    return <ListProductBrandsPage portalHome={portalHome} />;
  }
  if (view === "manufacturers") {
    return <ListProductManufacturersPage portalHome={portalHome} />;
  }
  if (view === "group-products") {
    return <GroupProductsPage portalHome={portalHome} />;
  }
  if (view === "subgroup-products") {
    return <SubgroupProductsPage portalHome={portalHome} />;
  }
  if (view === "brand-products") {
    return <BrandProductsPage portalHome={portalHome} />;
  }
  if (view === "manufacturer-products") {
    return <ManufacturerProductsPage portalHome={portalHome} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
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

      <div className="relative shrink-0 overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Product Inventory
            </h1>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 max-w-xl">
              Catalog of SKUs, groups, and active listing status.
            </p>
          </div>
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

      <ListEntitySearchPanel
        searchQuery={search}
        onSearchChange={handleSearchChange}
        desktopPlaceholder="Search by name, generic name, SKU, brand, manufacturer..."
        mobilePlaceholder="Search products…"
        filters={searchPanelFilters}
        compact
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
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
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-500 dark:hover:bg-rose-600 text-xs font-semibold shadow-sm transition active:scale-[0.98]"
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

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-white/5 dark:bg-slate-900/50">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isAllOnPageSelected}
                        onChange={toggleSelectAllOnPage}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 cursor-pointer"
                        aria-label="Select all on page"
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Group</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Brand</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Pricing</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {products.map((p) => {
                    const id = rowKey(p);
                    const label = rowLabel(p, id);
                    const name = p.product_name || "—";
                    const groupObj = p.product_group as any;
                    const groupPart = (groupObj?.name || p.product_group || "").trim();
                    const subgroupObj = p.product_subgroup as any;
                    const subgroupPart = (subgroupObj?.name || p.product_subgroup || "").trim();
                    const groupText = [groupPart, subgroupPart].filter(Boolean).join(" / ") || "—";

                    const brandObj = p.brand as any;
                    const brandPart = (brandObj?.name || p.brand || "").trim();
                    const mfrObj = p.manufacturer as any;
                    const mfrPart = (mfrObj?.name || p.manufacturer || "").trim();
                    const brandText = [brandPart, mfrPart].filter(Boolean).join(" / ") || "—";

                    const generic = p.generic_name?.trim() || "";
                    const sku = p.sku?.trim() || "";

                    const unit = p.unit || "pcs";
                    const basePrice = formatMoney(p.base_price);
                    const mrpPrice = formatMoney(p.mrp);
                    const gst = Number(p.gst_percent ?? 18);
                    const gstStr = Number.isFinite(gst) ? `${gst}%` : "—";
                    const active = p.is_active !== false;

                    return (
                      <tr
                        key={id || label}
                        className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="px-4 py-3 align-top">
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
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 cursor-pointer"
                            aria-label={`Select ${name}`}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-2 min-w-0">
                            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/5 dark:text-blue-400 shrink-0">
                              <Package className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-slate-900 dark:text-slate-50 break-words">
                                  {name}
                                </span>
                                <span className="inline-flex items-center rounded-md bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10 capitalize">
                                  {unit}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                {sku ? (
                                  <span className="font-mono uppercase tracking-wider bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                    SKU: {sku}
                                  </span>
                                ) : null}
                                {generic ? (
                                  <span className="truncate max-w-[200px]" title={generic}>
                                    Generic: {generic}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate font-medium text-slate-800 dark:text-slate-200" title={groupText}>
                              {groupText}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Building className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate font-medium text-slate-800 dark:text-slate-200" title={brandText}>
                              {brandText}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <Coins className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span>
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
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          {renderActiveBadge(active)}
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={id ? `${portalHome}/products/${id}` : "#"}
                              className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-blue-600 hover:bg-blue-50/50 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-500/10 text-xs font-semibold transition shadow-sm"
                            >
                              <span>View</span>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded border border-slate-200 hover:border-rose-300 p-1 text-rose-600 hover:bg-rose-50 dark:border-white/10 dark:text-rose-400 dark:hover:bg-rose-950/30 transition cursor-pointer disabled:opacity-50"
                              onClick={() => id && setDeleteTarget({ id, label })}
                              disabled={!id || isDeletingProduct}
                              title="Delete product"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <OrderListBottomTabStrip
        tabs={PRODUCT_STATUS_TABS}
        activeTab={statusFilter}
        onTabChange={handleStatusChange}
        filteredCount={totalMatching}
        isFetching={isFetching}
        searchQuery={search}
        onClearSearch={() => handleSearchChange("")}
        priorityFilter={groupFilter}
        onPriorityFilterChange={handleGroupChange}
        filterLabel="Group"
        filterOptions={bottomStripGroupOptions}
        showReset={showReset}
        onReset={handleResetFilters}
        compact
      />
    </div>
  );
}
