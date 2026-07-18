"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeleteDriverMutation,
  useListDriversQuery,
  useListVehiclesQuery,
  type DriverRecord,
} from "@/store/api";
import { transportAgentLabel } from "./fleetDisplay";
import { DriverDetailModal } from "./modals/DriverDetailModal";
import { ConfirmDeleteDriverModal } from "./modals/ConfirmDeleteDriverModal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { ListEntitySearchPanel } from "@/components/portal/shared/orderList/ListEntitySearchPanel";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { OrderListBottomTabStrip } from "@/components/portal/shared/orderList/OrderListBottomTabStrip";
import { RefreshCw, LayoutDashboard, Plus, Trash2, ExternalLink } from "lucide-react";

const DRIVER_STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "available", label: "Available" },
  { id: "assigned", label: "Assigned" },
  { id: "on_trip", label: "On Trip" },
  { id: "leave", label: "Leave" },
  { id: "inactive", label: "Inactive" },
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

type DriverRow = DriverRecord;

type VehicleRow = {
  _id?: string;
  id?: string;
  vehicle_no?: string;
};

function rowKey(row: unknown): string {
  if (row && typeof row === "object") {
    const o = row as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return "";
}

function formatDateReadOnly(dateVal: unknown): string {
  if (!dateVal) return "—";
  const d = new Date(String(dateVal));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function renderDriverStatusBadge(statusStr: string) {
  if (statusStr === "available") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full ring-1 ring-inset ring-emerald-700/10 dark:ring-emerald-500/25">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
        Available
      </span>
    );
  }
  if (statusStr === "assigned") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-955/30 px-2 py-0.5 rounded-full ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/25">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
        Assigned
      </span>
    );
  }
  if (statusStr === "on_trip") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full ring-1 ring-inset ring-amber-700/10 dark:ring-amber-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-650 dark:bg-amber-400" />
        On Trip
      </span>
    );
  }
  if (statusStr === "leave") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-medium bg-slate-50 dark:bg-white/5 px-2 py-0.5 rounded-full ring-1 ring-inset ring-slate-500/10 dark:ring-white/10">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        Leave
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-455 font-semibold bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 rounded-full ring-1 ring-inset ring-rose-700/10 dark:ring-rose-500/25">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400" />
      Inactive
    </span>
  );
}

export default function ListDriversPage() {
  const { data, isLoading, isFetching, isError, refetch } = useListDriversQuery({});
  const { data: vehiclesData } = useListVehiclesQuery({});

  const drivers = useMemo(() => pickList(data) as DriverRow[], [data]);
  const vehicles = useMemo(() => pickList(vehiclesData) as VehicleRow[], [vehiclesData]);

  const vehicleMap = useMemo(() => {
    const map = new Map<string, string>();
    vehicles.forEach((v) => {
      const id = v._id || v.id;
      if (id && v.vehicle_no) {
        map.set(id, v.vehicle_no);
      }
    });
    return map;
  }, [vehicles]);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const [deleteDriver, { isLoading: isDeletingDriver }] = useDeleteDriverMutation();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const closeDriverModal = useCallback(() => {
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
      await deleteDriver(id).unwrap();
      toast.success(mutationSuccessCopy("deleteDriver"));
      setDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [deleteDriver, deleteTarget]);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  }, []);

  const handleStatusChange = useCallback((val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setCurrentPage(1);
  }, []);

  const showReset = searchQuery.trim() !== "" || statusFilter !== "all";

  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (statusFilter !== "all") {
        const dStatus = (d.status || "available").toLowerCase();
        if (dStatus !== statusFilter) return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const name = (d.name || "").toLowerCase();
      const code = (d.driver_code || "").toLowerCase();
      const phone = (d.phone || "").toLowerCase();
      const lic = (d.license_no || "").toLowerCase();
      const agent = transportAgentLabel(d.transport_agent).toLowerCase();

      let vehicleLabel = "—";
      if (d.assigned_vehicle) {
        if (typeof d.assigned_vehicle === "object") {
          vehicleLabel =
            ((d.assigned_vehicle as Record<string, unknown>).vehicle_no as string) || "—";
        } else {
          vehicleLabel = vehicleMap.get(String(d.assigned_vehicle)) || "—";
        }
      }
      const vehicleLower = vehicleLabel.toLowerCase();

      return (
        name.includes(q) ||
        code.includes(q) ||
        phone.includes(q) ||
        lic.includes(q) ||
        agent.includes(q) ||
        vehicleLower.includes(q)
      );
    });
  }, [drivers, searchQuery, statusFilter, vehicleMap]);

  const paginatedDrivers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredDrivers.slice(start, end);
  }, [filteredDrivers, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredDrivers.length / itemsPerPage);
  const startEntry =
    filteredDrivers.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, filteredDrivers.length);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <PortalBusyOverlay active={isLoading} message="Loading drivers…" />
      <ConfirmDeleteDriverModal
        driverId={deleteTarget?.id ?? null}
        driverLabel={deleteTarget?.label ?? ""}
        isDeleting={isDeletingDriver}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
      />
      {createOpen ? (
        <DriverDetailModal driverId={null} create onClose={closeDriverModal} />
      ) : null}

      <div className="relative shrink-0 overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Drivers Control
            </h1>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 max-w-xl">
              Directory of active fleet drivers. Manage driver details, status, and vehicle assignments.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
              title="Reload drivers list"
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
              Add Driver
            </button>
          </div>
        </div>
      </div>

      <ListEntitySearchPanel
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        desktopPlaceholder="Search by driver name, code, phone, license, agent, or vehicle..."
        mobilePlaceholder="Search drivers…"
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {isError && (
          <div className="text-center py-16 px-4">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load drivers
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Please check database connection and try again.
            </p>
          </div>
        )}

        {!isLoading && !isError && filteredDrivers.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-950 text-xl text-slate-400 border border-slate-100 dark:border-white/5">
              🚚
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-950 dark:text-slate-100">
              No drivers found
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 max-w-xs mx-auto">
              {drivers.length === 0
                ? "Get started by adding your first driver profile."
                : "No drivers match your active filters. Try adjusting your search query."}
            </p>
            {drivers.length === 0 && (
              <button
                type="button"
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Driver
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && filteredDrivers.length > 0 && (
          <>
            <OrderListPaginationBar
              startEntry={startEntry}
              endEntry={endEntry}
              totalEntries={filteredDrivers.length}
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
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Code</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">License</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Expiry</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Vehicle</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {paginatedDrivers.map((d) => {
                    const id = rowKey(d);
                    const code = d.driver_code || "—";
                    const name = d.name || "Unnamed Driver";
                    const phone = d.phone || "—";
                    const lic = d.license_no || "—";
                    const expiry = formatDateReadOnly(d.license_expiry);

                    let vehicleLabel = "—";
                    let assignedVehicleId = "";
                    if (d.assigned_vehicle) {
                      if (typeof d.assigned_vehicle === "object") {
                        const av = d.assigned_vehicle as Record<string, unknown>;
                        assignedVehicleId = String(av._id ?? av.id ?? "");
                        vehicleLabel = String(av.vehicle_no ?? "") || "—";
                      } else {
                        assignedVehicleId = String(d.assigned_vehicle);
                        vehicleLabel = vehicleMap.get(assignedVehicleId) || "—";
                      }
                    }

                    const statusStr = (d.status || "available").toLowerCase();

                    return (
                      <tr
                        key={id || code}
                        className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                          {name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-600 dark:text-slate-400">
                          {code}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400">
                          {phone}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-600 dark:text-slate-400">
                          {lic}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400">
                          {expiry}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {assignedVehicleId && vehicleLabel !== "—" ? (
                            <Link
                              href={`/dispatch/vehicles/${assignedVehicleId}`}
                              className="font-mono font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              {vehicleLabel}
                            </Link>
                          ) : (
                            <span className="text-slate-500 dark:text-slate-400">{vehicleLabel}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {renderDriverStatusBadge(statusStr)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            {id ? (
                              <Link
                                href={`/dispatch/drivers/${id}`}
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
                                onClick={() => setDeleteTarget({ id, label: name })}
                                disabled={isDeletingDriver}
                                title="Delete driver"
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
        tabs={DRIVER_STATUS_TABS}
        activeTab={statusFilter}
        onTabChange={handleStatusChange}
        filteredCount={filteredDrivers.length}
        isFetching={isFetching}
        searchQuery={searchQuery}
        onClearSearch={() => handleSearchChange("")}
        priorityFilter="all"
        onPriorityFilterChange={() => {}}
        filterLabel="Status"
        filterOptions={[{ value: "all", label: "All" }]}
        showReset={showReset}
        onReset={resetFilters}
      />
    </div>
  );
}
