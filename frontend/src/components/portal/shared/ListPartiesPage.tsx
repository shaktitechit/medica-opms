"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  ExternalLink,
  Trash2,
  RefreshCw,
  LayoutDashboard,
  Plus,
  Upload,
  TableProperties,
} from "lucide-react";

import { primaryContactDisplay } from "@/lib/partyContacts";
import { canBulkUploadParties } from "@/lib/permissions";
import { ConfirmDeletePartyModal } from "@/components/portal/shared/ConfirmDeletePartyModal";
import { ConfirmBulkDeletePartiesModal } from "@/components/portal/shared/ConfirmBulkDeletePartiesModal";
import { PartyDetailModal } from "@/components/portal/shared/PartyDetailModal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { BulkUploadPartiesModal } from "@/components/portal/shared/BulkUploadPartiesModal";
import { GoogleSheetPartiesModal } from "@/components/portal/shared/GoogleSheetPartiesModal";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeletePartyMutation,
  useListPartiesQuery,
  useBulkDeletePartiesMutation,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { ListEntitySearchPanel } from "@/components/portal/shared/orderList/ListEntitySearchPanel";
import { OrderListBottomTabStrip } from "@/components/portal/shared/orderList/OrderListBottomTabStrip";

const btnCompactClass =
  "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer";

const PARTY_TYPE_TABS = [
  { id: "all", label: "All" },
  { id: "customer", label: "Customer" },
  { id: "supplier", label: "Supplier" },
  { id: "both", label: "Both" },
] as const;

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
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

type PartyRow = {
  _id?: string;
  id?: string;
  party_name?: string;
  party_type?: "customer" | "supplier" | "both";
  contact_person?: string;
  mobile?: string;
  email?: string;
  contacts?: Array<{
    name?: string;
    department?: string;
    phone?: string;
    email?: string;
    alternate_phone?: string;
  }>;
  gst_no?: string;
  drug_license_no?: string;
  district?: string;
  state?: string;
  payment_terms?: string;
  is_active?: boolean;
  sra?: boolean;
  sra_from_date?: string;
  sra_to_date?: string;
};

function rowKey(row: unknown): string {
  if (row && typeof row === "object") {
    const o = row as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return "";
}

function rowLabel(row: PartyRow, fallbackId: string): string {
  if (typeof row.party_name === "string" && row.party_name.trim())
    return row.party_name.trim();
  return fallbackId || "Party";
}

function formatDateShort(v: unknown): string {
  if (v == null || v === "") return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function renderPartyTypeBadge(type: string) {
  if (type === "customer") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-2xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20">
        Customer
      </span>
    );
  }
  if (type === "supplier") {
    return (
      <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-2xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/20">
        Supplier
      </span>
    );
  }
  if (type === "both") {
    return (
      <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-2xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-700/10 dark:bg-purple-500/10 dark:text-purple-400 dark:ring-purple-500/20">
        Both
      </span>
    );
  }
  return null;
}

function renderActiveBadge(active: boolean) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1 text-2xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-green-600/10 dark:ring-green-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-2xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-slate-500/10 dark:ring-slate-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Inactive
    </span>
  );
}

export type ListPartiesPageProps = {
  /** Portal home path e.g. `/finance` */
  portalHome: string;
};

export default function ListPartiesPage({ portalHome }: ListPartiesPageProps) {
  const user = useAppSelector((s) => s.auth.user);
  const mayBulkUpload = canBulkUploadParties(user);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 350);

    return () => clearTimeout(handler);
  }, [search]);

  const { data, isLoading, isFetching, isError, refetch } = useListPartiesQuery({
    paginate: "true",
    page: currentPage.toString(),
    limit: itemsPerPage.toString(),
    search: debouncedSearch,
    type: typeFilter,
    status: statusFilter,
  });

  const parties = useMemo(
    () => pickList(data) as PartyRow[],
    [data],
  );

  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [googleSheetOpen, setGoogleSheetOpen] = useState(false);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    setCurrentPage(1);
  }, []);

  const handleTypeChange = useCallback((val: string) => {
    setTypeFilter(val);
    setCurrentPage(1);
  }, []);

  const handleStatusChange = useCallback((val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("active");
    setCurrentPage(1);
  }, []);

  const showReset =
    search.trim() !== "" || typeFilter !== "all" || statusFilter !== "active";

  const searchPanelFilters = useMemo(
    () => [
      {
        id: "type",
        value: typeFilter,
        onChange: handleTypeChange,
        ariaLabel: "Party type",
        label: "Type",
        options: [
          { value: "all", label: "All Types" },
          { value: "customer", label: "Customer" },
          { value: "supplier", label: "Supplier" },
          { value: "both", label: "Both" },
        ],
      },
      {
        id: "status",
        value: statusFilter,
        onChange: handleStatusChange,
        ariaLabel: "Party status",
        label: "Status",
        options: [
          { value: "all", label: "All Statuses" },
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
    ],
    [handleStatusChange, handleTypeChange, statusFilter, typeFilter],
  );

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const [deleteParty, { isLoading: isDeletingParty }] =
    useDeletePartyMutation();

  const closePartyModal = useCallback(() => {
    setDetailId(null);
    setCreateOpen(false);
  }, []);

  const openCreate = useCallback(() => {
    setDetailId(null);
    setCreateOpen(true);
  }, []);

  const closeDeleteModal = useCallback(() => setDeleteTarget(null), []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    try {
      await deleteParty(id).unwrap();
      toast.success(mutationSuccessCopy("deleteParty"));
      if (detailId === id) closePartyModal();
      setSelectedIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [closePartyModal, deleteParty, deleteTarget, detailId]);

  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<string[] | null>(null);

  const [bulkDeleteParties, { isLoading: isBulkDeleting }] = useBulkDeletePartiesMutation();

  const selectedCount = useMemo(() => {
    return Object.keys(selectedIds).filter((id) => selectedIds[id]).length;
  }, [selectedIds]);

  const isAllOnPageSelected = useMemo(() => {
    if (parties.length === 0) return false;
    return parties.every((p) => {
      const id = rowKey(p);
      return id && !!selectedIds[id];
    });
  }, [parties, selectedIds]);

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (isAllOnPageSelected) {
        parties.forEach((p) => {
          const id = rowKey(p);
          if (id) {
            delete next[id];
          }
        });
      } else {
        parties.forEach((p) => {
          const id = rowKey(p);
          if (id) {
            next[id] = true;
          }
        });
      }
      return next;
    });
  }, [isAllOnPageSelected, parties]);

  const closeBulkDeleteModal = useCallback(() => setBulkDeleteTarget(null), []);

  const confirmBulkDelete = useCallback(async () => {
    if (!bulkDeleteTarget || bulkDeleteTarget.length === 0) return;
    try {
      await bulkDeleteParties(bulkDeleteTarget).unwrap();
      toast.success(`Successfully deleted ${bulkDeleteTarget.length} parties`);
      setSelectedIds((prev) => {
        const next = { ...prev };
        bulkDeleteTarget.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      setBulkDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [bulkDeleteParties, bulkDeleteTarget]);

  const totalMatching = useMemo(() => {
    if (data && typeof data === "object" && "total" in data) {
      return Number((data as { total?: unknown }).total) || 0;
    }
    return parties.length;
  }, [data, parties]);

  const totalPages = useMemo(() => {
    if (data && typeof data === "object" && "pages" in data) {
      return Number((data as { pages?: unknown }).pages) || 1;
    }
    return 1;
  }, [data]);

  const startEntry = totalMatching > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, totalMatching);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <PortalBusyOverlay active={isLoading} message="Loading parties…" />
      <ConfirmDeletePartyModal
        partyId={deleteTarget?.id ?? null}
        partyLabel={deleteTarget?.label ?? ""}
        isDeleting={isDeletingParty}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
      />
      <ConfirmBulkDeletePartiesModal
        isOpen={bulkDeleteTarget !== null}
        selectedCount={bulkDeleteTarget?.length ?? 0}
        isDeleting={isBulkDeleting}
        onClose={closeBulkDeleteModal}
        onConfirm={confirmBulkDelete}
      />
      <PartyDetailModal
        partyId={createOpen ? null : detailId}
        create={createOpen}
        portalHome={portalHome}
        onClose={closePartyModal}
      />
      <BulkUploadPartiesModal
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => refetch()}
      />
      <GoogleSheetPartiesModal
        isOpen={googleSheetOpen}
        onClose={() => setGoogleSheetOpen(false)}
        onSuccess={() => refetch()}
      />

      <div className="relative shrink-0 overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Parties Directory
            </h1>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 max-w-xl">
              Manage customers and suppliers for order clearance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className={btnCompactClass}
              title="Reload database table"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link href={portalHome} className={btnCompactClass}>
              <LayoutDashboard className="h-3 w-3" />
              Dashboard
            </Link>
            {mayBulkUpload && (
              <button type="button" onClick={() => setBulkUploadOpen(true)} className={btnCompactClass}>
                <Upload className="h-3 w-3" />
                Bulk Upload
              </button>
            )}
            <button
              type="button"
              onClick={() => setGoogleSheetOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
              <TableProperties className="h-3 w-3" />
              Sheet
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              <Plus className="h-3 w-3" />
              Add Party
            </button>
          </div>
        </div>
      </div>

      <ListEntitySearchPanel
        searchQuery={search}
        onSearchChange={handleSearchChange}
        desktopPlaceholder="Search by name, contact, phone, email, GSTIN..."
        mobilePlaceholder="Search parties…"
        filters={searchPanelFilters}
        compact
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {isError && (
          <div className="text-center py-16 px-4">
            <span className="text-2xl">⚠️</span>
            <h3 className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Failed to load parties
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Please check your database connection and try again.
            </p>
          </div>
        )}

        {!isLoading && !isError && totalMatching === 0 && (
          <div className="text-center py-16 px-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-950 text-xl text-slate-400">
              👥
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-950 dark:text-slate-100">
              No parties found
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 max-w-xs mx-auto">
              {parties.length === 0
                ? "Get started by adding your first party profile or importing from a template."
                : "No profiles match your active filters. Try adjusting your search query."}
            </p>
            {parties.length === 0 && (
              <button
                type="button"
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 transition"
              >
                ＋ Add Party
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && totalMatching > 0 && (
          <>
            {selectedCount > 0 && (
              <div className="flex items-center justify-between px-5 py-3.5 bg-blue-500/5 dark:bg-blue-500/10 border-b border-blue-100 dark:border-blue-500/20 text-sm">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <span className="font-semibold">{selectedCount}</span>
                  <span>parties selected</span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds({})}
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline font-medium"
                  >
                    Clear selection
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setBulkDeleteTarget(Object.keys(selectedIds).filter((id) => selectedIds[id]))}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-500 dark:hover:bg-rose-600 text-xs font-semibold shadow-sm transition active:scale-[0.98]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Selected ({selectedCount})</span>
                </button>
              </div>
            )}

            <OrderListPaginationBar
              startEntry={startEntry}
              endEntry={endEntry}
              totalEntries={totalMatching}
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
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isAllOnPageSelected}
                        onChange={toggleSelectAllOnPage}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 cursor-pointer"
                        aria-label="Select all on page"
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Party</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {parties.map((p) => {
                    const id = rowKey(p);
                    const label = rowLabel(p, id);
                    const name = p.party_name || "—";
                    const type = p.party_type || "customer";
                    const primaryContact = primaryContactDisplay(p);
                    const contact = primaryContact.name;
                    const department = primaryContact.department;
                    const mob = primaryContact.phone;
                    const email = primaryContact.email;
                    const extraContacts =
                      primaryContact.total > 1 ? ` (+${primaryContact.total - 1} more)` : "";
                    const gst = p.gst_no?.trim() || "";

                    const distPart = p.district?.trim() || "";
                    const statePart = p.state?.trim() || "";
                    const locationText = [distPart, statePart].filter(Boolean).join(" / ") || "—";

                    const active = p.is_active !== false;

                    return (
                      <tr
                        key={id || label}
                        className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={!!(id && selectedIds[id])}
                            onChange={(e) => {
                              if (id) {
                                setSelectedIds((prev) => ({
                                  ...prev,
                                  [id]: e.target.checked,
                                }));
                              }
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 cursor-pointer"
                            aria-label={`Select ${name}`}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-2 min-w-0">
                            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/5 dark:text-blue-400 shrink-0">
                              <Building2 className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-slate-50 break-words">
                                {name}
                              </div>
                              {gst ? (
                                <p className="mt-1 flex items-center gap-1 font-mono text-2xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  <FileText className="h-3 w-3 shrink-0 text-slate-400" />
                                  <span>GSTIN: {gst}</span>
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          {renderPartyTypeBadge(type)}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {renderActiveBadge(active)}
                            {p.sra ? (
                              <span
                                className="inline-flex items-center text-2xs text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-emerald-600/10 dark:ring-emerald-500/20"
                                title={`Special Rate Approval Enabled${p.sra_from_date || p.sra_to_date ? ` (${formatDateShort(p.sra_from_date)} - ${formatDateShort(p.sra_to_date)})` : ""}`}
                              >
                                SRA{p.sra_from_date || p.sra_to_date ? ` (${formatDateShort(p.sra_from_date)} - ${formatDateShort(p.sra_to_date)})` : ""}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-1.5 text-slate-600 dark:text-slate-400 min-w-0">
                            <User className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                            <span className="break-words" title={contact}>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {contact}
                                {extraContacts ? (
                                  <span className="font-normal text-slate-500">{extraContacts}</span>
                                ) : null}
                              </span>
                              {department ? (
                                <span className="ml-1.5 inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-2xs font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-400">
                                  {department}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="font-medium text-slate-800 dark:text-slate-200">{mob}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate font-mono text-slate-800 dark:text-slate-200" title={email}>
                              {email}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate font-medium text-slate-800 dark:text-slate-200" title={locationText}>
                              {locationText}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={id ? `${portalHome}/parties/${id}` : "#"}
                              className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-blue-600 hover:bg-blue-50/50 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-500/10 text-xs font-semibold transition shadow-sm"
                            >
                              <span>View</span>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded border border-slate-200 hover:border-rose-300 p-1 text-rose-600 hover:bg-rose-50 dark:border-white/10 dark:text-rose-400 dark:hover:bg-rose-950/30 transition cursor-pointer disabled:opacity-50"
                              onClick={() => id && setDeleteTarget({ id, label })}
                              disabled={!id || isDeletingParty}
                              title="Delete party"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
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
        tabs={PARTY_TYPE_TABS}
        activeTab={typeFilter}
        onTabChange={handleTypeChange}
        filteredCount={totalMatching}
        isFetching={isFetching}
        searchQuery={search}
        onClearSearch={() => handleSearchChange("")}
        priorityFilter={statusFilter}
        onPriorityFilterChange={handleStatusChange}
        filterLabel="Status"
        filterOptions={STATUS_FILTER_OPTIONS}
        showReset={showReset}
        onReset={handleResetFilters}
        compact
      />
    </div>
  );
}
