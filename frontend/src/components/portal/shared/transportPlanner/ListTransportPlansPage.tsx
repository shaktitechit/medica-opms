"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";

import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { ListEntitySearchPanel } from "@/components/portal/shared/orderList/ListEntitySearchPanel";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { OrderListBottomTabStrip } from "@/components/portal/shared/orderList/OrderListBottomTabStrip";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeleteTransportPlanMutation,
  useListTransportPlansQuery,
} from "@/store/api";
import { ConfirmDeleteTransportPlanModal } from "./ConfirmDeleteTransportPlanModal";
import {
  TRANSPORT_PLAN_STATUS_TABS,
  agentLabel,
  canEditPlan,
  formatPlanDate,
  planIdOf,
  renderPlanStatusBadge,
} from "./transportPlanUtils";

type ListTransportPlansPageProps = {
  portalHome?: string;
};

export default function ListTransportPlansPage({
  portalHome,
}: ListTransportPlansPageProps) {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawPortal =
    typeof params.portal === "string"
      ? params.portal
      : Array.isArray(params.portal)
        ? params.portal[0]
        : "account";
  const base = portalHome || `/${rawPortal}`;
  const canCreate = rawPortal === "account" || rawPortal === "admin" || rawPortal === "super_admin";
  const isDispatch = rawPortal === "dispatch";

  const initialStatus = searchParams.get("status") || "all";
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const queryArgs = useMemo(() => {
    const q: Record<string, string | number | undefined> = {
      page: currentPage,
      limit: itemsPerPage,
    };
    if (statusFilter && statusFilter !== "all") q.status = statusFilter;
    if (dateFrom) q.from = dateFrom;
    if (dateTo) q.to = dateTo;
    if (searchQuery.trim()) q.search = searchQuery.trim();
    return q;
  }, [currentPage, itemsPerPage, statusFilter, dateFrom, dateTo, searchQuery]);

  const { data, isLoading, isFetching, isError, refetch } =
    useListTransportPlansQuery(queryArgs);
  const [deletePlan, { isLoading: isDeleting }] = useDeleteTransportPlanMutation();

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 0;

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deletePlan(deleteTarget.id).unwrap();
      toast.success("Transport plan deleted");
      setDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [deleteTarget, deletePlan]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Transport Planner
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isDispatch
              ? "Execute submitted transport plans and update consignments"
              : "Group ready orders into transport plans by date and agent"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`${base}/transport-planner/calendar`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Calendar
          </Link>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {canCreate ? (
            <Link
              href={`${base}/transport-planner/new`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              New plan
            </Link>
          ) : null}
        </div>
      </div>

      <ListEntitySearchPanel
        searchQuery={searchQuery}
        onSearchChange={(v) => {
          setSearchQuery(v);
          setCurrentPage(1);
        }}
        desktopPlaceholder="Search transport agent…"
        mobilePlaceholder="Search…"
      />

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
          />
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <PortalBusyOverlay active={isLoading || isFetching} message="Loading transport plans…" />
        {isError ? (
          <div className="p-6 text-sm text-rose-600">Failed to load transport plans.</div>
        ) : rows.length === 0 && !isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">No transport plans found.</div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950/80">
              <tr>
                <th className="px-3 py-2 font-semibold">Dispatch date</th>
                <th className="px-3 py-2 font-semibold">Transport agent</th>
                <th className="px-3 py-2 font-semibold">Orders</th>
                <th className="px-3 py-2 font-semibold">Packages</th>
                <th className="px-3 py-2 font-semibold">Weight</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {rows.map((row) => {
                const id = planIdOf(row);
                return (
                  <tr key={id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                    <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {formatPlanDate(row.plan_date)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                      {agentLabel(row.transport_agent)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{row.order_count ?? 0}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.total_packages ?? 0}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.total_weight ?? 0}</td>
                    <td className="px-3 py-2.5">{renderPlanStatusBadge(row.status)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`${base}/transport-planner/${id}`}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </Link>
                        {canCreate && canEditPlan(row.status) ? (
                          <>
                            <Link
                              href={`${base}/transport-planner/${id}/edit`}
                              className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  id,
                                  label: `${formatPlanDate(row.plan_date)} · ${agentLabel(row.transport_agent)}`,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <OrderListPaginationBar
        startEntry={total === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
        endEntry={Math.min(currentPage * itemsPerPage, total)}
        totalEntries={total}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={(n) => {
          setItemsPerPage(n);
          setCurrentPage(1);
        }}
        currentPage={currentPage}
        totalPages={Math.max(pages, 1)}
        onPageChange={setCurrentPage}
      />

      <OrderListBottomTabStrip
        tabs={TRANSPORT_PLAN_STATUS_TABS}
        activeTab={statusFilter}
        onTabChange={(id) => {
          setStatusFilter(id);
          setCurrentPage(1);
        }}
        filteredCount={rows.length}
        isFetching={isFetching}
        searchQuery={searchQuery}
        onClearSearch={() => setSearchQuery("")}
        priorityFilter="all"
        onPriorityFilterChange={() => {}}
        filterLabel="Status"
        filterOptions={[{ value: "all", label: "All" }]}
        showReset={Boolean(searchQuery || dateFrom || dateTo || statusFilter !== "all")}
        onReset={() => {
          setSearchQuery("");
          setDateFrom("");
          setDateTo("");
          setStatusFilter("all");
          setCurrentPage(1);
        }}
      />

      <ConfirmDeleteTransportPlanModal
        planId={deleteTarget?.id ?? null}
        planLabel={deleteTarget?.label ?? ""}
        isDeleting={isDeleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
