/**
 * Shared Hold / Cancel / Reject gating for portal order detail screens.
 * These actions stay available until an OrderDispatch batch is created and submitted.
 */

const TERMINAL_STATUSES = new Set([
  "cancelled",
  "closed",
  "delivered",
  "finance_rejected",
  "account_rejected",
]);

/** Dispatch batch statuses that mean the batch left account draft and was sent onward. */
const SUBMITTED_OR_BEYOND = new Set(["submitted", "transport_created"]);

export function dispatchBatchStatus(dispatch: Record<string, unknown>): string {
  return String(dispatch.dispatch_status ?? dispatch.status ?? "draft").toLowerCase();
}

/** True when any non-cancelled dispatch batch has been submitted (or transport created). */
export function hasSubmittedDispatch(
  dispatches: Record<string, unknown>[] | null | undefined,
): boolean {
  if (!Array.isArray(dispatches) || dispatches.length === 0) return false;
  return dispatches.some((disp) => {
    const status = dispatchBatchStatus(disp);
    if (status === "cancelled") return false;
    return SUBMITTED_OR_BEYOND.has(status);
  });
}

export type OrderLifecycleActionCaps = {
  /** No submitted dispatch yet and order is not terminal. */
  canMutateLifecycle: boolean;
  canHold: boolean;
  canCancel: boolean;
  canReject: boolean;
  hasSubmittedDispatch: boolean;
  lockReason: string | undefined;
};

/**
 * Hold / Cancel / Reject stay enabled for all portals until a dispatch is submitted.
 */
export function computeOrderLifecycleActionCaps(options: {
  status: string;
  dispatches?: Record<string, unknown>[] | null;
  /** When true, Hide Hold (order already on hold). */
  alreadyOnHold?: boolean;
}): OrderLifecycleActionCaps {
  const status = String(options.status || "").toLowerCase();
  const submitted = hasSubmittedDispatch(options.dispatches);
  const isTerminal = TERMINAL_STATUSES.has(status);
  const isDraft = status === "draft";
  const canMutateLifecycle = !isTerminal && !submitted;

  const lockReason = submitted
    ? "Unavailable after a dispatch batch has been created and submitted"
    : isTerminal
      ? "Order is already closed, cancelled, or rejected"
      : undefined;

  const alreadyOnHold = options.alreadyOnHold ?? status === "on_hold";

  return {
    canMutateLifecycle,
    canHold: canMutateLifecycle && !alreadyOnHold && !isDraft,
    canCancel: canMutateLifecycle,
    canReject: canMutateLifecycle && status !== "on_hold" && !isDraft,
    hasSubmittedDispatch: submitted,
    lockReason,
  };
}
