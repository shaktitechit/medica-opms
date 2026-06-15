/**
 * Three independent status dimensions for order detail headers:
 * 1. Departmental stage — which team owns the order now
 * 2. Fulfillment stage — quantity progress (finance → dispatch → delivery)
 * 3. Action stage — latest workflow action / what happened last
 */

import {
  lineApprovalQuantities,
  num,
  resolveAccountApprovalStatus,
} from "./orderLineQuantities";

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

function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const DEPARTMENT_LABELS: Record<string, string> = {
  sales: "Sales",
  admin_review: "Sales Approval",
  finance_review: "Finance Review",
  account_review: "Account Review",
  dispatch_review: "Dispatch Review",
  dispatch_execution: "Dispatch Execution",
  completed: "Completed",
  cancelled: "Cancelled",
  hold: "On Hold",
};

const ACTION_LABELS: Record<string, string> = {
  drafted: "Draft saved",
  submitted: "Submitted for sales approval",
  approved: "Sales approved",
  review_requested: "Finance review requested",
  partially_finance_approved: "Partially finance approved",
  fully_finance_approved: "Fully finance approved",
  partially_account_approved: "Partially account approved",
  fully_account_approved: "Fully account approved",
  sent_to_account: "Sent to account review",
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
  const status = String(order.status || "");

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

  const finalStage =
    stage === "dispatch_review" &&
    (status === "account_review" ||
      String(order.current_action || "") === "sent_to_account" ||
      String(order.pending_with_role || "") === "account")
      ? "account_review"
      : stage;

  const label =
    DEPARTMENT_LABELS[finalStage] ||
    (pendingRole ? `${titleCase(pendingRole)} queue` : "In progress");

  return {
    key: finalStage || pendingRole || "unknown",
    label,
    detail: pendingRole && !DEPARTMENT_LABELS[finalStage] ? `Owner: ${titleCase(pendingRole)}` : undefined,
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

  const status = String(order.status || "");
  const stage = String(order.workflow_stage || "");
  const currentAction = String(order.current_action || "");
  const fas = String(order.finance_approval_status || "pending");
  const aas = resolveAccountApprovalStatus(order);
  const dispatchStatus = String(order.dispatch_status || "pending");
  const deliveryStatus = String(order.delivery_status || "pending");

  const ordered = num(totals?.ordered);
  const salesApproved = num(totals?.salesApproved);
  const approved = num(totals?.approved);
  const accountCleared = num(totals?.accountCleared);
  const dispatched = num(totals?.dispatched);
  const delivered = num(totals?.delivered);
  const pendingAdmin = num(totals?.pendingAdmin);
  const pendingFinance = num(totals?.pendingFinance);
  const pendingAccount = num(totals?.pendingAccount);
  const pendingDispatch = num(totals?.pendingDispatch);
  const pendingDelivery = num(totals?.pendingDelivery);
  const financeCap = salesApproved > 0 ? salesApproved : ordered;
  const dispatchCap = accountCleared > 0 ? accountCleared : approved;

  if (deliveryStatus === "completed" || (delivered > 0 && pendingDelivery === 0 && dispatched > 0)) {
    return {
      key: "fulfilled",
      label: "Fully delivered",
      detail: `${delivered} / ${approved || financeCap || ordered} qty delivered`,
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
  if (dispatchStatus === "completed" || (dispatched > 0 && pendingDispatch === 0 && dispatchCap > 0)) {
    return {
      key: "full_dispatch",
      label: "Fully dispatched",
      detail: `${dispatched} / ${dispatchCap} account-cleared qty dispatched`,
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
  if (aas === "full") {
    return {
      key: "account_full",
      label: "Fully account approved",
      detail: `${accountCleared} / ${approved} finance-approved qty cleared`,
      tone: "success",
    };
  }
  if (aas === "partial") {
    return {
      key: "account_partial",
      label: "Partially account approved",
      detail: `${pendingAccount} qty pending account clearance`,
      tone: "warning",
    };
  }
  if (aas === "rejected") {
    return { key: "account_rejected", label: "Account rejected", tone: "danger" };
  }
  if (
    stage === "account_review" ||
    status === "account_review" ||
    currentAction === "sent_to_account"
  ) {
    return {
      key: "account_review",
      label: "Account review",
      detail: `${approved} qty awaiting account clearance`,
      tone: "info",
    };
  }
  if (
    ["fully_finance_approved", "partially_finance_approved"].includes(status) &&
    approved > 0 &&
    aas === "pending"
  ) {
    return {
      key: "account_pending",
      label: "Awaiting send to account",
      detail: `${approved} qty finance-approved`,
      tone: "info",
    };
  }
  if (fas === "full" || (financeCap > 0 && approved >= financeCap)) {
    return {
      key: "finance_full",
      label: "Fully finance approved",
      detail: `${approved} / ${financeCap} sales-approved qty`,
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

  if (salesApproved > 0 && approved === 0) {
    return {
      key: "finance_pending",
      label: "Awaiting finance approval",
      detail: `${salesApproved} qty sales-approved`,
      tone: "neutral",
    };
  }

  if (pendingAdmin > 0) {
    return {
      key: "sales_approval_partial",
      label: "Partially sales approved",
      detail: `${salesApproved} / ${ordered} qty · ${pendingAdmin} pending sales approval`,
      tone: "warning",
    };
  }

  if (ordered > 0 && salesApproved <= 0) {
    return {
      key: "sales_approval_pending",
      label: "Awaiting sales approval",
      detail: `${ordered} qty ordered`,
      tone: "neutral",
    };
  }

  return {
    key: "sales_approval_pending",
    label: "Awaiting sales approval",
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
    action === "full_dispatch" ||
    action === "sent_to_account"
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
    let salesApproved = 0;
    let approved = 0;
    let dispatched = 0;
    let delivered = 0;
    let allocated = 0;
    let cancelled = 0;
    let pendingAdmin = 0;
    let pendingFinance = 0;
    let accountCleared = 0;
    let pendingAccount = 0;
    const accountApprovalStatus = resolveAccountApprovalStatus(order, fulfillmentSnapshot);

    for (const item of order.order_items) {
      if (item && typeof item === "object") {
        const q = lineApprovalQuantities(item as Record<string, unknown>, {
          accountApprovalStatus,
        });
        ordered += q.ordered;
        salesApproved += q.salesApproved;
        approved += q.financeApproved;
        accountCleared += q.accountCleared;
        dispatched += q.dispatched;
        delivered += q.delivered;
        allocated += num((item as Record<string, unknown>).allocated_quantity);
        cancelled += num((item as Record<string, unknown>).cancelled_quantity);
        pendingAdmin += q.pendingAdmin;
        pendingFinance += q.pendingFinance;
        pendingAccount += q.pendingAccount;
      }
    }

    const pendingDispatch = Math.max(0, accountCleared - dispatched);
    const pendingDelivery = Math.max(0, dispatched - delivered);

    totals = {
      ordered,
      salesApproved,
      approved,
      accountCleared,
      dispatched,
      delivered,
      allocated,
      cancelled,
      pendingAdmin,
      pendingFinance,
      pendingAccount,
      pendingDispatch,
      pendingDelivery,
    };
  }

  const orderForFulfillment = {
    ...order,
    finance_approval_status:
      fulfillmentSnapshot?.finance_approval_status ?? order.finance_approval_status,
    account_approval_status:
      fulfillmentSnapshot?.account_approval_status ?? order.account_approval_status,
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
