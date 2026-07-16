"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit,
  ArrowLeft,
  Building,
  MapPin,
  User,
  CreditCard,
  FileText,
  Package,
  Layers,
  Plus,
  Trash2,
  Check,
  X,
  Search,
  Settings,
  Calendar,
  DollarSign,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  UserCheck,
  Truck,
  Users, Wallet } from "lucide-react";

import { pickList } from "@/components/portal/sales/partyDisplay";
import { ConfirmDeleteDraftModal } from "@/components/portal/sales/components/modals/ConfirmDeleteDraftModal";
import { FulfillmentCircleStep } from "@/components/portal/shared/FulfillmentCircleStep";
import { computeDepartmentStageBoxes } from "@/components/portal/shared/orderDepartmentStages";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { resolvePortalPresentation } from "@/components/portal/shared/portalPresentation";
import { PRIORITY_OPTIONS } from "@/components/portal/shared/orderStatusOptions";
import {
  ADMIN_ORDER_TABS,
  getAdminOrderTabCategory,
  type AdminOrderTabCategory,
} from "@/components/portal/admin/adminOrderUtils";
import { isOrderClosed } from "@/components/portal/sales/orderUtils";

import {
  useGetPartyQuery,
  useListPartyProductsQuery,
  useCreatePartyProductMutation,
  usePatchPartyProductMutation,
  useDeletePartyProductMutation,
  useAddPartyProductRateMutation,
  useUpdatePartyProductRateMutation,
  useDeletePartyProductRateMutation,
  useApprovePartyProductRateMutation,
  useListProductsQuery,
  useListOrdersQuery,
  useDeleteOrderMutation,
} from "@/store/api";
import { PartyContactsDisplay } from "./PartyContactsDisplay";
import { PartyDetailModal } from "./PartyDetailModal";
import { contactsFromParty } from "@/lib/partyContacts";
import { toast } from "@/lib/toast";
import { mutationSuccessCopy, mutationRejectedMessage } from "@/lib/mutationMessages";

export type PartyDetailPageProps = {
  id: string;
  portalHome: string;
};

function toDateString(v: unknown): string {
  if (v == null || v === "") return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function orderKey(row: unknown): string {
  if (row && typeof row === "object") {
    const o = row as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return "";
}

function refProductId(product: unknown): string {
  if (product == null) return "";
  if (typeof product === "object") {
    const row = product as { _id?: unknown; id?: unknown };
    return String(row._id ?? row.id ?? "");
  }
  return String(product);
}

function resolveMappingProduct(
  mapping: Record<string, unknown>,
  productById: Map<string, Record<string, unknown>>,
): Record<string, unknown> | null {
  const raw = mapping.product;
  if (raw && typeof raw === "object") {
    const row = raw as Record<string, unknown>;
    if (row.product_name != null && String(row.product_name).trim() !== "") {
      return row;
    }
    const id = refProductId(row);
    if (id && productById.has(id)) return productById.get(id) ?? row;
    return row;
  }
  const id = refProductId(raw);
  if (id && productById.has(id)) return productById.get(id) ?? null;
  return null;
}

function mappingMatchesProductSearch(
  mapping: Record<string, unknown>,
  query: string,
  productById: Map<string, Record<string, unknown>>,
): boolean {
  const q = query.toLowerCase();
  const product = resolveMappingProduct(mapping, productById);
  const haystack = [
    product?.product_name,
    product?.sku,
    product?.brand,
    product?.generic_name,
    product?.product_group,
    mapping.remarks,
  ];
  return haystack.some((value) => String(value ?? "").toLowerCase().includes(q));
}

type PartyOrderTabCategory = Exclude<AdminOrderTabCategory, "pending_admin_approval">;
type PartyOrderStageTab = "all" | PartyOrderTabCategory;

const PARTY_ORDER_TABS: ReadonlyArray<{ id: PartyOrderStageTab; label: string }> = [
  { id: "all", label: "All Orders" },
  ...ADMIN_ORDER_TABS.filter(
    (tab): tab is { id: PartyOrderTabCategory; label: string } =>
      tab.id !== "pending_admin_approval",
  ).map(({ id, label }) => ({
    id,
    label:
      id === "open_dispatched"
        ? "Open Orders"
        : id === "closed_delivered"
          ? "Closed Orders"
          : label,
  })),
];

function getFinancePartyOrderTabCategory(order: unknown): PartyOrderTabCategory | null {
  const cat = getAdminOrderTabCategory(order);
  if (!cat || cat === "pending_admin_approval") return null;
  return cat;
}

function getPartyOrderTabCategory(order: unknown, portal: string): PartyOrderTabCategory | null {
  if (portal === "finance") {
    return getFinancePartyOrderTabCategory(order);
  }

  const cat = getAdminOrderTabCategory(order);
  if (!cat || cat === "pending_admin_approval") return null;
  return cat;
}

function renderPriorityBadge(priority: string) {
  const p = String(priority).toLowerCase();
  if (p === "urgent") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-700/10 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-500/25">
        Urgent
      </span>
    );
  }
  if (p === "high") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-700/10 dark:bg-amber-955 dark:text-amber-400 dark:ring-amber-500/20">
        High
      </span>
    );
  }
  if (p === "normal") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-955 dark:text-blue-400 dark:ring-blue-500/20">
        Normal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 ring-1 ring-inset ring-slate-500/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10">
      Low
    </span>
  );
}

function formatDateShort(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const labelClass = "text-xs font-semibold text-slate-500 dark:text-slate-400";
const valueClass = "text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5";

export default function PartyDetailPage({ id, portalHome }: PartyDetailPageProps) {
  const router = useRouter();
  const portal = portalHome.replace("/", "");
  const { portalName, gradientClass, badgeClass } = resolvePortalPresentation(portal);

  // Queries
  const { data: rawParty, isLoading, isFetching, isError, refetch } = useGetPartyQuery(id, {
    skip: !id,
  });

  // Modal & Tab states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editModalTab, setEditModalTab] = useState<"details" | "contacts" | "address">("details");
  const [activeTab, setActiveTab] = useState<"profile" | "contacts" | "addresses" | "products" | "orders">("profile");

  // Orders related state
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [debouncedOrderSearch, setDebouncedOrderSearch] = useState("");
  const [orderStageTab, setOrderStageTab] = useState<PartyOrderStageTab>("all");
  const [orderPriorityFilter, setOrderPriorityFilter] = useState("all");
  const [orderCurrentPage, setOrderCurrentPage] = useState(1);
  const [orderItemsPerPage, setOrderItemsPerPage] = useState(10);
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedOrderSearch(orderSearchQuery);
    }, 350);
    return () => clearTimeout(handler);
  }, [orderSearchQuery]);

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      party: id,
      paginate: "true",
      page: String(orderCurrentPage),
      limit: String(orderItemsPerPage),
    };
    if (debouncedOrderSearch.trim()) {
      params.search = debouncedOrderSearch.trim();
    }
    if (orderStageTab !== "all") {
      params.status = orderStageTab;
    }
    if (orderPriorityFilter !== "all") {
      params.priority = orderPriorityFilter;
    }
    return params;
  }, [id, orderCurrentPage, orderItemsPerPage, debouncedOrderSearch, orderStageTab, orderPriorityFilter]);

  const { data: rawOrders, isFetching: isOrdersFetching, isError: isOrdersError, refetch: refetchOrders } = useListOrdersQuery(queryParams);
  const { data: rawAllPartyOrders } = useListOrdersQuery({ party: id });

  const [deleteOrder, { isLoading: isDeletingOrder }] = useDeleteOrderMutation();

  const closeDeleteOrderModal = useCallback(() => setDeleteOrderTarget(null), []);

  const confirmDeleteOrderDraft = useCallback(async () => {
    if (!deleteOrderTarget) return;
    const { id } = deleteOrderTarget;
    try {
      await deleteOrder(id).unwrap();
      toast.success(mutationSuccessCopy("deleteOrder"));
      setDeleteOrderTarget(null);
      refetchOrders();
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [deleteOrder, deleteOrderTarget, refetchOrders]);

  const allPartyOrders = useMemo(() => pickOrders(rawAllPartyOrders) as any[], [rawAllPartyOrders]);

  const orderMetrics = useMemo(() => {
    let totalSpent = 0;
    let openCount = 0;
    let closedCount = 0;
    let totalItems = 0;
    let deliveredItems = 0;

    allPartyOrders.forEach((o) => {
      const total = Number(o.grand_total ?? o.total ?? 0);
      if (Number.isFinite(total)) {
        totalSpent += total;
      }

      const cat = getPartyOrderTabCategory(o, portal);
      if (!cat) return;
      if (cat === "open_dispatched" || cat === "on_hold") {
        openCount++;
      } else if (cat === "closed_delivered") {
        closedCount++;
      }

      const items = Array.isArray(o.order_items) ? o.order_items : [];
      items.forEach((item: any) => {
        const qty = Number(item.ordered_quantity ?? item.quantity ?? 0);
        const del = Number(item.delivered_quantity ?? 0);
        totalItems += qty;
        deliveredItems += del;
      });
    });

    const fulfillmentRate = totalItems > 0 ? Math.min(100, Math.round((deliveredItems / totalItems) * 100)) : 0;

    return {
      totalCount: allPartyOrders.length,
      totalSpent,
      openCount,
      closedCount,
      fulfillmentRate,
    };
  }, [allPartyOrders, portal]);

  const tabCounts = useMemo(() => {
    const counts = Object.fromEntries(
      PARTY_ORDER_TABS.map(({ id }) => [id, 0]),
    ) as Record<PartyOrderStageTab, number>;

    allPartyOrders.forEach((o) => {
      if (orderPriorityFilter !== "all" && (o.priority || "").toLowerCase() !== orderPriorityFilter.toLowerCase()) {
        return;
      }
      if (orderSearchQuery.trim()) {
        const query = orderSearchQuery.toLowerCase();
        const oid = orderKey(o);
        const ref = (
          typeof o.order_no === "string"
            ? o.order_no
            : typeof o.order_number === "string"
              ? o.order_number
              : oid || ""
        ).toLowerCase();
        if (!ref.includes(query)) return;
      }

      counts.all++;
      const cat = getPartyOrderTabCategory(o, portal);
      if (cat) {
        counts[cat]++;
      }
    });

    return counts;
  }, [allPartyOrders, orderPriorityFilter, orderSearchQuery, portal]);

  const filteredOrders = useMemo(() => pickOrders(rawOrders) as any[], [rawOrders]);

  const paginatedOrders = filteredOrders;

  const totalFilteredCount = useMemo(() => {
    if (rawOrders && typeof rawOrders === "object" && "total" in rawOrders) {
      return Number((rawOrders as any).total) || 0;
    }
    return filteredOrders.length;
  }, [rawOrders, filteredOrders]);

  const orderTotalPages = useMemo(() => {
    if (rawOrders && typeof rawOrders === "object" && "pages" in rawOrders) {
      return Number((rawOrders as any).pages) || 1;
    }
    return 1;
  }, [rawOrders]);

  const orderStartEntry = totalFilteredCount > 0 ? (orderCurrentPage - 1) * orderItemsPerPage + 1 : 0;
  const orderEndEntry = Math.min(orderCurrentPage * orderItemsPerPage, totalFilteredCount);

  // Party-Product Mappings State
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const [expandedMappingId, setExpandedMappingId] = useState<string | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedProductSearch(productSearchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [productSearchQuery]);

  // Modals for Products & Rates
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [editMappingTarget, setEditMappingTarget] = useState<any | null>(null);
  const [addRateTarget, setAddRateTarget] = useState<any | null>(null);
  const [editRateTarget, setEditRateTarget] = useState<{ mapping: any; rate: any } | null>(null);
  const [deleteMappingTarget, setDeleteMappingTarget] = useState<any | null>(null);
  const [deleteRateTarget, setDeleteRateTarget] = useState<{ mappingId: string; rateId: string; rateLabel: string } | null>(null);

  // Queries
  const { data: rawMappings, isLoading: isMappingsLoading } = useListPartyProductsQuery();
  const { data: rawCatalogProducts } = useListProductsQuery(
    {},
    { skip: activeTab !== "products" },
  );

  const productById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of pickList(rawCatalogProducts)) {
      if (!row || typeof row !== "object") continue;
      const product = row as Record<string, unknown>;
      const productId = refProductId(product);
      if (productId) map.set(productId, product);
    }
    return map;
  }, [rawCatalogProducts]);

  // Mutations
  const [createMapping, { isLoading: isCreating }] = useCreatePartyProductMutation();
  const [patchMapping, { isLoading: isPatching }] = usePatchPartyProductMutation();
  const [deleteMapping, { isLoading: isDeleting }] = useDeletePartyProductMutation();
  const [addRate, { isLoading: isAddingRate }] = useAddPartyProductRateMutation();
  const [updateRate, { isLoading: isUpdatingRate }] = useUpdatePartyProductRateMutation();
  const [deleteRate, { isLoading: isDeletingRate }] = useDeletePartyProductRateMutation();
  const [approveRate] = useApprovePartyProductRateMutation();

  const partyMappings = useMemo(() => {
    if (!Array.isArray(rawMappings)) return [];
    return rawMappings.filter((m: any) => {
      const pId = typeof m.party === "object" ? m.party?._id || m.party?.id : m.party;
      return String(pId) === String(id);
    });
  }, [rawMappings, id]);

  const filteredMappings = useMemo(() => {
    if (!debouncedProductSearch.trim()) return partyMappings;
    return partyMappings.filter((m: any) =>
      mappingMatchesProductSearch(m, debouncedProductSearch.trim(), productById),
    );
  }, [partyMappings, debouncedProductSearch, productById]);

  const mappedProductIds = useMemo(() => {
    return partyMappings.map((m: any) => {
      return typeof m.product === "object" ? m.product?._id || m.product?.id : m.product;
    });
  }, [partyMappings]);

  if (isError || (!isLoading && !rawParty)) {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <div className="text-4xl">⚠️</div>
        <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">Failed to load party details</h2>
        <p className="mt-2 text-sm text-slate-550 dark:text-slate-400">
          The requested profile may not exist, or there might be an issue connecting to the database.
        </p>
        <button
          onClick={() => router.push(`${portalHome}/parties`)}
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Parties
        </button>
      </div>
    );
  }

  if (!rawParty) {
    return <PortalBusyOverlay active message="Loading party…" />;
  }

  const p = rawParty as any;
  const bAddr = p.billing_address || {};
  const sAddr = p.shipping_address || {};
  const partyContacts = contactsFromParty(p);

  const openEditModal = (tab: "details" | "contacts" | "address" = "details") => {
    setEditModalTab(tab);
    setIsEditModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Edit Modal popup */}
      {isEditModalOpen && (
        <PartyDetailModal
          partyId={id}
          portalHome={portalHome}
          initialTab={editModalTab}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditModalTab("details");
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
              <span className="text-xs font-medium text-slate-550 dark:text-slate-400">Party Profile</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
                {p.party_name || "Untitled Party"}
              </h1>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset capitalize ${badgeClass}`}>
                {p.party_type}
              </span>
              {p.is_active !== false ? (
                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-xs font-semibold bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" /> Active
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
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => router.push(`${portalHome}/parties`)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-880 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4" /> Back to List
            </button>
            <button
              type="button"
              onClick={() => openEditModal("details")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              <Edit className="h-4 w-4" /> Edit Profile
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
            activeTab === "profile"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Building className="h-4 w-4" /> Profile & Licenses
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("contacts")}
          className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
            activeTab === "contacts"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Users className="h-4 w-4" /> Contacts ({partyContacts.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("addresses")}
          className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
            activeTab === "addresses"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <MapPin className="h-4 w-4" /> Address details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("products")}
          className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
            activeTab === "products"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Layers className="h-4 w-4" /> Products & Rates
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 ${
            activeTab === "orders"
              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <FileText className="h-4 w-4" /> Orders ({allPartyOrders.length})
        </button>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 gap-6">
        {activeTab === "profile" && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-6">
            <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-3">
              <User className="h-5 w-5 text-blue-500" /> Basic Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Party Name */}
              <div className="space-y-1 md:col-span-2">
                <label className={labelClass}>Party Name</label>
                <div className={valueClass}>{p.party_name || "—"}</div>
              </div>

              {/* Party Type */}
              <div className="space-y-1">
                <label className={labelClass}>Party Type</label>
                <div className={`${valueClass} capitalize`}>{p.party_type || "—"}</div>
              </div>

              {/* SRA Status */}
              <div className="space-y-1">
                <label className={labelClass}>Special Rate Approval (SRA)</label>
                <div className={valueClass}>
                  {p.sra ? (
                    <div className="flex flex-col gap-1.5">
                      <div>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10 px-2.5 py-0.5 rounded-full ring-1 ring-inset ring-emerald-600/10 dark:ring-emerald-500/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                          Enabled
                        </span>
                      </div>
                      {(p.sra_from_date || p.sra_to_date) && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          Validity Range: <span className="font-semibold text-slate-700 dark:text-slate-350">{formatDateShort(p.sra_from_date)}</span> to <span className="font-semibold text-slate-700 dark:text-slate-350">{formatDateShort(p.sra_to_date)}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-550 dark:text-slate-450 bg-slate-50 dark:bg-white/5 px-2.5 py-0.5 rounded-full ring-1 ring-inset ring-slate-500/10 dark:ring-slate-500/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                      Disabled
                    </span>
                  )}
                </div>
              </div>
            </div>

            <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pt-4 pb-3">
              <FileText className="h-5 w-5 text-blue-500" /> Compliance & Terms
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* GSTIN */}
              <div className="space-y-1">
                <label className={labelClass}>GSTIN</label>
                <div className={`${valueClass} font-mono uppercase tracking-wider`}>
                  {p.gst_no || "—"}
                </div>
              </div>

              {/* Drug License */}
              <div className="space-y-1">
                <label className={labelClass}>Drug License No</label>
                <div className={valueClass}>{p.drug_license_no || "—"}</div>
              </div>

              {/* District */}
              <div className="space-y-1">
                <label className={labelClass}>District</label>
                <div className={valueClass}>{p.district || "—"}</div>
              </div>

              {/* State */}
              <div className="space-y-1">
                <label className={labelClass}>State</label>
                <div className={valueClass}>{p.state || "—"}</div>
              </div>

              {/* Payment Terms */}
              <div className="space-y-1">
                <label className={labelClass}>Payment Terms</label>
                <div className={`${valueClass} flex items-center gap-1.5`}>
                  <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                  {p.payment_terms || "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "contacts" && (
          <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-3">
              <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Party Contacts
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-400">
                  {partyContacts.length}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => openEditModal("contacts")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-500/10"
              >
                <Edit className="h-3.5 w-3.5" />
                Edit Contacts
              </button>
            </div>
            <PartyContactsDisplay party={p} />
          </div>
        )}

        {activeTab === "addresses" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Billing Address Card */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-4">
              <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-2">
                <Building className="h-4.5 w-4.5 text-blue-500" /> Billing Address
              </h3>
              <div className="space-y-3.5 text-sm text-slate-700 dark:text-slate-350">
                <p className="font-semibold text-slate-900 dark:text-slate-50">
                  {bAddr.address_line_1 || "—"}
                </p>
                {bAddr.address_line_2 && (
                  <p>{bAddr.address_line_2}</p>
                )}
                <p>
                  {[
                    bAddr.city,
                    bAddr.state,
                    bAddr.pincode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </p>
                {bAddr.country && (
                  <p className="text-xs uppercase tracking-wider font-bold text-slate-400">
                    {bAddr.country}
                  </p>
                )}
              </div>
            </div>

            {/* Shipping Address Card */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-4">
              <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2 border-b border-slate-100 dark:border-white/5 pb-2">
                <MapPin className="h-4.5 w-4.5 text-blue-500" /> Shipping Address
              </h3>
              <div className="space-y-3.5 text-sm text-slate-700 dark:text-slate-350">
                <p className="font-semibold text-slate-900 dark:text-slate-50">
                  {sAddr.address_line_1 || "—"}
                </p>
                {sAddr.address_line_2 && (
                  <p>{sAddr.address_line_2}</p>
                )}
                <p>
                  {[
                    sAddr.city,
                    sAddr.state,
                    sAddr.pincode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </p>
                {sAddr.country && (
                  <p className="text-xs uppercase tracking-wider font-bold text-slate-400">
                    {sAddr.country}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "products" && (
          <div className="space-y-6">
            <div className="relative rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900 shadow-sm p-4">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                Search Products
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                  <Search className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  placeholder="Search mapped products by name, SKU, brand, or remarks..."
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-blue-500"
                />
                {productSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setProductSearchQuery("")}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-4 shadow-sm">
              {productSearchQuery.trim() ? (
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Showing{" "}
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {filteredMappings.length}
                    </span>{" "}
                    mapped product{filteredMappings.length === 1 ? "" : "s"} for{" "}
                    <span className="italic font-bold text-slate-900 dark:text-slate-100">
                      "{productSearchQuery}"
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setProductSearchQuery("")}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {partyMappings.length} mapped product{partyMappings.length === 1 ? "" : "s"} for this party
                </p>
              )}
              <button
                type="button"
                onClick={() => setIsMapModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition shrink-0 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                <Plus className="h-4 w-4" /> Map New Product
              </button>
            </div>

            {/* Mappings display */}
            {isMappingsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Loading mappings...</p>
              </div>
            ) : partyMappings.length === 0 ? (
              /* Empty state */
              <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-slate-900">
                <Layers className="h-12 w-12 mx-auto text-slate-400" />
                <h3 className="mt-4 text-sm font-bold text-slate-905 dark:text-slate-105">No products mapped</h3>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  This party doesn't have any custom catalog mappings or negotiated rates yet.
                </p>
                <button
                  type="button"
                  onClick={() => setIsMapModalOpen(true)}
                  className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  <Plus className="h-4 w-4" /> Map a Product
                </button>
              </div>
            ) : filteredMappings.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  No mapped products match "{productSearchQuery}"
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredMappings.map((m: any) => {
                  const isExpanded = expandedMappingId === m._id;
                  const product = resolveMappingProduct(m, productById);
                  return (
                    <div
                      key={m._id}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition duration-200"
                    >
                      {/* Product Header */}
                      <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/50">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 p-2 bg-blue-50 dark:bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400 shrink-0">
                            <Package className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                              {String(product?.product_name || "Unknown Product")}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs font-mono bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">
                                SKU: {String(product?.sku || "—")}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Base: ₹{String(product?.base_price ?? "—")}
                              </span>
                              <span className="text-xs text-slate-400 dark:text-slate-500">|</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Min Sale: ₹{String(product?.minimum_sale_rate ?? "—")}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Mapping Info & Actions */}
                        <div className="flex flex-wrap items-center gap-3 md:justify-end">
                          {/* Control Pills */}
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-350">
                              Priority: {m.priority ?? 100}
                            </span>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-350">
                              EOQ: {m.expected_order_quantity ?? 0}
                            </span>
                            {m.is_orderable ? (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400">
                                Orderable
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                Non-Orderable
                              </span>
                            )}
                            {m.is_active !== false ? (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400">
                                Active
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400">
                                Inactive
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-white/10 pl-3">
                            <button
                              type="button"
                              onClick={() => setEditMappingTarget(m)}
                              title="Edit Mapping Details"
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition"
                            >
                              <Settings className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteMappingTarget(m)}
                              title="Delete Mapping"
                              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded text-slate-550 hover:text-red-655 dark:text-slate-400 dark:hover:text-red-400 transition"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedMappingId(isExpanded ? null : m._id)}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition flex items-center gap-1 text-xs font-semibold"
                            >
                              {isExpanded ? (
                                <>
                                  Hide Rates <ChevronUp className="h-4 w-4" />
                                </>
                              ) : (
                                <>
                                  Show Rates ({m.rates?.length ?? 0}) <ChevronDown className="h-4 w-4" />
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Remarks if exist */}
                      {m.remarks && (
                        <div className="px-5 py-2 text-xs text-slate-505 dark:text-slate-400 bg-slate-50/20 dark:bg-slate-900/20 border-b border-slate-100 dark:border-white/5 italic">
                          Remarks: {m.remarks}
                        </div>
                      )}

                      {/* Rates Section */}
                      {isExpanded && (
                        <div className="p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
                            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider">
                              Negotiated Rates Setup
                            </h5>
                            <button
                              type="button"
                              onClick={() => setAddRateTarget(m)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition"
                            >
                              <Plus className="h-3 w-3" /> Add Rate Tier
                            </button>
                          </div>

                          {!m.rates || m.rates.length === 0 ? (
                            <div className="py-6 text-center bg-slate-50/30 dark:bg-slate-950/20 border border-dashed border-slate-200 dark:border-white/5 rounded-lg">
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                No custom rates configured. Orders will fall back to catalog base price.
                              </p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 font-semibold">
                                    <th className="py-2 pr-4">Rate Type</th>
                                    <th className="py-2 px-4 text-right">Negotiated Rate</th>
                                    <th className="py-2 px-4 text-center">Qty Bracket</th>
                                    <th className="py-2 px-4 text-center">Validity Range</th>
                                    <th className="py-2 px-4 text-center">Status</th>
                                    <th className="py-2 pl-4 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-300">
                                  {m.rates.map((r: any) => {
                                    // Status Badge styling
                                    let statusColor = "bg-slate-100 text-slate-650 dark:bg-white/5 dark:text-slate-400";
                                    if (r.status === "active") {
                                      statusColor = "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400";
                                    } else if (r.status === "draft") {
                                      statusColor = "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400";
                                    } else if (r.status === "expired" || r.status === "cancelled") {
                                      statusColor = "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400";
                                    }

                                    // Rate type label
                                    let typeLabel = r.rate_type;
                                    if (r.rate_type === "SR") typeLabel = "SR (Standard)";
                                    else if (r.rate_type === "SRA") typeLabel = "SRA (Special Admin)";
                                    else if (r.rate_type === "CR") typeLabel = "CR (Contract)";

                                    // Check if validity_end has passed
                                    const isExpired = new Date(r.validity_end).getTime() < Date.now();
                                    const displayStatus = isExpired && r.status === "active" ? "expired" : r.status;
                                    const displayStatusColor = isExpired && r.status === "active"
                                      ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                                      : statusColor;

                                    return (
                                      <tr key={r._id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                                        <td className="py-2.5 pr-4 font-medium flex items-center gap-1.5">
                                          {typeLabel}
                                          {r.approval_required && (
                                            <span className="text-[9px] bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-1 py-0.2 rounded font-bold uppercase">
                                              Req Approval
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-bold text-slate-905 dark:text-slate-50">
                                          ₹{Number(r.rate).toFixed(2)}
                                        </td>
                                        <td className="py-2.5 px-4 text-center font-mono">
                                          {r.min_qty ?? 1} - {r.max_qty === 999999 ? "∞" : r.max_qty}
                                        </td>
                                        <td className="py-2.5 px-4 text-center text-slate-500 dark:text-slate-400">
                                          {new Date(r.validity_start).toLocaleDateString()} to {new Date(r.validity_end).toLocaleDateString()}
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${displayStatusColor}`}>
                                            {displayStatus}
                                          </span>
                                        </td>
                                        <td className="py-2.5 pl-4 text-right">
                                          <div className="flex items-center justify-end gap-1.5">
                                            {r.status === "draft" && (
                                              <button
                                                type="button"
                                                onClick={async () => {
                                                  try {
                                                    await approveRate(r._id).unwrap();
                                                    toast.success("Rate tier approved successfully!");
                                                  } catch (err) {
                                                    toast.error(mutationRejectedMessage(err));
                                                  }
                                                }}
                                                title="Approve Rate"
                                                className="p-1 hover:bg-green-50 dark:hover:bg-green-500/10 text-green-600 rounded transition animate-pulse"
                                              >
                                                <Check className="h-3.5 w-3.5" />
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => setEditRateTarget({ mapping: m, rate: r })}
                                              title="Edit Rate Values"
                                              className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-550 dark:text-slate-400 rounded transition"
                                            >
                                              <Edit className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setDeleteRateTarget({
                                                mappingId: m._id,
                                                rateId: r._id,
                                                rateLabel: `₹${r.rate} (${r.rate_type})`
                                              })}
                                              title="Delete Rate"
                                              className="p-1 hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-550 hover:text-red-500 transition"
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
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "orders" && (
          <div className="space-y-6">
            {/* Summary Metrics Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Card 1: Total Orders */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 flex items-center gap-4">
                <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Orders</p>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">{orderMetrics.totalCount}</h4>
                </div>
              </div>

              {/* Card 2: Total Volume */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 flex items-center gap-4">
                <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Volume</p>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                    ${orderMetrics.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h4>
                </div>
              </div>

              {/* Card 3: Open Orders */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 flex items-center gap-4">
                <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Open Orders</p>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">{orderMetrics.openCount}</h4>
                </div>
              </div>

              {/* Card 4: Fulfillment Rate */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 flex items-center gap-4">
                <div className="rounded-lg bg-purple-50 p-2.5 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Fulfillment Rate</p>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">{orderMetrics.fulfillmentRate}%</h4>
                </div>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col gap-4">
              {/* Universal Search Bar */}
              <div className="relative rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900 shadow-sm p-4">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                  Search Orders
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={orderSearchQuery}
                    onChange={(e) => {
                      setOrderSearchQuery(e.target.value);
                      setOrderCurrentPage(1);
                    }}
                    placeholder="Search by order #..."
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-955 dark:text-slate-50 dark:focus:border-blue-500"
                  />
                  {orderSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearchQuery("");
                        setOrderCurrentPage(1);
                      }}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Horizontal Nav Tabs & Priority Filter */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/10 pb-2 md:pb-0">
                {orderSearchQuery.trim() ? (
                  <div className="flex items-center gap-2.5 py-3">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Showing <span className="font-bold text-blue-600 dark:text-blue-400">{totalFilteredCount}</span> search results for <span className="italic font-bold text-slate-900 dark:text-slate-100">"{orderSearchQuery}"</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearchQuery("");
                        setOrderCurrentPage(1);
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300 transition cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                      Clear
                    </button>
                  </div>
                ) : (
                  <nav className="-mb-px flex space-x-6 overflow-x-auto pb-px scrollbar-none" aria-label="Order stages">
                    {PARTY_ORDER_TABS.map((tab) => {
                      const isActive = orderStageTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setOrderStageTab(tab.id);
                            setOrderCurrentPage(1);
                          }}
                          className={`group border-b-2 py-4 px-1 text-sm font-semibold transition whitespace-nowrap inline-flex items-center gap-2 cursor-pointer ${
                            isActive
                              ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                          }`}
                        >
                          <span>{tab.label}</span>
                          {!isOrdersFetching && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isActive
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                : "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400"
                            }`}>
                              {tabCounts[tab.id] ?? 0}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                )}

                <div className="flex items-center gap-2 self-start md:self-center pb-2 md:pb-0">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Priority:
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={orderPriorityFilter}
                      onChange={(e) => {
                        setOrderPriorityFilter(e.target.value);
                        setOrderCurrentPage(1);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 cursor-pointer"
                    >
                      <option value="all">All Priorities</option>
                      {PRIORITY_OPTIONS.map((pr) => (
                        <option key={pr.value} value={pr.value}>
                          {pr.label}
                        </option>
                      ))}
                    </select>
                    {(orderSearchQuery || orderStageTab !== "all" || orderPriorityFilter !== "all") && (
                      <button
                        type="button"
                        onClick={() => {
                          setOrderSearchQuery("");
                          setOrderStageTab("all");
                          setOrderPriorityFilter("all");
                          setOrderCurrentPage(1);
                        }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 pl-1 cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Orders Cards List */}
            <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900 shadow-sm overflow-hidden">
              {isOrdersFetching && (
                <div className="flex flex-col items-center justify-center py-16 space-y-2">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading orders...</p>
                </div>
              )}

              {isOrdersError && (
                <div className="text-center py-16 px-4">
                  <span className="text-2xl">⚠️</span>
                  <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Failed to load orders
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Please try refreshing the page.
                  </p>
                </div>
              )}

              {!isOrdersFetching && !isOrdersError && filteredOrders.length === 0 && (
                <div className="text-center py-16 px-4">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-955 text-slate-400 text-xl border border-slate-100 dark:border-white/5">
                    📋
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    No orders found
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-500 max-w-xs mx-auto">
                    {allPartyOrders.length === 0
                      ? "No orders exist for this party."
                      : "No orders match your search and filter parameters."}
                  </p>
                </div>
              )}

              {!isOrdersFetching && !isOrdersError && filteredOrders.length > 0 && (
                <>
                  <div className="p-4 flex flex-col gap-3.5 bg-slate-50/10 dark:bg-slate-955/10">
                    {paginatedOrders.map((o) => {
                      const oid = orderKey(o);
                      const ref =
                        typeof o.order_no === "string"
                          ? o.order_no
                          : typeof o.order_number === "string"
                            ? o.order_number
                            : oid || "—";
                      const total = Number(o.grand_total ?? o.total ?? 0);
                      const pri = typeof o.priority === "string" ? o.priority : "normal";
                      const deptBoxes = computeDepartmentStageBoxes(
                        o as Record<string, unknown>,
                        null,
                      );
                      const adminBox = deptBoxes.find((b) => b.id === "admin");
                      const financeBox = deptBoxes.find((b) => b.id === "finance");
                      const dispatchBox = deptBoxes.find((b) => b.id === "dispatch");
                      const accountBox = deptBoxes.find((b) => b.id === "account");
  const deliveryBox = deptBoxes.find((b) => b.id === "delivery");

                      const adminStatusDim = adminBox?.status;
                      const financeStatusDim = financeBox?.status;
                      const dispatchStatusDim = dispatchBox?.status;
                      const accountStatusDim = accountBox?.status;
  const deliveryStatusDim = deliveryBox?.status;

                      const orderItems = Array.isArray(o.order_items) ? o.order_items : [];
                      const orderedQty = Math.max(1, orderItems.reduce((acc: number, item: any) => {
                        return acc + (Number(item.ordered_quantity ?? item.quantity) || 0);
                      }, 0));

                      const statusRaw = deriveOrderWorkflowStatus(o) || "draft";
                      const isDraftRow = statusRaw === "draft";
                      const orderDateStr = formatDateShort(o.order_date ?? o.created_at ?? o.createdAt);
                      const expectedDeliveryStr = formatDateShort(o.expected_delivery_date);

                      let stripeColor = "bg-slate-350 dark:bg-slate-700";
                      if (pri === "urgent") stripeColor = "bg-rose-500";
                      else if (pri === "high") stripeColor = "bg-amber-500";
                      else if (pri === "normal") stripeColor = "bg-blue-500";

                      return (
                        <div
                          key={oid || ref}
                          onClick={() => {
                            if (oid) {
                              router.push(`${portalHome}/order/${oid}`);
                            }
                          }}
                          className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 transition-all duration-300 hover:shadow-md hover:border-blue-500/20 dark:border-white/10 dark:bg-slate-900 flex flex-col gap-4 pl-5 animate-fadeIn cursor-pointer"
                        >
                          {/* Priority Accent Stripe */}
                          <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${stripeColor}`} />

                          {/* Top Row: Ref, Badges, Financials & Dates, Actions */}
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 w-full border-b border-slate-100/60 pb-3 dark:border-white/5">
                            {/* Ref & Badges */}
                            <div className="flex items-center justify-between lg:justify-start lg:gap-2 lg:w-[130px] lg:shrink-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-50">
                                  {ref}
                                </span>
                                {renderPriorityBadge(pri)}
                              </div>

                              {/* Mobile Actions (hidden on lg and up) */}
                              {isDraftRow && oid ? (
                                <div className="flex items-center gap-2 lg:hidden">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteOrderTarget({ id: oid, label: ref });
                                    }}
                                    disabled={isDeletingOrder}
                                    className="inline-flex items-center justify-center rounded border border-slate-200 hover:border-rose-350 p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:text-rose-455 dark:hover:bg-rose-950/30 transition cursor-pointer"
                                    title="Delete Draft Order"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            {/* Party Title (Already on Party's Detail Page, but keep label for consistent horizontal spacing / layout) */}
                            <span
                              className="text-xs font-semibold text-slate-500 dark:text-slate-400 lg:flex-1 break-words whitespace-normal"
                            >
                              Party Order
                            </span>

                            {/* Financials & Dates */}
                            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-8 lg:w-[280px] lg:shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                              <div className="flex flex-col min-w-[90px]">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                  Grand Total
                                </span>
                                <span className="mt-0.5 font-bold tabular-nums text-slate-900 dark:text-slate-50 text-xs">
                                  ${Number.isFinite(total) ? total.toFixed(2) : "0.00"}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                  Created
                                </span>
                                <span className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-355">
                                  {orderDateStr}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                  Expected Delivery
                                </span>
                                <span className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-355">
                                  {expectedDeliveryStr}
                                </span>
                              </div>
                            </div>

                            {/* Desktop Actions (hidden on lg and below) */}
                            <div className="hidden lg:flex lg:items-center lg:gap-2 lg:w-[40px] lg:shrink-0 lg:justify-end">
                              {isDraftRow && oid ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteOrderTarget({ id: oid, label: ref });
                                  }}
                                  disabled={isDeletingOrder}
                                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 hover:border-rose-350 p-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:text-rose-455 dark:hover:bg-rose-950/30 transition cursor-pointer"
                                  title="Delete Draft Order"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {/* Bottom Row: Pipeline */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/30 p-2.5 rounded-lg dark:bg-slate-955/5 border border-slate-100/50 dark:border-white/5">
                            <span className="text-slate-400 dark:text-slate-500 font-bold text-[9px] uppercase tracking-wider">
                              Fulfillment Pipeline
                            </span>
                            <div className="flex items-center gap-4 sm:gap-6">
                              <FulfillmentCircleStep label="Admin" status={adminStatusDim} completed={adminBox?.completedQty} total={orderedQty} icon={UserCheck} />
                              <FulfillmentCircleStep label="Finance" status={financeStatusDim} completed={financeBox?.completedQty} total={orderedQty} icon={DollarSign} />
                              <FulfillmentCircleStep label="Dispatch" status={dispatchStatusDim} completed={dispatchBox?.completedQty} total={orderedQty} icon={Package} />
                              <FulfillmentCircleStep label="Delivery" status={deliveryStatusDim} completed={deliveryBox?.completedQty} total={orderedQty} icon={Truck} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination Navigation Footer */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-slate-200/60 dark:border-white/5 bg-slate-50/50 dark:bg-slate-950/20 text-slate-600 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs">
                        Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{orderStartEntry}</span> to{" "}
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{orderEndEntry}</span> of{" "}
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{totalFilteredCount}</span> entries
                      </span>
                      <span className="text-slate-350 dark:text-slate-700">|</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-medium text-slate-500">Rows per page:</span>
                        <select
                          value={orderItemsPerPage}
                          onChange={(e) => {
                            setOrderItemsPerPage(Number(e.target.value));
                            setOrderCurrentPage(1);
                          }}
                          className="rounded bg-transparent border-none py-0.5 text-xs font-semibold text-slate-750 focus:ring-0 cursor-pointer dark:text-slate-200"
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 self-center sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setOrderCurrentPage(1)}
                        disabled={orderCurrentPage === 1}
                        className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors"
                        title="First Page"
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderCurrentPage((pg) => Math.max(1, pg - 1))}
                        disabled={orderCurrentPage === 1}
                        className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors"
                        title="Previous Page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>

                      <span className="text-xs font-semibold px-2">
                        Page {orderCurrentPage} of {orderTotalPages || 1}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setOrderCurrentPage((pg) => Math.min(orderTotalPages, pg + 1))
                        }
                        disabled={orderCurrentPage === orderTotalPages || orderTotalPages === 0}
                        className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors"
                        title="Next Page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderCurrentPage(orderTotalPages)}
                        disabled={orderCurrentPage === orderTotalPages || orderTotalPages === 0}
                        className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors"
                        title="Last Page"
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Map New Product Modal */}
      {isMapModalOpen && (
        <MapNewProductModal
          isOpen={isMapModalOpen}
          onClose={() => setIsMapModalOpen(false)}
          partyId={id}
          mappedProductIds={mappedProductIds}
          createMapping={createMapping}
          isCreating={isCreating}
          party={p}
        />
      )}

      {/* Edit Mapping Modal */}
      {editMappingTarget && (
        <EditMappingModal
          mapping={editMappingTarget}
          onClose={() => setEditMappingTarget(null)}
          patchMapping={patchMapping}
          isPatching={isPatching}
        />
      )}

      {/* Add Rate Modal */}
      {addRateTarget && (
        <AddRateModal
          mapping={addRateTarget}
          onClose={() => setAddRateTarget(null)}
          addRate={addRate}
          isAddingRate={isAddingRate}
          party={p}
        />
      )}

      {/* Edit Rate Modal */}
      {editRateTarget && (
        <EditRateModal
          mapping={editRateTarget.mapping}
          rate={editRateTarget.rate}
          onClose={() => setEditRateTarget(null)}
          updateRate={updateRate}
          isUpdatingRate={isUpdatingRate}
        />
      )}

      {/* Delete Mapping Confirmation */}
      {deleteMappingTarget && (
        <ConfirmDeleteMappingModal
          mapping={deleteMappingTarget}
          onClose={() => setDeleteMappingTarget(null)}
          deleteMapping={deleteMapping}
          isDeleting={isDeleting}
        />
      )}

      {/* Delete Rate Confirmation */}
      {deleteRateTarget && (
        <ConfirmDeleteRateModal
          target={deleteRateTarget}
          onClose={() => setDeleteRateTarget(null)}
          deleteRate={deleteRate}
          isDeleting={isDeletingRate}
        />
      )}

      {/* Delete Order Confirmation */}
      <ConfirmDeleteDraftModal
        orderId={deleteOrderTarget?.id ?? null}
        orderLabel={deleteOrderTarget?.label ?? ""}
        isDeleting={isDeletingOrder}
        onClose={closeDeleteOrderModal}
        onConfirm={confirmDeleteOrderDraft}
      />
    </div>
  );
}

// ==========================================
// Sub-components: Products & Rates Modals
// ==========================================

type CatalogProduct = {
  _id?: string;
  id?: string;
  product_name?: string;
  sku?: string;
  brand?: string;
  base_price?: unknown;
  is_active?: boolean;
};

type ProductAutocompleteProps = {
  products: CatalogProduct[];
  selectedId: string;
  onChange: (id: string) => void;
  onSearchChange?: (value: string) => void;
  className?: string;
  isLoading?: boolean;
};

function ProductAutocomplete({
  products,
  selectedId,
  onChange,
  onSearchChange,
  className,
  isLoading = false,
}: ProductAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo(() => {
    return products.find((p) => String(p._id ?? p.id ?? "") === String(selectedId));
  }, [products, selectedId]);

  useEffect(() => {
    if (selectedProduct) {
      const name = String(selectedProduct.product_name || "");
      const sku = selectedProduct.sku ? ` (${selectedProduct.sku})` : "";
      setSearch(`${name}${sku}`);
    } else {
      setSearch("");
    }
  }, [selectedProduct]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products;
    return products.filter((p) => {
      const name = String(p.product_name || "").toLowerCase();
      const sku = String(p.sku || "").toLowerCase();
      const brand = String(p.brand || "").toLowerCase();
      return name.includes(q) || sku.includes(q) || brand.includes(q);
    });
  }, [products, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedProduct) {
          const name = String(selectedProduct.product_name || "");
          const sku = selectedProduct.sku ? ` (${selectedProduct.sku})` : "";
          setSearch(`${name}${sku}`);
        } else {
          setSearch("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedProduct]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            onSearchChange?.(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="Search catalog by name, SKU, or brand..."
          className={`w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600 pr-10 ${className ?? ""}`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400 dark:text-slate-500">
          <Search className="h-4 w-4" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
          {isLoading ? (
            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              Searching catalog...
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              No products found
            </div>
          ) : (
            filtered.map((p) => {
              const productId = String(p._id ?? p.id ?? "");
              const isSelected = productId === selectedId;
              const name = String(p.product_name || "Product");
              const sku = p.sku ? ` · ${p.sku}` : "";
              const brand = p.brand ? ` (${p.brand})` : "";
              return (
                <button
                  key={productId}
                  type="button"
                  onClick={() => {
                    onChange(productId);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-white/5 ${
                    isSelected
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 font-medium"
                      : "text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <span className="truncate">
                    {name}
                    {sku}
                    {brand}
                  </span>
                  <span className="ml-2 shrink-0 text-slate-500 dark:text-slate-400">
                    ₹{String(p.base_price ?? "—")}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

type MapNewProductModalProps = {
  isOpen: boolean;
  onClose: () => void;
  partyId: string;
  mappedProductIds: string[];
  createMapping: any;
  isCreating: boolean;
  party?: any;
};

function MapNewProductModal({
  onClose,
  partyId,
  mappedProductIds,
  createMapping,
  isCreating,
  party,
}: MapNewProductModalProps) {
  const [catalogSearch, setCatalogSearch] = useState("");
  const [debouncedCatalogSearch, setDebouncedCatalogSearch] = useState("");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedCatalogSearch(catalogSearch);
    }, 300);
    return () => clearTimeout(handler);
  }, [catalogSearch]);

  const catalogQuery = useMemo(() => {
    const params: Record<string, string> = { status: "active", limit: "100" };
    if (debouncedCatalogSearch.trim()) {
      params.search = debouncedCatalogSearch.trim();
    }
    return params;
  }, [debouncedCatalogSearch]);

  const { data: rawProducts, isLoading: isProductsLoading, isFetching: isProductsFetching } =
    useListProductsQuery(catalogQuery);

  const products = useMemo(() => {
    const list = pickList(rawProducts) as CatalogProduct[];
    return list.filter((p) => {
      const productId = String(p._id ?? p.id ?? "");
      return p.is_active !== false && productId && !mappedProductIds.includes(productId);
    });
  }, [rawProducts, mappedProductIds]);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [priority, setPriority] = useState("100");
  const [expectedOrderQuantity, setExpectedOrderQuantity] = useState("0");
  const [isOrderable, setIsOrderable] = useState(true);
  const [remarks, setRemarks] = useState("");

  // Rate Info
  const [hasRate, setHasRate] = useState(() => !!(party && party.sra === true));
  const [rateType, setRateType] = useState(() => (party && party.sra === true) ? "SRA" : "SR");
  const [rate, setRate] = useState("");
  const [minQty, setMinQty] = useState("1");
  const [maxQty, setMaxQty] = useState("999999");
  const [validityStart, setValidityStart] = useState(() => {
    if (party && party.sra === true) {
      const sraStart = toDateString(party.sra_from_date);
      if (sraStart) return sraStart;
    }
    return new Date().toISOString().split("T")[0];
  });
  const [validityEnd, setValidityEnd] = useState(() => {
    if (party && party.sra === true) {
      const sraEnd = toDateString(party.sra_to_date);
      if (sraEnd) return sraEnd;
    }
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return nextYear.toISOString().split("T")[0];
  });
  const [rateRemarks, setRateRemarks] = useState("");

  useEffect(() => {
    if (rateType === "SRA" && party && party.sra === true) {
      setValidityStart(toDateString(party.sra_from_date) || new Date().toISOString().split("T")[0]);
      setValidityEnd(toDateString(party.sra_to_date) || toDateString(new Date(new Date().setFullYear(new Date().getFullYear() + 1))));
    } else {
      setValidityStart(new Date().toISOString().split("T")[0]);
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      setValidityEnd(nextYear.toISOString().split("T")[0]);
    }
  }, [rateType, party]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      toast.error("Please select a product");
      return;
    }
    const payload: any = {
      party: partyId,
      product: selectedProductId,
      priority: Number(priority) || 100,
      expected_order_quantity: Number(expectedOrderQuantity) || 0,
      is_orderable: isOrderable,
      remarks: remarks.trim(),
    };

    if (hasRate) {
      if (!rate || Number(rate) < 0) {
        toast.error("Please enter a valid rate");
        return;
      }
      if (new Date(validityStart) >= new Date(validityEnd)) {
        toast.error("Validity Start date must be before Validity End date");
        return;
      }
      payload.rates = [
        {
          rate_type: rateType,
          rate: Number(rate),
          min_qty: Number(minQty) || 1,
          max_qty: Number(maxQty) || 999999,
          validity_start: validityStart,
          validity_end: validityEnd,
          remarks: rateRemarks.trim(),
        },
      ];
    }

    try {
      await createMapping(payload).unwrap();
      toast.success("Product mapped successfully!");
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0">
          <h3 className="text-md font-bold text-slate-905 dark:text-slate-50 flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-500" /> Map New Product
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition">
            <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Select Catalog Product</label>
            {isProductsLoading && products.length === 0 ? (
              <div className="text-xs text-slate-550 py-2">Loading product catalog...</div>
            ) : products.length === 0 ? (
              <div className="text-xs text-red-500 py-2 font-medium">
                {debouncedCatalogSearch.trim()
                  ? "No catalog products match your search."
                  : "All active catalog products are already mapped to this party."}
              </div>
            ) : (
              <ProductAutocomplete
                products={products}
                selectedId={selectedProductId}
                onChange={setSelectedProductId}
                onSearchChange={setCatalogSearch}
                isLoading={isProductsFetching}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Mapping Priority</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                required
                min="0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 outline-none transition focus:border-blue-600"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Expected Order Qty (EOQ)</label>
              <input
                type="number"
                value={expectedOrderQuantity}
                onChange={(e) => setExpectedOrderQuantity(e.target.value)}
                required
                min="0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 outline-none transition focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center h-full pt-2">
              <label className="flex items-center gap-2 text-sm text-slate-850 dark:text-slate-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOrderable}
                  onChange={(e) => setIsOrderable(e.target.checked)}
                  className="rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                Is Orderable
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Mapping Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="e.g. Approved under corporate tier terms"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 outline-none transition focus:border-blue-600"
            />
          </div>

          {/* Negotiated Rate section */}
          <div className="border-t border-slate-100 dark:border-white/5 pt-4 shrink-0">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-105 cursor-pointer">
              <input
                type="checkbox"
                checked={hasRate}
                onChange={(e) => setHasRate(e.target.checked)}
                className="rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              Setup Initial Negotiated Rate
            </label>

            {hasRate && (
              <div className="mt-4 p-4 rounded-xl bg-slate-50/50 dark:bg-white/5 border border-slate-150 dark:border-white/5 space-y-4 animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Rate Type</label>
                    <select
                      value={rateType}
                      onChange={(e) => setRateType(e.target.value)}
                      className="w-full rounded-lg border border-slate-250 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                    >
                      <option value="SR">Standard Rate (SR)</option>
                      <option value="SRA">Special Rate Admin (SRA)</option>
                      <option value="CR">Contract Rate (CR)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Negotiated Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      required={hasRate}
                      placeholder="e.g. 450.00"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Min Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={minQty}
                      onChange={(e) => setMinQty(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Max Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={maxQty}
                      onChange={(e) => setMaxQty(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Validity Start</label>
                    <input
                      type="date"
                      value={validityStart}
                      onChange={(e) => setValidityStart(e.target.value)}
                      required={hasRate}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Validity End</label>
                    <input
                      type="date"
                      value={validityEnd}
                      onChange={(e) => setValidityEnd(e.target.value)}
                      required={hasRate}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Rate Remarks</label>
                  <input
                    type="text"
                    value={rateRemarks}
                    onChange={(e) => setRateRemarks(e.target.value)}
                    placeholder="e.g. Promotional offer for Q2"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="p-5 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200/95 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isCreating || products.length === 0}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50"
          >
            {isCreating ? "Mapping..." : "Map Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

type EditMappingModalProps = {
  mapping: any;
  onClose: () => void;
  patchMapping: any;
  isPatching: boolean;
};

function EditMappingModal({
  mapping,
  onClose,
  patchMapping,
  isPatching,
}: EditMappingModalProps) {
  const [priority, setPriority] = useState(String(mapping.priority ?? 100));
  const [expectedOrderQuantity, setExpectedOrderQuantity] = useState(String(mapping.expected_order_quantity ?? 0));
  const [isActive, setIsActive] = useState(mapping.is_active !== false);
  const [isOrderable, setIsOrderable] = useState(mapping.is_orderable !== false);
  const [remarks, setRemarks] = useState(mapping.remarks || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await patchMapping({
        id: mapping._id,
        patch: {
          priority: Number(priority) || 0,
          expected_order_quantity: Number(expectedOrderQuantity) || 0,
          is_active: isActive,
          is_orderable: isOrderable,
          remarks: remarks.trim(),
        },
      }).unwrap();
      toast.success("Mapping updated successfully!");
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-md font-bold text-slate-905 dark:text-slate-50 flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-500" /> Edit Mapping
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition">
            <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3.5 border border-slate-100 dark:border-white/5">
            <div className="text-xs text-slate-500 dark:text-slate-400">Target Product</div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-50 mt-0.5">{mapping.product?.product_name}</div>
            <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">SKU: {mapping.product?.sku || "—"}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Mapping Priority</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                required
                min="0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Expected Order Qty (EOQ)</label>
              <input
                type="number"
                value={expectedOrderQuantity}
                onChange={(e) => setExpectedOrderQuantity(e.target.value)}
                required
                min="0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-350 cursor-pointer">
              <input
                type="checkbox"
                checked={isOrderable}
                onChange={(e) => setIsOrderable(e.target.checked)}
                className="rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              Is Orderable
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-805 dark:text-slate-355 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-slate-300 dark:border-white/10 text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              Is Active
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="Enter remarks..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
            />
          </div>
        </form>

        <div className="p-5 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPatching}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50"
          >
            {isPatching ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

type AddRateModalProps = {
  mapping: any;
  onClose: () => void;
  addRate: any;
  isAddingRate: boolean;
  party?: any;
};

function AddRateModal({
  mapping,
  onClose,
  addRate,
  isAddingRate,
  party,
}: AddRateModalProps) {
  const [rateType, setRateType] = useState(() => (party && party.sra === true) ? "SRA" : "SR");
  const [rate, setRate] = useState("");
  const [minQty, setMinQty] = useState("1");
  const [maxQty, setMaxQty] = useState("999999");
  const [validityStart, setValidityStart] = useState(() => {
    if (party && party.sra === true) {
      const sraStart = toDateString(party.sra_from_date);
      if (sraStart) return sraStart;
    }
    return new Date().toISOString().split("T")[0];
  });
  const [validityEnd, setValidityEnd] = useState(() => {
    if (party && party.sra === true) {
      const sraEnd = toDateString(party.sra_to_date);
      if (sraEnd) return sraEnd;
    }
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return nextYear.toISOString().split("T")[0];
  });
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (rateType === "SRA" && party && party.sra === true) {
      setValidityStart(toDateString(party.sra_from_date) || new Date().toISOString().split("T")[0]);
      setValidityEnd(toDateString(party.sra_to_date) || toDateString(new Date(new Date().setFullYear(new Date().getFullYear() + 1))));
    } else {
      setValidityStart(new Date().toISOString().split("T")[0]);
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      setValidityEnd(nextYear.toISOString().split("T")[0]);
    }
  }, [rateType, party]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rate || Number(rate) < 0) {
      toast.error("Please enter a valid rate");
      return;
    }
    if (new Date(validityStart) >= new Date(validityEnd)) {
      toast.error("Validity Start date must be before Validity End date");
      return;
    }

    try {
      const pId = typeof mapping.party === "object" ? mapping.party?._id || mapping.party?.id : mapping.party;
      const prId = typeof mapping.product === "object" ? mapping.product?._id || mapping.product?.id : mapping.product;
      await addRate({
        id: mapping._id,
        body: {
          party: pId,
          product: prId,
          rate_type: rateType,
          rate: Number(rate),
          min_qty: Number(minQty) || 1,
          max_qty: Number(maxQty) || 999999,
          validity_start: validityStart,
          validity_end: validityEnd,
          remarks: remarks.trim(),
        },
      }).unwrap();
      toast.success("Negotiated rate tier added successfully!");
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-md font-bold text-slate-905 dark:text-slate-50 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-500" /> Add Custom Rate Tier
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition">
            <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/5">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Adding pricing tier for:</div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-50">{mapping.product?.product_name}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Rate Type</label>
              <select
                value={rateType}
                onChange={(e) => setRateType(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              >
                <option value="SR">Standard Rate (SR)</option>
                <option value="SRA">Special Rate Admin (SRA)</option>
                <option value="CR">Contract Rate (CR)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Price (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
                placeholder="e.g. 480.00"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Min Quantity</label>
              <input
                type="number"
                min="1"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Max Quantity</label>
              <input
                type="number"
                min="1"
                value={maxQty}
                onChange={(e) => setMaxQty(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Validity Start</label>
              <input
                type="date"
                value={validityStart}
                onChange={(e) => setValidityStart(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Validity End</label>
              <input
                type="date"
                value={validityEnd}
                onChange={(e) => setValidityEnd(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Special tier for Q2 contract"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
            />
          </div>
        </form>

        <div className="p-5 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isAddingRate}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50"
          >
            {isAddingRate ? "Adding..." : "Add Price Tier"}
          </button>
        </div>
      </div>
    </div>
  );
}

type EditRateModalProps = {
  mapping: any;
  rate: any;
  onClose: () => void;
  updateRate: any;
  isUpdatingRate: boolean;
};

function EditRateModal({
  mapping,
  rate,
  onClose,
  updateRate,
  isUpdatingRate,
}: EditRateModalProps) {
  const [rateVal, setRateVal] = useState(String(rate.rate ?? ""));
  const [minQty, setMinQty] = useState(String(rate.min_qty ?? 1));
  const [maxQty, setMaxQty] = useState(String(rate.max_qty ?? 999999));
  const [validityStart, setValidityStart] = useState(() => {
    if (!rate.validity_start) return "";
    return new Date(rate.validity_start).toISOString().split("T")[0];
  });
  const [validityEnd, setValidityEnd] = useState(() => {
    if (!rate.validity_end) return "";
    return new Date(rate.validity_end).toISOString().split("T")[0];
  });
  const [status, setStatus] = useState(rate.status || "active");
  const [remarks, setRemarks] = useState(rate.remarks || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateVal || Number(rateVal) < 0) {
      toast.error("Please enter a valid rate");
      return;
    }
    if (new Date(validityStart) >= new Date(validityEnd)) {
      toast.error("Validity Start date must be before Validity End date");
      return;
    }

    try {
      await updateRate({
        rateId: rate._id,
        patch: {
          rate: Number(rateVal),
          min_qty: Number(minQty) || 1,
          max_qty: Number(maxQty) || 999999,
          validity_start: validityStart,
          validity_end: validityEnd,
          status,
          remarks: remarks.trim(),
        },
      }).unwrap();
      toast.success("Rate tier updated successfully!");
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-md font-bold text-slate-905 dark:text-slate-50 flex items-center gap-2">
            <Edit className="h-5 w-5 text-blue-500" /> Edit Rate Tier
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition">
            <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-slate-550 dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-white/5">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Editing rate tier for:</div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-50">{mapping.product?.product_name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">Type: {rate.rate_type}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Rate Price (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={rateVal}
                onChange={(e) => setRateVal(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Min Quantity</label>
              <input
                type="number"
                min="1"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Max Quantity</label>
              <input
                type="number"
                min="1"
                value={maxQty}
                onChange={(e) => setMaxQty(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Validity Start</label>
              <input
                type="date"
                value={validityStart}
                onChange={(e) => setValidityStart(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Validity End</label>
              <input
                type="date"
                value={validityEnd}
                onChange={(e) => setValidityEnd(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Remarks..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-905 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 focus:outline-none"
            />
          </div>
        </form>

        <div className="p-5 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isUpdatingRate}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50"
          >
            {isUpdatingRate ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ConfirmDeleteMappingModalProps = {
  mapping: any;
  onClose: () => void;
  deleteMapping: any;
  isDeleting: boolean;
};

function ConfirmDeleteMappingModal({
  mapping,
  onClose,
  deleteMapping,
  isDeleting,
}: ConfirmDeleteMappingModalProps) {
  const handleConfirm = async () => {
    try {
      await deleteMapping(mapping._id).unwrap();
      toast.success("Mapping deleted successfully!");
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-5 flex items-start gap-3">
          <div className="p-2 bg-red-50 dark:bg-red-500/10 text-red-600 rounded-full shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-md font-bold text-slate-905 dark:text-slate-50">Delete Product Mapping?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Are you sure you want to remove the custom product mapping for{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {mapping.product?.product_name || "this product"}
              </span>
              ?
            </p>
            <p className="text-xs text-red-505 dark:text-red-400 mt-1 font-semibold">
              Warning: This will also soft-delete all negotiated rates configured under this product mapping.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200/95 px-3 py-1.5 text-xs font-semibold text-slate-850 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition dark:bg-red-500 dark:hover:bg-red-400"
          >
            {isDeleting ? "Deleting..." : "Delete Mapping"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ConfirmDeleteRateModalProps = {
  target: { mappingId: string; rateId: string; rateLabel: string };
  onClose: () => void;
  deleteRate: any;
  isDeleting: boolean;
};

function ConfirmDeleteRateModal({
  target,
  onClose,
  deleteRate,
  isDeleting,
}: ConfirmDeleteRateModalProps) {
  const handleConfirm = async () => {
    try {
      await deleteRate(target.rateId).unwrap();
      toast.success("Rate tier deleted successfully!");
      onClose();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        <div className="p-5 flex items-start gap-3">
          <div className="p-2 bg-red-50 dark:bg-red-500/10 text-red-600 rounded-full shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-md font-bold text-slate-905 dark:text-slate-50">Delete Rate Tier?</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Are you sure you want to delete the rate tier for{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {target.rateLabel}
              </span>
              ?
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-850 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition dark:bg-red-500 dark:hover:bg-red-400"
          >
            {isDeleting ? "Deleting..." : "Delete Rate"}
          </button>
        </div>
      </div>
    </div>
  );
}
