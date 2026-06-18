/**
 * Order lifecycle steps for the visual progress bar (canonical happy path + finance substates).
 */

export type LifecycleVariant = "progress" | "cancelled" | "on_hold" | "finance_rejected";

export type LifecycleStep = {
  id: string;
  label: string;
  shortLabel: string;
};

export const ORDER_LIFECYCLE_STEPS: LifecycleStep[] = [
  { id: "draft", label: "Draft", shortLabel: "Draft" },
  { id: "submitted", label: "Submitted", shortLabel: "Submit" },
  { id: "sales", label: "Sales OK", shortLabel: "Sales" },
  { id: "finance", label: "Finance", shortLabel: "$" },
  { id: "dispatch", label: "Dispatch queue", shortLabel: "Queue" },
  { id: "picking", label: "Fulfillment", shortLabel: "Pick" },
  { id: "shipment", label: "Shipment", shortLabel: "Ship" },
  { id: "delivered", label: "Delivered", shortLabel: "Done" },
];

export function formatOrderStatusLabel(status: string): string {
  if (!status) return "—";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const CURRENT_ACTION_TO_STATUS: Record<string, string> = {
  drafted: "draft",
  submitted: "submitted",
  approved: "sales_approved",
  review_requested: "finance_review",
  fully_approved: "fully_finance_approved",
  partially_finance_approved: "partially_finance_approved",
  fully_finance_approved: "fully_finance_approved",
  sent_to_account: "account_review",
  partially_account_approved: "partially_account_approved",
  fully_account_approved: "fully_account_approved",
  rejected: "finance_rejected",
  sent_to_dispatch: "dispatch_pending",
  partial_dispatch: "partial_dispatch_created",
  full_dispatch: "full_dispatch_created",
  partially_transported: "partially_transported",
  fully_transported: "fully_transported",
  transporter_assigned: "transport_assigned",
  vehicle_assigned: "transport_assigned",
  picked_up: "in_transit",
  in_transit: "in_transit",
  out_for_delivery: "in_transit",
  delivered: "delivered",
  return_logged: "partial_dispatch_created",
  delivery_failed: "partially_transported",
  returned: "partially_transported",
  cancelled: "cancelled",
  hold: "on_hold",
};

/**
 * Converts the new backend workflow fields into the legacy status key used by
 * existing portal screens and transition buttons.
 */
export function deriveOrderWorkflowStatus(order: unknown): string {
  if (!order || typeof order !== "object") return "";

  const row = order as Record<string, unknown>;
  const legacyStatus =
    typeof row.status === "string" ? row.status.trim() : "";
  const lifecycle = typeof row.lifecycle_status === "string" ? row.lifecycle_status : "";
  const stage = typeof row.workflow_stage === "string" ? row.workflow_stage : "";
  const action = typeof row.current_action === "string" ? row.current_action : "";
  const dispatchStatus = typeof row.dispatch_status === "string" ? row.dispatch_status : "";
  const deliveryStatus = typeof row.delivery_status === "string" ? row.delivery_status : "";
  const hasWorkflowFields = Boolean(lifecycle || stage || action);

  if (legacyStatus === "dispatch_pending") return "dispatch_pending";

  if (!hasWorkflowFields && legacyStatus) {
    return legacyStatus;
  }

  if (lifecycle === "cancelled" || stage === "cancelled") return "cancelled";
  if (lifecycle === "on_hold" || stage === "hold") return "on_hold";
  if (String(row.status || "") === "closed" || row.closed_at) return "closed";
  if (deliveryStatus === "completed" || lifecycle === "fulfilled") return "delivered";

  if (action && CURRENT_ACTION_TO_STATUS[action]) {
    return CURRENT_ACTION_TO_STATUS[action];
  }

  if (stage === "sales") return lifecycle === "draft" ? "draft" : "finance_rejected";
  if (stage === "admin_review") return "submitted";
  if (stage === "finance_review") return "finance_review";
  if (stage === "account_review") return "account_review";
  if (stage === "dispatch_review") {
    if (action === "sent_to_dispatch") return "dispatch_pending";
    if (action === "partially_account_approved") return "partially_account_approved";
    if (action === "fully_account_approved") return "fully_account_approved";
    const aas = typeof row.account_approval_status === "string" ? row.account_approval_status : "";
    if (aas === "partial") return "partially_account_approved";
    if (aas === "full" || aas === "approved") return "fully_account_approved";
    const fas = typeof row.finance_approval_status === "string" ? row.finance_approval_status : "";
    if (fas === "partial") return "partially_finance_approved";
    if (fas === "full") return "fully_finance_approved";
    if (action === "partially_finance_approved") return "partially_finance_approved";
    if (action === "fully_finance_approved") return "fully_finance_approved";
    return "fully_finance_approved";
  }
  if (stage === "dispatch_execution") {
    if (dispatchStatus === "completed") return "full_dispatch_created";
    if (dispatchStatus === "partial") return "partial_dispatch_created";
    return "partially_transported";
  }
  if (stage === "completed") return "delivered";

  return lifecycle || "";
}

export type LifecycleComputation = {
  variant: LifecycleVariant;
  /** Current milestone column — steps `< activeIndex` are completed (green). */
  activeIndex: number;
};

function activeStepIndex(status: string): number | null {
  switch (status) {
    case "draft":
      return 0;
    case "submitted":
      return 1;
    case "sales_approved":
    case "finance_review":
      return 3;
    case "finance_approved":
    case "partially_finance_approved":
    case "fully_finance_approved":
    case "dispatch_pending":
      return 4;
    case "partial_dispatch_created":
      return 5;
    case "full_dispatch_created":
    case "transport_pending":
    case "transport_assigned":
    case "partially_transported":
    case "fully_transported":
    case "in_transit":
      return 6;
    case "delivered":
      return 7;
    default:
      return null;
  }
}

export function computeLifecycle(status: string): LifecycleComputation {
  const s = (status || "").trim();
  if (!s) {
    return { variant: "progress", activeIndex: 0 };
  }
  if (s === "cancelled") {
    return { variant: "cancelled", activeIndex: 2 };
  }
  if (s === "on_hold") {
    return { variant: "on_hold", activeIndex: 4 };
  }
  if (s === "finance_rejected") {
    return { variant: "finance_rejected", activeIndex: 3 };
  }
  const idx = activeStepIndex(s);
  if (idx !== null) {
    return { variant: "progress", activeIndex: idx };
  }
  return { variant: "progress", activeIndex: 0 };
}
