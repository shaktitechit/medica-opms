/**
 * Order list workflow tabs — synced with backend models / enrichment:
 *
 * | Concern              | Source of truth                                              |
 * |----------------------|--------------------------------------------------------------|
 * | Queue / stage        | Order.status, Order.workflow_stage, Order.lifecycle_status   |
 * | Admin / finance / acct | OrderApproval flags + Order.*_approval_status + approval_pending |
 * | Due-sheet gate       | OrderDueSheet (active current) OR OrderApproval.is_due_sheet_uploaded |
 * | Dispatch rollup      | Order.dispatch_status (pending\|partial\|completed)          |
 * | Dispatch batches     | OrderDispatch.dispatch_status (draft\|submitted\|…)          |
 * | Transport            | TransportShipment.shipment_status                             |
 * | Delivery rollup      | Order.delivery_status (pending\|partial\|completed)          |
 * | Delivery lines       | OrderDelivery.delivery_status                                |
 * | Returns              | OrderReturn.return_status                                    |
 * | Audit trail only     | OrderWorkflow (from_/to_ snapshots)                          |
 *
 * Exclusive pipeline:
 * sales → admin → due sheet → finance → account → dispatch → transport pending → in transit → delivery/close
 *
 * List enrichment (orderApprovalPending.util):
 * - approval_pending: { admin, finance, account, stage }
 * - due_sheet_uploaded / is_due_sheet_uploaded (sheet OR approval flag)
 */
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { hasPendingReturns } from "@/components/portal/shared/returnSettlement";
import { isReturnPending } from "@/constants/orderReturnStatus";

export type ApprovalPendingStage = "admin" | "finance" | "account" | null;

export type OrderWorkflowCategoryOptions = {
  pendingReturnOrderIds?: Set<string>;
  returnsByOrderId?: Map<string, Record<string, unknown>[]>;
  /** Order ids with ≥1 dispatch batch submitted for transport. */
  submittedDispatchOrderIds?: Set<string>;
  /** Order ids with ≥1 open (not delivered/returned/cancelled) transport shipment. */
  activeTransportOrderIds?: Set<string>;
  /** Order ids with ≥1 transport shipment ever created (incl. delivered). */
  transportCreatedOrderIds?: Set<string>;
  /** Order ids with ≥1 OrderDispatch in transport_created. */
  dispatchTransportOrderIds?: Set<string>;
};

/** Submitted dispatch awaiting a transport shipment. */
const TRANSPORT_PENDING_STATUSES = new Set([
  "dispatch_created",
  "transport_pending",
]);

/** Active transport created — order is moving / assigned for shipment. */
const IN_TRANSIT_STATUSES = new Set([
  "transport_assigned",
  "partially_transported",
  "fully_transported",
  "in_transit",
]);

const IN_TRANSIT_ACTIONS = new Set([
  "partially_transported",
  "fully_transported",
  "transporter_assigned",
  "vehicle_assigned",
  "picked_up",
  "in_transit",
  "out_for_delivery",
]);

function refId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}

/** Shipments that are not a live open transport. */
const CLOSED_SHIPMENT_STATUSES = new Set([
  "returned",
  "cancelled",
  "delivery_failed",
  "delivered",
]);

/** Shipments that never count as "transport created" for pending exclusion. */
const VOID_SHIPMENT_STATUSES = new Set(["returned", "cancelled"]);

function collectTransportOrderIds(
  transports: unknown[],
  excludeStatuses: Set<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const raw of transports) {
    if (!raw || typeof raw !== "object") continue;
    const tr = raw as Record<string, unknown>;
    const shipmentStatus = String(tr.shipment_status ?? tr.status ?? "").toLowerCase();
    if (excludeStatuses.has(shipmentStatus)) continue;
    const orderId = refId(tr.order);
    if (orderId) ids.add(orderId);
  }
  return ids;
}

/**
 * Order ids with ≥1 open transport shipment.
 * Shared by ListOrdersPage workflow tabs and dashboard Quick Access.
 */
export function buildActiveTransportOrderIds(transports: unknown[]): Set<string> {
  return collectTransportOrderIds(transports, CLOSED_SHIPMENT_STATUSES);
}

/** Order ids with any non-void transport shipment (includes delivered). */
export function buildTransportCreatedOrderIds(transports: unknown[]): Set<string> {
  return collectTransportOrderIds(transports, VOID_SHIPMENT_STATUSES);
}

/** Order ids whose dispatch batches already have transport_created. */
export function buildTransportCreatedOrderIdsFromDispatches(
  dispatches: unknown[],
): Set<string> {
  const ids = new Set<string>();
  for (const raw of dispatches) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const dispatchStatus = String(
      row.dispatch_status ?? row.status ?? "",
    ).toLowerCase();
    if (dispatchStatus !== "transport_created") continue;
    const orderId = refId(row.order);
    if (orderId) ids.add(orderId);
  }
  return ids;
}

/** Category options used by Quick Access + list workflow tabs. */
export function buildOrderWorkflowCategoryOptions(params: {
  transports?: unknown[];
  dispatches?: unknown[];
}): OrderWorkflowCategoryOptions {
  const transports = params.transports ?? [];
  const transportCreatedOrderIds = buildTransportCreatedOrderIds(transports);
  const dispatchTransportOrderIds = buildTransportCreatedOrderIdsFromDispatches(
    params.dispatches ?? [],
  );
  return {
    activeTransportOrderIds: buildActiveTransportOrderIds(transports),
    transportCreatedOrderIds,
    dispatchTransportOrderIds,
  };
}

function orderHasPendingReturns(
  order: Record<string, unknown>,
  options?: OrderWorkflowCategoryOptions,
): boolean {
  const orderId = refId(order._id ?? order.id);
  if (options?.pendingReturnOrderIds?.has(orderId)) return true;
  if (options?.returnsByOrderId && orderId) {
    const rows = options.returnsByOrderId.get(orderId) ?? [];
    return hasPendingReturns(rows);
  }
  return false;
}

export function isReturnPendingOrder(
  order: unknown,
  options?: OrderWorkflowCategoryOptions,
): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return false;
  if (status === "on_hold") return false;
  if (status === "cancelled" || status === "finance_rejected") return false;

  return orderHasPendingReturns(row, options);
}

/** Physically closed or delivered — ignores billing (unbilled is a separate queue). */
export function isFulfillmentComplete(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  if (isOrderClosed(row) || isOrderDelivered(row)) return true;
  const legacyStatus = String(row.status || "").toLowerCase();
  return legacyStatus === "delivered" || legacyStatus === "closed";
}

function orderHasTransportCreated(
  order: Record<string, unknown>,
  options?: OrderWorkflowCategoryOptions,
): boolean {
  const orderId = refId(order._id ?? order.id);
  if (orderId && options?.transportCreatedOrderIds?.has(orderId)) return true;
  if (orderId && options?.activeTransportOrderIds?.has(orderId)) return true;
  if (orderId && options?.dispatchTransportOrderIds?.has(orderId)) return true;

  const status = deriveOrderWorkflowStatus(order);
  if (IN_TRANSIT_STATUSES.has(status)) return true;

  const legacyStatus = String(order.status || "").toLowerCase();
  if (legacyStatus === "in_transit" || IN_TRANSIT_STATUSES.has(legacyStatus)) return true;

  const action = String(order.current_action || "").toLowerCase();
  if (IN_TRANSIT_ACTIONS.has(action)) return true;

  return false;
}

/**
 * In Transit: an open transport shipment exists, or order status/action
 * already advanced past transport creation (and not yet delivered/closed).
 */
export function isInTransitOrder(
  order: unknown,
  options?: OrderWorkflowCategoryOptions,
): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "on_hold" || status === "cancelled" || status === "finance_rejected") {
    return false;
  }
  if (isFulfillmentComplete(row)) return false;

  const orderId = refId(row._id ?? row.id);
  if (orderId && options?.activeTransportOrderIds?.has(orderId)) {
    return true;
  }

  if (IN_TRANSIT_STATUSES.has(status)) return true;

  const legacyStatus = String(row.status || "").toLowerCase();
  if (legacyStatus === "in_transit" || IN_TRANSIT_STATUSES.has(legacyStatus)) {
    return true;
  }

  const action = String(row.current_action || "").toLowerCase();
  if (IN_TRANSIT_ACTIONS.has(action)) return true;

  // Dispatch marked transport_created but shipment list didn't yield an open row.
  if (orderId && options?.dispatchTransportOrderIds?.has(orderId)) {
    const onlyFinishedShipments =
      options.transportCreatedOrderIds?.has(orderId) &&
      !options.activeTransportOrderIds?.has(orderId);
    if (!onlyFinishedShipments) return true;
  }

  return false;
}

/**
 * Transport Pending: submitted dispatch exists, and no transport shipment yet.
 */
export function isTransportPending(
  order: unknown,
  options?: OrderWorkflowCategoryOptions,
): boolean {
  if (!order || typeof order !== "object") return false;
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "on_hold" || status === "cancelled" || status === "finance_rejected") {
    return false;
  }
  if (isFulfillmentComplete(row)) return false;
  if (isInTransitOrder(order, options)) return false;
  if (orderHasTransportCreated(row, options)) return false;

  const orderId = refId(row._id ?? row.id);
  if (orderId && options?.submittedDispatchOrderIds?.has(orderId)) {
    return true;
  }

  // Status transitions to partial/full_dispatch_created only on submit.
  if (TRANSPORT_PENDING_STATUSES.has(status)) return true;

  // Order-level fulfillment flags after submitted qty left the warehouse bucket.
  // Require account clearance so approval-stage rows never land here early.
  if (!isAccountCleared(row)) return false;

  const dispatchStatus = String(row.dispatch_status || "").toLowerCase();
  if (dispatchStatus === "partial" || dispatchStatus === "completed") return true;

  return false;
}


export type ApprovalPendingSummary = {
  admin: boolean;
  finance: boolean;
  account: boolean;
  stage: ApprovalPendingStage;
};

/** Mirrors backend APPROVAL_STATUS (+ registry sent_to_finance). */
const ADMIN_CLEARED_STATUS = new Set(["approved", "full", "sent_to_finance"]);
/** Account partial still means account signed off some qty — eligible for dispatch. */
const ACCOUNT_CLEARED_STATUS = new Set(["approved", "full", "partial"]);
const PARTIAL_OR_PENDING = new Set(["pending", "partial", ""]);

/**
 * Order.status values that mean admin has signed off
 * (canonical ORDER_STATUS + common legacy aliases still stored in DB).
 */
const POST_ADMIN_STATUSES = new Set([
  "sales_approved",
  "finance_review",
  "finance_approved",
  "partially_finance_approved",
  "fully_finance_approved",
  "account_review",
  "account_approved",
  "partially_account_approved",
  "fully_account_approved",
  "dispatch",
  "dispatch_pending",
  "dispatch_created",
  "in_transit",
  "transport_pending",
  "transport_assigned",
  "partially_transported",
  "fully_transported",
  "delivered",
  "closed",
]);

/**
 * Still awaiting finance. After admin approve, line qty can make
 * finance_approval_status look approved — keep these finance-pending.
 */
const PRE_FINANCE_STATUSES = new Set([
  "draft",
  "submitted",
  "pending_review",
  "sales_approved",
  "finance_review",
]);

/** Order.status values that prove finance has signed off (or later). */
const POST_FINANCE_STATUSES = new Set([
  "finance_approved",
  "partially_finance_approved",
  "fully_finance_approved",
  "account_review",
  "account_approved",
  "partially_account_approved",
  "fully_account_approved",
  "dispatch",
  "dispatch_pending",
  "dispatch_created",
  "in_transit",
  "transport_pending",
  "transport_assigned",
  "partially_transported",
  "fully_transported",
  "delivered",
  "closed",
]);

function asRow(order: unknown): Record<string, unknown> | null {
  if (!order || typeof order !== "object") return null;
  return order as Record<string, unknown>;
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function adminApprovalCleared(value: unknown): boolean {
  return ADMIN_CLEARED_STATUS.has(String(value || "").toLowerCase());
}

function accountApprovalCleared(value: unknown): boolean {
  return ACCOUNT_CLEARED_STATUS.has(String(value || "").toLowerCase());
}

function approvalStatusOpen(value: unknown): boolean {
  const s = String(value || "pending").toLowerCase();
  return PARTIAL_OR_PENDING.has(s);
}

/** Backend list enrichment: OrderApproval pending rollup. */
function readApprovalPending(
  row: Record<string, unknown>,
): ApprovalPendingSummary | null {
  const pending = row.approval_pending;
  if (!pending || typeof pending !== "object") return null;
  const p = pending as Record<string, unknown>;
  if (!("admin" in p) && !("finance" in p) && !("account" in p) && !("stage" in p)) {
    return null;
  }
  const stageRaw = String(p.stage || "").toLowerCase();
  const stage: ApprovalPendingStage =
    stageRaw === "admin" || stageRaw === "finance" || stageRaw === "account"
      ? stageRaw
      : null;
  return {
    admin: Boolean(p.admin),
    finance: Boolean(p.finance),
    account: Boolean(p.account),
    stage,
  };
}

/** Order.closed_at / Order.status === closed (workflow_stage completed). */
export function isOrderClosed(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  if (row.closed_at != null && row.closed_at !== "") return true;
  return String(row.status || "").toLowerCase() === "closed";
}

/**
 * OrderApproval.is_admin_approved / Order.admin_approval_status /
 * approval_pending.admin (enriched).
 */
export function isAdminCleared(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;

  const enriched = readApprovalPending(row);
  if (enriched?.admin) return false;

  // Explicit OrderApproval / Order flag.
  if (row.is_admin_approved === true) return true;

  const status = deriveOrderWorkflowStatus(row);
  const adminStatus = String(row.admin_approval_status || "pending").toLowerCase();

  if (adminApprovalCleared(adminStatus)) return true;
  if (status === "draft" || status === "submitted" || status === "pending_review") {
    return false;
  }
  if (POST_ADMIN_STATUSES.has(status)) return true;
  return !approvalStatusOpen(adminStatus);
}

/**
 * OrderApproval.is_finance_approved / approval_pending.finance /
 * Order.status past finance. Does not trust finance_approval_status alone
 * after admin (admin qty can mark that field approved early).
 */
export function isFinanceCleared(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  const status = deriveOrderWorkflowStatus(row);
  const enriched = readApprovalPending(row);

  if (enriched && ("finance" in (row.approval_pending as object))) {
    if (enriched.finance) return false;
    if (enriched.account) return true;
  }

  if (PRE_FINANCE_STATUSES.has(status)) return false;
  if (row.is_finance_approved === true) return true;
  if (POST_FINANCE_STATUSES.has(status)) return true;

  if (enriched && !enriched.finance && isAdminCleared(row)) {
    return true;
  }

  return false;
}

/**
 * OrderApproval.is_account_approved / approval_pending.account /
 * Order.account_approval_status / post-account Order.status.
 *
 * Prefer enrichment: when no OrderApproval batch still needs account, treat as
 * cleared even if Order.account_approval_status / status lagged (otherwise the
 * order is counted as Account Pending but missing from that API queue and also
 * filtered out of Dispatch Pending).
 */
export function isAccountCleared(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  const status = deriveOrderWorkflowStatus(row);
  const enriched = readApprovalPending(row);

  if (enriched?.account) return false;
  if (!isFinanceCleared(row)) return false;

  if (row.is_account_approved === true) return true;

  const accountStatus = String(row.account_approval_status || "pending").toLowerCase();
  if (accountApprovalCleared(accountStatus)) return true;

  const postAccountStatus =
    status === "account_approved" ||
    status === "fully_account_approved" ||
    status === "partially_account_approved" ||
    status === "dispatch" ||
    status === "dispatch_pending" ||
    status === "dispatch_created" ||
    status === "in_transit" ||
    status.startsWith("transport") ||
    status === "delivered" ||
    status === "closed";

  if (postAccountStatus) return true;

  // Enrichment: no batch still needs admin/finance/account. Trust OrderApproval even
  // when Order.status / account_approval_status / last_account_approval lagged —
  // otherwise the row is a ghost Account Pending and never reaches Dispatch Pending.
  if (
    enriched &&
    !enriched.admin &&
    !enriched.finance &&
    !enriched.account &&
    enriched.stage === null
  ) {
    if (row.last_account_approval != null && row.last_account_approval !== "") {
      return true;
    }
    if (status === "account_review") return true;
    // Finance already cleared and no account batch left — ready for dispatch queue.
    if (!PRE_FINANCE_STATUSES.has(status)) return true;
  }

  return false;
}

/**
 * Dispatch Pending: admin + due sheet + finance + account cleared, and no
 * dispatch batch has been created+submitted yet (draft-only still counts here).
 */
export function isDispatchPending(
  order: unknown,
  options?: OrderWorkflowCategoryOptions,
): boolean {
  const row = asRow(order);
  if (!row) return false;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return false;
  if (status === "on_hold") return false;
  if (status === "cancelled" || status === "finance_rejected" || status === "account_rejected") {
    return false;
  }
  if (isFulfillmentComplete(row)) return false;
  if (isInTransitOrder(order, options)) return false;
  if (isTransportPending(order, options)) return false;

  if (!isAdminCleared(row)) return false;
  if (!isDueSheetStageCleared(row)) return false;
  if (!isFinanceCleared(row)) return false;
  if (!isAccountCleared(row)) return false;

  return true;
}

/** OrderDueSheet present — list enrichment `due_sheet_uploaded`. */
export function isDueSheetUploaded(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  return isTruthyFlag(row.due_sheet_uploaded);
}

/**
 * OrderApproval.is_due_sheet_uploaded (enriched on order or nested last_*_approval).
 */
export function isApprovalDueSheetUploaded(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  if (isTruthyFlag(row.is_due_sheet_uploaded)) return true;

  for (const key of [
    "last_admin_approval",
    "last_finance_approval",
    "last_account_approval",
  ] as const) {
    const ref = row[key];
    if (
      ref &&
      typeof ref === "object" &&
      isTruthyFlag((ref as Record<string, unknown>).is_due_sheet_uploaded)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Due-sheet gate (between admin and finance):
 * OrderDueSheet (active current) OR OrderApproval.is_due_sheet_uploaded.
 */
export function isDueSheetStageCleared(order: unknown): boolean {
  return isDueSheetUploaded(order) || isApprovalDueSheetUploaded(order);
}

/**
 * Exclusive pending stage for list tabs (frontend due-sheet gate applied on top
 * of backend approval_pending).
 */
export function resolveApprovalPending(order: unknown): ApprovalPendingSummary {
  const row = asRow(order);
  if (!row) {
    return { admin: false, finance: false, account: false, stage: null };
  }

  const status = deriveOrderWorkflowStatus(row);
  if (status === "draft") {
    return { admin: false, finance: false, account: false, stage: null };
  }

  // Sequential — ignore overlapping API flags for exclusive tab membership.
  if (!isAdminCleared(row)) {
    return { admin: true, finance: false, account: false, stage: "admin" };
  }
  if (!isDueSheetStageCleared(row)) {
    return { admin: false, finance: false, account: false, stage: null };
  }
  if (!isFinanceCleared(row)) {
    return { admin: false, finance: true, account: false, stage: "finance" };
  }
  if (!isAccountCleared(row)) {
    return { admin: false, finance: false, account: true, stage: "account" };
  }
  return { admin: false, finance: false, account: false, stage: null };
}

export function hasAnyPendingApproval(order: unknown): boolean {
  const pending = resolveApprovalPending(order);
  return pending.admin || pending.finance || pending.account;
}

export function pendingApprovalStageLabel(stage: ApprovalPendingStage): string {
  switch (stage) {
    case "admin":
      return "Admin";
    case "finance":
      return "Finance";
    case "account":
      return "Account";
    default:
      return "Approval";
  }
}

export type OrderWorkflowTabCategory =
  | "all"
  | "pending_admin_approval"
  | "due_sheet_pending"
  | "pending_finance_approval"
  | "pending_account_approval"
  | "open_dispatched"
  | "transport_pending"
  | "in_transit"
  | "closed_delivered"
  | "on_hold"
  | "cancelled"
  | "rejected";

export const ORDER_WORKFLOW_TABS: ReadonlyArray<{
  id: OrderWorkflowTabCategory;
  label: string;
}> = [
  { id: "all", label: "All Orders" },
  { id: "pending_admin_approval", label: "Admin Pending" },
  { id: "due_sheet_pending", label: "Due Sheet Pending" },
  { id: "pending_finance_approval", label: "Finance Pending" },
  { id: "pending_account_approval", label: "Account Pending" },
  { id: "open_dispatched", label: "Dispatch Pending" },
  { id: "transport_pending", label: "Transport Pending" },
  { id: "in_transit", label: "In Transit" },
  { id: "closed_delivered", label: "Closed/Delivered" },
  { id: "on_hold", label: "On Hold" },
  { id: "cancelled", label: "Cancelled" },
  { id: "rejected", label: "Rejected" },
];

export const ORDER_WORKFLOW_TAB_LABELS: Record<OrderWorkflowTabCategory, string> = {
  all: "All Orders",
  pending_admin_approval: "Admin Pending",
  due_sheet_pending: "Due Sheet Pending",
  pending_finance_approval: "Finance Pending",
  pending_account_approval: "Account Pending",
  open_dispatched: "Dispatch Pending",
  transport_pending: "Transport Pending",
  in_transit: "In Transit",
  closed_delivered: "Closed/Delivered",
  on_hold: "On Hold",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const ORDER_PRIORITY_TABS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "low", label: "Low" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
  { id: "urgent", label: "Urgent" },
];

/** Order.status delivered / Order.delivery_status completed / lifecycle fulfilled. */
export function isOrderDelivered(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  const status = deriveOrderWorkflowStatus(row);
  if (status === "delivered") return true;
  const deliveryStatus = String(row.delivery_status || "").toLowerCase();
  const lifecycle = String(row.lifecycle_status || "").toLowerCase();
  return deliveryStatus === "completed" || lifecycle === "fulfilled";
}

/**
 * Closed/delivered for workflow tabs.
 * Billing no longer blocks this — unbilled delivered orders belong in
 * Closed/Delivered (and the Unbilled modal), not Transport Pending.
 */
export function isOrderClosedOrDelivered(order: unknown): boolean {
  return isFulfillmentComplete(order);
}

/**
 * Admin cleared + due sheet not cleared.
 * OrderDueSheet upload OR OrderApproval.is_due_sheet_uploaded clears this.
 */
export function isDueSheetPending(order: unknown): boolean {
  const row = asRow(order);
  if (!row) return false;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return false;
  if (status === "on_hold") return false;
  if (status === "cancelled") return false;
  if (status === "finance_rejected" || status === "account_rejected") return false;
  if (isOrderClosedOrDelivered(row)) return false;

  if (!isAdminCleared(row)) return false;
  if (isDueSheetStageCleared(row)) return false;

  return true;
}

/**
 * Exclusive tab bucket:
 * terminal → closed/delivered → in transit → transport pending → approvals → dispatch pending.
 *
 * Dispatch Pending is explicit: admin + due sheet + finance + account cleared,
 * and no submitted dispatch yet (draft dispatch still belongs here).
 */
export function getOrderWorkflowTabCategory(
  order: unknown,
  options?: OrderWorkflowCategoryOptions,
): OrderWorkflowTabCategory | null {
  const row = asRow(order);
  if (!row) return null;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return null;
  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected" || status === "account_rejected") return "rejected";

  // Delivered/closed first — never park them under transport pending.
  if (isFulfillmentComplete(row)) return "closed_delivered";

  const orderId = refId(row._id ?? row.id);
  const hasShipmentHistory =
    !!orderId && !!options?.transportCreatedOrderIds?.has(orderId);
  const hasActiveTransport =
    !!orderId && !!options?.activeTransportOrderIds?.has(orderId);

  // Shipments on file, none open ⇒ finished (delivered/returned), not pending.
  if (hasShipmentHistory && !hasActiveTransport && !isInTransitOrder(order, options)) {
    return "closed_delivered";
  }

  if (isInTransitOrder(order, options)) return "in_transit";
  if (isTransportPending(order, options)) return "transport_pending";

  const pending = resolveApprovalPending(row);
  if (pending.admin) return "pending_admin_approval";
  if (isDueSheetPending(row)) return "due_sheet_pending";
  if (pending.finance) return "pending_finance_approval";
  if (pending.account) return "pending_account_approval";

  if (isDispatchPending(order, options)) return "open_dispatched";

  return null;
}

export function orderMatchesWorkflowTab(
  order: unknown,
  tab: OrderWorkflowTabCategory,
  options?: OrderWorkflowCategoryOptions,
): boolean {
  const row = asRow(order);
  if (!row) return false;

  if (tab === "all") {
    return deriveOrderWorkflowStatus(row) !== "draft";
  }

  return getOrderWorkflowTabCategory(order, options) === tab;
}

export function isOrderWorkflowTabCategory(value: string): value is OrderWorkflowTabCategory {
  return ORDER_WORKFLOW_TABS.some((tab) => tab.id === value);
}

export function normalizeWorkflowTabFromUrl(
  value: string | null,
  defaultTab: OrderWorkflowTabCategory,
): OrderWorkflowTabCategory {
  if (!value) return defaultTab;
  if (value === "pending_finance_review") return "pending_finance_approval";
  if (value === "pending_account_review") return "pending_account_approval";
  if (value === "pending_review") return "pending_admin_approval";
  if (value === "open") return "open_dispatched";
  if (value === "dispatch_pending" || value === "dispatch") return "open_dispatched";
  if (value === "closed") return "closed_delivered";
  if (value === "pending_approvals") return "all";
  if (value === "pending_approval") return "pending_finance_approval";
  if (value === "transport_return_pending" || value === "pending_transport" || value === "pending_delivery") {
    return "transport_pending";
  }
  if (value === "returns_pending" || value === "return_pending") return "all";
  if (isOrderWorkflowTabCategory(value)) return value;
  return defaultTab;
}

/**
 * Shared list query for workflow tabs, Quick Access, and Google Sheet modal.
 * One RTK cache key → identical order pools; exclusive buckets are client-side.
 */
export const ORDER_WORKFLOW_LIST_QUERY: Record<string, string | undefined> = {
  exclude_status: "draft",
};

/**
 * List / Quick Access share one candidate set: all non-draft orders.
 * Exclusive tab membership is decided only by `getOrderWorkflowTabCategory`.
 */
export function workflowTabQueryParams(
  _tab?: OrderWorkflowTabCategory,
): Record<string, string | undefined> {
  return { ...ORDER_WORKFLOW_LIST_QUERY };
}

export type OrderWorkflowTabStat = {
  count: number;
  quantity: number;
  amount: number;
};

export type OrderWorkflowTabStats = Record<
  OrderWorkflowTabCategory,
  OrderWorkflowTabStat
>;

export function createEmptyOrderWorkflowTabStats(): OrderWorkflowTabStats {
  return Object.fromEntries(
    ORDER_WORKFLOW_TABS.map((tab) => [
      tab.id,
      { count: 0, quantity: 0, amount: 0 },
    ]),
  ) as OrderWorkflowTabStats;
}

function orderLineQuantityForStats(order: unknown): number {
  const row = order as { order_items?: unknown[]; status?: unknown };
  const items = Array.isArray(row.order_items) ? row.order_items : [];
  const status = deriveOrderWorkflowStatus(row);
  const isApproved =
    status !== "draft" &&
    status !== "submitted" &&
    status !== "cancelled" &&
    status !== "finance_rejected" &&
    status !== "rejected" &&
    status !== "on_hold";

  return items.reduce((sum: number, item) => {
    const line = item as {
      ordered_quantity?: unknown;
      quantity?: unknown;
      approved_quantity?: unknown;
    };
    const q = isApproved
      ? Number(line.approved_quantity ?? 0)
      : Number(line.ordered_quantity ?? line.quantity ?? 0);
    return sum + q;
  }, 0);
}

function orderAmountForStats(order: unknown): number {
  const row = order as { grand_total?: unknown; total?: unknown };
  return Number(row.grand_total ?? row.total ?? 0);
}

/**
 * Per-tab counts used by dashboard Quick Access and list workflow tabs.
 * Same exclusive buckets as `orderMatchesWorkflowTab`.
 */
export function computeOrderWorkflowTabStats(
  orders: unknown[],
  options?: OrderWorkflowCategoryOptions,
): OrderWorkflowTabStats {
  const stats = createEmptyOrderWorkflowTabStats();

  for (const order of orders) {
    if (!order || typeof order !== "object") continue;
    const status = deriveOrderWorkflowStatus(order);
    if (status === "draft") continue;

    const qty = orderLineQuantityForStats(order);
    const amount = orderAmountForStats(order);

    stats.all.count += 1;
    stats.all.quantity += qty;
    stats.all.amount += amount;

    const cat = getOrderWorkflowTabCategory(order, options);
    if (!cat || cat === "all") continue;

    stats[cat].count += 1;
    stats[cat].quantity += qty;
    stats[cat].amount += amount;
  }

  return stats;
}
