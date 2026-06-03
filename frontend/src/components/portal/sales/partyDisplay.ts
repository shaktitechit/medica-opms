/** Resolve party / order counterparty labels (list API often returns ids only). */

export function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

export function partyRecordName(record: unknown): string {
  if (record == null || typeof record !== "object") return "";
  const c = record as Record<string, unknown>;
  if (typeof c.party_name === "string" && c.party_name.trim())
    return c.party_name.trim();
  if (typeof c.contact_person === "string" && c.contact_person.trim())
    return c.contact_person.trim();
  return "";
}

export function buildPartyNameById(partiesRaw: unknown): Map<string, string> {
  const list = pickList(partiesRaw);
  const map = new Map<string, string>();
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
    if (!id) continue;
    const label = partyRecordName(row);
    if (label) map.set(id, label);
  }
  return map;
}

export function resolvePartyDisplay(
  party: unknown,
  nameById: Map<string, string>,
): string {
  if (party == null) return "—";
  if (typeof party === "object") {
    const embedded = partyRecordName(party);
    if (embedded) return embedded;
    const o = party as Record<string, unknown>;
    const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
    if (id && nameById.has(id)) return nameById.get(id)!;
    return id || "—";
  }
  if (typeof party === "string") {
    const id = party.trim();
    if (!id) return "—";
    return nameById.get(id) ?? `Party ${id.slice(0, 8)}…`;
  }
  return "—";
}

/** Prefer `party` on order; fallback label for legacy `customer` ids. */
export function resolveOrderCounterparty(
  detail: Record<string, unknown>,
  partyNameById: Map<string, string>,
): string {
  const party = detail.party;
  if (party != null && party !== "")
    return resolvePartyDisplay(party, partyNameById);
  const cust = detail.customer;
  if (cust == null) return "—";
  const cid =
    typeof cust === "string"
      ? cust
      : typeof cust === "object" && cust
        ? String(
            (cust as { _id?: unknown })._id ?? (cust as { id?: unknown }).id ?? "",
          )
        : "";
  if (!cid) return "—";
  return `Legacy · ${cid.slice(0, 8)}…`;
}
