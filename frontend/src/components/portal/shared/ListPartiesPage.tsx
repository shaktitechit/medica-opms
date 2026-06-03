"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { ConfirmDeletePartyModal } from "@/components/portal/shared/ConfirmDeletePartyModal";
import { PartyDetailModal } from "@/components/portal/shared/PartyDetailModal";
import { BulkUploadPartiesModal } from "@/components/portal/shared/BulkUploadPartiesModal";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeletePartyMutation,
  useListPartiesQuery,
} from "@/store/api";

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

type PartyRow = {
  _id?: string;
  id?: string;
  party_name?: string;
  party_type?: "customer" | "supplier" | "both";
  contact_person?: string;
  mobile?: string;
  email?: string;
  gst_no?: string;
  drug_license_no?: string;
  district?: string;
  state?: string;
  payment_terms?: string;
  is_active?: boolean;
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

export type ListPartiesPageProps = {
  /** Portal home path e.g. `/finance` */
  portalHome: string;
};

export default function ListPartiesPage({ portalHome }: ListPartiesPageProps) {
  const { data, isFetching, isError, refetch } = useListPartiesQuery({});

  const parties = useMemo(
    () => pickList(data) as PartyRow[],
    [data],
  );

  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  // Search & filter states
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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
      setDeleteTarget(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [closePartyModal, deleteParty, deleteTarget, detailId]);

  // Clientside filtered list
  const filteredParties = useMemo(() => {
    return parties.filter((p) => {
      const matchSearch =
        !search.trim() ||
        (p.party_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.contact_person || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.mobile || "").includes(search) ||
        (p.gst_no || "").toLowerCase().includes(search.toLowerCase());

      const matchType =
        typeFilter === "all" || p.party_type === typeFilter;

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && p.is_active !== false) ||
        (statusFilter === "inactive" && p.is_active === false);

      return matchSearch && matchType && matchStatus;
    });
  }, [parties, search, typeFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <ConfirmDeletePartyModal
        partyId={deleteTarget?.id ?? null}
        partyLabel={deleteTarget?.label ?? ""}
        isDeleting={isDeletingParty}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
      />
      <PartyDetailModal
        partyId={createOpen ? null : detailId}
        create={createOpen}
        onClose={closePartyModal}
      />
      <BulkUploadPartiesModal
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/10 p-6 dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Parties Directory
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-xl">
              Manage client accounts, hospitals, suppliers, and distributors. Set addresses, drug licenses, and billing policies.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className={btnSecondaryClass}
              title="Reload database table"
            >
              🔄 Refresh
            </button>
            <Link href={portalHome} className={btnSecondaryClass}>
              ← Dashboard
            </Link>
            <button
              type="button"
              onClick={() => setBulkUploadOpen(true)}
              className={btnSecondaryClass}
            >
              📥 Bulk Upload
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition active:scale-[0.98] dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              ＋ Add Party
            </button>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-slate-900 shadow-sm">
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Search
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search by name, contact, mobile, GSTIN..."
              className="w-full rounded-lg border border-slate-200/90 bg-white pl-9 pr-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Party Type
          </label>
          <select
            className="w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="customer">Customer Only</option>
            <option value="supplier">Supplier Only</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Status
          </label>
          <select
            className="w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600/50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Main Grid/Table Card */}
      <div className="rounded-xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900 shadow-sm overflow-hidden">
        {isFetching && (
          <div className="flex flex-col items-center justify-center py-16 space-y-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading directory...</p>
          </div>
        )}

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

        {!isFetching && !isError && filteredParties.length === 0 && (
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

        {!isFetching && !isError && filteredParties.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-left text-xs">
              <thead className="bg-slate-50/75 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 border-b border-slate-200/60 dark:border-white/5">
                <tr>
                  <th className="px-4 py-3 font-semibold">Party Name</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Contact Person</th>
                  <th className="px-4 py-3 font-semibold">Mobile</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">GSTIN</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredParties.map((p) => {
                  const id = rowKey(p);
                  const label = rowLabel(p, id);
                  const name = p.party_name || "—";
                  const type = p.party_type || "customer";
                  const contact = p.contact_person?.trim() || "—";
                  const mob = p.mobile?.trim() || "—";
                  const email = p.email?.trim() || "—";
                  const gst = p.gst_no?.trim() || "—";

                  const distPart = p.district?.trim() || "";
                  const statePart = p.state?.trim() || "";
                  const locationText = [distPart, statePart].filter(Boolean).join(" / ") || "—";

                  const active = p.is_active !== false;

                  return (
                    <tr
                      key={id || label}
                      className="bg-white dark:bg-slate-900 transition hover:bg-slate-50/50 dark:hover:bg-white/5"
                    >
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-50 max-w-[200px] truncate">
                        {name}
                      </td>
                      <td className="px-4 py-3">
                        {type === "customer" && (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20">
                            Customer
                          </span>
                        )}
                        {type === "supplier" && (
                          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/20">
                            Supplier
                          </span>
                        )}
                        {type === "both" && (
                          <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-700/10 dark:bg-purple-500/10 dark:text-purple-400 dark:ring-purple-500/20">
                            Both
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[140px] truncate text-slate-700 dark:text-slate-300 font-medium">
                        {contact}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-400">
                        {mob}
                      </td>
                      <td className="px-4 py-3 truncate max-w-[140px] text-slate-600 dark:text-slate-400">
                        {email}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        {gst}
                      </td>
                      <td className="px-4 py-3 truncate max-w-[140px] text-slate-600 dark:text-slate-400">
                        {locationText}
                      </td>
                      <td className="px-4 py-3">
                        {active ? (
                          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-400" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-3.5">
                          <Link
                            href={id ? `${portalHome}/parties/${id}` : "#"}
                            className="font-semibold text-blue-600 hover:text-blue-700 hover:underline underline-offset-2 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            View & Edit
                          </Link>
                          <button
                            type="button"
                            className="font-semibold text-rose-600 hover:text-rose-700 hover:underline underline-offset-2 dark:text-rose-400 dark:hover:text-rose-300"
                            onClick={() => id && setDeleteTarget({ id, label })}
                            disabled={!id || isDeletingParty}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
