/**
 * Public backend origin (`NEXT_PUBLIC_API_ORIGIN`).
 * Defaults to localhost for local dev against the Medica Express API.
 */
export function publicApiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_ORIGIN?.trim();
  if (!raw) return "http://localhost:5001";
  return raw.replace(/\/+$/, "");
}

/** Company name for PDF letterheads and branded exports (`NEXT_PUBLIC_COMPANY_NAME`). */
export function companyLetterheadName(): string {
  const raw = process.env.NEXT_PUBLIC_COMPANY_NAME?.trim();
  return raw || "Medica Enterprises";
}

/** Logo path or URL for PDF letterheads (`NEXT_PUBLIC_COMPANY_LOGO_URL`). */
export function companyLetterheadLogoUrl(): string {
  const raw = process.env.NEXT_PUBLIC_COMPANY_LOGO_URL?.trim();
  return raw || "/medica-logo.png";
}

/** Resolves a public logo path to an absolute URL for canvas/PDF capture. */
export function resolvePublicAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (typeof window !== "undefined") {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return new URL(normalized, window.location.origin).href;
  }
  return path.startsWith("/") ? path : `/${path}`;
}
