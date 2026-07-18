"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { mutationRejectedMessage, mutationSuccessCopy } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  type TransportAgentRecord,
  useDeleteTransportAgentMutation,
  useListTransportAgentsQuery,
} from "@/store/api";
import { TransportAgentDetailModal } from "./modals/TransportAgentDetailModal";
import { ConfirmDeleteTransportAgentModal } from "./modals/ConfirmDeleteTransportAgentModal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { ListEntitySearchPanel } from "@/components/portal/shared/orderList/ListEntitySearchPanel";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { OrderListBottomTabStrip } from "@/components/portal/shared/orderList/OrderListBottomTabStrip";
import { RefreshCw, LayoutDashboard, Plus, Trash2, ExternalLink } from "lucide-react";

const TRANSPORT_AGENT_STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "blacklisted", label: "Blacklisted" },
] as const;

const AGENT_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "internal_fleet", label: "Internal Fleet" },
  { value: "third_party", label: "Third Party" },
  { value: "courier", label: "Courier" },
] as const;

function rowKey(row: unknown): string {
  if (row && typeof row === "object") {
    const o = row as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return "";
}

function renderAgentTypeBadge(typeStr: string) {
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/20 capitalize">
      {typeStr}
    </span>
  );
}

function renderAgentStatusBadge(status: string) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-green-600/10 dark:ring-green-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
        Active
      </span>
    );
  }
  if (status === "blacklisted") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-455 font-semibold bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 rounded-full ring-1 ring-inset ring-rose-700/10 dark:ring-rose-500/25">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400" />
        Blacklisted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-slate-500/10 dark:ring-slate-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Inactive
    </span>
  );
}

export type ListTransportAgentsPageProps = {
  portalHome?: string;
};

export default function ListTransportAgentsPage({
  portalHome = "/dispatch",
}: ListTransportAgentsPageProps) {
  const { data = [], isLoading, isFetching, isError, refetch } = useListTransportAgentsQuery({});
  const rows = useMemo(() => (Array.isArray(data) ? (data as TransportAgentRecord[]) : []), [data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteTransportAgent, { isLoading: isDeleting }] = useDeleteTransportAgentMutation();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  }, []);

  const handleStatusChange = useCallback((val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  }, []);

  const handleTypeChange = useCallback((val: string) => {
    setTypeFilter(val);
    setCurrentPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
    setCurrentPage(1);
  }, []);

  const showReset =
    searchQuery.trim() !== "" || statusFilter !== "all" || typeFilter !== "all";

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all") {
        const status = String(r.status || "active").toLowerCase();
        if (status !== statusFilter) return false;
      }

      if (typeFilter !== "all") {
        const type = String(r.agent_type || "").toLowerCase();
        if (type !== typeFilter) return false;
      }

      if (!q) return true;
      return [r.agent_code, r.agent_name, r.agent_type, r.mobile, r.status, r.contact_person, r.email]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(q));
    });
  }, [rows, searchQuery, statusFilter, typeFilter]);

  const paged = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startEntry = filtered.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, filtered.length);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteTransportAgent(deleteTarget.id).unwrap();
      toast.success(mutationSuccessCopy("deleteTransportAgent"));
      setDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [deleteTransportAgent, deleteTarget]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <PortalBusyOverlay active={isLoading} message="Loading transport agents…" />
      <ConfirmDeleteTransportAgentModal
        transportAgentId={deleteTarget?.id ?? null}
        transportAgentLabel={deleteTarget?.label ?? ""}
        isDeleting={isDeleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
      {createOpen ? (
        <TransportAgentDetailModal transportAgentId={null} create onClose={() => setCreateOpen(false)} />
      ) : null}

      <div className="relative shrink-0 overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Transport Agents
            </h1>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 max-w-xl">
              Master list of internal fleet, third-party, and courier transport partners.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
              title="Reload transport agents list"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href={portalHome}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <LayoutDashboard className="h-3 w-3" />
              Dashboard
            </Link>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98] dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              Add Agent
            </button>
          </div>
        </div>
      </div>

      <ListEntitySearchPanel
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        desktopPlaceholder="Search by name, code, mobile, email..."
        mobilePlaceholder="Search agents…"
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {!isLoading && isError && (
          <div className="text-center py-16 px-4">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load transport agents
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Please check your database connection and try again.
            </p>
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-955 text-xl text-slate-400 border border-slate-100 dark:border-white/5">
              👥
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-950 dark:text-slate-100">
              No transport agents found
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 max-w-xs mx-auto">
              {rows.length === 0
                ? "Get started by adding your first transport agent profile."
                : "No transport agents match your active filters. Try adjusting your filter choices."}
            </p>
            {rows.length === 0 && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-4 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Agent
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <>
            <OrderListPaginationBar
              startEntry={startEntry}
              endEntry={endEntry}
              totalEntries={filtered.length}
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
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Name / Code</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {paged.map((r) => {
                    const id = rowKey(r);
                    const code = r.agent_code || "—";
                    const name = r.agent_name || "Unnamed Agent";
                    const typeStr = String(r.agent_type || "—").replace(/_/g, " ");
                    const mob = r.mobile || "—";
                    const status = String(r.status || "active").toLowerCase();
                    const contact = r.contact_person || "—";
                    const email = r.email || "";

                    return (
                      <tr
                        key={id || code}
                        className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{name}</div>
                          {code && code !== "—" && (
                            <div className="mt-0.5 font-mono text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {code}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {renderAgentTypeBadge(typeStr)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{contact}</div>
                          <div className="mt-0.5 tabular-nums text-slate-500 dark:text-slate-400">{mob}</div>
                          {email ? (
                            <div className="mt-0.5 font-mono text-2xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]" title={email}>
                              {email}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {renderAgentStatusBadge(status)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            {id ? (
                              <Link
                                href={`${portalHome}/transport-agents/${id}`}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 hover:bg-slate-50 hover:text-slate-900 px-2 py-1 text-slate-700 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5 transition font-semibold"
                              >
                                View
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : null}
                            {id ? (
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded border border-slate-200 hover:border-rose-350 p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:text-rose-455 dark:hover:bg-rose-950/30 transition cursor-pointer"
                                onClick={() => setDeleteTarget({ id, label: name })}
                                disabled={isDeleting}
                                title="Delete transport agent"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
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
        tabs={TRANSPORT_AGENT_STATUS_TABS}
        activeTab={statusFilter}
        onTabChange={handleStatusChange}
        filteredCount={filtered.length}
        isFetching={isFetching}
        searchQuery={searchQuery}
        onClearSearch={() => handleSearchChange("")}
        priorityFilter={typeFilter}
        onPriorityFilterChange={handleTypeChange}
        filterLabel="Type"
        filterOptions={AGENT_TYPE_FILTER_OPTIONS}
        showReset={showReset}
        onReset={resetFilters}
      />
    </div>
  );
}
