"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  type ProductSubgroupRecord,
  useListProductSubgroupsQuery,
  useCreateProductSubgroupMutation,
  usePatchProductSubgroupMutation,
  useDeleteProductSubgroupMutation,
  useListProductGroupsQuery,
} from "@/store/api";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { ListEntitySearchPanel } from "@/components/portal/shared/orderList/ListEntitySearchPanel";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { RefreshCw, Plus, Edit, Trash2, X, Package } from "lucide-react";

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
] as const;

export type ListProductSubgroupsPageProps = {
  portalHome?: string;
};

export default function ListProductSubgroupsPage({
  portalHome = "/admin",
}: ListProductSubgroupsPageProps) {
  const router = useRouter();
  const { data, isLoading, isFetching, isError, refetch } = useListProductSubgroupsQuery({
    limit: 1000,
  });
  const rows = useMemo(() => (Array.isArray(data?.data) ? (data.data as ProductSubgroupRecord[]) : []), [data]);

  // Load Groups for selection filter and form options
  const { data: groupsData } = useListProductGroupsQuery({ limit: 1000 });
  const groupsList = useMemo(() => (Array.isArray(groupsData?.data) ? groupsData.data : []), [groupsData]);

  const [createProductSubgroup] = useCreateProductSubgroupMutation();
  const [patchProductSubgroup] = usePatchProductSubgroupMutation();
  const [deleteProductSubgroup] = useDeleteProductSubgroupMutation();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modals state
  const [editTarget, setEditTarget] = useState<ProductSubgroupRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductSubgroupRecord | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formGroup, setFormGroup] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formFeatured, setFormFeatured] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  }, []);

  const handleStatusChange = useCallback((val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  }, []);

  const openCreate = () => {
    setFormName("");
    setFormGroup(groupsList[0]?._id || "");
    setFormDesc("");
    setFormActive(true);
    setFormFeatured(false);
    setCreateOpen(true);
  };

  const openEdit = (subgroup: ProductSubgroupRecord) => {
    setEditTarget(subgroup);
    setFormName(subgroup.name);
    const grpId = subgroup.group && typeof subgroup.group === "object" ? subgroup.group._id : subgroup.group;
    setFormGroup(grpId || "");
    setFormDesc(subgroup.description || "");
    setFormActive(subgroup.is_active);
    setFormFeatured(!!subgroup.is_featured);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!formGroup) {
      toast.error("Product Group is required");
      return;
    }

    setIsSaving(true);
    try {
      if (editTarget) {
        await patchProductSubgroup({
          id: editTarget._id,
          patch: { name: formName.trim(), group: formGroup, description: formDesc.trim(), is_active: formActive, is_featured: formFeatured },
        }).unwrap();
        toast.success("Product Subgroup updated successfully");
        setEditTarget(null);
      } else {
        await createProductSubgroup({
          name: formName.trim(),
          group: formGroup,
          description: formDesc.trim(),
          is_active: formActive,
          is_featured: formFeatured,
        }).unwrap();
        toast.success("Product Subgroup created successfully");
        setCreateOpen(false);
      }
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to save product subgroup");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsSaving(true);
    try {
      await deleteProductSubgroup(deleteTarget._id).unwrap();
      toast.success("Product Subgroup deleted successfully");
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to delete product subgroup");
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "active" && !r.is_active) return false;
      if (statusFilter === "inactive" && r.is_active) return false;

      if (groupFilter !== "all") {
        const grpId = r.group && typeof r.group === "object" ? r.group._id : r.group;
        if (grpId !== groupFilter) return false;
      }

      if (!q) return true;
      const groupName = r.group && typeof r.group === "object" ? r.group.name : "";
      return [r.name, r.description, groupName]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(q));
    });
  }, [rows, searchQuery, statusFilter, groupFilter]);

  const paged = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startEntry = filtered.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, filtered.length);

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Product Subgroups</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage granular product classifications linked under commercial groups
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 cursor-pointer"
          >
            <Plus className="size-4" />
            Add Subgroup
          </button>
        </div>
      </div>

      {/* Search & Tabs & Filter */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 p-4 border-b border-slate-100 dark:border-white/5 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 max-w-md">
            <ListEntitySearchPanel
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              desktopPlaceholder="Search subgroup name, description, group..."
              mobilePlaceholder="Search subgroups..."
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 whitespace-nowrap">Filter Group:</label>
            <select
              value={groupFilter}
              onChange={(e) => {
                setGroupFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="all">All Groups</option>
              {groupsList.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="flex border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01] px-4 py-2 gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleStatusChange(tab.id)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                statusFilter === tab.id
                  ? "bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-205"
                  : "text-slate-500 hover:bg-slate-105 dark:text-slate-400 dark:hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table list */}
        <div className="relative overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-slate-500">Loading Product Subgroups...</div>
          ) : isError ? (
            <div className="py-12 text-center text-rose-500">Failed to load product subgroups.</div>
          ) : paged.length === 0 ? (
            <div className="py-12 text-center text-slate-500">No product subgroups found.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-400">
                  <th className="px-4 py-3">Subgroup Name</th>
                  <th className="px-4 py-3">Commercial Group</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700 dark:divide-white/5 dark:text-slate-300">
                {paged.map((row) => (
                  <tr key={row._id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01]">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{row.name}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                      {row.group && typeof row.group === "object" ? row.group.name : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{row.description || "—"}</td>
                    <td className="px-4 py-3 space-x-1.5">
                      {row.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] text-green-700 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-green-600/10 dark:ring-green-500/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-slate-500/10 dark:ring-slate-500/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          Inactive
                        </span>
                      )}
                      {row.is_featured && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-amber-600/10 dark:ring-amber-500/20">
                          ★ Featured
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => router.push(`${portalHome}/products?view=subgroup-products&subgroupId=${row._id}&subgroupName=${encodeURIComponent(row.name)}`)}
                        className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 shadow-sm transition hover:bg-blue-100 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 cursor-pointer"
                      >
                        <Package className="size-3" />
                        Products
                      </button>
                      <button
                        onClick={() => openEdit(row)}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
                      >
                        <Edit className="size-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(row)}
                        className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 cursor-pointer"
                      >
                        <Trash2 className="size-3" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="border-t border-slate-100 p-4 dark:border-white/5">
          <OrderListPaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            startEntry={startEntry}
            endEntry={endEntry}
            totalEntries={filtered.length}
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={setItemsPerPage}
          />
        </div>
      </div>

      {/* Create/Edit Modal */}
      {(createOpen || editTarget) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5">
              <h2 className="font-semibold text-slate-955 dark:text-white">
                {editTarget ? "Edit Product Subgroup" : "Create Product Subgroup"}
              </h2>
              <button
                onClick={() => {
                  setCreateOpen(false);
                  setEditTarget(null);
                }}
                className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Name*</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Analgesics"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-955 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Commercial Group*</label>
                <select
                  required
                  value={formGroup}
                  onChange={(e) => setFormGroup(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-505 dark:border-white/10 dark:bg-slate-955 dark:text-slate-100 cursor-pointer"
                >
                  <option value="">-- Choose Group --</option>
                  {groupsList.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Add details about this subgroup..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-505 dark:border-white/10 dark:bg-slate-955 dark:text-slate-100 resize-none"
                />
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="subgroup-is-active"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                  />
                  <label htmlFor="subgroup-is-active" className="text-xs text-slate-700 dark:text-slate-300 select-none cursor-pointer">
                    Is Active
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="subgroup-is-featured"
                    checked={formFeatured}
                    onChange={(e) => setFormFeatured(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                  />
                  <label htmlFor="subgroup-is-featured" className="text-xs text-slate-700 dark:text-slate-300 select-none cursor-pointer">
                    Is Featured
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    setEditTarget(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50 cursor-pointer"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-white/10 p-6 space-y-4">
            <h3 className="font-bold text-slate-955 dark:text-white">Delete Product Subgroup</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Are you sure you want to delete Product Subgroup <strong className="text-slate-955 dark:text-white">"{deleteTarget.name}"</strong>? Associated products will not be deleted but will lose this subgroup.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isSaving}
                className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Busy Overlay */}
      <PortalBusyOverlay active={isSaving} />
    </div>
  );
}
