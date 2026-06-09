"use client";

import { Plus, Trash2 } from "lucide-react";

import {
  emptyPartyContact,
  type PartyContact,
} from "@/lib/partyContacts";

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";

export type PartyContactsEditorProps = {
  contacts: PartyContact[];
  onChange: (contacts: PartyContact[]) => void;
  disabled?: boolean;
};

export function PartyContactsEditor({
  contacts,
  onChange,
  disabled = false,
}: PartyContactsEditorProps) {
  const rows = contacts.length > 0 ? contacts : [emptyPartyContact()];

  const updateContact = (index: number, patch: Partial<PartyContact>) => {
    const next = rows.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange(next);
  };

  const addContact = () => {
    onChange([...rows, emptyPartyContact()]);
  };

  const removeContact = (index: number) => {
    if (rows.length <= 1) {
      onChange([emptyPartyContact()]);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {rows.map((contact, index) => (
        <div
          key={index}
          className="rounded-xl border border-slate-200/90 p-4 dark:border-white/10 dark:bg-slate-950/20 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Contact {index + 1}
              {index === 0 ? (
                <span className="ml-2 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                  Primary
                </span>
              ) : null}
            </h4>
            <button
              type="button"
              onClick={() => removeContact(index)}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className={labelClass}>Contact Name</label>
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. Dr. Rajesh Kumar"
                value={contact.name}
                onChange={(e) => updateContact(index, { name: e.target.value })}
                disabled={disabled}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Department</label>
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. Purchase, Accounts"
                value={contact.department}
                onChange={(e) => updateContact(index, { department: e.target.value })}
                disabled={disabled}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>
                Phone{index === 0 ? " *" : ""}
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. +91 9999988888"
                value={contact.phone}
                onChange={(e) => updateContact(index, { phone: e.target.value })}
                disabled={disabled}
              />
            </div>

            <div className="space-y-1">
              <label className={labelClass}>Alternate Number</label>
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. +91 8888877777"
                value={contact.alternate_phone}
                onChange={(e) =>
                  updateContact(index, { alternate_phone: e.target.value })
                }
                disabled={disabled}
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className={labelClass}>Email</label>
              <input
                type="email"
                className={inputClass}
                placeholder="e.g. billing@apollomed.com"
                value={contact.email}
                onChange={(e) => updateContact(index, { email: e.target.value })}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addContact}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-500/40 dark:text-blue-400 dark:hover:bg-blue-500/10"
      >
        <Plus className="h-4 w-4" />
        Add Another Contact
      </button>
    </div>
  );
}
