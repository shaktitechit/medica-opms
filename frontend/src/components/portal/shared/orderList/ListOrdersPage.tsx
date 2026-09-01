"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
  LayoutDashboard,
  Plus,
  Receipt,
  RefreshCw,
  TableProperties,
  Trash2,
  TrendingUp,
  Truck,
} from "lucide-react";

import TransportPlanModal from "../orderDetail/modals/TransportPlanModal";

import { ConfirmDeleteDraftModal } from "@/components/portal/sales/components/modals/ConfirmDeleteDraftModal";
import { OrderDetailModal } from "@/components/portal/sales/components/modals/OrderDetailModal";
import {
  buildPartyNameById,
  buildPartySraById,
  checkOrderPartySra,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import {
  filterOrdersForSalesUser,
  getOrderTabCategory,
  normalizeSalesTabFromUrl,
  SALES_ORDER_TABS,
  type SalesOrderTabCategory,
} from "@/components/portal/sales/orderUtils";
import { GoogleSheetAnalyticsModal } from "@/components/portal/shared/GoogleSheetAnalyticsModal";
import { GoogleSheetOrdersModal } from "./GoogleSheetOrdersModal";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { OrderDueSheetBadge } from "@/components/portal/shared/OrderDueSheetBadge";
import { OrderFlagBadge } from "@/components/portal/shared/OrderFlagBadge";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import {
  buildUserNameById,
  resolveUserDisplay,
} from "@/components/portal/shared/userDisplay";
import { SuperAdminOrdersSheetModal } from "@/components/portal/super_admin/order/SuperAdminOrdersSheetModal";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/store/hooks";
import {
  useDeleteOrderMutation,
  useListOrdersQuery,
  useListPartiesQuery,
  useListUsersQuery,
  useListTransportAgentsQuery,
  useListTransportsQuery,
  useListEligibleTransportOrdersQuery,
} from "@/store/api";

import { agentLabel } from "@/components/portal/shared/transportPlanner/transportPlanUtils";

import { OrderListBottomTabStrip } from "./OrderListBottomTabStrip";
import {
  buildOrderListTabCounts,
  filterListOrders,
} from "./filterListOrders";
import {
  formatDateShort,
  formatDateTime,
  formatMoney,
  orderKey,
  renderPendingApprovalBadge,
  renderPriorityBadge,
  renderWorkflowStatusBadge,
  type OrderListRow,
} from "./orderListDisplay";
import { OrderListPaginationBar } from "./OrderListPaginationBar";
import { OrderListSearchDatePanel } from "./OrderListSearchDatePanel";
import type {
  ListOrdersPageConfig,
  ListOrdersTabId,
} from "./listOrdersPageConfig";
import {
  getOrderWorkflowTabCategory,
  ORDER_PRIORITY_TABS,
  ORDER_WORKFLOW_TABS,
  workflowTabQueryParams,
  type OrderWorkflowTabCategory,
} from "./orderWorkflowTabs";
import { UnbilledOrdersModal } from "./UnbilledOrdersModal";
import { useOrderListUrlState } from "./useOrderListUrlState";
import { useOrderWorkflowCategoryOptions } from "./useOrderWorkflowCategoryOptions";

type ListOrdersPageProps = {
  config: ListOrdersPageConfig;
};

export default function ListOrdersPage({ config }: ListOrdersPageProps) {
  const router = useRouter();
  const authUser = useAppSelector((state) => state.auth.user);
  const {
    portalHome,
    title,
    subtitle,
    defaultTab,
    flagDepartment,
    showDueSheetBadge,
    showFlagBadge,
    showPricing,
    scopeToSalesUser,
    includeDraftTab,
    headerActions,
    createDraftLabel = "Draft Order",
    emptyNoOrdersHint,
    accents,
    sheetPortal,
    allowDraftDelete,
    allowSuperAdminEdit,
    useSuperAdminSheet,
  } = config;

  const normalizeSalesTab = useCallback(
    (value: string | null, fallback: ListOrdersTabId): ListOrdersTabId =>
      normalizeSalesTabFromUrl(value, fallback as SalesOrderTabCategory),
    [],
  );

  const {
    viewBy,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    priorityFilter,
    setPriorityFilter,
    dateFilter,
    handleDateFilterChange,
    customDateFrom,
    handleCustomDateFromChange,
    customDateTo,
    handleCustomDateToChange,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    handleResetFilters,
    showReset,
  } = useOrderListUrlState({
    defaultTab,
    includeDraftTab,
    normalizeTab: includeDraftTab ? normalizeSalesTab : undefined,
  });

  const workflowTabs = includeDraftTab ? SALES_ORDER_TABS : ORDER_WORKFLOW_TABS;

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isUnbilledOrdersOpen, setIsUnbilledOrdersOpen] = useState(false);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const [deleteOrder, { isLoading: isDeletingOrder }] = useDeleteOrderMutation();

  // Sales: all portfolio orders (incl. drafts). Others: shared non-draft pool
  // (same RTK cache as Quick Access / Google Sheet — search is client-side).
  const queryParams = useMemo(() => {
    if (includeDraftTab) return {};
    return workflowTabQueryParams(
      activeTab === "draft" ? "all" : (activeTab as OrderWorkflowTabCategory),
    );
  }, [activeTab, includeDraftTab]);

  const { data, isLoading, isFetching, isError, refetch } =
    useListOrdersQuery(queryParams);
  const partiesQ = useListPartiesQuery({});
  const salesUsersQ = useListUsersQuery({ department: "sales" });
  const categoryOptions = useOrderWorkflowCategoryOptions();

  const orders = useMemo(() => {
    const picked = pickOrders(data) as OrderListRow[];
    if (!scopeToSalesUser) return picked;
    return filterOrdersForSalesUser(picked, authUser) as OrderListRow[];
  }, [authUser, data, scopeToSalesUser]);

  const transportsQ = useListTransportsQuery({});
  const eligibleTransportQ = useListEligibleTransportOrdersQuery({ limit: 1000 });
  const agentsQ = useListTransportAgentsQuery({});

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    const list = Array.isArray(agentsQ.data) ? agentsQ.data : [];
    for (const a of list) {
      if (!a || typeof a !== "object") continue;
      const id = String(a._id || a.id || "");
      const name = a.agent_name || a.agent_code || id;
      if (id && name) map.set(id, name);
    }
    return map;
  }, [agentsQ.data]);

  const resolveAgentName = useCallback(
    (agentVal: unknown): string => {
      if (!agentVal) return "";
      const label = agentLabel(agentVal as any);
      if (label && label !== "—" && !/^[0-9a-fA-F]{24}$/.test(label)) {
        return label;
      }
      const rawId =
        typeof agentVal === "string"
          ? agentVal
          : String((agentVal as { _id?: unknown; id?: unknown })?._id ?? (agentVal as { id?: unknown })?.id ?? "");
      if (rawId && agentNameById.has(rawId)) {
        return agentNameById.get(rawId)!;
      }
      return label !== "—" ? label : "";
    },
    [agentNameById],
  );

  const getActiveTransportInfoForOrder = useCallback((orderId: string) => {
    const orderTransports = (transportsQ.data && Array.isArray(transportsQ.data) ? transportsQ.data : []).filter(
      (t: any) => String(t?.order?._id || t?.order?.id || t?.order || "") === orderId
    );

    for (const t of orderTransports) {
      if (!t || typeof t !== "object") continue;
      const row = t as Record<string, unknown>;
      if (row.shipment_status === "cancelled" || row.status === "cancelled") continue;
      const agent = row.transport_agent;
      const date = row.dispatch_date || row.expected_delivery_date;
      const resolvedName = resolveAgentName(agent);
      if (resolvedName || date) {
        return {
          agentName: resolvedName || undefined,
          scheduledDate: date ? String(date) : undefined,
        };
      }
    }

    const eligibleOrders = eligibleTransportQ.data?.data ?? [];
    const match = eligibleOrders.find((r) => String(r._id || r.id || "") === orderId);
    if (match) {
      const plan = match.transport_plan;
      const shipment = match.transport;
      if (plan || shipment) {
        const agent = shipment?.transport_agent || plan?.transport_agent;
        const date = shipment?.dispatch_date || plan?.plan_date;
        const resolvedName = resolveAgentName(agent);
        if (resolvedName || date) {
          return {
            agentName: resolvedName || undefined,
            scheduledDate: date ? String(date) : undefined,
          };
        }
      }
    }

    return null;
  }, [transportsQ.data, eligibleTransportQ.data, resolveAgentName]);

  const [transportPlanOrderId, setTransportPlanOrderId] = useState<string | null>(null);

  const selectedTransportOrder = useMemo(() => {
    if (!transportPlanOrderId) return null;
    return orders.find((o) => orderKey(o) === transportPlanOrderId) || null;
  }, [transportPlanOrderId, orders]);

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );

  const partySraById = useMemo(
    () => buildPartySraById(partiesQ.data),
    [partiesQ.data],
  );

  const salesUserNameById = useMemo(
    () => buildUserNameById(salesUsersQ.data),
    [salesUsersQ.data],
  );

  /** Same per-tab counts as dashboard Quick Access / Google Sheet. */
  const tabCounts = useMemo(
    () => buildOrderListTabCounts(orders, categoryOptions, includeDraftTab),
    [orders, categoryOptions, includeDraftTab],
  );

  /** Shared filter pipeline with GoogleSheetOrdersModal (`filterListOrders`). */
  const filteredOrders = useMemo(
    () =>
      filterListOrders<OrderListRow>({
        orders,
        activeTab,
        searchQuery,
        priorityFilter,
        dateFilter,
        customDateFrom,
        customDateTo,
        categoryOptions,
        partyNameById,
        includeDraftTab,
      }),
    [
      orders,
      searchQuery,
      activeTab,
      categoryOptions,
      priorityFilter,
      partyNameById,
      dateFilter,
      customDateFrom,
      customDateTo,
      includeDraftTab,
    ],
  );

  const totalEntries = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / itemsPerPage) || 1);

  // Keep current page in range when filters shrink the result set.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages, setCurrentPage]);

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(start, start + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const startEntry =
    totalEntries > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, totalEntries);

  const isPendingTab =
    activeTab === "pending_admin_approval" ||
    activeTab === "due_sheet_pending" ||
    activeTab === "pending_finance_approval" ||
    activeTab === "pending_account_approval";

  const hasAction = useCallback(
    (action: (typeof headerActions)[number]) => headerActions.includes(action),
    [headerActions],
  );

  const closeDeleteModal = useCallback(() => setDeleteTarget(null), []);

  const confirmDeleteDraft = useCallback(async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    try {
      await deleteOrder(id).unwrap();
      toast.success(mutationSuccessCopy("deleteOrder"));
      setDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [deleteOrder, deleteTarget]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <PortalBusyOverlay active={isLoading} message="Loading orders…" />

      {allowDraftDelete && (
        <ConfirmDeleteDraftModal
          orderId={deleteTarget?.id ?? null}
          orderLabel={deleteTarget?.label ?? ""}
          isDeleting={isDeletingOrder}
          onClose={closeDeleteModal}
          onConfirm={confirmDeleteDraft}
        />
      )}

      <div
        className={`relative shrink-0 overflow-hidden rounded-xl border px-4 py-2.5 shadow-sm ${accents.strip}`}
      >
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 max-w-xl text-xs text-slate-600 dark:text-slate-400">
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasAction("unbilled") && (
              <button
                type="button"
                onClick={() => setIsUnbilledOrdersOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-cyan-300 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 shadow-sm transition hover:bg-cyan-100 dark:border-cyan-700/50 dark:bg-cyan-950/40 dark:text-cyan-400 dark:hover:bg-cyan-900/30"
                title="View unbilled / partially billed orders (approved qty greater than dispatched qty)"
              >
                <Receipt className="h-3 w-3" />
                Un Billed Orders
              </button>
            )}
            {hasAction("sheet") && (
              <button
                type="button"
                onClick={() => setIsSheetOpen(true)}
                className={
                  useSuperAdminSheet || sheetPortal === "admin"
                    ? "inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
                    : "inline-flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                }
                title={
                  useSuperAdminSheet
                    ? "Open super-admin live orders sheet (bypass)"
                    : "Open spreadsheet view"
                }
              >
                {useSuperAdminSheet || sheetPortal === "admin" ? (
                  <FileText
                    className={`h-3 w-3 ${
                      useSuperAdminSheet
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-purple-600 dark:text-purple-400"
                    }`}
                  />
                ) : (
                  <TableProperties className="h-3 w-3" />
                )}
                {useSuperAdminSheet ? "Orders Sheet" : "Sheet"}
              </button>
            )}
            {hasAction("analytics") && (
              <button
                type="button"
                onClick={() => setIsAnalyticsOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
                title="View analytics"
              >
                <TrendingUp className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                Analytics
              </button>
            )}
            {hasAction("refresh") && (
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
                title="Reload orders list"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            )}
            {hasAction("dashboard") && (
              <Link
                href={portalHome}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
              >
                <LayoutDashboard className="h-3 w-3" />
                Dashboard
              </Link>
            )}
            {hasAction("createDraft") && (
              <Link
                href={`${portalHome}/create-order`}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98] dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                <Plus className="h-3 w-3" />
                {createDraftLabel}
              </Link>
            )}
          </div>
        </div>
      </div>

      {partiesQ.isError && (
        <div className="shrink-0 rounded-lg border border-amber-200/50 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400">
          Party directory failed to load — names may show as shortened IDs.
        </div>
      )}

      <OrderListSearchDatePanel
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        dateFilter={dateFilter}
        onDateFilterChange={handleDateFilterChange}
        customDateFrom={customDateFrom}
        customDateTo={customDateTo}
        onCustomDateFromChange={handleCustomDateFromChange}
        onCustomDateToChange={handleCustomDateToChange}
        searchFocusClass={accents.searchFocus}
        compact
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {isError && (
          <div className="px-4 py-16 text-center">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load orders
            </h3>
            <p className="mt-1.5 text-xs text-slate-500">
              Please check your database connection and try again.
            </p>
          </div>
        )}

        {!isLoading && !isError && totalEntries === 0 && (
          <div className="px-4 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-xl text-slate-400 dark:border-white/5 dark:bg-slate-950">
              📋
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
              No orders found
            </h3>
            <p className="mx-auto mt-1.5 max-w-xs text-xs text-slate-500">
              {orders.length === 0
                ? emptyNoOrdersHint ||
                  "No orders exist in the database system."
                : "No orders match your search and filter parameters."}
            </p>
            {orders.length === 0 && hasAction("createDraft") && (
              <Link
                href={`${portalHome}/create-order`}
                className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98] dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                <Plus className="h-3.5 w-3.5" />
                {createDraftLabel}
              </Link>
            )}
          </div>
        )}

        {!isLoading && !isError && totalEntries > 0 && (
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

            <div className="min-h-0 flex-1 overflow-auto">
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
                    {showPricing && (
                      <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                        Grand Total
                      </th>
                    )}
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                      Order Date
                    </th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                      Billing Date
                    </th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                      Expected Delivery
                    </th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                      Priority
                    </th>
                    <th className="px-4 py-3 font-semibold uppercase tracking-wider text-slate-500">
                      Transport
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
                  {paginatedOrders.map((o) => {
                    const id = orderKey(o);
                    const ref =
                      typeof o.order_no === "string"
                        ? o.order_no
                        : typeof o.order_number === "string"
                          ? o.order_number
                          : id || "—";
                    const total = Number(o.grand_total ?? o.total ?? 0);
                    const pri =
                      typeof o.priority === "string" ? o.priority : "normal";
                    const transportInfo = id ? getActiveTransportInfoForOrder(id) : null;
                    const partyLabel = resolveOrderCounterparty(
                      o as Record<string, unknown>,
                      partyNameById,
                    );
                    const salesPersonLabel = resolveUserDisplay(
                      o.assigned_sales_user,
                      salesUserNameById,
                    );
                    const statusRaw = deriveOrderWorkflowStatus(o) || "draft";
                    const isDraftRow = statusRaw === "draft";
                    const orderDateStr = formatDateTime(
                      o.order_date ?? o.created_at ?? o.createdAt,
                    );
                    const billingDateStr = formatDateTime(
                      o.billing_date,
                    );
                    const expectedDeliveryStr = formatDateShort(
                      o.expected_delivery_date,
                    );

                    return (
                      <tr
                        key={id || ref}
                        className="cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-white/5"
                        onClick={() => {
                          if (id) router.push(`${portalHome}/order/${id}`);
                        }}
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono font-bold">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (id) setViewOrderId(id);
                            }}
                            className="font-bold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            {ref}
                          </button>
                          {(showDueSheetBadge || showFlagBadge) && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {showDueSheetBadge && (
                                <OrderDueSheetBadge
                                  uploaded={o.due_sheet_uploaded}
                                />
                              )}
                              {showFlagBadge && (
                                <OrderFlagBadge
                                  orderId={o._id || o.id}
                                  department={flagDepartment}
                                />
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="break-words font-semibold text-slate-800 dark:text-slate-200">
                            {partyLabel}
                          </span>
                          {checkOrderPartySra(
                            o as Record<string, unknown>,
                            partySraById,
                          ) && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400">
                              SRA
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="break-words font-medium text-slate-700 dark:text-slate-300">
                            {salesPersonLabel}
                          </span>
                        </td>
                        {showPricing && (
                          <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums text-slate-900 dark:text-slate-50">
                            ₹{formatMoney(Number.isFinite(total) ? total : 0)}
                          </td>
                        )}
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-500 dark:text-slate-400">
                          {orderDateStr}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-500 dark:text-slate-400">
                          {billingDateStr}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-500 dark:text-slate-400">
                          {expectedDeliveryStr}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {renderPriorityBadge(pri)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {id && (
                            transportInfo?.agentName || transportInfo?.scheduledDate ? (
                              <div className="inline-flex flex-col items-start text-3xs font-medium text-amber-700 bg-amber-50/70 border border-amber-200/50 rounded px-1.5 py-0.5 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30 text-left shrink-0">
                                {transportInfo.agentName && (
                                  <span className="truncate max-w-[120px]" title={transportInfo.agentName}>
                                    Agent: <b>{transportInfo.agentName}</b>
                                  </span>
                                )}
                                {transportInfo.scheduledDate && (
                                  <span>
                                    Date: <b>{formatDateShort(transportInfo.scheduledDate)}</b>
                                  </span>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTransportPlanOrderId(id);
                                }}
                                className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-400 dark:hover:bg-blue-950/40"
                                title="Transport Plan"
                              >
                                <Truck className="h-3.5 w-3.5" />
                                <span>Plan</span>
                              </button>
                            )
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {isPendingTab
                            ? renderPendingApprovalBadge(o)
                            : renderWorkflowStatusBadge(
                                includeDraftTab
                                  ? getOrderTabCategory(o, categoryOptions)
                                  : (getOrderWorkflowTabCategory(
                                      o,
                                      categoryOptions,
                                    ) ?? "open_dispatched"),
                              )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (id) setViewOrderId(id);
                              }}
                              className="rounded border border-slate-200 px-2 py-1 font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                            >
                              View
                            </button>
                            {allowDraftDelete && isDraftRow && id && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget({ id, label: ref });
                                }}
                                disabled={isDeletingOrder}
                                className="inline-flex cursor-pointer items-center justify-center rounded border border-slate-200 p-1 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                title="Delete Draft Order"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
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

      {viewBy === "priority" ? (
        <OrderListBottomTabStrip
          tabs={ORDER_PRIORITY_TABS}
          activeTab={priorityFilter}
          onTabChange={(tabId) => {
            setPriorityFilter(tabId);
          }}
          filteredCount={totalEntries}
          isFetching={isFetching}
          searchQuery={searchQuery}
          onClearSearch={() => setSearchQuery("")}
          priorityFilter={activeTab}
          onPriorityFilterChange={(val) => {
            setActiveTab(val as ListOrdersTabId);
          }}
          filterLabel="Workflow"
          filterOptions={workflowTabs.map((tab) => ({
            value: tab.id,
            label: tab.label,
          }))}
          showReset={showReset}
          onReset={handleResetFilters}
          accentActiveClass={accents.tabActive}
          searchResultAccentClass={accents.searchResult}
          countBadgeClass={accents.countBadge}
          compact
        />
      ) : (
        <OrderListBottomTabStrip
          tabs={workflowTabs}
          activeTab={activeTab}
          onTabChange={(tabId) => {
            setActiveTab(tabId as ListOrdersTabId);
          }}
          filteredCount={totalEntries}
          tabCounts={tabCounts}
          isFetching={isFetching}
          searchQuery={searchQuery}
          onClearSearch={() => setSearchQuery("")}
          priorityFilter={priorityFilter}
          onPriorityFilterChange={setPriorityFilter}
          showReset={showReset}
          onReset={handleResetFilters}
          accentActiveClass={accents.tabActive}
          searchResultAccentClass={accents.searchResult}
          countBadgeClass={accents.countBadge}
          compact
        />
      )}

      {hasAction("unbilled") && (
        <UnbilledOrdersModal
          isOpen={isUnbilledOrdersOpen}
          onClose={() => setIsUnbilledOrdersOpen(false)}
          orders={orders}
          categoryOptions={categoryOptions}
          partyNameById={partyNameById}
          portalBasePath={portalHome}
        />
      )}

      {hasAction("sheet") &&
        sheetPortal &&
        (useSuperAdminSheet ? (
          <SuperAdminOrdersSheetModal
            isOpen={isSheetOpen}
            onClose={() => setIsSheetOpen(false)}
            partyNameById={partyNameById}
            config={config}
            orders={orders}
            categoryOptions={categoryOptions}
            isOrdersFetching={isFetching || isLoading}
            onRefetchOrders={() => void refetch()}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            activeTab={
              (activeTab === "draft" ? "all" : activeTab) as ListOrdersTabId
            }
            onActiveTabChange={(tab) => setActiveTab(tab)}
            priorityFilter={priorityFilter}
            onPriorityFilterChange={setPriorityFilter}
            dateFilter={dateFilter}
            onDateFilterChange={handleDateFilterChange}
            customDateFrom={customDateFrom}
            onCustomDateFromChange={handleCustomDateFromChange}
            customDateTo={customDateTo}
            onCustomDateToChange={handleCustomDateToChange}
            showReset={showReset}
            onResetFilters={handleResetFilters}
          />
        ) : (
          <GoogleSheetOrdersModal
            isOpen={isSheetOpen}
            onClose={() => setIsSheetOpen(false)}
            partyNameById={partyNameById}
            config={config}
            orders={orders}
            categoryOptions={categoryOptions}
            isOrdersFetching={isFetching || isLoading}
            onRefetchOrders={() => void refetch()}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            activeTab={
              (activeTab === "draft" ? "all" : activeTab) as ListOrdersTabId
            }
            onActiveTabChange={(tab) => setActiveTab(tab)}
            priorityFilter={priorityFilter}
            onPriorityFilterChange={setPriorityFilter}
            dateFilter={dateFilter}
            customDateFrom={customDateFrom}
            customDateTo={customDateTo}
            showReset={showReset}
            onResetFilters={handleResetFilters}
          />
        ))}

      {hasAction("analytics") && sheetPortal && (
        <GoogleSheetAnalyticsModal
          isOpen={isAnalyticsOpen}
          onClose={() => setIsAnalyticsOpen(false)}
          partyNameById={partyNameById}
          portal={sheetPortal === "super_admin" ? "super_admin" : sheetPortal}
        />
      )}

      {viewOrderId && (
        <OrderDetailModal
          orderId={viewOrderId}
          partyNameById={partyNameById}
          onClose={() => setViewOrderId(null)}
        />
      )}

      {transportPlanOrderId && selectedTransportOrder && (
        <TransportPlanModal
          isOpen={!!transportPlanOrderId}
          onClose={() => setTransportPlanOrderId(null)}
          orderId={transportPlanOrderId}
          orderNo={
            typeof selectedTransportOrder.order_no === "string"
              ? selectedTransportOrder.order_no
              : typeof selectedTransportOrder.order_number === "string"
                ? selectedTransportOrder.order_number
                : transportPlanOrderId.slice(0, 8)
          }
          custLabel={resolveOrderCounterparty(
            selectedTransportOrder as Record<string, unknown>,
            partyNameById,
          )}
        />
      )}
    </div>
  );
}
