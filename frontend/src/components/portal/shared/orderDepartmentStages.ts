/**
 * Per-department workflow boxes: status, qty progress, remaining, and relevant action.
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

export type FulfillmentLine = {
  order_item_id: string;
  product_name: string;
  sku: string;
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
  /** Admin review = sales approval sign-off before finance. */
  admin: ["approved"],
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
        product_name: String(line.product_name || "—"),
        sku: String(line.sku || ""),
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
      product_name: String(line.product_name || "—"),
      sku: String(line.sku || ""),
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

function stageIndex(stage: string): number {
  const order = [
    "sales",
    "admin_review",
    "finance_review",
    "account_review",
    "dispatch_review",
    "dispatch_execution",
    "completed",
  ];
  const idx = order.indexOf(stage);
  return idx >= 0 ? idx : -1;
}

function deriveSalesApprovalStatus(
  order: Record<string, unknown>,
  totals: FulfillmentTotals,
): OrderStatusDimension {
  const salesApprovalStatus = String(order.admin_approval_status ?? "pending");
  const stage = String(order.workflow_stage || "");
  const { salesApproved, pendingAdmin } = resolveSalesApprovedTotals(order, totals);

  if (salesApprovalStatus === "rejected") {
    return { key: "rejected", label: "Sales approval rejected", tone: "danger" };
  }
  if (salesApproved <= 0) {
    if (stage === "admin_review") {
      return { key: "pending", label: "Pending sales approval", tone: "warning" };
    }
    return { key: "waiting", label: "Awaiting submission", tone: "neutral" };
  }
  if (pendingAdmin <= 0) {
    return {
      key: "full",
      label: "Fully sales approved",
      detail: `${salesApproved} / ${totals.ordered} qty`,
      tone: "success",
    };
  }
  return {
    key: "partial",
    label: "Partially sales approved",
    detail: `${pendingAdmin} qty pending sales approval`,
    tone: "warning",
  };
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
  const stage = String(order.workflow_stage || "");
  const lifecycle = String(order.lifecycle_status || "");
  const fas = String(
    fulfillmentSnapshot?.finance_approval_status ?? order.finance_approval_status ?? "pending",
  );
  const aas = resolveAccountApprovalStatus(order, fulfillmentSnapshot);
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
      mk("admin", SALES_APPROVAL_DEPARTMENT_LABEL, cancelledStatus, 0, 0, totals.ordered, "—"),
      mk("finance", "Finance", cancelledStatus, 0, 0, totals.salesApproved, "—"),
      mk("account", "Account", cancelledStatus, 0, 0, totals.approved, "—"),
      mk("dispatch", "Dispatch", cancelledStatus, 0, 0, totals.approved, "—"),
      mk("delivery", "Delivery", cancelledStatus, 0, 0, totals.dispatched, "—"),
      mk("return", "Return", cancelledStatus, 0, 0, totals.delivered, "—"),
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

  const salesApprovalStatus = deriveSalesApprovalStatus(order, totals);

  let financeStatus: OrderStatusDimension;
  if (fas === "rejected") {
    financeStatus = { key: "rejected", label: "Finance rejected", tone: "danger" };
  } else if (fas === "full") {
    financeStatus = {
      key: "full",
      label: "Fully finance approved",
      detail: `${totals.approved} / ${totals.salesApproved} sales-approved qty`,
      tone: "success",
    };
  } else if (fas === "partial" || totals.approved > 0) {
    financeStatus = {
      key: "partial",
      label: "Partially finance approved",
      detail: `${totals.pendingFinance} qty pending finance`,
      tone: "warning",
    };
  } else if (totals.salesApproved > 0 && stage === "finance_review") {
    financeStatus = { key: "review", label: "Finance review", tone: "info" };
  } else if (totals.salesApproved > 0) {
    financeStatus = {
      key: "waiting",
      label: "Awaiting finance",
      detail: `${totals.salesApproved} qty ready`,
      tone: "neutral",
    };
  } else if (currentIdx > stageIndex("finance_review")) {
    financeStatus = { key: "done", label: "Finance complete", tone: "success" };
  } else {
    financeStatus = { key: "waiting", label: "Awaiting finance", tone: "neutral" };
  }

  let accountStatusDim: OrderStatusDimension;
  const status = String(order.status || "");
  const currentAction = String(order.current_action || "");
  const accountDone =
    aas === "full" ||
    ["fully_account_approved", "partially_account_approved"].includes(status) ||
    currentIdx > stageIndex("account_review") ||
    ["dispatch_pending", "partial_dispatch_created", "full_dispatch_created", "delivered"].includes(
      status,
    ) ||
    dispatchStatus === "completed" ||
    dispatchStatus === "partial";

  if (aas === "rejected") {
    accountStatusDim = { key: "rejected", label: "Account rejected", tone: "danger" };
  } else if (aas === "full") {
    accountStatusDim = {
      key: "full",
      label: "Fully account approved",
      detail: `${totals.accountCleared} / ${totals.approved} finance-approved qty`,
      tone: "success",
    };
  } else if (aas === "partial") {
    accountStatusDim = {
      key: "partial",
      label: "Partially account approved",
      detail: `${totals.pendingAccount} qty pending account`,
      tone: "warning",
    };
  } else if (
    stage === "account_review" ||
    status === "account_review" ||
    currentAction === "sent_to_account"
  ) {
    accountStatusDim = {
      key: "review",
      label: "Account review",
      detail: `${totals.approved} qty awaiting account clearance`,
      tone: "info",
    };
  } else if (
    ["fully_finance_approved", "partially_finance_approved"].includes(status) &&
    totals.approved > 0
  ) {
    accountStatusDim = {
      key: "waiting",
      label: "Awaiting send to account",
      detail: `${totals.approved} finance-approved qty`,
      tone: "neutral",
    };
  } else if (accountDone && totals.accountCleared > 0) {
    accountStatusDim = {
      key: "done",
      label: "Account cleared",
      detail: `${totals.accountCleared} qty cleared`,
      tone: "success",
    };
  } else {
    accountStatusDim = {
      key: "waiting",
      label: "Awaiting finance clearance",
      tone: "neutral",
    };
  }

  const dispatchCap = totals.accountCleared > 0 ? totals.accountCleared : totals.approved;

  let dispatchStatusDim: OrderStatusDimension;
  if (dispatchStatus === "completed" || (totals.dispatched > 0 && totals.pendingDispatch === 0)) {
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
  } else if (
    totals.pendingAccount > 0 &&
    totals.approved > 0 &&
    !["dispatch_review", "dispatch_execution"].includes(stage)
  ) {
    dispatchStatusDim = {
      key: "waiting",
      label: "Awaiting account clearance",
      detail: `${totals.pendingAccount} qty pending account`,
      tone: "neutral",
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

  const returnCap = totals.delivered > 0 ? totals.delivered : totals.dispatched;
  const returnedQty = totals.returned;
  const pendingReturnQty = totals.pendingReturn;

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
      "Sales approved qty",
    ),
    mk(
      "finance",
      "Finance",
      financeStatus,
      totals.approved,
      totals.pendingFinance,
      totals.salesApproved || totals.ordered,
      "Finance approved qty",
    ),
    mk(
      "account",
      "Account",
      accountStatusDim,
      totals.accountCleared,
      totals.pendingAccount,
      totals.approved,
      "Account cleared qty",
    ),
    mk(
      "dispatch",
      "Dispatch",
      dispatchStatusDim,
      totals.dispatched,
      totals.pendingDispatch,
      dispatchCap || totals.salesApproved || totals.ordered,
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
