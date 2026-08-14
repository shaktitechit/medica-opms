/**
 * Per-department workflow boxes — synced with backend models:
 *
 * | Box        | Source of truth |
 * |------------|-----------------|
 * | Sales      | Order.lifecycle_status / workflow_stage=sales |
 * | Admin      | OrderApproval.is_admin_approved + Order.admin_approval_status |
 * | Due sheet  | OrderDueSheet (active) OR OrderApproval.is_due_sheet_uploaded |
 * | Finance    | OrderApproval.is_finance_approved + Order.finance_approval_status |
 * | Account    | OrderApproval.is_account_approved + Order.account_approval_status |
 * | Dispatch   | Order.dispatch_status (rollup) + OrderDispatch.dispatch_status |
 * | Delivery   | Order.delivery_status (rollup) + TransportShipment / OrderDelivery |
 * | Return     | OrderReturn.return_status (+ line returned qty) |
 *
 * Order.workflow_stage (ORDER_WORKFLOW_STAGE): sales → admin_review →
 * finance_review → account_review → dispatch → completed.
 * Due sheet is a gate between admin and finance (not a workflow_stage value).
 * OrderWorkflow is audit-only (not used for box state).
 *
 * Pipeline: submitted → admin → due sheet → finance → account → dispatch → delivery/return.
 */

import {
  computeOrderStatusDimensions,
  deriveAction,
  type OrderStatusDimension,
} from "./orderStatusDimensions";
import {
  aggregatePendingReturnsByOrderLine,
  aggregateReceivedReturnsByOrderLine,
  totalPendingReturnQty,
} from "./returnSettlement";
import {
  financeApprovedOnLine,
  lineApprovalQuantities,
  num,
  resolveAccountApprovalStatus,
  resolveSalesApprovedTotals,
  salesApprovedOnLine,
} from "./orderLineQuantities";
import {
  isAccountCleared,
  isAdminCleared,
  isApprovalDueSheetUploaded,
  isDueSheetStageCleared,
  isDueSheetUploaded,
  isFinanceCleared,
} from "./orderList/orderWorkflowTabs";
import { hasSubmittedDispatch } from "./orderLifecycleActions";
import { deriveOrderWorkflowStatus } from "./orderLifecycle";

export type FulfillmentLine = {
  order_item_id: string;
  product: string;
  product_name: string;
  sku: string;
  /** When set, this line is an expanded kit bucket individual. */
  kit_parent_product: string;
  ordered: number;
  salesApproved: number;
  approved: number;
  accountCleared: number;
  dispatched: number;
  delivered: number;
  returned: number;
  pendingReturn: number;
  pendingAdmin: number;
  pendingFinance: number;
  pendingAccount: number;
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

/** Display name for the admin-review workflow stage (sales approval). */
export const SALES_APPROVAL_DEPARTMENT_LABEL = "Sales Approval";

const DEPT_ACTION_KEYS: Record<string, string[]> = {
  sales: ["drafted", "submitted"],
  /** Admin review = sales approval sign-off before due sheet / finance. */
  admin: ["approved"],
  due_sheet: ["due_sheet_uploaded"],
  finance: [
    "review_requested",
    "partially_finance_approved",
    "fully_finance_approved",
    "rejected",
  ],
  account: [
    "sent_to_account",
    "partially_account_approved",
    "fully_account_approved",
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
  ],
  return: ["returned"],
};

const WAITING: OrderStatusDimension = {
  key: "waiting",
  label: "Waiting",
  tone: "neutral",
};

const PENDING: OrderStatusDimension = {
  key: "pending",
  label: "Pending",
  tone: "warning",
};

const APPROVED: OrderStatusDimension = {
  key: "approved",
  label: "Approved",
  tone: "success",
};

type FulfillmentTotals = {
  ordered: number;
  salesApproved: number;
  approved: number;
  accountCleared: number;
  dispatched: number;
  delivered: number;
  returned: number;
  pendingReturn: number;
  pendingAdmin: number;
  pendingFinance: number;
  pendingAccount: number;
  pendingDispatch: number;
  pendingDelivery: number;
};

const EMPTY_TOTALS: FulfillmentTotals = {
  ordered: 0,
  salesApproved: 0,
  approved: 0,
  accountCleared: 0,
  dispatched: 0,
  delivered: 0,
  returned: 0,
  pendingReturn: 0,
  pendingAdmin: 0,
  pendingFinance: 0,
  pendingAccount: 0,
  pendingDispatch: 0,
  pendingDelivery: 0,
};

function sumReturnedFromLines(
  lines: Record<string, unknown>[],
): number {
  return lines.reduce((sum, line) => sum + num(line.returned_quantity ?? line.returned), 0);
}

function totalsFromSources(
  order: Record<string, unknown>,
  fulfillmentSnapshot?: Record<string, unknown> | null,
  options?: {
    returns?: Record<string, unknown>[];
    dispatches?: Record<string, unknown>[];
  },
): FulfillmentTotals {
  const accountApprovalStatus = resolveAccountApprovalStatus(order, fulfillmentSnapshot);
  const snap =
    fulfillmentSnapshot?.totals && typeof fulfillmentSnapshot.totals === "object"
      ? (fulfillmentSnapshot.totals as Record<string, unknown>)
      : null;
  const items = Array.isArray(order.order_items)
    ? (order.order_items as Record<string, unknown>[])
    : [];

  if (snap) {
    const approved = num(snap.approved);
    const accountCleared = num(snap.accountCleared ?? snap.account_cleared);
    const pendingAccount = num(snap.pendingAccount ?? snap.pending_account);
    return {
      ordered: num(snap.ordered),
      salesApproved: num(snap.salesApproved),
      approved,
      accountCleared: accountCleared || (accountApprovalStatus !== "pending" ? approved : 0),
      dispatched: num(snap.dispatched),
      delivered: num(snap.delivered),
      returned:
        num(snap.returned) ||
        sumReturnedFromLines(
          Array.isArray(fulfillmentSnapshot?.lines)
            ? (fulfillmentSnapshot.lines as Record<string, unknown>[])
            : items,
        ),
      pendingReturn:
        num(snap.pendingReturn ?? snap.pending_return) ||
        (options?.returns?.length ? totalPendingReturnQty(options.returns) : 0),
      pendingAdmin: num(snap.pendingAdmin),
      pendingFinance: num(snap.pendingFinance),
      pendingAccount:
        pendingAccount ||
        Math.max(0, approved - (accountCleared || (accountApprovalStatus !== "pending" ? approved : 0))),
      pendingDispatch: num(snap.pendingDispatch),
      pendingDelivery: num(snap.pendingDelivery),
    };
  }

  const base = items.reduce<FulfillmentTotals>((acc, line) => {
    // Kit bucket individuals are expansion rows — do not inflate department totals.
    if (isKitBucketLine(line)) return acc;
    const q = lineApprovalQuantities(line, { accountApprovalStatus });
    acc.ordered += q.ordered;
    acc.salesApproved += q.salesApproved;
    acc.approved += q.financeApproved;
    acc.accountCleared += q.accountCleared;
    acc.dispatched += q.dispatched;
    acc.delivered += q.delivered;
    acc.returned += num(line.returned_quantity ?? line.returned);
    acc.pendingAdmin += q.pendingAdmin;
    acc.pendingFinance += q.pendingFinance;
    acc.pendingAccount += q.pendingAccount;
    acc.pendingDispatch += q.pendingDispatch;
    acc.pendingDelivery += q.pendingDelivery;
    return acc;
  }, { ...EMPTY_TOTALS });

  if (options?.returns?.length) {
    base.pendingReturn = totalPendingReturnQty(options.returns);
    if (!base.returned && options.dispatches?.length) {
      const byLine = aggregateReceivedReturnsByOrderLine(options.returns, options.dispatches);
      base.returned = Object.values(byLine).reduce((sum, qty) => sum + qty, 0);
    }
  }

  const salesResolved = resolveSalesApprovedTotals(order, base);
  base.salesApproved = salesResolved.salesApproved;
  base.pendingAdmin = salesResolved.pendingAdmin;

  return base;
}

function idFromRef(ref: unknown): string {
  if (typeof ref === "string") return ref.trim();
  if (ref && typeof ref === "object" && "_id" in ref) {
    return String((ref as { _id: unknown })._id ?? "").trim();
  }
  if (ref && typeof ref === "object" && "id" in ref) {
    return String((ref as { id: unknown }).id ?? "").trim();
  }
  return "";
}

function isKitBucketLine(line: { kit_parent_product?: unknown }): boolean {
  return Boolean(idFromRef(line.kit_parent_product));
}

export function fulfillmentLinesFromSnapshot(
  order: Record<string, unknown> | null,
  fulfillmentSnapshot?: Record<string, unknown> | null,
  options?: {
    returns?: Record<string, unknown>[];
    dispatches?: Record<string, unknown>[];
  },
): FulfillmentLine[] {
  if (!order) return [];

  const accountApprovalStatus = resolveAccountApprovalStatus(order, fulfillmentSnapshot);
  const returnedByLine =
    options?.returns?.length && options?.dispatches?.length
      ? aggregateReceivedReturnsByOrderLine(options.returns, options.dispatches)
      : null;
  const pendingByLine =
    options?.returns?.length && options?.dispatches?.length
      ? aggregatePendingReturnsByOrderLine(options.returns, options.dispatches)
      : null;

  const snapLines = fulfillmentSnapshot?.lines;
  if (Array.isArray(snapLines) && snapLines.length > 0) {
    return snapLines.map((raw) => {
      const line = raw as Record<string, unknown>;
      const orderItemId = String(line.order_item_id ?? "");
      const ordered = num(line.ordered);
      const salesApproved = num(line.salesApproved ?? line.sales_approved);
      const financeApproved = num(line.approved ?? line.financeApproved);
      const accountCleared = num(
        line.accountCleared ??
          line.account_cleared ??
          (accountApprovalStatus !== "pending" ? financeApproved : 0),
      );
      const pendingAccount = num(
        line.pendingAccount ??
          line.pending_account ??
          Math.max(0, financeApproved - accountCleared),
      );
      const returned =
        num(line.returned ?? line.returned_quantity) ||
        (returnedByLine && orderItemId ? returnedByLine[orderItemId] ?? 0 : 0);
      const pendingReturn =
        num(line.pendingReturn ?? line.pending_return) ||
        (pendingByLine && orderItemId ? pendingByLine[orderItemId] ?? 0 : 0);
      return {
        order_item_id: orderItemId,
        product: idFromRef(line.product),
        product_name: String(line.product_name || "—"),
        sku: String(line.sku || ""),
        kit_parent_product: idFromRef(line.kit_parent_product),
        ordered,
        salesApproved,
        approved: financeApproved,
        accountCleared,
        dispatched: num(line.dispatched),
        delivered: num(line.delivered),
        returned,
        pendingReturn,
        pendingAdmin: num(line.pendingAdmin ?? Math.max(0, ordered - salesApproved)),
        pendingFinance: num(
          line.pendingFinance ?? Math.max(0, salesApproved - financeApproved),
        ),
        pendingAccount,
        pendingDispatch: num(
          line.pendingDispatch ?? Math.max(0, accountCleared - num(line.dispatched)),
        ),
        pendingDelivery: num(line.pendingDelivery),
      };
    });
  }

  const items = Array.isArray(order.order_items)
    ? (order.order_items as Record<string, unknown>[])
    : [];
  return items.map((line) => {
    const q = lineApprovalQuantities(line, { accountApprovalStatus });
    const orderItemId = String(line._id ?? line.id ?? "");
    const returned =
      num(line.returned_quantity ?? line.returned) ||
      (returnedByLine ? returnedByLine[orderItemId] ?? 0 : 0);
    const pendingReturn = pendingByLine ? pendingByLine[orderItemId] ?? 0 : 0;
    return {
      order_item_id: orderItemId,
      product: idFromRef(line.product),
      product_name: String(line.product_name || "—"),
      sku: String(line.sku || ""),
      kit_parent_product: idFromRef(line.kit_parent_product),
      ordered: q.ordered,
      salesApproved: q.salesApproved,
      approved: q.financeApproved,
      accountCleared: q.accountCleared,
      dispatched: q.dispatched,
      delivered: q.delivered,
      returned,
      pendingReturn,
      pendingAdmin: q.pendingAdmin,
      pendingFinance: q.pendingFinance,
      pendingAccount: q.pendingAccount,
      pendingDispatch: q.pendingDispatch,
      pendingDelivery: q.pendingDelivery,
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

/**
 * Normalize Order.workflow_stage to canonical ORDER_WORKFLOW_STAGE values
 * (mirrors backend normalizeWorkflowStage).
 */
function normalizeWorkflowStage(stage: string): string {
  const s = String(stage || "").toLowerCase();
  if (s === "dispatch_review" || s === "dispatch_execution") return "dispatch";
  if (s === "hold") return "on_hold";
  if (s === "delivered") return "completed";
  return s;
}

/** Index into Order.workflow_stage pipeline (canonical + legacy aliases). */
function stageIndex(stage: string): number {
  const order = [
    "sales",
    "admin_review",
    "finance_review",
    "account_review",
    "dispatch",
    "completed",
  ];
  const idx = order.indexOf(normalizeWorkflowStage(stage));
  return idx >= 0 ? idx : -1;
}

/** Order.dispatch_status rollup (FULFILLMENT_STATUS) — not OrderDispatch.dispatch_status. */
function orderDispatchRollup(value: unknown): string {
  return String(value || "pending").toLowerCase();
}

/** Order.delivery_status rollup (FULFILLMENT_STATUS). */
function orderDeliveryRollup(value: unknown): string {
  return String(value || "pending").toLowerCase();
}

/**
 * TransportShipment.shipment_status when nested on dispatches / order.
 * Used only as a delivery-box hint after a batch is submitted.
 */
function latestShipmentStatus(
  dispatches?: Record<string, unknown>[] | null,
  order?: Record<string, unknown> | null,
): string {
  const fromOrder = order?.latest_shipment_status ?? order?.shipment_status;
  if (fromOrder != null && String(fromOrder)) {
    return String(fromOrder).toLowerCase();
  }
  if (!Array.isArray(dispatches)) return "";
  for (let i = dispatches.length - 1; i >= 0; i -= 1) {
    const d = dispatches[i];
    const nested =
      d.shipment_status ??
      (d.transport && typeof d.transport === "object"
        ? (d.transport as Record<string, unknown>).shipment_status
        : null) ??
      (d.shipment && typeof d.shipment === "object"
        ? (d.shipment as Record<string, unknown>).shipment_status
        : null);
    if (nested != null && String(nested)) return String(nested).toLowerCase();
  }
  return "";
}

export function computeDepartmentStageBoxes(
  order: Record<string, unknown> | null,
  fulfillmentSnapshot?: Record<string, unknown> | null,
  options?: {
    returns?: Record<string, unknown>[];
    dispatches?: Record<string, unknown>[];
  },
): DepartmentStageBox[] {
  if (!order) return [];

  let totals = totalsFromSources(order, fulfillmentSnapshot, options);
  const salesResolved = resolveSalesApprovedTotals(order, totals);
  totals = { ...totals, ...salesResolved };
  const stage = normalizeWorkflowStage(String(order.workflow_stage || ""));
  const lifecycle = String(order.lifecycle_status || "");
  // Order.* rollups (FULFILLMENT_STATUS) — distinct from OrderDispatch / OrderDelivery enums.
  const dispatchStatus = orderDispatchRollup(
    fulfillmentSnapshot?.dispatch_status ?? order.dispatch_status,
  );
  const deliveryStatus = orderDeliveryRollup(
    fulfillmentSnapshot?.delivery_status ?? order.delivery_status,
  );
  const shipmentStatus = latestShipmentStatus(options?.dispatches, order);
  const currentIdx = stageIndex(stage);
  const cancelled =
    lifecycle === "cancelled" || stage === "cancelled" || String(order.status || "") === "cancelled";

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
      mk("admin", SALES_APPROVAL_DEPARTMENT_LABEL, cancelledStatus, 0, 0, totals.ordered, "—"),
      mk("due_sheet", "Due Sheet", cancelledStatus, 0, 0, totals.ordered, "—"),
      mk("finance", "Finance", cancelledStatus, 0, 0, totals.salesApproved, "—"),
      mk("account", "Account", cancelledStatus, 0, 0, totals.approved, "—"),
      mk("dispatch", "Dispatch", cancelledStatus, 0, 0, totals.approved, "—"),
      mk("delivery", "Delivery", cancelledStatus, 0, 0, totals.dispatched, "—"),
      mk("return", "Return", cancelledStatus, 0, 0, totals.delivered, "—"),
    ];
  }

  const workflowStatus = deriveOrderWorkflowStatus(order);
  const adminCleared = isAdminCleared(order);
  const dueSheetUploaded = isDueSheetUploaded(order);
  const approvalDueSheetFlagged = isApprovalDueSheetUploaded(order);
  // Pass when due sheet file exists OR OrderApproval.is_due_sheet_uploaded is true.
  const dueSheetCleared = isDueSheetStageCleared(order);
  const financeCleared = isFinanceCleared(order);
  const accountCleared = isAccountCleared(order);
  const submittedDispatch = hasSubmittedDispatch(options?.dispatches);

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

  // Sequential: admin → due sheet → finance → account → dispatch → delivery.
  let salesApprovalStatus: OrderStatusDimension;
  if (workflowStatus === "draft") {
    salesApprovalStatus = { ...WAITING, detail: "Awaiting submission" };
  } else if (!adminCleared) {
    salesApprovalStatus =
      totals.pendingAdmin > 0 && totals.salesApproved > 0
        ? {
            key: "partial",
            label: "Partial",
            detail: `${totals.pendingAdmin} qty pending`,
            tone: "warning",
          }
        : { ...PENDING, detail: "Admin approval required" };
  } else {
    salesApprovalStatus = {
      ...APPROVED,
      detail: `${totals.salesApproved || totals.ordered} / ${totals.ordered} qty`,
    };
  }

  let dueSheetStatus: OrderStatusDimension;
  if (!adminCleared) {
    dueSheetStatus = { ...WAITING, detail: "Awaiting admin approval" };
  } else if (!dueSheetCleared) {
    dueSheetStatus = { ...PENDING, detail: "Upload required before finance" };
  } else if (dueSheetUploaded) {
    dueSheetStatus = {
      key: "uploaded",
      label: "Uploaded",
      tone: "success",
    };
  } else {
    dueSheetStatus = {
      key: "flagged",
      label: "Marked uploaded",
      detail: "Flagged on order approval",
      tone: "success",
    };
  }

  let financeStatus: OrderStatusDimension;
  if (!adminCleared) {
    financeStatus = { ...WAITING, detail: "Awaiting admin approval" };
  } else if (!dueSheetCleared) {
    financeStatus = { ...WAITING, detail: "Awaiting due sheet" };
  } else if (!financeCleared) {
    financeStatus =
      totals.pendingFinance > 0 && totals.approved > 0
        ? {
            key: "partial",
            label: "Partial",
            detail: `${totals.pendingFinance} qty pending`,
            tone: "warning",
          }
        : { ...PENDING, detail: "Finance approval required" };
  } else {
    financeStatus = {
      ...APPROVED,
      detail: `${totals.approved} / ${totals.salesApproved || totals.ordered} qty`,
    };
  }

  let accountStatusDim: OrderStatusDimension;
  if (!adminCleared) {
    accountStatusDim = { ...WAITING, detail: "Awaiting admin approval" };
  } else if (!dueSheetCleared) {
    accountStatusDim = { ...WAITING, detail: "Awaiting due sheet" };
  } else if (!financeCleared) {
    accountStatusDim = { ...WAITING, detail: "Awaiting finance approval" };
  } else if (!accountCleared) {
    accountStatusDim =
      totals.pendingAccount > 0 && totals.accountCleared > 0
        ? {
            key: "partial",
            label: "Partial",
            detail: `${totals.pendingAccount} qty pending`,
            tone: "warning",
          }
        : { ...PENDING, detail: "Account approval required" };
  } else {
    accountStatusDim = {
      ...APPROVED,
      detail: `${totals.accountCleared || totals.approved} qty cleared`,
    };
  }

  const dispatchCap = accountCleared
    ? totals.accountCleared > 0
      ? totals.accountCleared
      : totals.approved
    : 0;

  let dispatchStatusDim: OrderStatusDimension;
  if (!accountCleared) {
    dispatchStatusDim = {
      ...WAITING,
      detail: !adminCleared
        ? "Awaiting admin approval"
        : !dueSheetCleared
          ? "Awaiting due sheet"
          : !financeCleared
            ? "Awaiting finance approval"
            : "Awaiting account approval",
    };
  } else if (dispatchStatus === "completed" || (totals.dispatched > 0 && totals.pendingDispatch === 0)) {
    dispatchStatusDim = {
      key: "full",
      label: "Fully dispatched",
      detail: `${totals.dispatched} / ${dispatchCap} account-cleared qty`,
      tone: "success",
    };
  } else if (dispatchStatus === "partial" || totals.dispatched > 0) {
    dispatchStatusDim = {
      key: "partial",
      label: "Partially dispatched",
      detail: `${totals.pendingDispatch} qty pending`,
      tone: "info",
    };
  } else if (submittedDispatch) {
    // OrderDispatch.dispatch_status: submitted | transport_created
    dispatchStatusDim = {
      key: "submitted",
      label: "Submitted for transport",
      tone: "info",
    };
  } else if (
    stage === "dispatch" ||
    currentIdx >= stageIndex("dispatch") ||
    workflowStatus === "dispatch" ||
    workflowStatus === "dispatch_pending" ||
    workflowStatus === "fully_account_approved" ||
    workflowStatus === "account_approved"
  ) {
    dispatchStatusDim = { key: "queue", label: "Dispatch pending", tone: "warning" };
  } else {
    dispatchStatusDim = { key: "queue", label: "Dispatch pending", tone: "warning" };
  }

  let deliveryStatusDim: OrderStatusDimension;
  if (!accountCleared || (!submittedDispatch && totals.dispatched <= 0)) {
    deliveryStatusDim = {
      ...WAITING,
      detail:
        accountCleared && !submittedDispatch
          ? "Awaiting dispatch submit"
          : "Awaiting dispatch",
    };
  } else if (
    deliveryStatus === "completed" ||
    shipmentStatus === "delivered" ||
    (totals.delivered > 0 && totals.pendingDelivery === 0)
  ) {
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
  } else if (
    shipmentStatus === "in_transit" ||
    shipmentStatus === "out_for_delivery" ||
    shipmentStatus === "picked_up"
  ) {
    deliveryStatusDim = {
      key: "in_transit",
      label: "In transit",
      detail: shipmentStatus.replaceAll("_", " "),
      tone: "info",
    };
  } else if (submittedDispatch || totals.dispatched > 0) {
    deliveryStatusDim = {
      key: "pending",
      label: "Transport pending",
      detail: shipmentStatus
        ? shipmentStatus.replaceAll("_", " ")
        : "Dispatch submitted for transport",
      tone: "warning",
    };
  } else {
    deliveryStatusDim = { key: "waiting", label: "Not started", tone: "neutral" };
  }

  const returnCap = totals.delivered > 0 ? totals.delivered : totals.dispatched;
  const returnedQty = totals.returned;
  // OrderReturn.return_status: pending | received_at_warehouse
  const pendingReturnQty =
    totals.pendingReturn ||
    (options?.returns?.length ? totalPendingReturnQty(options.returns) : 0);

  let returnStatusDim: OrderStatusDimension;
  if (returnCap <= 0) {
    returnStatusDim = { key: "waiting", label: "Not started", tone: "neutral" };
  } else if (pendingReturnQty > 0 && returnedQty === 0) {
    returnStatusDim = {
      key: "pending",
      label: "Pending warehouse receipt",
      detail: `${pendingReturnQty} qty logged`,
      tone: "warning",
    };
  } else if (returnedQty >= returnCap && returnCap > 0) {
    returnStatusDim = {
      key: "full",
      label: "Fully returned",
      detail: `${returnedQty} qty at warehouse`,
      tone: "danger",
    };
  } else if (returnedQty > 0) {
    returnStatusDim = {
      key: "partial",
      label: "Partially returned",
      detail:
        pendingReturnQty > 0
          ? `${returnedQty} received · ${pendingReturnQty} pending`
          : `${returnedQty} / ${returnCap} qty`,
      tone: "warning",
    };
  } else if (pendingReturnQty > 0) {
    returnStatusDim = {
      key: "pending",
      label: "Return logged",
      detail: `${pendingReturnQty} qty pending receipt`,
      tone: "info",
    };
  } else {
    returnStatusDim = {
      key: "none",
      label: "No returns",
      detail: `${returnCap} qty deliverable`,
      tone: "success",
    };
  }

  const financeCap = dueSheetCleared ? totals.salesApproved || totals.ordered : 0;
  const accountCap = financeCleared ? totals.approved : 0;
  const financeCompleted = dueSheetCleared ? totals.approved : 0;
  const financeRemaining = dueSheetCleared ? totals.pendingFinance : 0;
  const accountCompleted = financeCleared ? totals.accountCleared : 0;
  const accountRemaining = financeCleared ? totals.pendingAccount : 0;
  const dispatchCompleted = accountCleared ? totals.dispatched : 0;
  const dispatchRemaining = accountCleared ? totals.pendingDispatch : 0;

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
      SALES_APPROVAL_DEPARTMENT_LABEL,
      salesApprovalStatus,
      totals.salesApproved,
      totals.pendingAdmin,
      totals.ordered,
      "Admin approved qty",
    ),
    mk(
      "due_sheet",
      "Due Sheet",
      dueSheetStatus,
      dueSheetCleared ? 1 : 0,
      adminCleared && !dueSheetCleared ? 1 : 0,
      1,
      dueSheetUploaded
        ? "Due sheet upload"
        : approvalDueSheetFlagged
          ? "Approval due-sheet flag"
          : "Due sheet upload",
    ),
    mk(
      "finance",
      "Finance",
      financeStatus,
      financeCompleted,
      financeRemaining,
      financeCap,
      "Finance approved qty",
    ),
    mk(
      "account",
      "Account",
      accountStatusDim,
      accountCompleted,
      accountRemaining,
      accountCap,
      "Account cleared qty",
    ),
    mk(
      "dispatch",
      "Dispatch",
      dispatchStatusDim,
      dispatchCompleted,
      dispatchRemaining,
      dispatchCap || (accountCleared ? totals.salesApproved || totals.ordered : 0),
      "Dispatched qty",
    ),
    mk(
      "delivery",
      "Delivery",
      deliveryStatusDim,
      totals.delivered,
      totals.pendingDelivery,
      totals.dispatched || (submittedDispatch ? dispatchCap : 0),
      "Delivered qty",
    ),
    mk(
      "return",
      "Return",
      returnStatusDim,
      returnedQty,
      Math.max(0, returnCap - returnedQty),
      returnCap,
      "Returned qty",
    ),
  ];
}

export { computeOrderStatusDimensions, salesApprovedOnLine, financeApprovedOnLine };
