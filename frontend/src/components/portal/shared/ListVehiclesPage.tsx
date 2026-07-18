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
  useListDriversQuery,
  useListVehiclesQuery,
  type DriverRecord,
  type VehicleRecord,
} from "@/store/api";
import { transportAgentLabel } from "./fleetDisplay";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { VehicleDetailModal } from "./modals/VehicleDetailModal";
import { ConfirmDeleteVehicleModal } from "./modals/ConfirmDeleteVehicleModal";
import { ListEntitySearchPanel } from "@/components/portal/shared/orderList/ListEntitySearchPanel";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { OrderListBottomTabStrip } from "@/components/portal/shared/orderList/OrderListBottomTabStrip";
import { RefreshCw, LayoutDashboard, Plus, Trash2, ExternalLink } from "lucide-react";

const VEHICLE_STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "available", label: "Available" },
  { id: "maintenance", label: "Maintenance" },
  { id: "on_trip", label: "On Trip" },
] as const;

const OWNERSHIP_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "owned", label: "Owned" },
  { value: "leased", label: "Leased" },
] as const;

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

function renderOwnershipBadge(owner: string) {
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/20 capitalize">
      {owner}
    </span>
  );
}

function renderVehicleStatusBadge(statusStr: string) {
  if (statusStr === "available") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-455 font-semibold bg-emerald-50 dark:bg-emerald-955/30 px-2 py-0.5 rounded-full ring-1 ring-inset ring-emerald-700/10 dark:ring-emerald-500/25">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
        Available
      </span>
    );
  }
  if (statusStr === "maintenance") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full ring-1 ring-inset ring-amber-700/10 dark:ring-amber-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
        Maintenance
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-455 font-semibold bg-rose-50 dark:bg-rose-955/30 px-2 py-0.5 rounded-full ring-1 ring-inset ring-rose-700/10 dark:ring-rose-500/25">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400" />
      {statusStr.replace("_", " ")}
    </span>
  );
}

export default function ListVehiclesPage() {
  const { data, isLoading, isFetching, isError, refetch } = useListVehiclesQuery({});
  const { data: driversData } = useListDriversQuery({});

  const vehicles = useMemo(() => pickList(data) as VehicleRow[], [data]);
  const drivers = useMemo(() => pickList(driversData) as DriverRecord[], [driversData]);

  const driverByVehicleId = useMemo(() => {
    const map = new Map<string, string>();
    drivers.forEach((d) => {
      const driverName = d.name || "Unnamed Driver";
      if (!d.assigned_vehicle) return;
      if (typeof d.assigned_vehicle === "object") {
        const av = d.assigned_vehicle as Record<string, unknown>;
        const vehicleId = String(av._id ?? av.id ?? "");
        if (vehicleId) map.set(vehicleId, driverName);
      } else {
        map.set(String(d.assigned_vehicle), driverName);
      }
    });
    return map;
  }, [drivers]);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const [deleteVehicle, { isLoading: isDeletingVehicle }] = useDeleteVehicleMutation();

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

  const showReset =
    searchQuery.trim() !== "" || statusFilter !== "all" || ownershipFilter !== "all";

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (statusFilter !== "all") {
        const statusStr = (v.status || "available").toLowerCase();
        if (statusStr !== statusFilter) return false;
      }

      if (ownershipFilter !== "all") {
        const ownershipStr = (v.ownership_type || "owned").toLowerCase();
        if (ownershipStr !== ownershipFilter) return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const num = (v.vehicle_no || "").toLowerCase();
      const type = (v.vehicle_type || "").toLowerCase();
      const owner = (v.ownership_type || "").toLowerCase();
      const agent = transportAgentLabel(v.transport_agent).toLowerCase();
      const driverName = (driverByVehicleId.get(rowKey(v)) || "").toLowerCase();

      return (
        num.includes(q) ||
        type.includes(q) ||
        owner.includes(q) ||
        agent.includes(q) ||
        driverName.includes(q)
      );
    });
  }, [vehicles, searchQuery, statusFilter, ownershipFilter, driverByVehicleId]);

  const paginatedVehicles = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredVehicles.slice(start, end);
  }, [filteredVehicles, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredVehicles.length / itemsPerPage);
  const startEntry =
    filteredVehicles.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, filteredVehicles.length);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <PortalBusyOverlay active={isLoading} message="Loading vehicles…" />
      <ConfirmDeleteVehicleModal
        vehicleId={deleteTarget?.id ?? null}
        vehicleLabel={deleteTarget?.label ?? ""}
        isDeleting={isDeletingVehicle}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
      />
      {createOpen ? (
        <VehicleDetailModal vehicleId={null} create onClose={closeVehicleModal} />
      ) : null}

      <div className="relative shrink-0 overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Vehicles Control
            </h1>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 max-w-xl">
              Directory of active fleet vehicles. Manage vehicles, capacities, types, and document expirations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
              title="Reload vehicles list"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/dispatch"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <LayoutDashboard className="h-3 w-3" />
              Dashboard
            </Link>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98] dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              Add Vehicle
            </button>
          </div>
        </div>
      </div>

      <ListEntitySearchPanel
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        desktopPlaceholder="Search by registration, agent, type, driver..."
        mobilePlaceholder="Search vehicles…"
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
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
                <Plus className="h-3.5 w-3.5" />
                Add Vehicle
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && filteredVehicles.length > 0 && (
          <>
            <OrderListPaginationBar
              startEntry={startEntry}
              endEntry={endEntry}
              totalEntries={filteredVehicles.length}
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
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Vehicle No</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Ownership</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Driver / Agent</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {paginatedVehicles.map((v) => {
                    const id = rowKey(v);
                    const num = v.vehicle_no || "Unnamed Vehicle";
                    const type = v.vehicle_type || "pickup";
                    const agent = transportAgentLabel(v.transport_agent);
                    const owner = v.ownership_type || "owned";
                    const statusStr = (v.status || "available").toLowerCase();
                    const driverName = driverByVehicleId.get(id);

                    return (
                      <tr
                        key={id || num}
                        className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap font-mono font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                          {num}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap capitalize text-slate-600 dark:text-slate-400">
                          {type.replace("_", " ")}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {renderOwnershipBadge(owner)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {renderVehicleStatusBadge(statusStr)}
                        </td>
                        <td className="px-4 py-3">
                          {driverName ? (
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{driverName}</div>
                          ) : null}
                          {agent && agent !== "—" ? (
                            <div className={`text-slate-500 dark:text-slate-400 ${driverName ? "mt-0.5 text-2xs" : "font-semibold text-slate-800 dark:text-slate-200"}`}>
                              {driverName ? `Agent: ${agent}` : agent}
                            </div>
                          ) : !driverName ? (
                            <span className="text-slate-500 dark:text-slate-400">—</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            {id ? (
                              <Link
                                href={`/dispatch/vehicles/${id}`}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 hover:bg-slate-50 hover:text-slate-900 px-2 py-1 text-slate-700 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5 transition font-semibold"
                              >
                                View
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                            {id ? (
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded border border-slate-200 hover:border-rose-350 p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:text-rose-455 dark:hover:bg-rose-950/30 transition cursor-pointer"
                                onClick={() => setDeleteTarget({ id, label: num })}
                                disabled={isDeletingVehicle}
                                title="Delete vehicle"
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
        tabs={VEHICLE_STATUS_TABS}
        activeTab={statusFilter}
        onTabChange={handleStatusChange}
        filteredCount={filteredVehicles.length}
        isFetching={isFetching}
        searchQuery={searchQuery}
        onClearSearch={() => handleSearchChange("")}
        priorityFilter={ownershipFilter}
        onPriorityFilterChange={handleOwnershipChange}
        filterLabel="Ownership"
        filterOptions={OWNERSHIP_FILTER_OPTIONS}
        showReset={showReset}
        onReset={resetFilters}
      />
    </div>
  );
}
