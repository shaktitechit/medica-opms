/**
 * Three independent status dimensions for order detail headers:
 * 1. Departmental stage — which team owns the order now
 * 2. Fulfillment stage — quantity progress (finance → dispatch → delivery)
 * 3. Action stage — latest workflow action / what happened last
 */

export type OrderStatusDimension = {
  key: string;
  label: string;
  detail?: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
};

export type OrderStatusDimensions = {
  departmental: OrderStatusDimension;
  fulfillment: OrderStatusDimension;
  action: OrderStatusDimension;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const DEPARTMENT_LABELS: Record<string, string> = {
  sales: "Sales",
  admin_review: "Admin Review",
  finance_review: "Finance Review",
  dispatch_review: "Dispatch Review",
  dispatch_execution: "Dispatch Execution",
  completed: "Completed",
  cancelled: "Cancelled",
  hold: "On Hold",
};

const ACTION_LABELS: Record<string, string> = {
  drafted: "Draft saved",
  submitted: "Submitted to admin",
  approved: "Sales / admin approved",
  review_requested: "Finance review requested",
  partially_finance_approved: "Partially finance approved",
  fully_finance_approved: "Fully finance approved",
  rejected: "Rejected",
  sent_to_dispatch: "Sent to dispatch queue",
  partial_dispatch: "Partial dispatch recorded",
  full_dispatch: "Full dispatch recorded",
  partially_transported: "Partially in transport",
  fully_transported: "All dispatches shipped",
  transporter_assigned: "Transporter assigned",
  vehicle_assigned: "Vehicle assigned",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  delivery_failed: "Delivery failed",
  returned: "Returned",
  cancelled: "Cancelled",
  hold: "On hold",
  allocation_started: "Allocation started",
  allocation_completed: "Allocation completed",
};

function deriveDepartmental(order: Record<string, unknown>): OrderStatusDimension {
  const lifecycle = String(order.lifecycle_status || "");
  const stage = String(order.workflow_stage || "");
  const pendingRole = String(order.pending_with_role || order.current_department || "");

  if (lifecycle === "cancelled" || stage === "cancelled") {
    return { key: "cancelled", label: "Cancelled", tone: "danger" };
  }
  if (lifecycle === "on_hold" || stage === "hold") {
    return {
      key: "on_hold",
      label: "On Hold",
      detail: pendingRole ? `With ${titleCase(pendingRole)}` : undefined,
      tone: "warning",
    };
  }
  if (stage === "completed" || lifecycle === "fulfilled") {
    return { key: "completed", label: "Completed", tone: "success" };
  }

  const label =
    DEPARTMENT_LABELS[stage] ||
    (pendingRole ? `${titleCase(pendingRole)} queue` : "In progress");

  return {
    key: stage || pendingRole || "unknown",
    label,
    detail: pendingRole && !DEPARTMENT_LABELS[stage] ? `Owner: ${titleCase(pendingRole)}` : undefined,
    tone: "info",
  };
}

function deriveFulfillment(
  order: Record<string, unknown>,
  totals?: Record<string, unknown> | null,
): OrderStatusDimension {
  const lifecycle = String(order.lifecycle_status || "");
  if (lifecycle === "cancelled") {
    return { key: "cancelled", label: "Cancelled", tone: "danger" };
  }

  const fas = String(order.finance_approval_status || "pending");
  const dispatchStatus = String(order.dispatch_status || "pending");
  const deliveryStatus = String(order.delivery_status || "pending");

  const ordered = num(totals?.ordered);
  const approved = num(totals?.approved);
  const dispatched = num(totals?.dispatched);
  const delivered = num(totals?.delivered);
  const pendingFinance = num(totals?.pendingFinance);
  const pendingDispatch = num(totals?.pendingDispatch);
  const pendingDelivery = num(totals?.pendingDelivery);

  if (deliveryStatus === "completed" || (delivered > 0 && pendingDelivery === 0 && dispatched > 0)) {
    return {
      key: "fulfilled",
      label: "Fully delivered",
      detail: `${delivered} / ${approved || ordered} qty delivered`,
      tone: "success",
    };
  }
  if (deliveryStatus === "partial" || delivered > 0) {
    return {
      key: "partial_delivery",
      label: "Partially delivered",
      detail: `${delivered} delivered · ${pendingDelivery} pending delivery`,
      tone: "info",
    };
  }
  if (dispatchStatus === "completed" || (dispatched > 0 && pendingDispatch === 0 && approved > 0)) {
    return {
      key: "full_dispatch",
      label: "Fully dispatched",
      detail: `${dispatched} / ${approved} approved qty dispatched`,
      tone: "success",
    };
  }
  if (dispatchStatus === "partial" || dispatched > 0) {
    return {
      key: "partial_dispatch",
      label: "Partially dispatched",
      detail: `${dispatched} dispatched · ${pendingDispatch} pending dispatch`,
      tone: "info",
    };
  }
  if (fas === "full" || (ordered > 0 && approved >= ordered)) {
    return {
      key: "finance_full",
      label: "Fully finance approved",
      detail: `${approved} / ${ordered} qty approved`,
      tone: "success",
    };
  }
  if (fas === "partial" || approved > 0) {
    return {
      key: "finance_partial",
      label: "Partially finance approved",
      detail: `${approved} approved · ${pendingFinance} pending finance`,
      tone: "warning",
    };
  }
  if (fas === "rejected") {
    return { key: "finance_rejected", label: "Finance rejected", tone: "danger" };
  }

  return {
    key: "finance_pending",
    label: "Awaiting finance approval",
    detail: ordered > 0 ? `${ordered} qty ordered` : undefined,
    tone: "neutral",
  };
}

export function deriveAction(order: Record<string, unknown>): OrderStatusDimension {
  const action = String(order.current_action || "");
  const legacyStatus = String(order.status || "");

  if (!action && legacyStatus) {
    return {
      key: legacyStatus,
      label: titleCase(legacyStatus),
      tone: "neutral",
    };
  }

  const label = ACTION_LABELS[action] || titleCase(action || "No action");
  let tone: OrderStatusDimension["tone"] = "neutral";
  if (action.includes("rejected") || action === "cancelled" || action === "delivery_failed") {
    tone = "danger";
  } else if (action === "hold") {
    tone = "warning";
  } else if (
    action.includes("approved") ||
    action === "delivered" ||
    action === "full_dispatch"
  ) {
    tone = "success";
  } else if (action.includes("partial") || action.includes("transit")) {
    tone = "info";
  }

  return { key: action || "none", label, tone };
}

/** Use API snapshot when available (GET /orders/:id/fulfillment). */
export function statusDimensionsFromSnapshot(
  fulfillmentSnapshot?: Record<string, unknown> | null,
): OrderStatusDimensions | null {
  if (!fulfillmentSnapshot?.status_dimensions) return null;
  const sd = fulfillmentSnapshot.status_dimensions;
  if (!sd || typeof sd !== "object") return null;
  const o = sd as Record<string, unknown>;
  if (
    !o.departmental ||
    !o.fulfillment ||
    !o.action ||
    typeof o.departmental !== "object" ||
    typeof o.fulfillment !== "object" ||
    typeof o.action !== "object"
  ) {
    return null;
  }
  return {
    departmental: o.departmental as OrderStatusDimension,
    fulfillment: o.fulfillment as OrderStatusDimension,
    action: o.action as OrderStatusDimension,
  };
}

/** Build from order document + optional fulfillment API totals. */
export function computeOrderStatusDimensions(
  order: Record<string, unknown> | null,
  fulfillmentSnapshot?: Record<string, unknown> | null,
): OrderStatusDimensions | null {
  if (!order) return null;

  const fromApi = statusDimensionsFromSnapshot(fulfillmentSnapshot);
  if (fromApi) return fromApi;

  let totals =
    fulfillmentSnapshot?.totals && typeof fulfillmentSnapshot.totals === "object"
      ? (fulfillmentSnapshot.totals as Record<string, unknown>)
      : null;

  if (!totals && order && Array.isArray(order.order_items)) {
    let ordered = 0;
    let approved = 0;
    let dispatched = 0;
    let delivered = 0;
    let allocated = 0;
    let cancelled = 0;

    for (const item of order.order_items) {
      if (item && typeof item === "object") {
        const itemObj = item as Record<string, unknown>;
        ordered += num(itemObj.ordered_quantity ?? itemObj.quantity);
        approved += num(itemObj.approved_quantity);
        dispatched += num(itemObj.dispatched_quantity);
        delivered += num(itemObj.delivered_quantity);
        allocated += num(itemObj.allocated_quantity);
        cancelled += num(itemObj.cancelled_quantity);
      }
    }

    const fas = String(order.finance_approval_status || "pending");
    const pendingFinance = fas === "full" ? 0 : Math.max(0, ordered - approved);
    const pendingDispatch = Math.max(0, approved - dispatched);
    const pendingDelivery = Math.max(0, dispatched - delivered);

    totals = {
      ordered,
      approved,
      dispatched,
      delivered,
      allocated,
      cancelled,
      pendingFinance,
      pendingDispatch,
      pendingDelivery,
    };
  }

  const orderForFulfillment = {
    ...order,
    finance_approval_status:
      fulfillmentSnapshot?.finance_approval_status ?? order.finance_approval_status,
    dispatch_status: fulfillmentSnapshot?.dispatch_status ?? order.dispatch_status,
    delivery_status: fulfillmentSnapshot?.delivery_status ?? order.delivery_status,
  };

  return {
    departmental: deriveDepartmental(order),
    fulfillment: deriveFulfillment(orderForFulfillment, totals),
    action: deriveAction(order),
  };
}

export function dimensionToneClass(tone: OrderStatusDimension["tone"]): string {
  switch (tone) {
    case "success":
      return "bg-emerald-50 text-emerald-800 ring-emerald-600/15 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "warning":
      return "bg-amber-50 text-amber-800 ring-amber-600/15 dark:bg-amber-950/40 dark:text-amber-300";
    case "danger":
      return "bg-rose-50 text-rose-800 ring-rose-600/15 dark:bg-rose-950/40 dark:text-rose-300";
    case "info":
      return "bg-blue-50 text-blue-800 ring-blue-600/15 dark:bg-blue-950/40 dark:text-blue-300";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300";
  }
}
