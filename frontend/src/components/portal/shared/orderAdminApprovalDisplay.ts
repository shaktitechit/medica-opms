import { lineApprovalQuantities, num } from "./orderLineQuantities";

function approvalItemsList(
  approval: Record<string, unknown>,
): Record<string, unknown>[] {
  return Array.isArray(approval.approval_items)
    ? (approval.approval_items as Record<string, unknown>[])
    : [];
}

/** Cumulative admin-approved qty per order line from approval audit records. */
export function cumulativeAdminApprovedQtyByLine(
  approvals: Record<string, unknown>[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const approval of approvals) {
    const status = String(approval.approval_status ?? "");
    if (status !== "approved" && status !== "sent_to_finance") continue;
    for (const item of approvalItemsList(approval)) {
      if (String(item.approval_status ?? "") === "rejected") continue;
      const qty = num(item.approved_quantity);
      if (qty <= 0) continue;
      const key = String(item.order_item_id ?? "");
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + qty);
    }
  }
  return map;
}

/**
 * Merge persisted `sales_approved_quantity` with totals from admin approval records
 * (handles legacy rows before the field was stored on order lines).
 */
export function withAdminApprovalQuantities(
  items: Record<string, unknown>[],
  approvals: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (items.length === 0) return items;
  const fromApprovals = cumulativeAdminApprovedQtyByLine(approvals);
  if (fromApprovals.size === 0) return items;

  return items.map((line) => {
    const lineId = String(line._id ?? line.id ?? "");
    const ordered = num(line.ordered_quantity ?? line.quantity);
    const persisted = num(line.sales_approved_quantity);
    const audited = fromApprovals.get(lineId) ?? 0;
    const salesApproved = Math.min(ordered, Math.max(persisted, audited));
    if (salesApproved === persisted) return line;
    return { ...line, sales_approved_quantity: salesApproved };
  });
}

/** Pick the latest admin approval record that completed sales review. */
export function pickLatestAdminSalesApproval(
  rows: unknown[],
): Record<string, unknown> | null {
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const status = String((row as Record<string, unknown>).approval_status ?? "");
    if (status === "approved" || status === "sent_to_finance") {
      return row as Record<string, unknown>;
    }
  }
  return null;
}

/** True when any line still has quantity left to approve at admin review. */
export function hasRemainingAdminApprovalQty(
  items: Record<string, unknown>[],
): boolean {
  return items.some((line) => lineApprovalQuantities(line).pendingAdmin > 0);
}

export function hasAdminApprovalStarted(
  items: Record<string, unknown>[],
): boolean {
  return items.some((line) => lineApprovalQuantities(line).salesApproved > 0);
}

/** True when a prior approval left quantity to approve on one or more lines. */
export function isAdminApprovalContinuation(
  items: Record<string, unknown>[],
): boolean {
  return (
    hasAdminApprovalStarted(items) && hasRemainingAdminApprovalQty(items)
  );
}

/** Whether admin can open the approval modal (initial or continue). */
export function canOpenAdminApprovalModal(
  status: string,
  items: Record<string, unknown>[],
): boolean {
  if (status === "submitted" || status === "on_hold") return true;
  if (isAdminApprovalContinuation(items)) return true;
  return false;
}

/** Label for the primary approval action button. */
export function adminApprovalActionLabel(
  _status: string,
  items: Record<string, unknown>[],
): string {
  if (isAdminApprovalContinuation(items)) {
    return "Continue Approval";
  }
  return "Approve Items";
}

/** Approval id suitable for send-to-finance (approved, not yet sent). */
export function pickSendableAdminApprovalId(rows: unknown[]): string {
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (String(record.approval_status) !== "approved") continue;
    const id = String(record._id ?? record.id ?? "").trim();
    if (id) return id;
  }
  return "";
}
