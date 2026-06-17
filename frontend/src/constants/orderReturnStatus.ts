export const ORDER_RETURN_STATUS = {
  PENDING: "pending",
  RECEIVED_AT_WAREHOUSE: "received_at_warehouse",
} as const;

export type OrderReturnStatus =
  (typeof ORDER_RETURN_STATUS)[keyof typeof ORDER_RETURN_STATUS];

export function normalizeReturnStatus(status: unknown): string {
  const s = String(status || ORDER_RETURN_STATUS.PENDING);
  if (s === "received") return ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE;
  return s;
}

export function isReturnReceivedAtWarehouse(status: unknown): boolean {
  return normalizeReturnStatus(status) === ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE;
}

export function isReturnPending(status: unknown): boolean {
  return normalizeReturnStatus(status) === ORDER_RETURN_STATUS.PENDING;
}

export function returnStatusLabel(status: unknown): string {
  return normalizeReturnStatus(status).replace(/_/g, " ");
}

export function returnStatusBadgeClass(status: unknown): string {
  const s = normalizeReturnStatus(status);
  if (s === ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE) {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400";
  }
  return "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400";
}
