/** Shared helpers for resolving user labels in portal views. */

export function pickUsersList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

export function buildUserNameById(usersRaw: unknown): Record<string, string> {
  const list = pickUsersList(usersRaw);
  const map: Record<string, string> = {};
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
    if (!id) continue;
    const name = typeof o.name === "string" ? o.name.trim() : typeof o.username === "string" ? o.username.trim() : "";
    if (name) map[id] = name;
  }
  return map;
}

export function resolveUserDisplay(
  userVal: unknown,
  nameById: Record<string, string>,
): string {
  if (userVal == null) return "—";
  if (typeof userVal === "object") {
    const o = userVal as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : typeof o.username === "string" ? o.username.trim() : "";
    if (name) return name;
    const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
    if (id && nameById[id]) return nameById[id];
    return id || "—";
  }
  if (typeof userVal === "string") {
    const id = userVal.trim();
    if (!id) return "—";
    return nameById[id] ?? id;
  }
  return "—";
}
