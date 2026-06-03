"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { ConfirmDeleteProductModal } from "@/components/portal/shared/ConfirmDeleteProductModal";
import { ProductDetailModal } from "@/components/portal/shared/ProductDetailModal";
import { BulkUploadProductsModal } from "@/components/portal/shared/BulkUploadProductsModal";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useDeleteProductMutation, useListProductsQuery } from "@/store/api";

const btnSecondaryClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-white/5 dark:active:bg-white/10";

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
  const { data, isFetching, isError, refetch } = useListProductsQuery({});

  const products = useMemo(() => pickList(data) as ProductRow[], [data]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Search & filter states
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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
      setDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [closeProductModal, deleteProduct, deleteTarget, detailId]);

  // Extract unique groups dynamically
  const uniqueGroups = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.product_group?.trim()) {
        set.add(p.product_group.trim());
      }
    });
    return Array.from(set).sort();
  }, [products]);

  // Clientside filtered list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !search.trim() ||
        (p.product_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.generic_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.sku || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.brand || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.manufacturer || "").toLowerCase().includes(search.toLowerCase());

      const matchGroup =
        groupFilter === "all" || p.product_group === groupFilter;

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && p.is_active !== false) ||
        (statusFilter === "inactive" && p.is_active === false);

      return matchSearch && matchGroup && matchStatus;
    });
  }, [products, search, groupFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <ConfirmDeleteProductModal
        productId={deleteTarget?.id ?? null}
        productLabel={deleteTarget?.label ?? ""}
        isDeleting={isDeletingProduct}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
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

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/10 p-6 dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Product Inventory
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl">
              Manage items, default catalog pricing, generic drug names, tax GST percentages, and manufacturer relationships.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className={btnSecondaryClass}
              title="Reload catalog table"
            >
              🔄 Refresh
            </button>
            <Link href={portalHome} className={btnSecondaryClass}>
              ← Dashboard
            </Link>
            <button
              type="button"
              onClick={() => setBulkUploadOpen(true)}
              className={btnSecondaryClass}
            >
              📥 Bulk Upload
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition active:scale-[0.98] dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              ＋ Add Product
            </button>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900 shadow-sm">
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Search
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search by name, generic name, SKU, brand, manufacturer..."
              className="w-full rounded-lg border border-slate-200/90 bg-white pl-9 pr-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Product Group
          </label>
          <select
            className="w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="all">All Groups</option>
            {uniqueGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Status
          </label>
          <select
            className="w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Main Grid/Table Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900 shadow-sm overflow-hidden">
        {isFetching && (
          <div className="flex flex-col items-center justify-center py-16 space-y-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading catalog...</p>
          </div>
        )}

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

        {!isFetching && !isError && filteredProducts.length === 0 && (
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

        {!isFetching && !isError && filteredProducts.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 border-b border-slate-200/60 dark:border-white/5">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product Name</th>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">Group / Subgroup</th>
                  <th className="px-4 py-3 font-semibold">Brand / Manufacturer</th>
                  <th className="px-4 py-3 font-semibold">Unit</th>
                  <th className="px-4 py-3 font-semibold">Base Price</th>
                  <th className="px-4 py-3 font-semibold">MRP</th>
                  <th className="px-4 py-3 font-semibold">GST %</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredProducts.map((p) => {
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
                    <tr
                      key={id || label}
                      className="bg-white dark:bg-slate-900 transition hover:bg-slate-50/50 dark:hover:bg-white/5"
                    >
                      <td className="px-4 py-3 max-w-[220px] truncate">
                        <div className="font-bold text-slate-900 dark:text-slate-50">
                          {name}
                        </div>
                        {generic && generic !== "—" && (
                          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 max-w-[200px] truncate">
                            {generic}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        {sku}
                      </td>
                      <td className="px-4 py-3 max-w-[150px] truncate text-slate-600 dark:text-slate-400 font-medium">
                        {groupText}
                      </td>
                      <td className="px-4 py-3 max-w-[160px] truncate text-slate-600 dark:text-slate-400 font-medium">
                        {brandText}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-650 ring-1 ring-inset ring-slate-500/10 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10 capitalize">
                          {unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                        {basePrice}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-400">
                        {mrpPrice}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-400">
                        {gstStr}
                      </td>
                      <td className="px-4 py-3">
                        {active ? (
                          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-3.5">
                          <Link
                            href={id ? `${portalHome}/products/${id}` : "#"}
                            className="font-semibold text-blue-600 hover:text-blue-700 hover:underline underline-offset-2 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            View & Edit
                          </Link>
                          <button
                            type="button"
                            className="font-semibold text-rose-600 hover:text-rose-700 hover:underline underline-offset-2 dark:text-rose-400 dark:hover:text-rose-300"
                            onClick={() => id && setDeleteTarget({ id, label })}
                            disabled={!id || isDeletingProduct}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
