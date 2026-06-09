export type PartyContact = {
  name: string;
  department: string;
  phone: string;
  email: string;
  alternate_phone: string;
};

export function emptyPartyContact(): PartyContact {
  return {
    name: "",
    department: "",
    phone: "",
    email: "",
    alternate_phone: "",
  };
}

function stringField(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function sanitizePartyContacts(contacts: PartyContact[]): PartyContact[] {
  return contacts
    .map((c) => ({
      name: c.name.trim(),
      department: c.department.trim(),
      phone: c.phone.trim(),
      email: c.email.trim().toLowerCase(),
      alternate_phone: c.alternate_phone.trim(),
    }))
    .filter(
      (c) =>
        c.name || c.department || c.phone || c.email || c.alternate_phone,
    );
}

export function contactsFromParty(raw: unknown): PartyContact[] {
  if (!raw || typeof raw !== "object") return [];
  const p = raw as Record<string, unknown>;

  if (Array.isArray(p.contacts) && p.contacts.length > 0) {
    return p.contacts
      .filter((c): c is Record<string, unknown> => c != null && typeof c === "object")
      .map((c) => ({
        name: stringField(c.name),
        department: stringField(c.department),
        phone: stringField(c.phone),
        email: stringField(c.email),
        alternate_phone: stringField(c.alternate_phone),
      }));
  }

  const legacyName = stringField(p.contact_person);
  const legacyPhone = stringField(p.mobile);
  const legacyEmail = stringField(p.email);
  if (legacyName || legacyPhone || legacyEmail) {
    return [
      {
        name: legacyName,
        department: "",
        phone: legacyPhone,
        email: legacyEmail,
        alternate_phone: "",
      },
    ];
  }

  return [];
}

export function primaryContactDisplay(raw: unknown): {
  name: string;
  department: string;
  phone: string;
  email: string;
  total: number;
} {
  const contacts = contactsFromParty(raw);
  const primary = contacts[0];
  if (primary) {
    return {
      name: primary.name || "—",
      department: primary.department || "",
      phone: primary.phone || "—",
      email: primary.email || "—",
      total: contacts.length,
    };
  }

  if (!raw || typeof raw !== "object") {
    return { name: "—", department: "", phone: "—", email: "—", total: 0 };
  }

  const p = raw as Record<string, unknown>;
  return {
    name: stringField(p.contact_person) || "—",
    department: "",
    phone: stringField(p.mobile) || "—",
    email: stringField(p.email) || "—",
    total: 0,
  };
}

export function contactsEqual(a: PartyContact[], b: PartyContact[]): boolean {
  return JSON.stringify(sanitizePartyContacts(a)) === JSON.stringify(sanitizePartyContacts(b));
}

const BULK_CONTACT_SLOTS = 5;

function pickString(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const direct = raw[key];
    if (direct != null && String(direct).trim()) return String(direct).trim();
    const lower = raw[key.toLowerCase()];
    if (lower != null && String(lower).trim()) return String(lower).trim();
  }
  return "";
}

function readBulkContactSlot(
  raw: Record<string, unknown>,
  slot: number,
): PartyContact | null {
  if (slot === 1) {
    const contact: PartyContact = {
      name: pickString(raw, ["contact_name", "contact_person", "contact"]),
      department: pickString(raw, ["contact_department", "department"]),
      phone: pickString(raw, ["contact_phone", "mobile", "phone"]),
      email: pickString(raw, ["contact_email", "email"]),
      alternate_phone: pickString(raw, [
        "contact_alternate_phone",
        "alternate_phone",
        "alt_phone",
      ]),
    };
    if (
      contact.name ||
      contact.department ||
      contact.phone ||
      contact.email ||
      contact.alternate_phone
    ) {
      return contact;
    }
    return null;
  }

  const prefix = `contact_${slot}`;
  const contact: PartyContact = {
    name: pickString(raw, [`${prefix}_name`, `${prefix}_person`]),
    department: pickString(raw, [`${prefix}_department`]),
    phone: pickString(raw, [`${prefix}_phone`, `${prefix}_mobile`]),
    email: pickString(raw, [`${prefix}_email`]),
    alternate_phone: pickString(raw, [
      `${prefix}_alternate_phone`,
      `${prefix}_alt_phone`,
    ]),
  };

  if (
    contact.name ||
    contact.department ||
    contact.phone ||
    contact.email ||
    contact.alternate_phone
  ) {
    return contact;
  }
  return null;
}

export function contactsFromBulkRow(raw: Record<string, unknown>): PartyContact[] {
  if (Array.isArray(raw.contacts)) {
    return sanitizePartyContacts(
      raw.contacts
        .filter((c): c is Record<string, unknown> => c != null && typeof c === "object")
        .map((c) => ({
          name: stringField(c.name),
          department: stringField(c.department),
          phone: stringField(c.phone),
          email: stringField(c.email),
          alternate_phone: stringField(c.alternate_phone),
        })),
    );
  }

  const contacts: PartyContact[] = [];
  for (let slot = 1; slot <= BULK_CONTACT_SLOTS; slot++) {
    const contact = readBulkContactSlot(raw, slot);
    if (contact) contacts.push(contact);
  }
  return contacts;
}

export function hasContactPhone(contacts: PartyContact[]): boolean {
  return contacts.some((c) => c.phone.trim());
}

export function formatContactsSummary(contacts: PartyContact[]): string {
  if (contacts.length === 0) return "No contacts";
  const primary = contacts[0];
  const parts = [primary.name || "Unnamed", primary.department].filter(Boolean);
  const label = parts.join(" · ") || primary.phone || primary.email || "Contact";
  if (contacts.length === 1) return label;
  return `${label} (+${contacts.length - 1} more)`;
}
