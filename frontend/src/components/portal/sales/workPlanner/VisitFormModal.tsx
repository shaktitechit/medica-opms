"use client";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import {
  useListPartiesQuery,
  useListUsersQuery,
  type WorkPlanVisitRecord,
} from "@/store/api";
import { useEffect, useMemo, useState } from "react";
import { salesUserLabel } from "./workPlanUtils";

export type VisitFormModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initial?: WorkPlanVisitRecord | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void | Promise<void>;
  /** When true (admin / super_admin), show searchable sales-person picker. */
  allowSalesUserSelect?: boolean;
  /** Prefill / controlled sales user for admin-created plans. */
  salesUserId?: string;
  salesUserLabel?: string;
};

function partyIdOf(party: WorkPlanVisitRecord["party"]): string {
  if (!party) return "";
  if (typeof party === "string") return party;
  return String(party._id || "");
}

type SalesUserRow = {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  department?: string;
};

export function VisitFormModal({
  open,
  mode,
  initial,
  isSaving,
  onClose,
  onSubmit,
  allowSalesUserSelect = false,
  salesUserId: salesUserIdProp,
  salesUserLabel: salesUserLabelProp,
}: VisitFormModalProps) {
  const partiesQ = useListPartiesQuery({ status: "active" }, { skip: !open });
  const usersQ = useListUsersQuery(
    { department: "sales" },
    { skip: !open || !allowSalesUserSelect },
  );

  const parties = useMemo(() => {
    const raw = partiesQ.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: unknown[] }).data;
    }
    return [];
  }, [partiesQ.data]);

  const salesUsers = useMemo(() => {
    const raw = usersQ.data;
    if (Array.isArray(raw)) return raw as SalesUserRow[];
    if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: SalesUserRow[] }).data;
    }
    return [] as SalesUserRow[];
  }, [usersQ.data]);

  const [partySearch, setPartySearch] = useState("");
  const [partyId, setPartyId] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [salesUserId, setSalesUserId] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [address, setAddress] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setPartyId(partyIdOf(initial?.party));
    setContactPerson(initial?.contact_person || "");
    setContactNumber(initial?.contact_number || "");
    setAddress(initial?.address || "");
    setStartTime(
      initial?.planned_start_time
        ? new Date(initial.planned_start_time).toISOString().slice(0, 16)
        : "",
    );
    setEndTime(
      initial?.planned_end_time
        ? new Date(initial.planned_end_time).toISOString().slice(0, 16)
        : "",
    );
    setPurpose(initial?.purpose || "");
    setNotes(initial?.notes || "");
    setPartySearch(
      typeof initial?.party === "object" ? initial.party?.party_name || "" : "",
    );
    const nextSalesId = salesUserIdProp || "";
    setSalesUserId(nextSalesId);
    if (nextSalesId) {
      const fromList = salesUsers.find(
        (u) => String(u._id || u.id || "") === nextSalesId,
      );
      setSalesSearch(
        salesUserLabelProp ||
          (fromList
            ? salesUserLabel(fromList)
            : salesUserLabelProp || ""),
      );
    } else {
      setSalesSearch("");
    }
  }, [open, initial, salesUserIdProp, salesUserLabelProp, salesUsers]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, isSaving, onClose]);

  const filteredParties = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    const list = parties as Array<{
      _id?: string;
      id?: string;
      party_name?: string;
      mobile?: string;
      contact_person?: string;
    }>;
    if (!q) return list.slice(0, 20);
    return list
      .filter((p) => String(p.party_name || "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [parties, partySearch]);

  const filteredSalesUsers = useMemo(() => {
    const q = salesSearch.trim().toLowerCase();
    if (!q) return salesUsers.slice(0, 20);
    return salesUsers
      .filter((u) => {
        const name = String(u.name || "").toLowerCase();
        const email = String(u.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 20);
  }, [salesUsers, salesSearch]);

  if (!open) return null;

  const canSubmit =
    Boolean(partyId) && (!allowSalesUserSelect || Boolean(salesUserId));

  return (
    <LargeModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
        role="presentation"
        onClick={() => !isSaving && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {mode === "create" ? "Add visit" : "Edit visit"}
            </h2>
          </div>
          <div className="space-y-3 px-5 py-4">
            {allowSalesUserSelect ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Sales person
                </label>
                <input
                  type="text"
                  value={salesSearch}
                  onChange={(e) => {
                    setSalesSearch(e.target.value);
                    setSalesUserId("");
                  }}
                  placeholder="Search sales user…"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                />
                {salesSearch && !salesUserId ? (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
                    {filteredSalesUsers.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-slate-500">
                        No sales users found
                      </li>
                    ) : (
                      filteredSalesUsers.map((u) => {
                        const id = String(u._id || u.id || "");
                        const label = salesUserLabel(u);
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-white/5"
                              onClick={() => {
                                setSalesUserId(id);
                                setSalesSearch(label === "—" ? id : label);
                              }}
                            >
                              <div className="font-medium text-slate-800 dark:text-slate-100">
                                {u.name || "Unnamed"}
                              </div>
                              {u.email ? (
                                <div className="text-2xs text-slate-500">
                                  {u.email}
                                </div>
                              ) : null}
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                ) : null}
                {salesUserId ? (
                  <p className="mt-1 text-2xs text-emerald-700 dark:text-emerald-400">
                    Selected for this plan
                  </p>
                ) : (
                  <p className="mt-1 text-2xs text-slate-500">
                    Required — plan will be created for the selected sales user
                  </p>
                )}
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Party
              </label>
              <input
                type="text"
                value={partySearch}
                onChange={(e) => {
                  setPartySearch(e.target.value);
                  setPartyId("");
                }}
                placeholder="Search party…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              />
              {partySearch && !partyId ? (
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
                  {filteredParties.map((p) => {
                    const id = String(p._id || p.id || "");
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-white/5"
                          onClick={() => {
                            setPartyId(id);
                            setPartySearch(p.party_name || "");
                            if (!contactPerson && p.contact_person) {
                              setContactPerson(p.contact_person);
                            }
                            if (!contactNumber && p.mobile) {
                              setContactNumber(p.mobile);
                            }
                          }}
                        >
                          {p.party_name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Contact person
                </label>
                <input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Contact number
                </label>
                <input
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Address
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Planned start
                </label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Planned end
                </label>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Purpose
              </label>
              <input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="rounded-lg border border-slate-200/95 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/15"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving || !canSubmit}
              onClick={() =>
                void onSubmit({
                  party: partyId,
                  ...(allowSalesUserSelect && salesUserId
                    ? { sales_user: salesUserId }
                    : {}),
                  contact_person: contactPerson || undefined,
                  contact_number: contactNumber || undefined,
                  address: address || undefined,
                  planned_start_time: startTime
                    ? new Date(startTime).toISOString()
                    : undefined,
                  planned_end_time: endTime
                    ? new Date(endTime).toISOString()
                    : undefined,
                  purpose: purpose || undefined,
                  notes: notes || undefined,
                })
              }
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : mode === "create" ? "Add visit" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </LargeModalPortal>
  );
}
