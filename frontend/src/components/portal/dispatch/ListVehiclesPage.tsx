"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeleteVehicleMutation,
  useListVehiclesQuery,
  type VehicleRecord,
} from "@/store/api";
import { formatVehicleCapacity, transportAgentLabel } from "./fleetDisplay";
import { VehicleDetailModal } from "./modals/VehicleDetailModal";
import { ConfirmDeleteVehicleModal } from "./modals/ConfirmDeleteVehicleModal";
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

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

type VehicleRow = VehicleRecord;

function rowKey(row: unknown): string {
  if (row && typeof row === "object") {
    const o = row as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return "";
}

export default function ListVehiclesPage() {
  const { data, isFetching, isError, refetch } = useListVehiclesQuery({});

  const vehicles = useMemo(() => pickList(data) as VehicleRow[], [data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const [deleteVehicle, { isLoading: isDeletingVehicle }] = useDeleteVehicleMutation();

  // Search & Pagination State
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const closeVehicleModal = useCallback(() => {
    setCreateOpen(false);
  }, []);

  const openCreate = useCallback(() => {
    setCreateOpen(true);
  }, []);

  const closeDeleteModal = useCallback(() => setDeleteTarget(null), []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    try {
      await deleteVehicle(id).unwrap();
      toast.success(mutationSuccessCopy("deleteVehicle"));
      setDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [deleteVehicle, deleteTarget]);

  // Handle Search Change
  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  }, []);

  // Filter vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const num = (v.vehicle_no || "").toLowerCase();
      const type = (v.vehicle_type || "").toLowerCase();
      const owner = (v.ownership_type || "").toLowerCase();
      const cap = formatVehicleCapacity(v as Record<string, unknown>).toLowerCase();
      const agent = transportAgentLabel(v.transport_agent).toLowerCase();

      return num.includes(q) || type.includes(q) || owner.includes(q) || cap.includes(q) || agent.includes(q);
    });
  }, [vehicles, searchQuery]);

  // Sliced vehicles
  const paginatedVehicles = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredVehicles.slice(start, end);
  }, [filteredVehicles, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredVehicles.length / itemsPerPage);
  const startEntry = filteredVehicles.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, filteredVehicles.length);

  return (
    <div className="space-y-6">
      <ConfirmDeleteVehicleModal
        vehicleId={deleteTarget?.id ?? null}
        vehicleLabel={deleteTarget?.label ?? ""}
        isDeleting={isDeletingVehicle}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
      />
      {createOpen ? (
        <VehicleDetailModal
          vehicleId={null}
          create
          onClose={closeVehicleModal}
        />
      ) : null}

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 p-6 dark:from-blue-500/5 dark:to-indigo-500/5 shadow-sm">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Vehicles Control
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl">
              Directory of active fleet vehicles. Manage vehicles, capacities, types, and document expirations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
              title="Reload vehicles list"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/dispatch"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Overview
            </Link>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-500/25 transition active:scale-[0.98] dark:bg-blue-50 dark:hover:bg-blue-400 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Vehicle
            </button>
          </div>
        </div>
      </div>

      {/* Search Input Controls */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900 shadow-sm">
        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Search Vehicles
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-450 pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by registration, agent, type, capacity, or ownership..."
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-955 dark:text-slate-50 dark:bg-slate-950"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-655"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-end">
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange("")}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mb-2.5 pl-1 cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Grid/Table Card */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900 shadow-sm overflow-hidden">
        {isFetching && (
          <div className="flex flex-col items-center justify-center py-16 space-y-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading vehicles...</p>
          </div>
        )}

        {isError && (
          <div className="text-center py-16 px-4">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load vehicles
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Please check database connection and try again.
            </p>
          </div>
        )}

        {!isFetching && !isError && filteredVehicles.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-955 text-slate-400 text-xl border border-slate-100 dark:border-white/5">
              🚚
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
              No vehicles found
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 max-w-xs mx-auto">
              {vehicles.length === 0
                ? "No fleet vehicles are registered in the system yet."
                : "No vehicles match your search parameters."}
            </p>
          </div>
        )}

        {!isFetching && !isError && filteredVehicles.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-xs">
                <thead className="bg-slate-50/75 dark:bg-slate-955/40 text-slate-500 dark:text-slate-400 border-b border-slate-200/60 dark:border-white/5 uppercase tracking-wider text-[10px] font-bold">
                  <tr>
                    <th className="px-4 py-3">Vehicle Registration No.</th>
                    <th className="px-4 py-3">Transport agent</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Capacity</th>
                    <th className="px-4 py-3">Ownership</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {paginatedVehicles.map((v) => {
                    const id = rowKey(v);
                    const num = v.vehicle_no || "Unnamed Vehicle";
                    const type = v.vehicle_type || "pickup";
                    const cap = formatVehicleCapacity(v as Record<string, unknown>);
                    const agent = transportAgentLabel(v.transport_agent);
                    const owner = v.ownership_type || "owned";
                    const statusStr = (v.status || "available").toLowerCase();

                    return (
                      <tr
                        key={id}
                        className="bg-white dark:bg-slate-900 transition-colors hover:bg-slate-50/50 dark:hover:bg-white/5"
                      >
                        <td className="px-4 py-3.5 font-mono font-bold uppercase tracking-wider">
                          {id ? (
                            <Link
                              href={`/dispatch/vehicles/${id}`}
                              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              {num}
                            </Link>
                          ) : (
                            <span className="text-slate-900 dark:text-slate-50">
                              {num}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-slate-650 dark:text-slate-350 font-medium max-w-[180px] truncate" title={agent}>
                          {agent}
                        </td>
                        <td className="px-4 py-3.5 capitalize text-slate-800 dark:text-slate-200 font-medium">
                          {type.replace("_", " ")}
                        </td>
                        <td className="px-4 py-3.5 text-slate-650 dark:text-slate-350 font-medium">
                          {cap}
                        </td>
                        <td className="px-4 py-3.5 capitalize text-slate-650 dark:text-slate-350 font-medium">
                          {owner}
                        </td>
                        <td className="px-4 py-3.5">
                          {statusStr === "available" ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-700/10 dark:bg-emerald-955/30 dark:text-emerald-455/90 dark:ring-emerald-500/25">
                              Available
                            </span>
                          ) : statusStr === "maintenance" ? (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-700/10 dark:bg-amber-950/30 dark:text-amber-455/90 dark:ring-amber-500/20">
                              Maintenance
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-700/10 dark:bg-rose-950/30 dark:text-rose-455/90 dark:ring-rose-500/25">
                              {statusStr.replace("_", " ")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {id ? (
                              <Link
                                href={`/dispatch/vehicles/${id}`}
                                className="inline-flex items-center gap-1 rounded bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-600 shadow-sm transition hover:bg-blue-100 hover:text-blue-700 dark:bg-blue-955/40 dark:text-blue-400 dark:hover:bg-blue-955/60 dark:hover:text-blue-300"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </Link>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                            {id ? (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ id, label: num })}
                                disabled={isDeletingVehicle}
                                className="inline-flex items-center justify-center rounded p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-455 dark:hover:bg-rose-950/30 transition cursor-pointer"
                                title="Delete Vehicle"
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

            {/* Pagination Navigation Footer */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-slate-200/60 dark:border-white/5 bg-slate-50/50 dark:bg-slate-950/20 text-slate-600 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs">
                  Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{startEntry}</span> to{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{endEntry}</span> of{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{filteredVehicles.length}</span> entries
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
