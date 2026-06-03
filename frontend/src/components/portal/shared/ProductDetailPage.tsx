"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Edit,
  ArrowLeft,
  Package,
  DollarSign,
  Layers,
  Tag,
} from "lucide-react";

import { useGetProductQuery } from "@/store/api";
import { ProductDetailModal } from "./ProductDetailModal";

export type ProductDetailPageProps = {
  id: string;
  portalHome: string;
};

const labelClass = "text-xs font-semibold text-slate-500 dark:text-slate-400";
const valueClass = "text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5";

function formatMoney(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toFixed(2)}` : "—";
}

export default function ProductDetailPage({ id, portalHome }: ProductDetailPageProps) {
  const router = useRouter();
  const portal = portalHome.replace("/", ""); // e.g. "admin" or "finance"

  // Queries
  const { data: rawProduct, isFetching, isError, refetch } = useGetProductQuery(id, {
    skip: !id,
  });

  // Modal & Tab states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"specifications" | "commercials">("specifications");

  // Theme selection: emerald/teal for finance, violet/purple for admin
  const isFinance = portal === "finance";
  const gradientClass = isFinance
    ? "from-emerald-500/10 to-teal-500/10 border-emerald-500/10 dark:from-emerald-500/5 dark:to-teal-500/5"
    : "from-violet-500/10 to-purple-500/10 border-violet-500/10 dark:from-violet-500/5 dark:to-purple-500/5";
  const badgeClass = isFinance
    ? "bg-emerald-50 text-emerald-700 ring-emerald-700/10 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20"
    : "bg-violet-50 text-violet-700 ring-violet-700/10 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/20";
  const portalName = isFinance ? "Finance Portal" : "Admin Portal";

  if (isFetching) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Loading catalog files...</p>
      </div>
    );
  }

  if (isError || !rawProduct) {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <div className="text-4xl">⚠️</div>
        <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">Failed to load product details</h2>
        <p className="mt-2 text-sm text-slate-550 dark:text-slate-400">
          The requested product may not exist in the catalog, or there might be an issue connecting to the database.
        </p>
        <button
          onClick={() => router.push(`${portalHome}/products`)}
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Products
        </button>
      </div>
    );
  }

  const p = rawProduct as any;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Edit Modal popup */}
      {isEditModalOpen && (
        <ProductDetailModal
          productId={id}
          onClose={() => {
            setIsEditModalOpen(false);
            refetch();
          }}
        />
      )}

      {/* Header Banner */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r border p-6 shadow-sm ${gradientClass}`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white dark:bg-white dark:text-slate-900">
                {portalName}
              </span>
              <span className="text-xs font-medium text-slate-550 dark:text-slate-400">Product Specifications</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
                {p.product_name || "Untitled Product"}
              </h1>
              {p.generic_name && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset capitalize ${badgeClass}`}>
                  {p.generic_name}
                </span>
              )}
              {p.is_active !== false ? (
                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-xs font-semibold bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" /> Active Catalog
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 text-xs font-medium bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Inactive
                </span>
              )}
            </div>
            {p.sku && (
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-550 dark:text-slate-400">
                <p>
                  SKU: <span className="font-mono text-slate-800 dark:text-slate-350 bg-black/5 dark:bg-white/5 px-1 py-0.5 rounded">{p.sku}</span>
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => router.push(`${portalHome}/products`)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4" /> Back to List
            </button>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              <Edit className="h-4 w-4" /> Edit Product
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab("specifications")}
          className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
            activeTab === "specifications"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Layers className="h-4 w-4" /> Basic Specifications
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("commercials")}
          className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
            activeTab === "commercials"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <DollarSign className="h-4 w-4" /> Commercials & Pricing
        </button>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 gap-6">
        {activeTab === "specifications" && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-6">
            <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-3">
              <Package className="h-5 w-5 text-blue-500" /> Basic Specs & Groupings
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Product Name */}
              <div className="space-y-1 md:col-span-2">
                <label className={labelClass}>Product Name</label>
                <div className={valueClass}>{p.product_name || "—"}</div>
              </div>

              {/* Generic Name */}
              <div className="space-y-1">
                <label className={labelClass}>Generic Name</label>
                <div className={valueClass}>{p.generic_name || "—"}</div>
              </div>

              {/* SKU */}
              <div className="space-y-1">
                <label className={labelClass}>SKU / Catalog No</label>
                <div className={`${valueClass} font-mono uppercase tracking-wider`}>
                  {p.sku || "—"}
                </div>
              </div>

              {/* Group */}
              <div className="space-y-1">
                <label className={labelClass}>Commercial Group</label>
                <div className={valueClass}>{p.product_group || "—"}</div>
              </div>

              {/* Subgroup */}
              <div className="space-y-1">
                <label className={labelClass}>Subgroup</label>
                <div className={valueClass}>{p.product_subgroup || "—"}</div>
              </div>

              {/* Brand */}
              <div className="space-y-1">
                <label className={labelClass}>Brand</label>
                <div className={valueClass}>{p.brand || "—"}</div>
              </div>

              {/* Manufacturer */}
              <div className="space-y-1">
                <label className={labelClass}>Manufacturer</label>
                <div className={valueClass}>{p.manufacturer || "—"}</div>
              </div>

              {/* Unit of Measurement */}
              <div className="space-y-1">
                <label className={labelClass}>Unit of Measurement</label>
                <div className={`${valueClass} uppercase`}>{p.unit || "—"}</div>
              </div>

              {/* Warranty */}
              <div className="space-y-1">
                <label className={labelClass}>Warranty (months)</label>
                <div className={valueClass}>
                  {p.warranty_months ? `${p.warranty_months} months` : "No Warranty"}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1 md:col-span-2">
                <label className={labelClass}>Description</label>
                <div className="text-sm text-slate-700 dark:text-slate-350 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-white/5 rounded-xl p-4 mt-1 leading-relaxed">
                  {p.description || "No catalog description available."}
                </div>
              </div>
            </div>

            <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pt-4 pb-3">
              <Tag className="h-5 w-5 text-blue-500" /> Search Terms & Metadata
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Aliases */}
              <div className="space-y-1">
                <label className={labelClass}>Aliases</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {Array.isArray(p.aliases) && p.aliases.length > 0 ? (
                    p.aliases.map((alias: string) => (
                      <span
                        key={alias}
                        className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-650 dark:text-slate-300 text-xs font-semibold border border-slate-200/50 dark:border-white/5"
                      >
                        {alias}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500 dark:text-slate-500">—</span>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-1">
                <label className={labelClass}>Tags</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {Array.isArray(p.tags) && p.tags.length > 0 ? (
                    p.tags.map((t: string) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 text-xs font-semibold border border-blue-100 dark:border-blue-900/10"
                      >
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500 dark:text-slate-500">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "commercials" && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-6">
            <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-3">
              <DollarSign className="h-5 w-5 text-blue-500" /> Commercial & Compliance Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Base Price */}
              <div className="space-y-1">
                <label className={labelClass}>Base Price</label>
                <div className="text-lg font-bold text-slate-950 dark:text-slate-50 tabular-nums">
                  {formatMoney(p.base_price)}
                </div>
              </div>

              {/* Minimum Sale Rate */}
              <div className="space-y-1">
                <label className={labelClass}>Minimum Sale Rate</label>
                <div className="text-lg font-bold text-slate-950 dark:text-slate-50 tabular-nums">
                  {formatMoney(p.minimum_sale_rate)}
                </div>
              </div>

              {/* MRP */}
              <div className="space-y-1">
                <label className={labelClass}>MRP</label>
                <div className="text-lg font-bold text-slate-950 dark:text-slate-50 tabular-nums">
                  {formatMoney(p.mrp)}
                </div>
              </div>

              {/* GST Percent */}
              <div className="space-y-1">
                <label className={labelClass}>GST %</label>
                <div className="text-lg font-bold text-slate-950 dark:text-slate-50 tabular-nums">
                  {p.gst_percent ? `${p.gst_percent}%` : "—"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
