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
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
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
  Building2,
  Truck,
  Scale,
  ArrowLeft,
  ExternalLink,
  Key,
} from "lucide-react";

const btnSecondaryClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-white/5 dark:active:bg-white/10";

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
  const { data, isLoading, isFetching, isError, refetch } = useListVehiclesQuery({});

  const vehicles = useMemo(() => pickList(data) as VehicleRow[], [data]);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const [deleteVehicle, { isLoading: isDeletingVehicle }] = useDeleteVehicleMutation();

  // Search, Filtering & Pagination State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");
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

  // Handle Filter Changes
  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  }, []);

  const handleStatusChange = useCallback((val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  }, []);

  const handleOwnershipChange = useCallback((val: string) => {
    setOwnershipFilter(val);
    setCurrentPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setOwnershipFilter("all");
    setCurrentPage(1);
  }, []);

  // Filter vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      // Status check
      if (statusFilter !== "all") {
        const statusStr = (v.status || "available").toLowerCase();
        if (statusStr !== statusFilter) return false;
      }
      
      // Ownership check
      if (ownershipFilter !== "all") {
        const ownershipStr = (v.ownership_type || "owned").toLowerCase();
        if (ownershipStr !== ownershipFilter) return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const num = (v.vehicle_no || "").toLowerCase();
      const type = (v.vehicle_type || "").toLowerCase();
      const owner = (v.ownership_type || "").toLowerCase();
      const cap = formatVehicleCapacity(v as Record<string, unknown>).toLowerCase();
      const agent = transportAgentLabel(v.transport_agent).toLowerCase();

      return num.includes(q) || type.includes(q) || owner.includes(q) || cap.includes(q) || agent.includes(q);
    });
  }, [vehicles, searchQuery, statusFilter, ownershipFilter]);

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
      <PortalBusyOverlay active={isLoading} message="Loading vehicles…" />
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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/10 p-6 dark:from-blue-500/5 dark:to-indigo-500/5 shadow-sm">
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className={btnSecondaryClass}
              title="Reload vehicles list"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link href="/dispatch" className={btnSecondaryClass}>
              ← Dashboard
            </Link>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition active:scale-[0.98] dark:bg-blue-550 dark:hover:bg-blue-400"
            >
              ＋ Add Vehicle
            </button>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900 shadow-sm">
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Search Vehicles
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by registration, agent, type, capacity..."
              className="w-full rounded-lg border border-slate-200/90 bg-white pl-9 pr-8 py-2 text-sm text-slate-955 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
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

        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Vehicle Status
          </label>
          <select
            className="w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-955 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="maintenance">Maintenance</option>
            <option value="on_trip">On Trip</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Ownership Type
          </label>
          <select
            className="w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-955 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
            value={ownershipFilter}
            onChange={(e) => handleOwnershipChange(e.target.value)}
          >
            <option value="all">All Ownerships</option>
            <option value="owned">Owned</option>
            <option value="leased">Leased</option>
          </select>
        </div>

        <div className="flex items-end col-span-1 md:col-span-4 justify-start">
          {(searchQuery || statusFilter !== "all" || ownershipFilter !== "all") && (
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
        {isError && (
          <div className="text-center py-16 px-4">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load vehicles
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Please check your database connection and try again.
            </p>
          </div>
        )}

        {!isLoading && !isError && filteredVehicles.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-955 text-xl text-slate-400 border border-slate-100 dark:border-white/5">
              🚚
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-950 dark:text-slate-100">
              No vehicles found
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 max-w-xs mx-auto">
              {vehicles.length === 0
                ? "Get started by adding your first vehicle profile."
                : "No vehicles match your active filters. Try adjusting your search query."}
            </p>
            {vehicles.length === 0 && (
              <button
                type="button"
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 transition"
              >
                ＋ Add Vehicle
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && filteredVehicles.length > 0 && (
          <>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {paginatedVehicles.map((v) => {
                const id = rowKey(v);
                const num = v.vehicle_no || "Unnamed Vehicle";
                const type = v.vehicle_type || "pickup";
                const cap = formatVehicleCapacity(v as Record<string, unknown>);
                const agent = transportAgentLabel(v.transport_agent);
                const owner = v.ownership_type || "owned";
                const statusStr = (v.status || "available").toLowerCase();

                return (
                  <div
                    key={id || num}
                    className="p-5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition duration-150 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    {/* Left Column: Icon, Vehicle Registration No, type & status badges */}
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/5 dark:text-blue-400 shrink-0">
                        <Truck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate font-mono uppercase tracking-wider">
                            {num}
                          </h3>
                          {/* Ownership Badge */}
                          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/20 capitalize font-sans">
                            {owner}
                          </span>
                          {/* Status Badge */}
                          {statusStr === "available" ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-455 font-semibold bg-emerald-50 dark:bg-emerald-955/30 px-2 py-0.5 rounded-full ring-1 ring-inset ring-emerald-700/10 dark:ring-emerald-500/25 font-sans">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                              Available
                            </span>
                          ) : statusStr === "maintenance" ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full ring-1 ring-inset ring-amber-700/10 dark:ring-amber-500/20 font-sans">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
                              Maintenance
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-rose-700 dark:text-rose-455 font-semibold bg-rose-50 dark:bg-rose-955/30 px-2 py-0.5 rounded-full ring-1 ring-inset ring-rose-700/10 dark:ring-rose-500/25 font-sans">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400" />
                              {statusStr.replace("_", " ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Middle Column: Grid of Metadata details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs lg:flex-[2] max-w-2xl w-full">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate" title="Transport Agent">
                          <span className="text-slate-400 mr-1">Agent:</span>
                          <strong className="font-semibold text-slate-800 dark:text-slate-200">
                            {agent}
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Truck className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate capitalize" title="Vehicle Type">
                          <span className="text-slate-400 mr-1">Type:</span>
                          <strong className="font-semibold text-slate-800 dark:text-slate-200">
                            {type.replace("_", " ")}
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Scale className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate" title="Vehicle Capacity">
                          <span className="text-slate-400 mr-1">Capacity:</span>
                          <strong className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                            {cap}
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Key className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate capitalize" title="Ownership Type">
                          <span className="text-slate-400 mr-1">Ownership:</span>
                          <strong className="font-semibold text-slate-800 dark:text-slate-200">
                            {owner}
                          </strong>
                        </span>
                      </div>
                    </div>

                    {/* Right Column: Actions */}
                    <div className="flex items-center gap-2 self-start sm:self-end lg:self-auto pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-white/5 w-full lg:w-auto justify-end">
                      {id ? (
                        <Link
                          href={`/dispatch/vehicles/${id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-blue-600 hover:bg-blue-50/50 active:bg-blue-100 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-500/10 text-xs font-semibold transition shadow-sm"
                        >
                          <span>View & Edit</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                      {id ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-250 bg-white text-rose-600 hover:bg-rose-50/50 active:bg-rose-100 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-445 dark:hover:bg-rose-500/10 text-xs font-semibold disabled:opacity-50 transition shadow-sm"
                          onClick={() => setDeleteTarget({ id, label: num })}
                          disabled={isDeletingVehicle}
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
                  <span className="font-semibold text-slate-900 dark:text-slate-200">{filteredVehicles.length}</span> entries
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
