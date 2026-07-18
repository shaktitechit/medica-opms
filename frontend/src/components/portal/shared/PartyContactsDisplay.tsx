"use client";

import { Building2, Mail, Phone, User } from "lucide-react";

import { contactsFromParty, type PartyContact } from "@/lib/partyContacts";

const labelClass = "text-xs font-semibold text-slate-500 dark:text-slate-400";
const valueClass = "text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5";

function ContactCard({ contact, index }: { contact: PartyContact; index: number }) {
  return (
    <div className="rounded-xl border border-slate-200/90 p-4 dark:border-white/10 dark:bg-slate-950/20 space-y-3">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-blue-500" />
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-50">
          {contact.name || "Unnamed contact"}
        </h4>
        {index === 0 ? (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
            Primary
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelClass}>Department</label>
          <div className={`${valueClass} flex items-center gap-1.5`}>
            {contact.department ? (
              <>
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                {contact.department}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Phone</label>
          <div className={`${valueClass} flex items-center gap-1.5`}>
            {contact.phone ? (
              <>
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                {contact.phone}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Alternate Number</label>
          <div className={`${valueClass} flex items-center gap-1.5`}>
            {contact.alternate_phone ? (
              <>
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                {contact.alternate_phone}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Email</label>
          <div className={`${valueClass} flex items-center gap-1.5`}>
            {contact.email ? (
              <>
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                {contact.email}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type PartyContactsDisplayProps = {
  party: unknown;
};

export function PartyContactsDisplay({ party }: PartyContactsDisplayProps) {
  const contacts = contactsFromParty(party);

  if (contacts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-white/10">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          No contacts added yet
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Use Edit Contacts to add department-wise phone numbers and emails.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {contacts.map((contact, index) => (
        <ContactCard key={index} contact={contact} index={index} />
      ))}
    </div>
  );
}
