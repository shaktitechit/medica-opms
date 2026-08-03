"use client";

import { LargeModalPortal } from "./LargeModalPortal";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  type ZoneRecord,
  useListZonesQuery,
  useCreateZoneMutation,
  usePatchZoneMutation,
  useDeleteZoneMutation,
} from "@/store/api";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { ListEntitySearchPanel } from "@/components/portal/shared/orderList/ListEntitySearchPanel";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { RefreshCw, Plus, Edit, Trash2, X, MapPin, Users } from "lucide-react";
import ZoneDetailModal from "./ZoneDetailModal";

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
] as const;

export type ListZonePartiesPageProps = {
  portalHome?: string;
};

export default function ListZonePartiesPage({
  portalHome = "/admin",
}: ListZonePartiesPageProps) {
  const router = useRouter();
  const { data, isLoading, isFetching, isError, refetch } = useListZonesQuery({
    limit: 1000,
  });
  const rows = useMemo(() => (Array.isArray(data?.data) ? (data.data as ZoneRecord[]) : []), [data]);

  const [createZone] = useCreateZoneMutation();
  const [patchZone] = usePatchZoneMutation();
  const [deleteZone] = useDeleteZoneMutation();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modals state
  const [editTarget, setEditTarget] = useState<ZoneRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ZoneRecord | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  }, []);

  const handleStatusChange = useCallback((val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  }, []);

  const openCreate = () => {
    setCreateOpen(true);
  };

  const openEdit = (zone: ZoneRecord) => {
    setEditTarget(zone);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteZone(deleteTarget._id).unwrap();
      toast.success("Zone deleted successfully");
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to delete zone");
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "active" && !r.is_active) return false;
      if (statusFilter === "inactive" && r.is_active) return false;

      if (!q) return true;
      return [r.name, r.description]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(q));
    });
  }, [rows, searchQuery, statusFilter]);

  const paged = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startEntry = filtered.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, filtered.length);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <PortalBusyOverlay active={isLoading} message="Processing..." />

      {/* Header Panel */}
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Zone Management
            </h1>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Define operational zones, associate parties and assign sales persons to them.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
            >
              <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
            >
              <Plus className="size-3" />
              Add Zone
            </button>
          </div>
        </div>
      </div>

      <ListEntitySearchPanel
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        desktopPlaceholder="Search by name or description..."
        mobilePlaceholder="Search zones..."
        compact
      />

      {/* Main Table Container */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {isError && (
          <div className="text-center py-16 px-4">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load zones
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Please check your backend connection and try again.
            </p>
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="text-center py-16 px-4">
            <MapPin className="mx-auto size-12 text-slate-350 dark:text-slate-600" />
            <h3 className="mt-3 text-sm font-semibold text-slate-950 dark:text-slate-100">
              No zones found
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 max-w-xs mx-auto">
              Add your first operational zone to begin structuring your parties and sales team associations.
            </p>
          </div>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <>
            <OrderListPaginationBar
              startEntry={startEntry}
              endEntry={endEntry}
              totalEntries={filtered.length}
              itemsPerPage={itemsPerPage}
              onItemsPerPageChange={(v) => {
                setItemsPerPage(v);
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
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Parties Count</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Sales Persons</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {paged.map((row) => (
                    <tr key={row._id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white">
                        {row.name}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {row.description || "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ring-inset ${
                            row.is_active
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/25 dark:bg-emerald-500/10 dark:text-emerald-450 dark:ring-emerald-500/20"
                              : "bg-slate-50 text-slate-650 ring-slate-600/20 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10"
                          }`}
                        >
                          {row.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-700 dark:text-slate-350">
                        {row.parties?.length ?? 0}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700 dark:text-slate-350">
                        {row.sales_persons && row.sales_persons.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.sales_persons.map((s: any) => (
                              <span
                                key={s._id}
                                className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-3xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                              >
                                {s.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() =>
                              router.push(
                                `${portalHome}/parties?view=zone-parties&zoneId=${row._id}&zoneName=${encodeURIComponent(
                                  row.name
                                )}`
                              )
                            }
                            className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-blue-600 hover:bg-blue-50/50 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-500/10 text-xs font-semibold transition shadow-sm cursor-pointer"
                          >
                            <Users className="size-3" />
                            Manage
                          </button>
                          <button
                            onClick={() => openEdit(row)}
                            className="inline-flex items-center justify-center rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
                          >
                            <Edit className="size-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(row)}
                            className="inline-flex items-center justify-center rounded border border-slate-200 p-1 text-rose-600 hover:bg-rose-50 dark:border-white/10 dark:text-rose-450 dark:hover:bg-rose-500/10 cursor-pointer"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Create / Edit Modal */}
      {(createOpen || editTarget) && (
        <ZoneDetailModal
          zoneId={editTarget?._id ?? null}
          create={createOpen}
          onClose={() => {
            setCreateOpen(false);
            setEditTarget(null);
          }}
          onSuccess={() => refetch()}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <LargeModalPortal>
          <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-200 dark:border-white/10 max-w-md p-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              ⚠️ Delete Zone
            </h3>
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
              Are you sure you want to delete the zone <strong>{deleteTarget.name}</strong>? This action will remove the zone mapping from all associated parties and sales persons.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-55 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </LargeModalPortal>
      )}
    </div>
  );
}
