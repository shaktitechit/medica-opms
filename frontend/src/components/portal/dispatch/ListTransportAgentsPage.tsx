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
  Eye,
  ArrowLeft,
} from "lucide-react";

function rowKey(row: unknown): string {
  if (row && typeof row === "object") {
    const o = row as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return "";
}

export default function ListTransportAgentsPage() {
  const { data = [], isFetching, isError, refetch } = useListTransportAgentsQuery({});
  const rows = useMemo(() => (Array.isArray(data) ? (data as TransportAgentRecord[]) : []), [data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteTransportAgent, { isLoading: isDeleting }] = useDeleteTransportAgentMutation();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.agent_code, r.agent_name, r.agent_type, r.mobile, r.status]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(q)),
    );
  }, [rows, searchQuery]);

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

      <div className="relative overflow-hidden rounded-2xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 p-6 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Transport Agents</h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl">
              Master list of internal fleet, third-party, and courier transport partners.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link href="/dispatch" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
              <ArrowLeft className="h-3.5 w-3.5" />
              Overview
            </Link>
            <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-500/25 hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" />
              Add Agent
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Search</label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by name, code, type, mobile, or status..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
            />
            {searchQuery ? (
              <button type="button" onClick={() => setSearchQuery("")} className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {!isFetching && isError ? (
          <div className="px-4 py-10 text-center text-sm text-rose-600">Failed to load transport agents.</div>
        ) : null}
        {!isFetching && !isError && filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">No transport agents found.</div>
        ) : null}
        {!isError && filtered.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-xs">
                <thead className="border-b border-slate-200/60 bg-slate-50/75 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-white/5 dark:bg-slate-950/40 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Mobile</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {paged.map((r) => {
                    const id = rowKey(r);
                    const status = String(r.status || "active").toLowerCase();
                    return (
                      <tr key={id} className="bg-white transition-colors hover:bg-slate-50/50 dark:bg-slate-900 dark:hover:bg-white/5">
                        <td className="px-4 py-3.5 font-mono uppercase">{r.agent_code || "—"}</td>
                        <td className="px-4 py-3.5 font-semibold">
                          {id ? <Link href={`/dispatch/transport-agents/${id}`} className="text-blue-600 hover:text-blue-700 dark:text-blue-400">{r.agent_name || "Unnamed Agent"}</Link> : (r.agent_name || "Unnamed Agent")}
                        </td>
                        <td className="px-4 py-3.5 capitalize">{String(r.agent_type || "—").replace(/_/g, " ")}</td>
                        <td className="px-4 py-3.5">{r.mobile || "—"}</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:bg-white/5 dark:text-slate-400">
                            {status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {id ? (
                              <Link href={`/dispatch/transport-agents/${id}`} className="inline-flex items-center gap-1 rounded bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-100">
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </Link>
                            ) : null}
                            {id ? (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ id, label: r.agent_name || r.agent_code || id })}
                                className="inline-flex items-center justify-center rounded p-1.5 text-rose-600 hover:bg-rose-50"
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
            <div className="flex flex-col gap-4 border-t border-slate-200/60 bg-slate-50/50 px-4 py-3 text-slate-600 dark:border-white/5 dark:bg-slate-950/20 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs">
                  Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{startEntry}</span> to{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{endEntry}</span> of{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{filtered.length}</span> entries
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-medium text-slate-500">Rows per page:</span>
                  <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="rounded bg-transparent py-0.5 text-xs font-semibold">
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-1.5 self-center sm:self-auto">
                <button type="button" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-50"><ChevronsLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
                <span className="px-2 text-xs font-semibold">Page {currentPage} of {totalPages || 1}</span>
                <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || totalPages === 0} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-50"><ChevronsRight className="h-4 w-4" /></button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

