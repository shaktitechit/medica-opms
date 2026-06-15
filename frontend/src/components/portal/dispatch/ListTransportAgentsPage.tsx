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
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  Plus,
  Trash2,
  Building2,
  User,
  Phone,
  Mail,
  FileText,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";

const btnSecondaryClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-white/5 dark:active:bg-white/10";

function rowKey(row: unknown): string {
  if (row && typeof row === "object") {
    const o = row as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return "";
}

export default function ListTransportAgentsPage() {
  const { data = [], isLoading, isFetching, isError, refetch } = useListTransportAgentsQuery({});
  const rows = useMemo(() => (Array.isArray(data) ? (data as TransportAgentRecord[]) : []), [data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteTransportAgent, { isLoading: isDeleting }] = useDeleteTransportAgentMutation();
  
  // Search, Filtering & Pagination State
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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      // Status filter
      if (statusFilter !== "all") {
        const status = String(r.status || "active").toLowerCase();
        if (status !== statusFilter) return false;
      }
      
      // Type filter
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
    <div className="space-y-6">
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

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/10 p-6 dark:from-blue-500/5 dark:to-indigo-500/5 shadow-sm">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Transport Agents</h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl">
              Master list of internal fleet, third-party, and courier transport partners.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className={btnSecondaryClass}
              title="Reload transport agents list"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link href="/dispatch" className={btnSecondaryClass}>
              ← Dashboard
            </Link>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition active:scale-[0.98] dark:bg-blue-550 dark:hover:bg-blue-400"
            >
              ＋ Add Agent
            </button>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900 shadow-sm">
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Search</label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by name, code, mobile, email..."
              className="w-full rounded-lg border border-slate-200/90 bg-white pl-9 pr-8 py-2 text-sm text-slate-955 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
            />
            {searchQuery ? (
              <button type="button" onClick={() => handleSearchChange("")} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-655">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Agent Type</label>
          <select
            className="w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-955 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
            value={typeFilter}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="internal_fleet">Internal Fleet</option>
            <option value="third_party">Third Party</option>
            <option value="courier">Courier</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Status</label>
          <select
            className="w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-955 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
            <option value="blacklisted">Blacklisted Only</option>
          </select>
        </div>

        <div className="flex items-end">
          {(searchQuery || statusFilter !== "all" || typeFilter !== "all") && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mb-2.5 pl-1 cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Grid/Table Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900 shadow-sm overflow-hidden">
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
                ＋ Add Agent
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {paged.map((r) => {
                const id = rowKey(r);
                const code = r.agent_code || "—";
                const name = r.agent_name || "Unnamed Agent";
                const typeStr = String(r.agent_type || "—").replace(/_/g, " ");
                const mob = r.mobile || "—";
                const status = String(r.status || "active").toLowerCase();
                const contact = r.contact_person || "—";
                const email = r.email || "—";

                return (
                  <div
                    key={id || code}
                    className="p-5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition duration-150 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    {/* Left Column: Icon, Agent Name, Type & Status badges, Code */}
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/5 dark:text-indigo-400 shrink-0">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate max-w-[280px]">
                            {name}
                          </h3>
                          {/* Type Badge */}
                          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/20 capitalize">
                            {typeStr}
                          </span>
                          {/* Status Badge */}
                          {status === "active" ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-green-700 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-green-600/10 dark:ring-green-500/20">
                              <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
                              Active
                            </span>
                          ) : status === "blacklisted" ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-rose-700 dark:text-rose-455 font-semibold bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 rounded-full ring-1 ring-inset ring-rose-700/10 dark:ring-rose-500/25">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400" />
                              Blacklisted
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-slate-500/10 dark:ring-slate-500/20">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              Inactive
                            </span>
                          )}
                        </div>
                        {/* Agent Code */}
                        {code && code !== "—" && (
                          <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            <span>Code: {code}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Middle Column: Grid of Metadata details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs lg:flex-[2] max-w-2xl w-full">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <User className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate" title="Contact Person">
                          <span className="text-slate-400 mr-1">Contact:</span>
                          <strong className="font-semibold text-slate-800 dark:text-slate-200">
                            {contact}
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="tabular-nums">
                          <span className="text-slate-400 mr-1">Phone:</span>
                          <strong className="font-semibold text-slate-800 dark:text-slate-200">
                            {mob}
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate" title={email}>
                          <span className="text-slate-400 mr-1">Email:</span>
                          <strong className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                            {email}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Right Column: Actions */}
                    <div className="flex items-center gap-2 self-start sm:self-end lg:self-auto pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-white/5 w-full lg:w-auto justify-end">
                      {id ? (
                        <Link
                          href={`/dispatch/transport-agents/${id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-blue-600 hover:bg-blue-50/50 active:bg-blue-100 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-500/10 text-xs font-semibold transition shadow-sm"
                        >
                          <span>View & Edit</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                      {id ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-250 bg-white text-rose-600 hover:bg-rose-50/50 active:bg-rose-100 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-445 dark:hover:bg-rose-500/10 text-xs font-semibold disabled:opacity-50 transition shadow-sm"
                          onClick={() => setDeleteTarget({ id, label: name })}
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Navigation Footer */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-slate-200/60 dark:border-white/5 bg-slate-50/50 dark:bg-slate-955/20 text-slate-600 dark:text-slate-400 font-sans">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs">
                  Showing <span className="font-semibold text-slate-900 dark:text-slate-200">{startEntry}</span> to{" "}
                  <span className="font-semibold text-slate-900 dark:text-slate-200">{endEntry}</span> of{" "}
                  <span className="font-semibold text-slate-900 dark:text-slate-200">{filtered.length}</span> entries
                </span>
                <span className="text-slate-350 dark:text-slate-700">|</span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-medium text-slate-500">Rows per page:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded bg-transparent border-none py-0.5 text-xs font-semibold text-slate-700 focus:ring-0 cursor-pointer dark:text-slate-200"
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
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors"
                  title="First Page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <span className="text-xs font-semibold px-2">
                  Page {currentPage} of {totalPages || 1}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100 cursor-pointer transition-colors"
                  title="Next Page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || totalPages === 0}
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
  );
}
