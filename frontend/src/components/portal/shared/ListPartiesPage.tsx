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
  Search,
  X,
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
import {  mutationRejectedMessage,
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
import { dateFilterSelectClass } from "@/components/portal/shared/orderList/orderListDateFilter";

const btnCompactClass =
  "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer";

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

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
  };
  const handleTypeChange = (val: string) => {
    setTypeFilter(val);
    setCurrentPage(1);
  };
  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  };

  const handleResetFilters = useCallback(() => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("active");
    setCurrentPage(1);
  }, []);

  const filtersActive =
    search.trim() !== "" || typeFilter !== "all" || statusFilter !== "active";

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

  const openView = useCallback((id: string) => {
    setCreateOpen(false);
    setDetailId(id);
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

  // Total matched records from backend pagination
  const totalMatching = useMemo(() => {
    if (data && typeof data === "object" && "total" in data) {
      return Number((data as any).total) || 0;
    }
    return parties.length;
  }, [data, parties]);

  const totalPages = useMemo(() => {
    if (data && typeof data === "object" && "pages" in data) {
      return Number((data as any).pages) || 1;
    }
    return 1;
  }, [data]);

  const startEntry = totalMatching > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * itemsPerPage, totalMatching);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
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

      {/* Compact Control Strip */}
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Parties Directory
          </h1>
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

      {/* Search + filters inline */}
      <div className="relative shrink-0 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-2 md:hidden">
          <div className="relative min-w-0">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
              <Search className="h-3.5 w-3.5" />
            </span>
            <input
              type="text"
              placeholder="Search parties…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              className={`${dateFilterSelectClass} min-w-0 flex-1`}
              value={typeFilter}
              onChange={(e) => handleTypeChange(e.target.value)}
              aria-label="Party type"
            >
              <option value="all">All Types</option>
              <option value="customer">Customer</option>
              <option value="supplier">Supplier</option>
              <option value="both">Both</option>
            </select>
            <select
              className={`${dateFilterSelectClass} min-w-0 flex-1`}
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              aria-label="Party status"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Search by name, contact, phone, email, GSTIN..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            className={`${dateFilterSelectClass} min-w-[8.5rem] py-2 text-sm`}
            value={typeFilter}
            onChange={(e) => handleTypeChange(e.target.value)}
            aria-label="Party type"
          >
            <option value="all">All Types</option>
            <option value="customer">Customer Only</option>
            <option value="supplier">Supplier Only</option>
            <option value="both">Both</option>
          </select>
          <select
            className={`${dateFilterSelectClass} min-w-[8.5rem] py-2 text-sm`}
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            aria-label="Party status"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          {filtersActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main table card */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
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
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-50 dark:hover:bg-rose-600 text-xs font-semibold shadow-sm transition active:scale-[0.98]"
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

          <div className="flex shrink-0 items-center gap-4 border-b border-slate-100 bg-slate-50/50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-white/5 dark:bg-slate-950/20 dark:text-slate-400">
            <div className="flex items-center gap-3 shrink-0">
              <input
                type="checkbox"
                checked={isAllOnPageSelected}
                onChange={toggleSelectAllOnPage}
                className="h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 cursor-pointer"
              />
            </div>
            <div className="flex-1">Party Details</div>
            <div className="hidden lg:block lg:flex-[2] max-w-2xl">Contact & Location</div>
            <div className="w-24 text-right">Actions</div>
          </div>

          <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-white/5">
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
              const gst = p.gst_no?.trim() || "—";

              const distPart = p.district?.trim() || "";
              const statePart = p.state?.trim() || "";
              const locationText = [distPart, statePart].filter(Boolean).join(" / ") || "—";

              const active = p.is_active !== false;

              return (
                <div
                  key={id || label}
                  className="flex flex-col justify-between gap-4 p-4 transition duration-150 hover:bg-slate-50/50 dark:hover:bg-white/5 lg:flex-row lg:items-center"
                >
                  <div className="flex items-center gap-3 shrink-0 self-start lg:self-center">
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
                      className="h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-950 cursor-pointer"
                    />
                  </div>
                  {/* Left Column: Icon, Party Name, Type & Status badges, GSTIN */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/5 dark:text-blue-400 shrink-0">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate max-w-[280px]">
                          {name}
                        </h3>
                        {/* Type Badge */}
                        {type === "customer" && (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20">
                            Customer
                          </span>
                        )}
                        {type === "supplier" && (
                          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/20">
                            Supplier
                          </span>
                        )}
                        {type === "both" && (
                          <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700 ring-1 ring-inset ring-purple-700/10 dark:bg-purple-500/10 dark:text-purple-400 dark:ring-purple-500/20">
                            Both
                          </span>
                        )}
                        {/* Status badge */}
                        {active ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-green-700 dark:text-green-400 font-semibold bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-green-600/10 dark:ring-green-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium bg-slate-50 dark:bg-slate-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-slate-500/10 dark:ring-slate-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Inactive
                          </span>
                        )}
                        {p.sra && (
                          <span
                            className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full ring-1 ring-inset ring-emerald-600/10 dark:ring-emerald-500/20"
                            title={`Special Rate Approval Enabled${p.sra_from_date || p.sra_to_date ? ` (${formatDateShort(p.sra_from_date)} - ${formatDateShort(p.sra_to_date)})` : ''}`}
                          >
                            SRA {p.sra_from_date || p.sra_to_date ? `(${formatDateShort(p.sra_from_date)} - ${formatDateShort(p.sra_to_date)})` : ''}
                          </span>
                        )}
                      </div>
                      {/* GSTIN and ID */}
                      {gst && gst !== "—" && (
                        <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          <FileText className="h-3.5 w-3.5 text-slate-400" />
                          <span>GSTIN: {gst}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Middle Column: Grid of Metadata details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs lg:flex-[2] max-w-2xl w-full">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 sm:col-span-2">
                      <User className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate" title={contact}>
                        <span className="text-slate-400 mr-1">Primary contact:</span>
                        <strong className="font-semibold text-slate-800 dark:text-slate-200">
                          {contact}
                          {extraContacts ? (
                            <span className="font-normal text-slate-500">{extraContacts}</span>
                          ) : null}
                        </strong>
                        {department ? (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-400">
                            {department}
                          </span>
                        ) : null}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="tabular-nums">
                        <span className="text-slate-400 mr-1">Phone:</span>
                        <strong className="font-semibold text-slate-800 dark:text-slate-200 font-medium">
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

                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate" title={locationText}>
                        <span className="text-slate-400 mr-1">Location:</span>
                        <strong className="font-semibold text-slate-800 dark:text-slate-200 font-medium">
                          {locationText}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex items-center gap-2 self-start sm:self-end lg:self-auto pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-white/5 w-full lg:w-auto justify-end">
                    <Link
                      href={id ? `${portalHome}/parties/${id}` : "#"}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-blue-600 hover:bg-blue-50/50 active:bg-blue-100 dark:border-blue-500/30 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-500/10 text-xs font-semibold transition shadow-sm"
                    >
                      <span>View & Edit</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-250 bg-white text-rose-600 hover:bg-rose-50/50 active:bg-rose-100 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-500/10 text-xs font-semibold disabled:opacity-50 transition shadow-sm"
                      onClick={() => id && setDeleteTarget({ id, label })}
                      disabled={!id || isDeletingParty}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      {filtersActive && (
        <div className="shrink-0 border-t border-slate-200 bg-white/95 px-4 py-1.5 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-900/95 md:hidden">
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400"
          >
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
