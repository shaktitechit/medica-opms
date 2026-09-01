"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Edit,
  ArrowLeft,
  Package,
  DollarSign,
  Layers,
  Tag,
  Link2,
  FileText,
} from "lucide-react";

import {
  useGetProductQuery,
  useListOrdersQuery,
  useListPartiesQuery,
  useListUsersQuery,
} from "@/store/api";
import {
  formatDateTime,
  orderKey,
  renderWorkflowStatusBadge,
} from "./orderList/orderListDisplay";
import { getOrderTabCategory } from "@/components/portal/sales/orderUtils";
import { useOrderWorkflowCategoryOptions } from "./orderList/useOrderWorkflowCategoryOptions";
import {
  buildPartyNameById,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import {
  buildUserNameById,
  resolveUserDisplay,
} from "@/components/portal/shared/userDisplay";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import Link from "next/link";
import { OrderListSearchDatePanel } from "./orderList/OrderListSearchDatePanel";
import { OrderListPaginationBar } from "./orderList/OrderListPaginationBar";
import { orderMatchesDateFilter } from "./orderList/orderListDateFilter";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { resolvePortalPresentation } from "@/components/portal/shared/portalPresentation";
import { ProductDetailModal } from "./ProductDetailModal";
import { ProductKitItemsMapping } from "./ProductKitItemsMapping";
import { productRefLabel } from "./productRefLabel";

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
  const portal = portalHome.replace("/", "");
  const { portalName, gradientClass, badgeClass } = resolvePortalPresentation(portal);

  // Queries
  const { data: rawProduct, isLoading, isFetching, isError, refetch } = useGetProductQuery(id, {
    skip: !id,
  });

  // Modal & Tab states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "specifications" | "commercials" | "items" | "orders"
  >("specifications");

  if (isError || (!isLoading && !rawProduct)) {
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

  if (!rawProduct) {
    return <PortalBusyOverlay active message="Loading product…" />;
  }

  const p = rawProduct as any;
  const isKit = p.product_type === "kit";
  const tab =
    !isKit && activeTab === "items" ? "specifications" : activeTab;

  return (
    <div className="space-y-6 max-w-none w-full pb-12">
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
              <span className="rounded bg-slate-900 px-2 py-0.5 text-2xs font-bold uppercase tracking-widest text-white dark:bg-white dark:text-slate-900">
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
              {p.is_featured === true && (
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs font-semibold bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-400" /> Featured
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                  isKit
                    ? "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10"
                    : "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/10"
                }`}
              >
                {isKit ? "Kit" : "Individual"}
              </span>
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
            tab === "specifications"
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
            tab === "commercials"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <DollarSign className="h-4 w-4" /> Commercials & Pricing
        </button>
        {isKit && (
          <button
            type="button"
            onClick={() => setActiveTab("items")}
            className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
              tab === "items"
                ? "border-violet-600 text-violet-600 dark:border-violet-500 dark:text-violet-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Link2 className="h-4 w-4" /> Items Mapping
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
            tab === "orders"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <FileText className="h-4 w-4" /> Orders
        </button>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 gap-6">
        {tab === "specifications" && (
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

              {/* Product Type */}
              <div className="space-y-1">
                <label className={labelClass}>Product Type</label>
                <div className={`${valueClass} capitalize`}>
                  {isKit ? "Kit" : "Individual"}
                </div>
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
                <div className={valueClass}>{productRefLabel(p.product_group) || "—"}</div>
              </div>

              {/* Subgroup */}
              <div className="space-y-1">
                <label className={labelClass}>Subgroup</label>
                <div className={valueClass}>{productRefLabel(p.product_subgroup) || "—"}</div>
              </div>

              {/* Brand */}
              <div className="space-y-1">
                <label className={labelClass}>Brand</label>
                <div className={valueClass}>{productRefLabel(p.brand) || "—"}</div>
              </div>

              {/* Manufacturer */}
              <div className="space-y-1">
                <label className={labelClass}>Manufacturer</label>
                <div className={valueClass}>{productRefLabel(p.manufacturer) || "—"}</div>
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

        {tab === "commercials" && (
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

        {isKit && tab === "items" && <ProductKitItemsMapping kitId={id} />}
        {tab === "orders" && (
          <ProductOrdersTab productId={id} portalHome={portalHome} />
        )}
      </div>
    </div>
  );
}

function ProductOrdersTab({
  productId,
  portalHome,
}: {
  productId: string;
  portalHome: string;
}) {
  const { data: rawOrders, isLoading, isError } = useListOrdersQuery({
    product: productId,
  });
  const partiesQ = useListPartiesQuery({});
  const salesUsersQ = useListUsersQuery({ department: "sales" });
  const categoryOptions = useOrderWorkflowCategoryOptions();

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );
  const salesUserNameById = useMemo(
    () => buildUserNameById(salesUsersQ.data),
    [salesUsersQ.data],
  );

  const orders = useMemo(() => {
    if (!Array.isArray(rawOrders)) return [];
    return rawOrders;
  }, [rawOrders]);

  // States
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter, customDateFrom, customDateTo]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o: any) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const id = orderKey(o);
        const ref = (o.order_no || o.order_number || id || "").toLowerCase();
        const partyLabel = resolveOrderCounterparty(o, partyNameById).toLowerCase();
        const salesPersonLabel = resolveUserDisplay(o.assigned_sales_user, salesUserNameById).toLowerCase();
        if (!ref.includes(query) && !partyLabel.includes(query) && !salesPersonLabel.includes(query)) {
          return false;
        }
      }
      // 2. Date Filter
      if (!orderMatchesDateFilter(o, dateFilter, customDateFrom, customDateTo)) {
        return false;
      }
      return true;
    });
  }, [orders, searchQuery, dateFilter, customDateFrom, customDateTo, partyNameById, salesUserNameById]);

  const totalEntries = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / itemsPerPage) || 1);

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(start, start + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const startEntry = totalEntries > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, totalEntries);

  if (isLoading || partiesQ.isLoading || salesUsersQ.isLoading) {
    return (
      <div className="text-center py-10 text-xs text-slate-500">
        Loading orders...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-10 text-xs text-rose-500">
        Failed to load orders.
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200/90 bg-white p-12 text-center dark:border-white/10 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          No orders contain this product.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OrderListSearchDatePanel
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        customDateFrom={customDateFrom}
        customDateTo={customDateTo}
        onCustomDateFromChange={setCustomDateFrom}
        onCustomDateToChange={setCustomDateTo}
        desktopPlaceholder="Search by order #, party name, or sales person..."
        mobilePlaceholder="Search order #, party, or sales..."
        compact
      />

      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 overflow-hidden">
        {totalEntries === 0 ? (
          <div className="px-4 py-12 text-center">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              No matching orders found
            </h3>
            <p className="mx-auto mt-1.5 max-w-xs text-xs text-slate-500">
              No orders match your search and filter parameters.
            </p>
          </div>
        ) : (
          <>
            <OrderListPaginationBar
              startEntry={startEntry}
              endEntry={endEntry}
              totalEntries={totalEntries}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={(value) => {
                setItemsPerPage(value);
                setCurrentPage(1);
              }}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-white/5 dark:bg-slate-900/50">
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                      Order No
                    </th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                      Party
                    </th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                      Sales Person
                    </th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                      Quantity
                    </th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                      Amount
                    </th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                      Order Date
                    </th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {paginatedOrders.map((o: any) => {
                    const id = orderKey(o);
                    const ref = o.order_no || o.order_number || id || "—";
                    const partyLabel = resolveOrderCounterparty(o, partyNameById);
                    const salesPersonLabel = resolveUserDisplay(
                      o.assigned_sales_user,
                      salesUserNameById,
                    );
                    const matchItem = (o.order_items || []).find(
                      (item: any) => String(item.product?._id || item.product) === productId,
                    );
                    const qty = matchItem
                      ? Number(matchItem.ordered_quantity ?? matchItem.quantity ?? 0)
                      : 0;
                    const amount = matchItem
                      ? Number(matchItem.total_amount ?? qty * (matchItem.unit_price ?? 0))
                      : 0;
                    const orderDateStr = formatDateTime(
                      o.order_date ?? o.created_at ?? o.createdAt,
                    );
                    const statusRaw = getOrderTabCategory(o, categoryOptions);

                    return (
                      <tr
                        key={id || ref}
                        className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors animate-fadeIn"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono font-bold">
                          <Link
                            href={`${portalHome}/order/${id}`}
                            className="font-bold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            {ref}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                          {partyLabel}
                        </td>
                        <td className="px-4 py-3 text-slate-655 dark:text-slate-350">
                          {salesPersonLabel}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700 dark:text-slate-300">
                          {qty}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-900 dark:text-slate-50 tabular-nums">
                          {formatMoney(amount)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
                          {orderDateStr}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {renderWorkflowStatusBadge(statusRaw as any)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <Link
                            href={`${portalHome}/order/${id}`}
                            className="rounded border border-slate-200 px-2 py-1 font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                          >
                            View
                          </Link>
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
    </div>
  );
}
