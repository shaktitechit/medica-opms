import {
  normalizeDepartment,
  resolveHomeDashboardPath,
} from "@/constants/dashboardAccess";

/** Non-HttpOnly: lets Edge middleware route without JWT in LS. Cleared together with Redux logout. */
export const SESSION_COOKIE_NAME = "medica_session";
export const DEPT_HINT_COOKIE_NAME = "medica_department_hint";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function setCookie(name: string, value: string, maxAge: number): void {
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; Path=/; Max-Age=${String(maxAge)}; SameSite=Lax`;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function readDepartmentHint(user: unknown): string {
  if (!user || typeof user !== "object") return "";
  const raw = (user as Record<string, unknown>).department;
  return normalizeDepartment(raw);
}

/** Sync minimal session markers after login/me so middleware can authorize navigations. */
export function persistSessionMarksFromAuth(input: {
  token: string | null | undefined;
  user: unknown;
}): void {
  if (typeof document === "undefined") return;
  const dept = readDepartmentHint(input.user);
  if (input.token) {
    setCookie(SESSION_COOKIE_NAME, "1", COOKIE_MAX_AGE_SECONDS);
    if (dept) setCookie(DEPT_HINT_COOKIE_NAME, dept, COOKIE_MAX_AGE_SECONDS);
    return;
  }
  deleteCookie(SESSION_COOKIE_NAME);
  deleteCookie(DEPT_HINT_COOKIE_NAME);
}

export function clearSessionMarks(): void {
  if (typeof document === "undefined") return;
  deleteCookie(SESSION_COOKIE_NAME);
  deleteCookie(DEPT_HINT_COOKIE_NAME);
}

/** Fallback when dept cookie missing but user object carries `department`. */
export function fallbackHomeHrefFromUser(user: unknown): string {
  const d = readDepartmentHint(user);
  return resolveHomeDashboardPath(d) ?? "/login";
}
