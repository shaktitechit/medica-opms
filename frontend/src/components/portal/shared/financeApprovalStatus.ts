/**
 * Finance approval display state — separate from dispatch/transport execution status.
 * Driven by order.finance_approval_status and line-level approved vs ordered quantities.
 */

import { deriveOrderWorkflowStatus } from "./orderLifecycle";
import { lineApprovalQuantities, resolveAccountApprovalStatus } from "./orderLineQuantities";

export type FinanceApprovalDisplayStatus =
  | "finance_review"
  | "partially_finance_approved"
  | "fully_finance_approved"
  | "finance_rejected";

export type FinanceApprovalCapabilities = {
  displayStatus: FinanceApprovalDisplayStatus;
  financeApprovalStatus: "pending" | "partial" | "full" | "rejected";
  pendingFinanceQty: number;
  approvedQty: number;
  orderedQty: number;
  financeApprovalCount: number;
  hasFinanceApprovalRecord: boolean;
  canReviewAndApprove: boolean;
  canApproveRemaining: boolean;
  canSendToDispatch: boolean;
  isPartiallyApproved: boolean;
  isFullyApproved: boolean;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * True after finance has explicitly handed the order to dispatch (sent_to_dispatch)
 * or execution has started. `dispatch_review` alone means finance-approved and
 * waiting for "Send to Dispatch" — not yet in the dispatch queue.
 */
const DISPATCH_HANDOFF_STATUSES = new Set([
  "dispatch_pending",
  "partial_dispatch_created",
  "full_dispatch_created",
  "transport_pending",
  "partially_transported",
  "fully_transported",
  "transport_assigned",
  "in_transit",
  "delivered",
]);

/** Status history row from GET /orders/:id/history (OrderStatusHistory). */
export function statusHistoryHasDispatchHandoff(
  history: Record<string, unknown>[] | undefined,
): boolean {
  if (!history?.length) return false;
  return history.some((row) => {
    const toStatus = String(row.to_status ?? "").trim();
    return toStatus === "dispatch_pending";
  });
}

export function isOrderSentToDispatch(
  order: Record<string, unknown> | null,
  options?: {
    statusHistory?: Record<string, unknown>[];
    fulfillmentSnapshot?: Record<string, unknown> | null;
  },
): boolean {
  if (!order) return false;

  const legacyStatus = typeof order.status === "string" ? order.status.trim() : "";
  if (legacyStatus === "dispatch_pending") return true;

  const action = String(order.current_action || "").trim();
  if (action === "sent_to_dispatch") return true;

  const stage = String(order.workflow_stage || "").trim();
  if (stage === "dispatch_execution" || stage === "completed") {
    return true;
  }

  const snap = options?.fulfillmentSnapshot;
  if (snap) {
    if (String(snap.current_action ?? "").trim() === "sent_to_dispatch") {
      return true;
    }
    if (String(snap.status ?? "").trim() === "dispatch_pending") {
      return true;
    }
  }

  if (statusHistoryHasDispatchHandoff(options?.statusHistory)) {
    return true;
  }

  const workflowStatus = deriveOrderWorkflowStatus(order);
  return DISPATCH_HANDOFF_STATUSES.has(workflowStatus);
}

/** Finance has handed the order to dispatch review / queue (Send to Dispatch completed). */
export function orderHasDispatchReviewHandoff(
  order: Record<string, unknown> | null,
  options?: {
    statusHistory?: Record<string, unknown>[];
    fulfillmentSnapshot?: Record<string, unknown> | null;
  },
): boolean {
  return isOrderSentToDispatch(order, options);
}

export function deriveFinanceApprovalDisplayStatus(
  order: Record<string, unknown> | null,
): FinanceApprovalDisplayStatus {
  if (!order) return "finance_review";

  const fas = typeof order.finance_approval_status === "string"
    ? order.finance_approval_status
    : "pending";

  if (fas === "rejected") return "finance_rejected";
  if (fas === "full") return "fully_finance_approved";
  if (fas === "partial") return "partially_finance_approved";

  const stage = typeof order.workflow_stage === "string" ? order.workflow_stage : "";
  if (stage === "finance_review") return "finance_review";

  const items = Array.isArray(order.order_items) ? order.order_items : [];
  let hasSalesPool = false;
  let hasFinanceApproved = false;
  let allFinanceComplete = true;

  for (const line of items) {
    if (!line || typeof line !== "object") continue;
    const q = lineApprovalQuantities(line as Record<string, unknown>);
    if (q.salesApproved > 0) {
      hasSalesPool = true;
      if (q.financeApproved > 0) hasFinanceApproved = true;
      if (q.financeApproved < q.salesApproved) allFinanceComplete = false;
    }
  }

  if (!hasSalesPool) return "finance_review";
  if (!hasFinanceApproved) return "finance_review";
  return allFinanceComplete ? "fully_finance_approved" : "partially_finance_approved";
}

export function computeFinanceApprovalCapabilities(
  order: Record<string, unknown> | null,
  fulfillmentTotals?: Record<string, unknown> | null,
  options?: {
    financeApprovalCount?: number;
    /** At least one OrderApproval in an approved (non-rejected) state */
    hasApprovedFinanceApproval?: boolean;
  },
): FinanceApprovalCapabilities {
  const displayStatus = deriveFinanceApprovalDisplayStatus(order);
  const financeApprovalStatus =
    (typeof order?.finance_approval_status === "string"
      ? order.finance_approval_status
      : displayStatus === "fully_finance_approved"
        ? "full"
        : displayStatus === "partially_finance_approved"
          ? "partial"
          : displayStatus === "finance_rejected"
            ? "rejected"
            : "pending") as FinanceApprovalCapabilities["financeApprovalStatus"];

  const items = Array.isArray(order?.order_items) ? order!.order_items! : [];
  let orderedQty = num(fulfillmentTotals?.ordered);
  let salesApprovedQty = num(fulfillmentTotals?.salesApproved);
  let approvedQty = num(fulfillmentTotals?.approved);
  let pendingFinanceQty = num(fulfillmentTotals?.pendingFinance);

  if (!fulfillmentTotals) {
    for (const line of items) {
      if (!line || typeof line !== "object") continue;
      const q = lineApprovalQuantities(line as Record<string, unknown>);
      orderedQty += q.ordered;
      salesApprovedQty += q.salesApproved;
      approvedQty += q.financeApproved;
      pendingFinanceQty += q.pendingFinance;
    }
  }

  const workflowStage =
    typeof order?.workflow_stage === "string" ? order.workflow_stage : "";
  const legacyStatus = typeof order?.status === "string" ? order.status : "";

  const isPartiallyApproved = financeApprovalStatus === "partial";
  const isFullyApproved = financeApprovalStatus === "full";

  const inFinancePhase =
    workflowStage === "finance_review" ||
    displayStatus === "finance_review" ||
    legacyStatus === "finance_review";

  const canReviewAndApprove =
    inFinancePhase &&
    financeApprovalStatus !== "rejected" &&
    pendingFinanceQty > 0 &&
    salesApprovedQty > 0;

  const canApproveRemaining = isPartiallyApproved && pendingFinanceQty > 0;

  const financeApprovalCount = Math.max(0, Number(options?.financeApprovalCount ?? 0));
  const hasFinanceApprovalRecord = financeApprovalCount > 0;
  const hasApprovedFinanceApproval = Boolean(options?.hasApprovedFinanceApproval);

  const accountApprovalStatus = resolveAccountApprovalStatus(order);
  const accountClearedForDispatch =
    accountApprovalStatus === "full" || accountApprovalStatus === "partial";

  const canSendToDispatch =
    hasFinanceApprovalRecord &&
    (approvedQty > 0 || hasApprovedFinanceApproval) &&
    financeApprovalStatus !== "rejected" &&
    accountClearedForDispatch &&
    !isOrderSentToDispatch(order);

  return {
    displayStatus,
    financeApprovalStatus,
    pendingFinanceQty,
    approvedQty,
    orderedQty,
    financeApprovalCount,
    hasFinanceApprovalRecord,
    canReviewAndApprove,
    canApproveRemaining,
    canSendToDispatch,
    isPartiallyApproved,
    isFullyApproved,
  };
}

export function financeApprovalStatusLabel(
  status: FinanceApprovalDisplayStatus,
): string {
  switch (status) {
    case "partially_finance_approved":
      return "Partially Finance Approved";
    case "fully_finance_approved":
      return "Fully Finance Approved";
    case "finance_rejected":
      return "Finance Rejected";
    default:
      return "Finance Review";
  }
}
