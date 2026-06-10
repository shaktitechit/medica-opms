import { userDashboardDepartment } from "@/constants/dashboardAccess";

const PARTIES_BULK_UPLOAD_DEPARTMENTS = new Set([
  "admin",
  "finance",
  "super_admin",
]);

export function getUserPermissionCodes(user: unknown): string[] {
  if (!user || typeof user !== "object") return [];
  const codes = (user as { permissionCodes?: unknown }).permissionCodes;
  if (!Array.isArray(codes)) return [];
  return codes.filter((c): c is string => typeof c === "string");
}

export function userHasAnyPermission(user: unknown, required: string[]): boolean {
  const codes = getUserPermissionCodes(user);
  if (codes.includes("*")) return true;
  return required.some((code) => codes.includes(code));
}

/** Admin and finance portals may bulk-upload parties (plus super_admin). */
export function canBulkUploadParties(user: unknown): boolean {
  const dept = userDashboardDepartment(user);
  if (PARTIES_BULK_UPLOAD_DEPARTMENTS.has(dept)) return true;
  return userHasAnyPermission(user, ["parties:manage", "*"]);
}
