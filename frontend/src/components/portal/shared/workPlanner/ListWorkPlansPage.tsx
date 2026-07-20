"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";

import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { ListEntitySearchPanel } from "@/components/portal/shared/orderList/ListEntitySearchPanel";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { OrderListBottomTabStrip } from "@/components/portal/shared/orderList/OrderListBottomTabStrip";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeleteWorkPlanMutation,
  useListUsersQuery,
  useListWorkPlansQuery,
} from "@/store/api";
import { ConfirmDeleteWorkPlanModal } from "./ConfirmDeleteWorkPlanModal";
import {
  WORK_PLAN_STATUS_TABS,
  canEditPlan,
  formatPlanDate,
  planIdOf,
  renderPlanStatusBadge,
  salesUserLabel,
} from "./workPlanUtils";

type ListWorkPlansPageProps = {
  portalHome?: string;
};

export default function ListWorkPlansPage({ portalHome }: ListWorkPlansPageProps) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawPortal =
    typeof params.portal === "string"
      ? params.portal
      : Array.isArray(params.portal)
        ? params.portal[0]
        : "sales";
  const base = portalHome || `/${rawPortal}`;
  const isAdmin = rawPortal === "admin" || rawPortal === "super_admin";

  const initialStatus = searchParams.get("status") || "all";
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [salesUserFilter, setSalesUserFilter] = useState("");
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
    if (isAdmin && salesUserFilter) q.sales_user = salesUserFilter;
    return q;
  }, [currentPage, itemsPerPage, statusFilter, dateFrom, dateTo, isAdmin, salesUserFilter]);

  const { data, isLoading, isFetching, isError, refetch } =
    useListWorkPlansQuery(queryArgs);
  const usersQ = useListUsersQuery(isAdmin ? { department: "sales" } : undefined, {
    skip: !isAdmin,
  });
  const [deleteWorkPlan, { isLoading: isDeleting }] = useDeleteWorkPlanMutation();

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 0;

  const salesUsers = useMemo(() => {
    const raw = usersQ.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: unknown[] }).data;
    }
    return [];
  }, [usersQ.data]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const sales = salesUserLabel(r.sales_user).toLowerCase();
      const remarks = (r.remarks || "").toLowerCase();
      const status = (r.status || "").toLowerCase();
      return sales.includes(q) || remarks.includes(q) || status.includes(q);
    });
  }, [rows, searchQuery]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteWorkPlan(deleteTarget.id).unwrap();
      toast.success("Work plan deleted");
      setDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [deleteTarget, deleteWorkPlan]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Work Planner
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isAdmin
              ? "Review and approve daily sales visit plans"
              : "Plan and execute your daily customer visits"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            href={`${base}/work-planner/calendar`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Calendar
          </Link>
          <Link
            href={`${base}/work-planner/new`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New plan
          </Link>
        </div>
      </div>

      <ListEntitySearchPanel
        searchQuery={searchQuery}
        onSearchChange={(v) => {
          setSearchQuery(v);
          setCurrentPage(1);
        }}
        desktopPlaceholder="Search remarks or sales user…"
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
        {isAdmin ? (
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">
              Sales executive
            </label>
            <select
              value={salesUserFilter}
              onChange={(e) => {
                setSalesUserFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
            >
              <option value="">All</option>
              {(salesUsers as Array<{ _id?: string; id?: string; name?: string }>).map(
                (u) => {
                  const id = String(u._id || u.id || "");
                  return (
                    <option key={id} value={id}>
                      {u.name || id}
                    </option>
                  );
                }
              )}
            </select>
          </div>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <PortalBusyOverlay active={isLoading || isFetching} message="Loading work plans…" />
        {isError ? (
          <div className="p-6 text-sm text-rose-600">Failed to load work plans.</div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Date</th>
                {isAdmin ? (
                  <th className="px-3 py-2.5 font-semibold">Sales executive</th>
                ) : null}
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Visits</th>
                <th className="px-3 py-2.5 font-semibold">Remarks</th>
                <th className="px-3 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    className="px-3 py-10 text-center text-slate-500"
                  >
                    No work plans found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const id = planIdOf(row);
                  return (
                    <tr
                      key={id}
                      className="border-t border-slate-100 hover:bg-slate-50/80 dark:border-white/5 dark:hover:bg-white/[0.03]"
                    >
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                        {formatPlanDate(row.plan_date)}
                      </td>
                      {isAdmin ? (
                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                          {salesUserLabel(row.sales_user)}
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5">{renderPlanStatusBadge(row.status)}</td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {row.visit_count ?? 0}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-600 dark:text-slate-400">
                        {row.remarks || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`${base}/work-planner/${id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium hover:bg-slate-50 dark:border-white/15 dark:hover:bg-white/5"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open
                          </Link>
                          {canEditPlan(row.status) ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(`${base}/work-planner/${id}/edit`)
                                }
                                className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium hover:bg-slate-50 dark:border-white/15 dark:hover:bg-white/5"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    id,
                                    label: formatPlanDate(row.plan_date),
                                  })
                                }
                                className="inline-flex items-center rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-400"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
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
        tabs={WORK_PLAN_STATUS_TABS}
        activeTab={statusFilter}
        onTabChange={(id) => {
          setStatusFilter(id);
          setCurrentPage(1);
        }}
        filteredCount={filteredRows.length}
        isFetching={isFetching}
        searchQuery={searchQuery}
        onClearSearch={() => setSearchQuery("")}
        priorityFilter="all"
        onPriorityFilterChange={() => {}}
        filterLabel="Status"
        filterOptions={[{ value: "all", label: "All" }]}
        showReset={
          Boolean(searchQuery || dateFrom || dateTo || salesUserFilter || statusFilter !== "all")
        }
        onReset={() => {
          setSearchQuery("");
          setDateFrom("");
          setDateTo("");
          setSalesUserFilter("");
          setStatusFilter("all");
          setCurrentPage(1);
        }}
      />

      <ConfirmDeleteWorkPlanModal
        planId={deleteTarget?.id ?? null}
        planLabel={deleteTarget?.label ?? ""}
        isDeleting={isDeleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
