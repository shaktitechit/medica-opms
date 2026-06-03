/**
 * Public backend origin (`NEXT_PUBLIC_API_ORIGIN`).
 * Defaults to localhost for local dev against the Medica Express API.
 */
export function publicApiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_ORIGIN?.trim();
  if (!raw) return "http://localhost:5000";
  return raw.replace(/\/+$/, "");
}
