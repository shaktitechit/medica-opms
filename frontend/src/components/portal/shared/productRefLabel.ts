/** Product group / brand / manufacturer / subgroup may be a name string or `{ _id, name }`. */

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * Display label for a product ref field. Never returns a bare Mongo ObjectId.
 */
export function productRefLabel(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (name != null && String(name).trim()) return String(name).trim();
    return "";
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s || OBJECT_ID_RE.test(s)) return "";
    return s;
  }
  return "";
}
