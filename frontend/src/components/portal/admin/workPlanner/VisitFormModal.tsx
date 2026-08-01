"use client";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import {
  useListPartiesQuery,
  useListUsersQuery,
  type WorkPlanVisitPartyType,
  type WorkPlanVisitRecord,
} from "@/store/api";
import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

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
  disablePartyEdit?: boolean;
};

function partyIdOf(party: WorkPlanVisitRecord["party"]): string {
  if (!party) return "";
  if (typeof party === "string") return party;
  return String(party._id || "");
}

function userLabel(u: { name?: string; email?: string; _id?: string; id?: string }): string {
  return u.name || u.email || String(u._id || u.id || "") || "—";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

type SalesUserRow = {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  department?: string;
};

type PartyRow = {
  _id?: string;
  id?: string;
  party_name?: string;
  mobile?: string;
  email?: string;
  contact_person?: string;
};

const PARTY_TYPE_OPTIONS: Array<{ value: WorkPlanVisitPartyType; label: string }> = [
  { value: "existing", label: "Existing Party" },
  { value: "new_party", label: "New Party" },
  { value: "new_lead", label: "New Leads" },
];

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";

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
  disablePartyEdit = false,
}: VisitFormModalProps) {
  const partiesQ = useListPartiesQuery({ status: "active" }, { skip: !open });
  const usersQ = useListUsersQuery(
    { department: "sales" },
    { skip: !open || !allowSalesUserSelect },
  );

  const parties = useMemo(() => {
    const raw = partiesQ.data;
    if (Array.isArray(raw)) return raw as PartyRow[];
    if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: PartyRow[] }).data;
    }
    return [] as PartyRow[];
  }, [partiesQ.data]);

  const salesUsers = useMemo(() => {
    const raw = usersQ.data;
    if (Array.isArray(raw)) return raw as SalesUserRow[];
    if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: SalesUserRow[] }).data;
    }
    return [] as SalesUserRow[];
  }, [usersQ.data]);

  const [partyType, setPartyType] = useState<WorkPlanVisitPartyType>("existing");
  const [partySearch, setPartySearch] = useState("");
  const [partyId, setPartyId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [salesUserId, setSalesUserId] = useState("");
  const [contacts, setContacts] = useState<Array<{
    contact_person: string;
    contact_number: string;
    contact_email: string;
  }>>([{ contact_person: "", contact_number: "", contact_email: "" }]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    const initialType =
      initial?.party_type ||
      (partyIdOf(initial?.party) ? "existing" : initial?.party_name ? "new_party" : "existing");
    setPartyType(initialType);
    setPartyId(partyIdOf(initial?.party));
    setPartyName(
      initial?.party_name ||
      (typeof initial?.party === "object" ? initial.party?.party_name || "" : "") ||
      "",
    );
    const initialContacts = initial?.contacts && initial.contacts.length > 0
      ? initial.contacts.map((c) => ({
          contact_person: c.contact_person || "",
          contact_number: c.contact_number || "",
          contact_email: c.contact_email || "",
        }))
      : [
          {
            contact_person: initial?.contact_person || "",
            contact_number: initial?.contact_number || "",
            contact_email: initial?.contact_email || (typeof initial?.party === "object" ? initial.party?.email || "" : "") || "",
          },
        ];
    setContacts(initialContacts);
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
      typeof initial?.party === "object"
        ? initial.party?.party_name || ""
        : initial?.party_name || "",
    );
    const nextSalesId = salesUserIdProp || "";
    setSalesUserId(nextSalesId);
    if (nextSalesId) {
      const fromList = salesUsers.find(
        (u) => String(u._id || u.id || "") === nextSalesId,
      );
      setSalesSearch(
        salesUserLabelProp || (fromList ? userLabel(fromList) : salesUserLabelProp || ""),
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
    if (!q) return parties.slice(0, 20);
    return parties
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

  const switchPartyType = (next: WorkPlanVisitPartyType) => {
    if (disablePartyEdit) return;
    setPartyType(next);
    setPartyId("");
    setPartySearch("");
    if (next !== "existing") {
      // Keep manually entered contact fields when switching between new party / lead.
    } else {
      setPartyName("");
    }
  };

  if (!open) return null;

  const requiredOk =
    Boolean(partyName.trim()) &&
    (partyType !== "existing" || Boolean(partyId)) &&
    (!allowSalesUserSelect || Boolean(salesUserId)) &&
    contacts.every((c) => Boolean(c.contact_person.trim()) && Boolean(c.contact_number.trim()) && isValidEmail(c.contact_email));

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
                <label className={labelClass}>Sales person</label>
                <input
                  type="text"
                  value={salesSearch}
                  onChange={(e) => {
                    setSalesSearch(e.target.value);
                    setSalesUserId("");
                  }}
                  placeholder="Search sales user…"
                  className={inputClass}
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
                        const label = userLabel(u);
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
                                <div className="text-2xs text-slate-500">{u.email}</div>
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
              <label className={labelClass}>Party type</label>
              <div className="flex flex-wrap gap-3">
                {PARTY_TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="radio"
                      name="visit-party-type"
                      value={opt.value}
                      checked={partyType === opt.value}
                      onChange={() => switchPartyType(opt.value)}
                      disabled={isSaving || disablePartyEdit}
                      className="h-3.5 w-3.5 border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {partyType === "existing" ? (
              <div>
                <label className={labelClass}>
                  Party name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={partySearch}
                  onChange={(e) => {
                    setPartySearch(e.target.value);
                    setPartyId("");
                    setPartyName("");
                  }}
                  disabled={isSaving || disablePartyEdit}
                  placeholder="Search and select party…"
                  className={inputClass}
                />
                {partySearch && !partyId ? (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
                    {filteredParties.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-slate-500">No parties found</li>
                    ) : (
                      filteredParties.map((p) => {
                        const id = String(p._id || p.id || "");
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-white/5"
                              onClick={() => {
                                 setPartyId(id);
                                 setPartySearch(p.party_name || "");
                                 setPartyName(p.party_name || "");
                                 setContacts([
                                   {
                                     contact_person: p.contact_person || "",
                                     contact_number: p.mobile || "",
                                     contact_email: p.email || "",
                                   },
                                 ]);
                              }}
                            >
                              <div className="font-medium text-slate-800 dark:text-slate-100">
                                {p.party_name}
                              </div>
                              {p.mobile || p.email ? (
                                <div className="text-2xs text-slate-500">
                                  {[p.mobile, p.email].filter(Boolean).join(" · ")}
                                </div>
                              ) : null}
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                ) : null}
                {partyId ? (
                  <p className="mt-1 text-2xs text-emerald-700 dark:text-emerald-400">
                    Party selected — contact fields below are required and editable
                  </p>
                ) : (
                  <p className="mt-1 text-2xs text-slate-500">Select an existing party</p>
                )}
              </div>
            ) : (
              <div>
                <label className={labelClass}>
                  Party name <span className="text-rose-500">*</span>
                </label>
                <input
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  disabled={isSaving || disablePartyEdit}
                  placeholder={
                    partyType === "new_lead"
                      ? "Enter lead / prospect name"
                      : "Enter new party name"
                  }
                  className={inputClass}
                />
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-slate-900/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Contacts</span>
                <button
                  type="button"
                  onClick={() => setContacts([...contacts, { contact_person: "", contact_number: "", contact_email: "" }])}
                  className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 transition"
                >
                  <Plus className="h-3 w-3" /> Add Contact
                </button>
              </div>

              {contacts.map((c, idx) => (
                <div key={idx} className="relative space-y-2 border-t border-slate-200/60 pt-2 first:border-0 first:pt-0 dark:border-white/10">
                  {contacts.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setContacts(contacts.filter((_, i) => i !== idx))}
                      className="absolute right-0 top-0 text-slate-400 hover:text-rose-600 transition"
                      title="Remove contact"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>
                        Contact person name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        value={c.contact_person}
                        onChange={(e) => {
                          const next = [...contacts];
                          next[idx].contact_person = e.target.value;
                          setContacts(next);
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Contact number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        value={c.contact_number}
                        onChange={(e) => {
                          const next = [...contacts];
                          next[idx].contact_number = e.target.value;
                          setContacts(next);
                        }}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>
                      Contact email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={c.contact_email}
                      onChange={(e) => {
                        const next = [...contacts];
                        next[idx].contact_email = e.target.value;
                        setContacts(next);
                      }}
                      placeholder="name@example.com"
                      className={inputClass}
                    />
                    {c.contact_email.trim() && !isValidEmail(c.contact_email) ? (
                      <p className="mt-1 text-2xs text-rose-600">Enter a valid email address</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Planned start</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Planned end</label>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Purpose</label>
              <input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inputClass}
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
              disabled={isSaving || !requiredOk}
              onClick={() =>
                void onSubmit({
                  party_type: partyType,
                  ...(partyType === "existing" ? { party: partyId } : {}),
                  ...(allowSalesUserSelect && salesUserId
                    ? { sales_user: salesUserId }
                    : {}),
                  party_name: partyName.trim(),
                  contact_person: contacts[0]?.contact_person.trim() || "",
                  contact_number: contacts[0]?.contact_number.trim() || "",
                  contact_email: contacts[0]?.contact_email.trim().toLowerCase() || "",
                  contacts: contacts.map((c) => ({
                    contact_person: c.contact_person.trim(),
                    contact_number: c.contact_number.trim(),
                    contact_email: c.contact_email.trim().toLowerCase(),
                  })),
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

export default VisitFormModal;
