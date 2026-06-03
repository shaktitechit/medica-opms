/**
 * Per-department workflow boxes: status, qty progress, remaining, and relevant action.
 */

import {
  computeOrderStatusDimensions,
  deriveAction,
  type OrderStatusDimension,
} from "./orderStatusDimensions";

export type FulfillmentLine = {
  order_item_id: string;
  product_name: string;
  sku: string;
  ordered: number;
  approved: number;
  dispatched: number;
  delivered: number;
  pendingFinance: number;
  pendingDispatch: number;
  pendingDelivery: number;
};

export type DepartmentStageBox = {
  id: string;
  department: string;
  status: OrderStatusDimension;
  action: OrderStatusDimension | null;
  completedQty: number;
  remainingQty: number;
  totalQty: number;
  progressLabel: string;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const DEPT_ACTION_KEYS: Record<string, string[]> = {
  sales: ["drafted", "submitted"],
  admin: ["approved"],
  finance: [
    "review_requested",
    "partially_finance_approved",
    "fully_finance_approved",
    "rejected",
  ],
  dispatch: [
    "sent_to_dispatch",
    "partial_dispatch",
    "full_dispatch",
    "partially_transported",
    "fully_transported",
    "transporter_assigned",
    "vehicle_assigned",
    "allocation_started",
    "allocation_completed",
  ],
  delivery: [
    "picked_up",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "delivery_failed",
    "returned",
  ],
};

type FulfillmentTotals = {
  ordered: number;
  approved: number;
  dispatched: number;
  delivered: number;
  pendingFinance: number;
  pendingDispatch: number;
  pendingDelivery: number;
};

const EMPTY_TOTALS: FulfillmentTotals = {
  ordered: 0,
  approved: 0,
  dispatched: 0,
  delivered: 0,
  pendingFinance: 0,
  pendingDispatch: 0,
  pendingDelivery: 0,
};

function totalsFromSources(
  order: Record<string, unknown>,
  fulfillmentSnapshot?: Record<string, unknown> | null,
): FulfillmentTotals {
  const snap =
    fulfillmentSnapshot?.totals && typeof fulfillmentSnapshot.totals === "object"
      ? (fulfillmentSnapshot.totals as Record<string, unknown>)
      : null;

  if (snap) {
    return {
      ordered: num(snap.ordered),
      approved: num(snap.approved),
      dispatched: num(snap.dispatched),
      delivered: num(snap.delivered),
      pendingFinance: num(snap.pendingFinance),
      pendingDispatch: num(snap.pendingDispatch),
      pendingDelivery: num(snap.pendingDelivery),
    };
  }

  const items = Array.isArray(order.order_items)
    ? (order.order_items as Record<string, unknown>[])
    : [];
  return items.reduce<FulfillmentTotals>((acc, line) => {
    const ordered = num(line.ordered_quantity ?? line.quantity);
    const approved = num(line.approved_quantity);
    const dispatched = num(line.dispatched_quantity);
    const delivered = num(line.delivered_quantity);
    acc.ordered += ordered;
    acc.approved += approved;
    acc.dispatched += dispatched;
    acc.delivered += delivered;
    acc.pendingFinance += Math.max(0, ordered - approved);
    acc.pendingDispatch += Math.max(0, approved - dispatched);
    acc.pendingDelivery += Math.max(0, dispatched - delivered);
    return acc;
  }, { ...EMPTY_TOTALS });
}

export function fulfillmentLinesFromSnapshot(
  order: Record<string, unknown> | null,
  fulfillmentSnapshot?: Record<string, unknown> | null,
): FulfillmentLine[] {
  if (!order) return [];

  const snapLines = fulfillmentSnapshot?.lines;
  if (Array.isArray(snapLines) && snapLines.length > 0) {
    return snapLines.map((raw) => {
      const line = raw as Record<string, unknown>;
      return {
        order_item_id: String(line.order_item_id ?? ""),
        product_name: String(line.product_name || "—"),
        sku: String(line.sku || ""),
        ordered: num(line.ordered),
        approved: num(line.approved),
        dispatched: num(line.dispatched),
        delivered: num(line.delivered),
        pendingFinance: num(line.pendingFinance),
        pendingDispatch: num(line.pendingDispatch),
        pendingDelivery: num(line.pendingDelivery),
      };
    });
  }

  const items = Array.isArray(order.order_items)
    ? (order.order_items as Record<string, unknown>[])
    : [];
  return items.map((line) => {
    const ordered = num(line.ordered_quantity ?? line.quantity);
    const approved = num(line.approved_quantity);
    const dispatched = num(line.dispatched_quantity);
    const delivered = num(line.delivered_quantity);
    return {
      order_item_id: String(line._id ?? line.id ?? ""),
      product_name: String(line.product_name || "—"),
      sku: String(line.sku || ""),
      ordered,
      approved,
      dispatched,
      delivered,
      pendingFinance: Math.max(0, ordered - approved),
      pendingDispatch: Math.max(0, approved - dispatched),
      pendingDelivery: Math.max(0, dispatched - delivered),
    };
  });
}

function actionForDepartment(
  order: Record<string, unknown>,
  deptId: string,
): OrderStatusDimension | null {
  const action = String(order.current_action || "");
  if (!action) return null;
  const keys = DEPT_ACTION_KEYS[deptId] || [];
  if (!keys.includes(action)) return null;
  return deriveAction(order);
}

function stageIndex(stage: string): number {
  const order = [
    "sales",
    "admin_review",
    "finance_review",
    "dispatch_review",
    "dispatch_execution",
    "completed",
  ];
  const idx = order.indexOf(stage);
  return idx >= 0 ? idx : -1;
}

export function computeDepartmentStageBoxes(
  order: Record<string, unknown> | null,
  fulfillmentSnapshot?: Record<string, unknown> | null,
): DepartmentStageBox[] {
  if (!order) return [];

  const totals = totalsFromSources(order, fulfillmentSnapshot);
  const stage = String(order.workflow_stage || "");
  const lifecycle = String(order.lifecycle_status || "");
  const fas = String(
    fulfillmentSnapshot?.finance_approval_status ?? order.finance_approval_status ?? "pending",
  );
  const dispatchStatus = String(
    fulfillmentSnapshot?.dispatch_status ?? order.dispatch_status ?? "pending",
  );
  const deliveryStatus = String(
    fulfillmentSnapshot?.delivery_status ?? order.delivery_status ?? "pending",
  );
  const currentIdx = stageIndex(stage);
  const cancelled = lifecycle === "cancelled" || stage === "cancelled";

  const mk = (
    id: string,
    department: string,
    status: OrderStatusDimension,
    completedQty: number,
    remainingQty: number,
    totalQty: number,
    progressLabel: string,
  ): DepartmentStageBox => ({
    id,
    department,
    status,
    action: actionForDepartment(order, id),
    completedQty,
    remainingQty,
    totalQty,
    progressLabel,
  });

  if (cancelled) {
    const cancelledStatus: OrderStatusDimension = {
      key: "cancelled",
      label: "Cancelled",
      tone: "danger",
    };
    return [
      mk("sales", "Sales", cancelledStatus, 0, 0, totals.ordered, "—"),
      mk("admin", "Admin", cancelledStatus, 0, 0, totals.ordered, "—"),
      mk("finance", "Finance", cancelledStatus, 0, 0, totals.ordered, "—"),
      mk("dispatch", "Dispatch", cancelledStatus, 0, 0, totals.approved, "—"),
      mk("delivery", "Delivery", cancelledStatus, 0, 0, totals.dispatched, "—"),
    ];
  }

  const salesDone = currentIdx > stageIndex("sales") || lifecycle !== "draft";
  const salesStatus: OrderStatusDimension = !salesDone
    ? lifecycle === "draft"
      ? { key: "draft", label: "Draft", tone: "neutral" }
      : { key: "sales", label: "With sales", tone: "warning" }
    : {
        key: "captured",
        label: "Order captured",
        detail: `${totals.ordered} qty ordered`,
        tone: "success",
      };

  const adminDone = currentIdx > stageIndex("admin_review");
  const adminStatus: OrderStatusDimension =
    stage === "admin_review"
      ? { key: "pending", label: "Pending admin review", tone: "warning" }
      : adminDone
        ? { key: "done", label: "Admin review complete", tone: "success" }
        : { key: "waiting", label: "Awaiting submission", tone: "neutral" };

  let financeStatus: OrderStatusDimension;
  if (fas === "rejected") {
    financeStatus = { key: "rejected", label: "Finance rejected", tone: "danger" };
  } else if (fas === "full") {
    financeStatus = {
      key: "full",
      label: "Fully approved",
      detail: `${totals.approved} / ${totals.ordered} qty`,
      tone: "success",
    };
  } else if (fas === "partial" || totals.approved > 0) {
    financeStatus = {
      key: "partial",
      label: "Partially approved",
      detail: `${totals.pendingFinance} qty pending`,
      tone: "warning",
    };
  } else if (stage === "finance_review") {
    financeStatus = { key: "review", label: "Finance review", tone: "info" };
  } else if (currentIdx > stageIndex("finance_review")) {
    financeStatus = { key: "done", label: "Finance complete", tone: "success" };
  } else {
    financeStatus = { key: "waiting", label: "Awaiting finance", tone: "neutral" };
  }

  let dispatchStatusDim: OrderStatusDimension;
  if (dispatchStatus === "completed" || (totals.dispatched > 0 && totals.pendingDispatch === 0)) {
    dispatchStatusDim = {
      key: "full",
      label: "Fully dispatched",
      detail: `${totals.dispatched} / ${totals.approved} approved qty`,
      tone: "success",
    };
  } else if (dispatchStatus === "partial" || totals.dispatched > 0) {
    dispatchStatusDim = {
      key: "partial",
      label: "Partially dispatched",
      detail: `${totals.pendingDispatch} qty pending`,
      tone: "info",
    };
  } else if (
    ["dispatch_review", "dispatch_execution"].includes(stage) ||
    currentIdx >= stageIndex("dispatch_review")
  ) {
    dispatchStatusDim = { key: "queue", label: "Dispatch queue", tone: "warning" };
  } else {
    dispatchStatusDim = { key: "waiting", label: "Awaiting dispatch", tone: "neutral" };
  }

  let deliveryStatusDim: OrderStatusDimension;
  if (deliveryStatus === "completed" || (totals.delivered > 0 && totals.pendingDelivery === 0)) {
    deliveryStatusDim = {
      key: "fulfilled",
      label: "Fully delivered",
      detail: `${totals.delivered} qty delivered`,
      tone: "success",
    };
  } else if (deliveryStatus === "partial" || totals.delivered > 0) {
    deliveryStatusDim = {
      key: "partial",
      label: "Partially delivered",
      detail: `${totals.pendingDelivery} qty in transit / pending`,
      tone: "info",
    };
  } else if (totals.dispatched > 0) {
    deliveryStatusDim = { key: "pending", label: "Awaiting delivery", tone: "warning" };
  } else {
    deliveryStatusDim = { key: "waiting", label: "Not started", tone: "neutral" };
  }

  return [
    mk(
      "sales",
      "Sales",
      salesStatus,
      salesDone ? totals.ordered : 0,
      salesDone ? 0 : totals.ordered,
      totals.ordered,
      "Ordered qty",
    ),
    mk(
      "admin",
      "Admin",
      adminStatus,
      adminDone ? totals.ordered : 0,
      adminDone ? 0 : totals.ordered,
      totals.ordered,
      "Order lines",
    ),
    mk(
      "finance",
      "Finance",
      financeStatus,
      totals.approved,
      totals.pendingFinance,
      totals.ordered,
      "Approved qty",
    ),
    mk(
      "dispatch",
      "Dispatch",
      dispatchStatusDim,
      totals.dispatched,
      totals.pendingDispatch,
      totals.approved || totals.ordered,
      "Dispatched qty",
    ),
    mk(
      "delivery",
      "Delivery",
      deliveryStatusDim,
      totals.delivered,
      totals.pendingDelivery,
      totals.dispatched || totals.approved,
      "Delivered qty",
    ),
  ];
}

export { computeOrderStatusDimensions };
