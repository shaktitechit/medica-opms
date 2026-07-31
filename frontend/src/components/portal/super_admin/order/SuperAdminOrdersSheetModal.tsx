"use client";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Search,
  RefreshCw,
  Cloud,
  ShieldAlert,
  Download,
  Plus,
  Trash2,
  Package,
  Save,
  ClipboardCheck,
  RotateCcw,
  Truck,
} from "lucide-react";
import {
  useListOrdersQuery,
  useListOrdersDeletedQuery,
  useListOrderApprovalsQuery,
  useListPartiesQuery,
  useListProductsQuery,
  useListUsersQuery,
  useSuperSheetPatchOrderMutation,
  useSuperSheetPatchOrderApprovalMutation,
  useDeleteOrderMutation,
  useRestoreOrderMutation,
  useListDispatchesQuery,
  usePatchDispatchMutation,
  useCreateDispatchMutation,
  useListTransportsQuery,
  useCreateTransportMutation,
  usePatchTransportMutation,
  useListOrderDeliveriesQuery,
  useLogShipmentDeliveryMutation,
  useListOrderReturnsQuery,
  useCreateOrderReturnMutation,
} from "@/store/api";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import {
  buildPartyNameById,
  pickList,
  resolvePartyDisplay,
} from "@/components/portal/sales/partyDisplay";
import {
  buildUserNameById,
  resolveUserDisplay,
} from "@/components/portal/shared/userDisplay";
import { toast } from "@/lib/toast";
import { SettleRestOrderModal } from "@/components/portal/account/order/components/SettleRestOrderModal";
import { summarizeReleaseDispatchState } from "@/components/portal/account/order/components/accountDispatchAvailability";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import {
  refId,
  toDateInput,
  formatMoney,
  NamedOption,
  ProductOption,
} from "./utils";
import { OrderItemsForm } from "./OrderItemsForm";
import { OrderApprovalsForm } from "./OrderApprovalsForm";
import { OrderDispatchesForm } from "./OrderDispatchesForm";
import { OrderTransportsForm } from "./OrderTransportsForm";
import { OrderDeliveriesForm } from "./OrderDeliveriesForm";
import { OrderReturnsForm } from "./OrderReturnsForm";
import {
  ORDER_WORKFLOW_TABS,
  orderMatchesWorkflowTab,
  type OrderWorkflowTabCategory,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import { getOrderListTabIcon } from "@/components/portal/shared/orderList/orderListTabIcons";

export type SuperAdminOrdersSheetModalProps = {
  isOpen: boolean;
  onClose: () => void;
  partyNameById?: Map<string, string>;
};

type ColDef = {
  key: string;
  label: string;
  editable?: boolean;
  type?: "text" | "number" | "select" | "boolean" | "date";
  options?: readonly string[];
  /** Show / edit as name; persist ObjectId */
  refKind?: "party" | "user" | "approval";
  /** Which approver field to prefer when refKind is approval */
  approvalKind?: "finance" | "admin" | "account";
  width?: number;
};

const PARTY_REF_KEYS = new Set(["party", "customer"]);
const USER_REF_KEYS = new Set([
  "current_assignee",
  "assigned_sales_user",
  "closed_by",
  "created_by",
  "updated_by",
]);
const APPROVAL_REF_KEYS = new Set([
  "last_finance_approval",
  "last_admin_approval",
  "last_account_approval",
]);
const APPROVAL_KIND_BY_KEY: Record<string, "finance" | "admin" | "account"> = {
  last_finance_approval: "finance",
  last_admin_approval: "admin",
  last_account_approval: "account",
};

const ORDER_STATUSES = [
  "draft",
  "submitted",
  "sales_approved",
  "finance_review",
  "finance_approved",
  "finance_rejected",
  "account_review",
  "account_approved",
  "account_rejected",
  "dispatch",
  "in_transit",
  "delivered",
  "closed",
  "cancelled",
  "on_hold",
] as const;

const LIFECYCLE = [
  "draft",
  "active",
  "partially_fulfilled",
  "fulfilled",
  "closed",
  "cancelled",
  "on_hold",
] as const;

const WORKFLOW_STAGES = [
  "sales",
  "admin_review",
  "finance_review",
  "account_review",
  "dispatch",
  "completed",
  "cancelled",
  "on_hold",
] as const;

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const PAYMENT = ["unpaid", "partial", "paid"] as const;
const APPROVAL = ["pending", "partial", "approved", "rejected", "full"] as const;
const FULFILLMENT = ["pending", "partial", "completed"] as const;
const DEPARTMENTS = [
  "super_admin",
  "sales",
  "admin",
  "finance",
  "account",
  "dispatch",
] as const;
const FLAG_SEVERITY = ["none", "low", "medium", "high", "critical"] as const;
const LINE_STATUSES = ["active", "partial", "fulfilled", "cancelled"] as const;
const RATE_TYPES = ["SR", "SRA", "CR", "MANUAL"] as const;

const ORDER_COLUMNS: ColDef[] = [
  { key: "_id", label: "Order ID", width: 110 },
  { key: "order_no", label: "order_no", editable: true, type: "text", width: 130 },
  { key: "order_date", label: "order_date", editable: true, type: "date", width: 120 },
  {
    key: "expected_delivery_date",
    label: "expected_delivery_date",
    editable: true,
    type: "date",
    width: 140,
  },
  {
    key: "priority",
    label: "priority",
    editable: true,
    type: "select",
    options: PRIORITIES,
    width: 100,
  },
  {
    key: "customer",
    label: "customer",
    editable: true,
    type: "text",
    refKind: "party",
    width: 160,
  },
  {
    key: "party",
    label: "party",
    editable: true,
    type: "text",
    refKind: "party",
    width: 160,
  },
  {
    key: "lifecycle_status",
    label: "lifecycle_status",
    editable: true,
    type: "select",
    options: LIFECYCLE,
    width: 140,
  },
  {
    key: "workflow_stage",
    label: "workflow_stage",
    editable: true,
    type: "select",
    options: WORKFLOW_STAGES,
    width: 130,
  },
  {
    key: "status",
    label: "status",
    editable: true,
    type: "select",
    options: ORDER_STATUSES,
    width: 140,
  },
  { key: "current_action", label: "current_action", editable: true, type: "text", width: 120 },
  {
    key: "current_revision",
    label: "current_revision",
    editable: true,
    type: "number",
    width: 100,
  },
  { key: "is_locked", label: "is_locked", editable: true, type: "boolean", width: 90 },
  {
    key: "current_assignee",
    label: "current_assignee",
    editable: true,
    type: "text",
    refKind: "user",
    width: 140,
  },
  {
    key: "assigned_sales_user",
    label: "assigned_sales_user",
    editable: true,
    type: "text",
    refKind: "user",
    width: 150,
  },
  {
    key: "current_department",
    label: "current_department",
    editable: true,
    type: "select",
    options: DEPARTMENTS,
    width: 130,
  },
  {
    key: "pending_with_role",
    label: "pending_with_role",
    editable: true,
    type: "select",
    options: DEPARTMENTS,
    width: 130,
  },
  { key: "subtotal", label: "subtotal", editable: true, type: "number", width: 100 },
  {
    key: "discount_amount",
    label: "discount_amount",
    editable: true,
    type: "number",
    width: 110,
  },
  {
    key: "taxable_amount",
    label: "taxable_amount",
    editable: true,
    type: "number",
    width: 110,
  },
  { key: "gst_amount", label: "gst_amount", editable: true, type: "number", width: 100 },
  { key: "grand_total", label: "grand_total", editable: true, type: "number", width: 110 },
  {
    key: "extra_charges",
    label: "extra_charges",
    editable: true,
    type: "number",
    width: 110,
  },
  {
    key: "penalty_amount",
    label: "penalty_amount",
    editable: true,
    type: "number",
    width: 110,
  },
  {
    key: "damage_charge",
    label: "damage_charge",
    editable: true,
    type: "number",
    width: 110,
  },
  { key: "closed_at", label: "closed_at", editable: true, type: "date", width: 120 },
  {
    key: "closed_by",
    label: "closed_by",
    editable: true,
    type: "text",
    refKind: "user",
    width: 140,
  },
  {
    key: "closure_remarks",
    label: "closure_remarks",
    editable: true,
    type: "text",
    width: 140,
  },
  {
    key: "payment_status",
    label: "payment_status",
    editable: true,
    type: "select",
    options: PAYMENT,
    width: 120,
  },
  {
    key: "finance_approval_status",
    label: "finance_approval_status",
    editable: true,
    type: "select",
    options: APPROVAL,
    width: 150,
  },
  {
    key: "last_finance_approval",
    label: "last_finance_approval",
    editable: true,
    type: "text",
    refKind: "approval",
    approvalKind: "finance",
    width: 180,
  },
  {
    key: "admin_approval_status",
    label: "admin_approval_status",
    editable: true,
    type: "select",
    options: APPROVAL,
    width: 150,
  },
  {
    key: "last_admin_approval",
    label: "last_admin_approval",
    editable: true,
    type: "text",
    refKind: "approval",
    approvalKind: "admin",
    width: 180,
  },
  {
    key: "account_approval_status",
    label: "account_approval_status",
    editable: true,
    type: "select",
    options: APPROVAL,
    width: 150,
  },
  {
    key: "last_account_approval",
    label: "last_account_approval",
    editable: true,
    type: "text",
    refKind: "approval",
    approvalKind: "account",
    width: 180,
  },
  {
    key: "allocation_status",
    label: "allocation_status",
    editable: true,
    type: "select",
    options: FULFILLMENT,
    width: 130,
  },
  {
    key: "dispatch_status",
    label: "dispatch_status",
    editable: true,
    type: "select",
    options: FULFILLMENT,
    width: 130,
  },
  {
    key: "delivery_status",
    label: "delivery_status",
    editable: true,
    type: "select",
    options: FULFILLMENT,
    width: 130,
  },
  {
    key: "has_open_flags",
    label: "has_open_flags",
    editable: true,
    type: "boolean",
    width: 110,
  },
  {
    key: "open_flag_count",
    label: "open_flag_count",
    editable: true,
    type: "number",
    width: 110,
  },
  {
    key: "highest_flag_severity",
    label: "highest_flag_severity",
    editable: true,
    type: "select",
    options: FLAG_SEVERITY,
    width: 140,
  },
  { key: "remarks", label: "remarks", editable: true, type: "text", width: 160 },
  {
    key: "internal_notes",
    label: "internal_notes",
    editable: true,
    type: "text",
    width: 160,
  },
  {
    key: "created_by",
    label: "created_by",
    editable: true,
    type: "text",
    refKind: "user",
    width: 140,
  },
  {
    key: "updated_by",
    label: "updated_by",
    editable: true,
    type: "text",
    refKind: "user",
    width: 140,
  },
];



function displayOrderField(
  order: any,
  key: string,
  partyNameById: Map<string, string>,
  userNameById: Record<string, string>,
  approvalById: Map<string, Record<string, unknown>> = new Map(),
): string {
  const raw = order?.[key];
  if (key === "_id") return refId(order?._id || order?.id);
  if (PARTY_REF_KEYS.has(key) || key === "party" || key === "customer") {
    const label = resolvePartyDisplay(raw, partyNameById);
    return label === "—" ? "" : label;
  }
  if (USER_REF_KEYS.has(key)) {
    const label = resolveUserDisplay(raw, userNameById);
    return label === "—" ? "" : label;
  }
  if (APPROVAL_REF_KEYS.has(key)) {
    const kind = APPROVAL_KIND_BY_KEY[key] || "admin";
    return resolveApprovalDisplay(raw, kind, approvalById, userNameById);
  }
  return String(readOrderField(order, key) ?? "");
}

function buildProductOptions(raw: unknown): ProductOption[] {
  return pickList(raw)
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const o = row as Record<string, unknown>;
      const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
      if (!id) return null;
      return {
        id,
        product_name: String(o.product_name || o.name || "").trim() || id,
        sku: String(o.sku || ""),
        brand:
          typeof o.brand === "object" && o.brand
            ? String((o.brand as { name?: string }).name || "")
            : String(o.brand || ""),
        manufacturer:
          typeof o.manufacturer === "object" && o.manufacturer
            ? String((o.manufacturer as { name?: string }).name || "")
            : String(o.manufacturer || ""),
        unit: String(o.unit || "pcs"),
        hsn_code: String(o.hsn_code || ""),
        gst_percent: Number(o.gst_percent ?? 0) || 0,
        base_price: Number(o.base_price ?? o.mrp ?? 0) || 0,
      } satisfies ProductOption;
    })
    .filter(Boolean) as ProductOption[];
}

function buildPartyOptions(
  partiesRaw: unknown,
  nameById: Map<string, string>,
): NamedOption[] {
  const fromList = pickList(partiesRaw)
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const o = row as Record<string, unknown>;
      const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
      if (!id) return null;
      return {
        id,
        name: nameById.get(id) || resolvePartyDisplay(row, nameById),
      };
    })
    .filter(Boolean) as NamedOption[];
  if (fromList.length) return fromList.sort((a, b) => a.name.localeCompare(b.name));
  return Array.from(nameById.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildUserOptions(usersRaw: unknown): NamedOption[] {
  const map = buildUserNameById(usersRaw);
  return Object.entries(map)
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function pickApprovalApprover(
  approval: Record<string, unknown>,
  kind: "finance" | "admin" | "account",
): unknown {
  if (kind === "finance") {
    return (
      approval.finance_approved_by ??
      approval.approved_by ??
      approval.assigned_finance_user ??
      approval.reviewed_by
    );
  }
  if (kind === "admin") {
    return (
      approval.admin_approved_by ??
      approval.approved_by ??
      approval.sales_submitted_by ??
      approval.created_by
    );
  }
  return (
    approval.account_approved_by ??
    approval.approved_by ??
    approval.assigned_account_user ??
    approval.created_by
  );
}

function approvalRecordLabel(
  approval: Record<string, unknown> | null | undefined,
  kind: "finance" | "admin" | "account",
  userNameById: Record<string, string>,
): string {
  if (!approval) return "";
  const approverName = resolveUserDisplay(
    pickApprovalApprover(approval, kind),
    userNameById,
  );
  const approvalNo =
    typeof approval.approval_no === "string" && approval.approval_no.trim()
      ? approval.approval_no.trim()
      : "";
  const rev =
    approval.revision_number != null
      ? `Rev ${String(approval.revision_number)}`
      : "";
  const status =
    typeof approval.derived_status === "string"
      ? approval.derived_status
      : typeof approval.status === "string"
        ? approval.status
        : "";

  if (approverName && approverName !== "—") {
    return approvalNo
      ? `${approverName} (${approvalNo})`
      : rev
        ? `${approverName} · ${rev}`
        : approverName;
  }
  if (approvalNo) return approvalNo;
  if (rev && status) return `${rev} · ${status}`;
  if (rev) return rev;
  return refId(approval._id || approval.id);
}

function buildApprovalById(raw: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of pickList(raw)) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
    if (id) map.set(id, o);
  }
  return map;
}

function resolveApprovalDisplay(
  value: unknown,
  kind: "finance" | "admin" | "account",
  approvalById: Map<string, Record<string, unknown>>,
  userNameById: Record<string, string>,
): string {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    return approvalRecordLabel(
      value as Record<string, unknown>,
      kind,
      userNameById,
    );
  }
  const id = String(value);
  const fromMap = approvalById.get(id);
  if (fromMap) return approvalRecordLabel(fromMap, kind, userNameById);
  return id;
}

function approvalOptionsForOrder(
  orderId: string,
  kind: "finance" | "admin" | "account",
  approvalById: Map<string, Record<string, unknown>>,
  userNameById: Record<string, string>,
): NamedOption[] {
  const opts: NamedOption[] = [];
  for (const [id, row] of approvalById) {
    const rowOrderId = refId(row.order);
    if (rowOrderId && rowOrderId !== orderId) continue;
    opts.push({
      id,
      name: approvalRecordLabel(row, kind, userNameById) || id,
    });
  }
  return opts.sort((a, b) => a.name.localeCompare(b.name));
}

function readOrderField(order: any, key: string): string | number | boolean {
  const v = order?.[key];
  if (key === "_id") return refId(order?._id || order?.id);
  if (
    [
      "party",
      "customer",
      "current_assignee",
      "assigned_sales_user",
      "closed_by",
      "created_by",
      "updated_by",
      "last_finance_approval",
      "last_admin_approval",
      "last_account_approval",
    ].includes(key)
  ) {
    return refId(v);
  }
  if (["order_date", "expected_delivery_date", "closed_at"].includes(key)) {
    return toDateInput(v);
  }
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v;
  if (v == null) return "";
  // Guard: never return a raw object as it would crash React render
  if (typeof v === "object") return refId(v);
  return String(v);
}

function parseCellValue(col: ColDef, raw: string): unknown {
  if (col.type === "number") {
    if (raw === "") return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (col.type === "boolean") {
    return raw === "true" || raw === "1" || raw === "yes";
  }
  if (col.type === "date") {
    return raw || null;
  }
  return raw;
}




/* ─── Order Approvals Form Panel ───────────────────────────────────────── */

type ApprovalItemDraft = {
  key: string;
  order_item_id: string;
  product: string;
  product_label: string;
  ordered_quantity: number;
  ordered_unit_price: number;
  ordered_total_amount: number;
  approved_quantity: number;
  approved_unit_price: number;
  approved_total_amount: number;
  applied_rate_type: string;
  pricing_reference: string;
  manual_price_override: boolean;
  rate_mapped: boolean;
  discount_percent: number;
  discount_amount: number;
  gst_percent: number;
  free_quantity: number;
  remarks: string;
};

type ApprovalHeaderDraft = {
  approved_total_amount: number;
  rejected_total_amount: number;
  ordered_total_amount: number;
  risk_level: string;
  is_admin_approved: boolean;
  is_finance_approved: boolean;
  is_account_approved: boolean;
  rates_reviewed: boolean;
  all_rates_mapped: boolean;
  credit_limit_checked: boolean;
  outstanding_checked: boolean;
  approval_notes: string;
  rejection_reason: string;
  hold_reason: string;
  remarks: string;
  assigned_finance_user: string;
  assigned_account_user: string;
};

const RISK_LEVEL_OPTS = ["low", "medium", "high", "critical"] as const;

function calcApprovalLineTotal(
  qty: number,
  price: number,
  discountPercent: number,
  gstPercent: number,
): { discount_amount: number; approved_total_amount: number } {
  const gross = Math.max(0, qty) * Math.max(0, price);
  const disc = discountPercent > 0 ? (gross * discountPercent) / 100 : 0;
  const taxable = Math.max(0, gross - disc);
  const gst = (taxable * Math.max(0, gstPercent)) / 100;
  return {
    discount_amount: Number(disc.toFixed(2)),
    approved_total_amount: Number((taxable + gst).toFixed(2)),
  };
}

function approvalItemFromRaw(item: any, idx: number): ApprovalItemDraft {
  const product = item?.product;
  const productId = refId(product);
  const productLabel =
    typeof product === "object" && product
      ? String(product.product_name || product.name || productId)
      : productId;
  const qty = Number(item?.approved_quantity ?? 0) || 0;
  const price = Number(item?.approved_unit_price ?? 0) || 0;
  const discPct = Number(item?.discount_percent ?? 0) || 0;
  const gstPct = Number(item?.gst_percent ?? 0) || 0;
  const calc = calcApprovalLineTotal(qty, price, discPct, gstPct);
  return {
    key: `${refId(item?.order_item_id) || "line"}-${idx}`,
    order_item_id: refId(item?.order_item_id),
    product: productId,
    product_label: productLabel,
    ordered_quantity: Number(item?.ordered_quantity ?? 0) || 0,
    ordered_unit_price: Number(item?.ordered_unit_price ?? 0) || 0,
    ordered_total_amount: Number(item?.ordered_total_amount ?? 0) || 0,
    approved_quantity: qty,
    approved_unit_price: price,
    approved_total_amount:
      Number(item?.approved_total_amount ?? calc.approved_total_amount) || 0,
    applied_rate_type: String(item?.applied_rate_type || "SR"),
    pricing_reference: refId(item?.pricing_reference),
    manual_price_override: Boolean(item?.manual_price_override),
    rate_mapped: Boolean(item?.rate_mapped),
    discount_percent: discPct,
    discount_amount: Number(item?.discount_amount ?? calc.discount_amount) || 0,
    gst_percent: gstPct,
    free_quantity: Number(item?.free_quantity ?? 0) || 0,
    remarks: String(item?.remarks ?? ""),
  };
}

function emptyApprovalLine(): ApprovalItemDraft {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    order_item_id: "",
    product: "",
    product_label: "",
    ordered_quantity: 0,
    ordered_unit_price: 0,
    ordered_total_amount: 0,
    approved_quantity: 0,
    approved_unit_price: 0,
    approved_total_amount: 0,
    applied_rate_type: "SR",
    pricing_reference: "",
    manual_price_override: true,
    rate_mapped: false,
    discount_percent: 0,
    discount_amount: 0,
    gst_percent: 0,
    free_quantity: 0,
    remarks: "",
  };
}

function headerFromApproval(approval: Record<string, unknown>): ApprovalHeaderDraft {
  return {
    approved_total_amount: Number(approval.approved_total_amount ?? 0) || 0,
    rejected_total_amount: Number(approval.rejected_total_amount ?? 0) || 0,
    ordered_total_amount: Number(approval.ordered_total_amount ?? 0) || 0,
    risk_level: String(approval.risk_level || "low"),
    is_admin_approved: Boolean(approval.is_admin_approved),
    is_finance_approved: Boolean(approval.is_finance_approved),
    is_account_approved: Boolean(approval.is_account_approved),
    rates_reviewed: Boolean(approval.rates_reviewed),
    all_rates_mapped: Boolean(approval.all_rates_mapped),
    credit_limit_checked: Boolean(approval.credit_limit_checked),
    outstanding_checked: Boolean(approval.outstanding_checked),
    approval_notes: String(approval.approval_notes ?? ""),
    rejection_reason: String(approval.rejection_reason ?? ""),
    hold_reason: String(approval.hold_reason ?? ""),
    remarks: String(approval.remarks ?? ""),
    assigned_finance_user: refId(approval.assigned_finance_user),
    assigned_account_user: refId(approval.assigned_account_user),
  };
}

/* ─── Main Sheet Modal ─────────────────────────────────────────────────── */

export function SuperAdminOrdersSheetModal({
  isOpen,
  onClose,
  partyNameById: partyNameByIdProp,
}: SuperAdminOrdersSheetModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday" | "last7" | "thisMonth" | "custom">("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [workflowTab, setWorkflowTab] = useState<OrderWorkflowTabCategory>("all");
  const [sheetTab, setSheetTab] = useState<"orders" | "bin">("orders");
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [savingApprovalIds, setSavingApprovalIds] = useState<
    Record<string, boolean>
  >({});
  const [savingDispatchIds, setSavingDispatchIds] = useState<
    Record<string, boolean>
  >({});
  const [localOrders, setLocalOrders] = useState<any[]>([]);
  const [itemsOrderId, setItemsOrderId] = useState<string | null>(null);
  const [approvalsOrderId, setApprovalsOrderId] = useState<string | null>(null);
  const [dispatchesOrderId, setDispatchesOrderId] = useState<string | null>(null);
  const [transportsOrderId, setTransportsOrderId] = useState<string | null>(null);
  const [deliveriesOrderId, setDeliveriesOrderId] = useState<string | null>(null);
  const [returnsOrderId, setReturnsOrderId] = useState<string | null>(null);
  const [savingTransportIds, setSavingTransportIds] = useState<Record<string, boolean>>({});
  const [savingDeliveryId, setSavingDeliveryId] = useState(false);
  const [savingReturnId, setSavingReturnId] = useState(false);
  const [settleApproval, setSettleApproval] = useState<any | null>(null);
  const [settleReleaseNo, setSettleReleaseNo] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    orderId: string;
    colKey: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  const isBin = sheetTab === "bin";

  const activeOrdersQ = useListOrdersQuery(
    {},
    { skip: !isOpen || isBin },
  );
  const deletedOrdersQ = useListOrdersDeletedQuery(
    {},
    { skip: !isOpen || !isBin },
  );
  const data = isBin ? deletedOrdersQ.data : activeOrdersQ.data;
  const isFetching = isBin
    ? deletedOrdersQ.isFetching
    : activeOrdersQ.isFetching;
  const isLoading = isBin ? deletedOrdersQ.isLoading : activeOrdersQ.isLoading;
  const refetch = isBin ? deletedOrdersQ.refetch : activeOrdersQ.refetch;

  const partiesQ = useListPartiesQuery({}, { skip: !isOpen });
  const usersQ = useListUsersQuery({}, { skip: !isOpen });
  const productsQ = useListProductsQuery({}, { skip: !isOpen });
  const approvalsQ = useListOrderApprovalsQuery({}, { skip: !isOpen });
  const dispatchesQ = useListDispatchesQuery({}, { skip: !isOpen });
  const transportsQ = useListTransportsQuery({}, { skip: !isOpen });
  const deliveriesQ = useListOrderDeliveriesQuery({}, { skip: !isOpen });
  const returnsQ = useListOrderReturnsQuery({}, { skip: !isOpen });
  const [superSheetPatch] = useSuperSheetPatchOrderMutation();
  const [superSheetPatchApproval] = useSuperSheetPatchOrderApprovalMutation();
  const [patchDispatch] = usePatchDispatchMutation();
  const [createDispatch] = useCreateDispatchMutation();
  const [createTransport] = useCreateTransportMutation();
  const [patchTransport] = usePatchTransportMutation();
  const [logShipmentDelivery] = useLogShipmentDeliveryMutation();
  const [createOrderReturn] = useCreateOrderReturnMutation();
  const [deleteOrder, { isLoading: isDeletingOrder }] =
    useDeleteOrderMutation();
  const [restoreOrder] = useRestoreOrderMutation();

  const partyNameById = useMemo(() => {
    if (partyNameByIdProp && partyNameByIdProp.size > 0) return partyNameByIdProp;
    return buildPartyNameById(partiesQ.data);
  }, [partyNameByIdProp, partiesQ.data]);

  const userNameById = useMemo(
    () => buildUserNameById(usersQ.data),
    [usersQ.data],
  );

  const approvalById = useMemo(
    () => buildApprovalById(approvalsQ.data),
    [approvalsQ.data],
  );

  const approvalsByOrderId = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const row of pickList(approvalsQ.data)) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const orderId = refId(o.order);
      if (!orderId) continue;
      const list = map.get(orderId) || [];
      list.push(o);
      map.set(orderId, list);
    }
    return map;
  }, [approvalsQ.data]);

  const dispatchesByOrderId = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const row of pickList(dispatchesQ.data)) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const orderId = refId(o.order);
      if (!orderId) continue;
      const list = map.get(orderId) || [];
      list.push(o);
      map.set(orderId, list);
    }
    return map;
  }, [dispatchesQ.data]);

  const transportsByOrderId = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const row of pickList(transportsQ.data)) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const orderId = refId(o.order);
      if (!orderId) continue;
      const list = map.get(orderId) || [];
      list.push(o);
      map.set(orderId, list);
    }
    return map;
  }, [transportsQ.data]);

  const deliveriesByOrderId = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const row of pickList(deliveriesQ.data)) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      // deliveries are linked to transport->dispatch->order, try order field directly
      const orderId = refId(o.order);
      if (!orderId) continue;
      const list = map.get(orderId) || [];
      list.push(o);
      map.set(orderId, list);
    }
    return map;
  }, [deliveriesQ.data]);

  const returnsByOrderId = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const row of pickList(returnsQ.data)) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const orderId = refId(o.order);
      if (!orderId) continue;
      const list = map.get(orderId) || [];
      list.push(o);
      map.set(orderId, list);
    }
    return map;
  }, [returnsQ.data]);

  const partyOptions = useMemo(
    () => buildPartyOptions(partiesQ.data, partyNameById),
    [partiesQ.data, partyNameById],
  );

  const userOptions = useMemo(
    () => buildUserOptions(usersQ.data),
    [usersQ.data],
  );

  const products = useMemo(
    () => buildProductOptions(productsQ.data),
    [productsQ.data],
  );

  const rawOrders = useMemo(() => pickOrders(data) || [], [data]);

  useEffect(() => {
    if (!isOpen) return;
    setLocalOrders(rawOrders.map((o) => ({ ...(o as object) })));
  }, [isOpen, rawOrders, sheetTab]);

  useEffect(() => {
    if (!isOpen) return;
    setItemsOrderId(null);
    setApprovalsOrderId(null);
    setDispatchesOrderId(null);
    setTransportsOrderId(null);
    setDeliveriesOrderId(null);
    setReturnsOrderId(null);
    setSettleApproval(null);
    setSettleReleaseNo("");
    setEditing(null);
    setDeleteTarget(null);
    setDateFilter("all");
    setCustomDateFrom("");
    setCustomDateTo("");
  }, [sheetTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deleteTarget) {
        if (!isDeletingOrder) setDeleteTarget(null);
        return;
      }
      if (approvalsOrderId) {
        setApprovalsOrderId(null);
        return;
      }
      if (settleApproval) {
        setSettleApproval(null);
        setSettleReleaseNo("");
        return;
      }
      if (dispatchesOrderId) {
        setDispatchesOrderId(null);
        return;
      }
      if (transportsOrderId) {
        setTransportsOrderId(null);
        return;
      }
      if (deliveriesOrderId) {
        setDeliveriesOrderId(null);
        return;
      }
      if (returnsOrderId) {
        setReturnsOrderId(null);
        return;
      }
      if (itemsOrderId) {
        setItemsOrderId(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [
    isOpen,
    onClose,
    itemsOrderId,
    approvalsOrderId,
    dispatchesOrderId,
    transportsOrderId,
    deliveriesOrderId,
    returnsOrderId,
    settleApproval,
    deleteTarget,
    isDeletingOrder,
  ]);

  const filteredOrders = useMemo(() => {
    // ─── Date filter bounds ───────────────────────────────────────────────
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let dateFrom: Date | null = null;
    let dateTo: Date | null = null;
    if (dateFilter === "today") {
      dateFrom = startOfDay(now);
      dateTo = new Date(dateFrom.getTime() + 86400000);
    } else if (dateFilter === "yesterday") {
      dateTo = startOfDay(now);
      dateFrom = new Date(dateTo.getTime() - 86400000);
    } else if (dateFilter === "last7") {
      dateFrom = startOfDay(new Date(now.getTime() - 6 * 86400000));
      dateTo = new Date(startOfDay(now).getTime() + 86400000);
    } else if (dateFilter === "thisMonth") {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    } else if (dateFilter === "custom" && (customDateFrom || customDateTo)) {
      dateFrom = customDateFrom ? new Date(customDateFrom) : null;
      dateTo = customDateTo ? new Date(new Date(customDateTo).getTime() + 86400000) : null;
    }

    // ─── Text search ─────────────────────────────────────────────────────
    const q = searchQuery.trim().toLowerCase();

    return localOrders.filter((o) => {
      // Date filter
      if (dateFrom || dateTo) {
        const rawDate = o.order_date || o.createdAt;
        if (!rawDate) return false;
        const orderDate = new Date(String(rawDate));
        if (isNaN(orderDate.getTime())) return false;
        if (dateFrom && orderDate < dateFrom) return false;
        if (dateTo && orderDate >= dateTo) return false;
      }

      // Shared workflow tab (admin → due sheet → finance → account → dispatch…)
      if (!orderMatchesWorkflowTab(o, workflowTab)) return false;

      // Text search
      if (!q) return true;
      const id = refId(o._id || o.id);
      const hay = [
        id,
        o.order_no,
        o.status,
        displayOrderField(o, "party", partyNameById, userNameById, approvalById),
        displayOrderField(o, "customer", partyNameById, userNameById, approvalById),
        displayOrderField(
          o,
          "assigned_sales_user",
          partyNameById,
          userNameById,
          approvalById,
        ),
        displayOrderField(o, "created_by", partyNameById, userNameById, approvalById),
        displayOrderField(
          o,
          "last_finance_approval",
          partyNameById,
          userNameById,
          approvalById,
        ),
        displayOrderField(
          o,
          "last_admin_approval",
          partyNameById,
          userNameById,
          approvalById,
        ),
        displayOrderField(
          o,
          "last_account_approval",
          partyNameById,
          userNameById,
          approvalById,
        ),
        o.remarks,
        ...(Array.isArray(o.order_items)
          ? o.order_items.map((l: any) => {
              const pn = l.product_name;
              const sk = l.sku;
              const productObj = l.product;
              if (pn && typeof pn !== "object") return String(pn);
              if (sk && typeof sk !== "object") return String(sk);
              if (productObj && typeof productObj === "object") {
                return String(productObj.product_name || productObj.name || "");
              }
              return "";
            })
          : []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    localOrders,
    searchQuery,
    dateFilter,
    customDateFrom,
    customDateTo,
    workflowTab,
    partyNameById,
    userNameById,
    approvalById,
  ]);

  const itemsOrder = useMemo(
    () =>
      itemsOrderId
        ? localOrders.find((o) => refId(o._id || o.id) === itemsOrderId) ||
          rawOrders.find((o: any) => refId(o._id || o.id) === itemsOrderId)
        : null,
    [itemsOrderId, localOrders, rawOrders],
  );

  const approvalsOrder = useMemo(
    () =>
      approvalsOrderId
        ? localOrders.find((o) => refId(o._id || o.id) === approvalsOrderId) ||
          rawOrders.find((o: any) => refId(o._id || o.id) === approvalsOrderId)
        : null,
    [approvalsOrderId, localOrders, rawOrders],
  );

  const approvalsForSelectedOrder = useMemo(
    () =>
      approvalsOrderId
        ? approvalsByOrderId.get(approvalsOrderId) || []
        : [],
    [approvalsOrderId, approvalsByOrderId],
  );

  const dispatchesOrder = useMemo(
    () =>
      dispatchesOrderId
        ? localOrders.find((o) => refId(o._id || o.id) === dispatchesOrderId) ||
          rawOrders.find((o: any) => refId(o._id || o.id) === dispatchesOrderId)
        : null,
    [dispatchesOrderId, localOrders, rawOrders],
  );

  const dispatchesForSelectedOrder = useMemo(
    () =>
      dispatchesOrderId
        ? dispatchesByOrderId.get(dispatchesOrderId) || []
        : [],
    [dispatchesOrderId, dispatchesByOrderId],
  );

  const transportsOrder = useMemo(
    () =>
      transportsOrderId
        ? localOrders.find((o) => refId(o._id || o.id) === transportsOrderId) ||
          rawOrders.find((o: any) => refId(o._id || o.id) === transportsOrderId)
        : null,
    [transportsOrderId, localOrders, rawOrders],
  );

  const transportsForSelectedOrder = useMemo(
    () =>
      transportsOrderId
        ? transportsByOrderId.get(transportsOrderId) || []
        : [],
    [transportsOrderId, transportsByOrderId],
  );

  const dispatchesForTransportsOrder = useMemo(
    () =>
      transportsOrderId
        ? dispatchesByOrderId.get(transportsOrderId) || []
        : [],
    [transportsOrderId, dispatchesByOrderId],
  );

  const deliveriesOrder = useMemo(
    () =>
      deliveriesOrderId
        ? localOrders.find((o) => refId(o._id || o.id) === deliveriesOrderId) ||
          rawOrders.find((o: any) => refId(o._id || o.id) === deliveriesOrderId)
        : null,
    [deliveriesOrderId, localOrders, rawOrders],
  );

  const deliveriesForSelectedOrder = useMemo(
    () =>
      deliveriesOrderId
        ? deliveriesByOrderId.get(deliveriesOrderId) || []
        : [],
    [deliveriesOrderId, deliveriesByOrderId],
  );

  const transportsForDeliveriesOrder = useMemo(
    () =>
      deliveriesOrderId
        ? transportsByOrderId.get(deliveriesOrderId) || []
        : [],
    [deliveriesOrderId, transportsByOrderId],
  );

  const dispatchesForDeliveriesOrder = useMemo(
    () =>
      deliveriesOrderId
        ? dispatchesByOrderId.get(deliveriesOrderId) || []
        : [],
    [deliveriesOrderId, dispatchesByOrderId],
  );

  const returnsOrder = useMemo(
    () =>
      returnsOrderId
        ? localOrders.find((o) => refId(o._id || o.id) === returnsOrderId) ||
          rawOrders.find((o: any) => refId(o._id || o.id) === returnsOrderId)
        : null,
    [returnsOrderId, localOrders, rawOrders],
  );

  const returnsForSelectedOrder = useMemo(
    () =>
      returnsOrderId
        ? returnsByOrderId.get(returnsOrderId) || []
        : [],
    [returnsOrderId, returnsByOrderId],
  );

  const dispatchesForReturnsOrder = useMemo(
    () =>
      returnsOrderId
        ? dispatchesByOrderId.get(returnsOrderId) || []
        : [],
    [returnsOrderId, dispatchesByOrderId],
  );

  const saveOrderPatch = useCallback(
    async (orderId: string, patch: Record<string, unknown>) => {
      setSavingIds((prev) => ({ ...prev, [orderId]: true }));
      try {
        await superSheetPatch({ id: orderId, patch }).unwrap();
        toast.success("Saved (bypass)");
        await refetch();
      } catch (err: any) {
        toast.error(err?.data?.message || "Failed to save");
        await refetch();
        throw err;
      } finally {
        setSavingIds((prev) => ({ ...prev, [orderId]: false }));
      }
    },
    [superSheetPatch, refetch],
  );

  const saveApprovalPatch = useCallback(
    async (approvalId: string, patch: Record<string, unknown>) => {
      setSavingApprovalIds((prev) => ({ ...prev, [approvalId]: true }));
      try {
        await superSheetPatchApproval({ id: approvalId, patch }).unwrap();
        toast.success("Approval saved (bypass)");
        await Promise.all([
          approvalsQ.refetch(),
          refetch(),
        ]);
      } catch (err: any) {
        toast.error(err?.data?.message || "Failed to save approval");
        await approvalsQ.refetch();
        throw err;
      } finally {
        setSavingApprovalIds((prev) => ({ ...prev, [approvalId]: false }));
      }
    },
    [superSheetPatchApproval, approvalsQ, refetch],
  );

  const saveDispatchPatch = useCallback(
    async (dispatchId: string, patch: Record<string, unknown>) => {
      setSavingDispatchIds((prev) => ({ ...prev, [dispatchId]: true }));
      try {
        await patchDispatch({ id: dispatchId, patch }).unwrap();
        toast.success("Dispatch saved (bypass)");
        await Promise.all([
          dispatchesQ.refetch(),
          refetch(),
        ]);
      } catch (err: any) {
        toast.error(err?.data?.message || "Failed to save dispatch");
        await dispatchesQ.refetch();
        throw err;
      } finally {
        setSavingDispatchIds((prev) => ({ ...prev, [dispatchId]: false }));
      }
    },
    [patchDispatch, dispatchesQ, refetch],
  );

  const handleCreateDispatch = useCallback(
    async (formData: FormData) => {
      const tempId = "new_dispatch_saving";
      setSavingDispatchIds((prev) => ({ ...prev, [tempId]: true }));
      try {
        await createDispatch(formData).unwrap();
        toast.success("Dispatch created successfully");
        await Promise.all([
          dispatchesQ.refetch(),
          refetch(),
        ]);
      } catch (err: any) {
        toast.error(err?.data?.message || "Failed to create dispatch");
        throw err;
      } finally {
        setSavingDispatchIds((prev) => ({ ...prev, [tempId]: false }));
      }
    },
    [createDispatch, dispatchesQ, refetch],
  );

  const handleCreateTransport = useCallback(
    async (payload: Record<string, any>) => {
      const tempId = "new_transport_saving";
      setSavingTransportIds((prev) => ({ ...prev, [tempId]: true }));
      try {
        await createTransport(payload).unwrap();
        toast.success("Transport created successfully");
        await Promise.all([transportsQ.refetch(), refetch()]);
      } catch (err: any) {
        toast.error(err?.data?.message || "Failed to create transport");
        throw err;
      } finally {
        setSavingTransportIds((prev) => ({ ...prev, [tempId]: false }));
      }
    },
    [createTransport, transportsQ, refetch],
  );

  const handleSaveTransport = useCallback(
    async (transportId: string, patch: Record<string, any>) => {
      setSavingTransportIds((prev) => ({ ...prev, [transportId]: true }));
      try {
        await patchTransport({ id: transportId, patch }).unwrap();
        toast.success("Transport saved (bypass)");
        await transportsQ.refetch();
      } catch (err: any) {
        toast.error(err?.data?.message || "Failed to save transport");
        throw err;
      } finally {
        setSavingTransportIds((prev) => ({ ...prev, [transportId]: false }));
      }
    },
    [patchTransport, transportsQ],
  );

  const handleLogDelivery = useCallback(
    async (payload: Record<string, any>) => {
      setSavingDeliveryId(true);
      try {
        await logShipmentDelivery(payload).unwrap();
        toast.success("Delivery logged successfully");
        await Promise.all([deliveriesQ.refetch(), refetch()]);
      } catch (err: any) {
        toast.error(err?.data?.message || "Failed to log delivery");
        throw err;
      } finally {
        setSavingDeliveryId(false);
      }
    },
    [logShipmentDelivery, deliveriesQ, refetch],
  );

  const handleCreateReturn = useCallback(
    async (payload: Record<string, any>) => {
      setSavingReturnId(true);
      try {
        await createOrderReturn(payload).unwrap();
        toast.success("Return submitted successfully");
        await Promise.all([returnsQ.refetch(), refetch()]);
      } catch (err: any) {
        toast.error(err?.data?.message || "Failed to submit return");
        throw err;
      } finally {
        setSavingReturnId(false);
      }
    },
    [createOrderReturn, returnsQ, refetch],
  );

  const confirmDeleteOrder = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteOrder(deleteTarget.id).unwrap();
      toast.success(mutationSuccessCopy("deleteOrder"));
      setDeleteTarget(null);
      setLocalOrders((list) =>
        list.filter((o) => refId(o._id || o.id) !== deleteTarget.id),
      );
      // Only refetch queries that are currently subscribed (started).
      await activeOrdersQ.refetch();
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [deleteOrder, deleteTarget, activeOrdersQ]);

  const handleRestoreOrder = useCallback(
    async (orderId: string) => {
      setRestoringId(orderId);
      try {
        await restoreOrder(orderId).unwrap();
        toast.success(mutationSuccessCopy("restoreOrder"));
        setLocalOrders((list) =>
          list.filter((o) => refId(o._id || o.id) !== orderId),
        );
        await deletedOrdersQ.refetch();
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
      } finally {
        setRestoringId(null);
      }
    },
    [restoreOrder, deletedOrdersQ],
  );

  const commitOrderField = async (
    order: any,
    colKey: string,
    rawVal: string,
  ) => {
    const col = ORDER_COLUMNS.find((c) => c.key === colKey);
    if (!col?.editable) return;
    const orderId = refId(order._id || order.id);
    const parsed =
      col.refKind === "party" ||
      col.refKind === "user" ||
      col.refKind === "approval"
        ? rawVal || null
        : parseCellValue(col, rawVal);
    const prev = readOrderField(order, colKey);
    if (String(prev ?? "") === String(parsed ?? "")) return;

    setLocalOrders((list) =>
      list.map((o) =>
        refId(o._id || o.id) === orderId ? { ...o, [colKey]: parsed } : o,
      ),
    );
    await saveOrderPatch(orderId, { [colKey]: parsed });
  };

  const exportCsv = () => {
    const headers = ORDER_COLUMNS.map((c) => c.key).join(",");
    const rows = filteredOrders.map((o) =>
      ORDER_COLUMNS.map((c) => {
        const s = displayOrderField(
          o,
          c.key,
          partyNameById,
          userNameById,
          approvalById,
        );
        return `"${s.replace(/"/g, '""')}"`;
      }).join(","),
    );
    const blob = new Blob(["\uFEFF" + [headers, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `super_admin_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isSavingAny =
    Object.values(savingIds).some(Boolean) ||
    Object.values(savingApprovalIds).some(Boolean) ||
    Object.values(savingDispatchIds).some(Boolean);

  const renderCell = (
    orderId: string,
    col: ColDef,
    order: any,
    onCommit: (val: string) => void,
  ) => {
    const idValue = String(readOrderField(order, col.key) ?? "");
    const displayValue = displayOrderField(
      order,
      col.key,
      partyNameById,
      userNameById,
      approvalById,
    );
    const isEditing =
      editing?.orderId === orderId && editing?.colKey === col.key;

    if (!col.editable || isBin) {
      const safeDisplay = displayValue != null && typeof displayValue !== "object"
        ? String(displayValue)
        : typeof displayValue === "object" && displayValue !== null
          ? String((displayValue as any).product_name || (displayValue as any).name || JSON.stringify(displayValue))
          : "";
      return (
        <span className="block truncate text-slate-600 dark:text-slate-300">
          {safeDisplay || "—"}
        </span>
      );
    }

    if (isEditing) {
      if (
        col.refKind === "party" ||
        col.refKind === "user" ||
        col.refKind === "approval"
      ) {
        const options =
          col.refKind === "party"
            ? partyOptions
            : col.refKind === "user"
              ? userOptions
              : approvalOptionsForOrder(
                  orderId,
                  col.approvalKind ||
                    APPROVAL_KIND_BY_KEY[col.key] ||
                    "admin",
                  approvalById,
                  userNameById,
                );
        return (
          <select
            autoFocus
            className="w-full rounded border border-amber-400 bg-white px-1 py-0.5 text-xs outline-none dark:bg-slate-950"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => {
              setEditing(null);
              onCommit(editValue);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditing(null);
                onCommit(editValue);
              }
              if (e.key === "Escape") setEditing(null);
            }}
          >
            <option value="">—</option>
            {idValue && !options.some((o) => o.id === idValue) ? (
              <option value={idValue}>
                {displayValue || idValue}
              </option>
            ) : null}
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        );
      }
      if (col.type === "select" && col.options) {
        return (
          <select
            autoFocus
            className="w-full rounded border border-amber-400 bg-white px-1 py-0.5 text-xs outline-none dark:bg-slate-950"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => {
              setEditing(null);
              onCommit(editValue);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditing(null);
                onCommit(editValue);
              }
              if (e.key === "Escape") setEditing(null);
            }}
          >
            {col.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );
      }
      if (col.type === "boolean") {
        return (
          <select
            autoFocus
            className="w-full rounded border border-amber-400 bg-white px-1 py-0.5 text-xs outline-none dark:bg-slate-950"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => {
              setEditing(null);
              onCommit(editValue);
            }}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        );
      }
      return (
        <input
          autoFocus
          type={
            col.type === "number" ? "number" : col.type === "date" ? "date" : "text"
          }
          className="w-full rounded border border-amber-400 bg-white px-1 py-0.5 text-xs outline-none dark:bg-slate-950"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => {
            setEditing(null);
            onCommit(editValue);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setEditing(null);
              onCommit(editValue);
            }
            if (e.key === "Escape") setEditing(null);
          }}
        />
      );
    }

    return (
      <button
        type="button"
        className={`block w-full truncate text-left hover:underline decoration-dotted ${
          col.refKind ? "" : "font-mono"
        }`}
        onClick={() => {
          setEditing({ orderId, colKey: col.key });
          setEditValue(
            col.type === "boolean"
              ? idValue === "true" || idValue === "1"
                ? "true"
                : "false"
              : idValue,
          );
        }}
        title={
          col.refKind
            ? `Click to edit · id: ${idValue || "—"}`
            : "Click to edit"
        }
      >
        {displayValue || <span className="text-slate-300">—</span>}
      </button>
    );
  };

  if (!isOpen) return null;

  return (
    <LargeModalPortal>
      <div className="fixed inset-0 z-[100] flex flex-col bg-white font-sans text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300/60 bg-amber-50 px-4 py-3 shrink-0 dark:border-amber-500/30 dark:bg-amber-950/30">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white shadow">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-wide">
                  Super Admin Orders Sheet
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-amber-600/15 px-2 py-0.5 text-2xs font-bold uppercase text-amber-800 dark:text-amber-300">
                  Bypass · all fields
                </span>
                <span className="inline-flex items-center gap-1 text-2xs text-slate-500">
                  {isSavingAny ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Cloud className="h-3 w-3 text-emerald-500" /> Live
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                Package opens items; clipboard opens approvals; trash moves to Bin
                (soft delete) with restore.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 shrink-0 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setSheetTab("orders")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  sheetTab === "orders"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                Orders
              </button>
              <button
                type="button"
                onClick={() => setSheetTab("bin")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  sheetTab === "bin"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Trash2 className="h-3 w-3" />
                Bin
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                void refetch();
                void approvalsQ.refetch();
                void dispatchesQ.refetch();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isFetching || approvalsQ.isFetching || dispatchesQ.isFetching ? "animate-spin" : ""}`}
              />
              Reload
            </button>
            {!isBin ? (
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            ) : null}
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isBin ? "Search bin…" : "Search orders…"}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        </div>

        {/* Date filter row */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 shrink-0 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-2xs font-semibold uppercase tracking-wider text-slate-400">Order Date</span>
          {([
            ["all", "All"],
            ["today", "Today"],
            ["yesterday", "Yesterday"],
            ["last7", "Last 7 days"],
            ["thisMonth", "This month"],
            ["custom", "Custom range"],
          ] as [string, string][]).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setDateFilter(val as typeof dateFilter)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                dateFilter === val
                  ? "bg-amber-500 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
          {dateFilter === "custom" && (
            <div className="flex items-center gap-1.5 ml-1">
              <input
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="From"
              />
              <span className="text-xs text-slate-400">→</span>
              <input
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-900"
                placeholder="To"
              />
              {(customDateFrom || customDateTo) && (
                <button
                  type="button"
                  onClick={() => { setCustomDateFrom(""); setCustomDateTo(""); }}
                  className="rounded px-2 py-1 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {(dateFilter !== "all" || workflowTab !== "all") && (
            <span className="ml-auto text-2xs text-slate-400">
              {filteredOrders.length} matching order{filteredOrders.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Workflow status — shared ORDER_WORKFLOW_TABS */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 shrink-0 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-2xs font-semibold uppercase tracking-wider text-slate-400">
            Workflow
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
            {ORDER_WORKFLOW_TABS.map((tab) => {
              const TabIcon = getOrderListTabIcon(tab.id);
              const active = workflowTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  title={tab.label}
                  onClick={() => setWorkflowTab(tab.id)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? "bg-amber-500 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <TabIcon className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="whitespace-nowrap">{tab.label}</span>
                </button>
              );
            })}
          </div>
          {workflowTab !== "all" ? (
            <button
              type="button"
              onClick={() => setWorkflowTab("all")}
              className="shrink-0 rounded px-2 py-1 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto bg-slate-100 dark:bg-slate-950">
          {(isLoading || isFetching) && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 dark:bg-slate-900/50">
              <RefreshCw className="h-5 w-5 animate-spin text-amber-600" />
            </div>
          )}

          <table className="min-w-max border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900">
                <th className="sticky top-0 left-0 z-30 w-14 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 dark:border-slate-800 dark:bg-slate-900">
                  {isBin ? "Restore" : "Actions"}
                </th>
                {!isBin ? (
                  <>
                    <th className="sticky top-0 z-30 w-12 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 dark:border-slate-800 dark:bg-slate-900">
                      Items
                    </th>
                    <th className="sticky top-0 z-30 w-12 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 dark:border-slate-800 dark:bg-slate-900">
                      Appr
                    </th>
                    <th className="sticky top-0 z-30 w-12 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 dark:border-slate-800 dark:bg-slate-900">
                      Disp
                    </th>
                    <th className="sticky top-0 z-30 w-12 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 dark:border-slate-800 dark:bg-slate-900">
                      Trsp
                    </th>
                    <th className="sticky top-0 z-30 w-12 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 dark:border-slate-800 dark:bg-slate-900">
                      Delv
                    </th>
                    <th className="sticky top-0 z-30 w-12 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 dark:border-slate-800 dark:bg-slate-900">
                      Retn
                    </th>
                  </>
                ) : null}
                <th className="sticky top-0 z-20 w-10 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                  #
                </th>
                {ORDER_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    style={{ minWidth: col.width || 110 }}
                    className="sticky top-0 z-20 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-left font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {col.label}
                    {col.editable && !isBin ? (
                      <span className="ml-1 text-amber-600">✎</span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={ORDER_COLUMNS.length + (isBin ? 2 : 7)}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    {isBin
                      ? "Bin is empty — deleted orders will appear here."
                      : "No orders found."}
                  </td>
                </tr>
              ) : null}
              {filteredOrders.map((order, idx) => {
                const orderId = refId(order._id || order.id);
                const itemCount = Array.isArray(order.order_items)
                  ? order.order_items.length
                  : 0;
                const approvalCount =
                  approvalsByOrderId.get(orderId)?.length ?? 0;
                const dispatchCount =
                  dispatchesByOrderId.get(orderId)?.length ?? 0;
                const transportCount =
                  transportsByOrderId.get(orderId)?.length ?? 0;
                const deliveryCount =
                  deliveriesByOrderId.get(orderId)?.length ?? 0;
                const returnCount =
                  returnsByOrderId.get(orderId)?.length ?? 0;
                const orderLabel =
                  String(order.order_no || "").trim() || orderId;
                return (
                  <tr
                    key={orderId}
                    className="bg-white hover:bg-amber-50/30 dark:bg-slate-900 dark:hover:bg-amber-950/20"
                  >
                    <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-1 py-1 dark:border-slate-800 dark:bg-slate-900">
                      {isBin ? (
                        <button
                          type="button"
                          disabled={restoringId === orderId}
                          onClick={() => void handleRestoreOrder(orderId)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-2xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                          title="Restore order from bin"
                        >
                          <RotateCcw
                            className={`h-3.5 w-3.5 ${restoringId === orderId ? "animate-spin" : ""}`}
                          />
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({ id: orderId, label: orderLabel })
                          }
                          className="inline-flex items-center justify-center rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          title="Move order to bin"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                    {!isBin ? (
                      <>
                        <td className="border-b border-r border-slate-100 px-1 py-1 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setItemsOrderId(orderId)}
                            className="relative inline-flex items-center justify-center rounded-lg p-1.5 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
                            title="Open order items form"
                          >
                            <Package className="h-4 w-4" />
                            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-0.5 text-[9px] font-bold text-white">
                              {itemCount}
                            </span>
                          </button>
                        </td>
                        <td className="border-b border-r border-slate-100 px-1 py-1 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setApprovalsOrderId(orderId)}
                            className="relative inline-flex items-center justify-center rounded-lg p-1.5 text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-900/40"
                            title="Open order approvals form"
                          >
                            <ClipboardCheck className="h-4 w-4" />
                            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-600 px-0.5 text-[9px] font-bold text-white">
                              {approvalCount}
                            </span>
                          </button>
                        </td>
                        <td className="border-b border-r border-slate-100 px-1 py-1 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setDispatchesOrderId(orderId)}
                            className="relative inline-flex items-center justify-center rounded-lg p-1.5 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                            title="Open order dispatches form"
                          >
                            <Truck className="h-4 w-4" />
                            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-0.5 text-[9px] font-bold text-white">
                              {dispatchCount}
                            </span>
                          </button>
                        </td>
                        <td className="border-b border-r border-slate-100 px-1 py-1 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setTransportsOrderId(orderId)}
                            className="relative inline-flex items-center justify-center rounded-lg p-1.5 text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900/40"
                            title="Open order transport shipments"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v13H3z"/><path d="M3 16l2 5h14l2-5"/><path d="M9 21v-5"/><path d="M15 21v-5"/></svg>
                            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-0.5 text-[9px] font-bold text-white">
                              {transportCount}
                            </span>
                          </button>
                        </td>
                        <td className="border-b border-r border-slate-100 px-1 py-1 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setDeliveriesOrderId(orderId)}
                            className="relative inline-flex items-center justify-center rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                            title="Open order deliveries"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-0.5 text-[9px] font-bold text-white">
                              {deliveryCount}
                            </span>
                          </button>
                        </td>
                        <td className="border-b border-r border-slate-100 px-1 py-1 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setReturnsOrderId(orderId)}
                            className="relative inline-flex items-center justify-center rounded-lg p-1.5 text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/40"
                            title="Open order returns"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
                            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-0.5 text-[9px] font-bold text-white">
                              {returnCount}
                            </span>
                          </button>
                        </td>
                      </>
                    ) : null}
                    <td className="border-b border-r border-slate-100 px-2 py-1 text-center font-mono text-slate-400 dark:border-slate-800">
                      {idx + 1}
                    </td>
                    {ORDER_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`border-b border-r border-slate-100 px-2 py-1 dark:border-slate-800 ${
                          col.editable && !isBin
                            ? "bg-amber-50/25 dark:bg-amber-950/10"
                            : ""
                        }`}
                      >
                        {renderCell(orderId, col, order, (val) =>
                          void commitOrderField(order, col.key, val),
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-1 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 shrink-0 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {filteredOrders.length} / {localOrders.length}{" "}
            {isBin ? "deleted orders" : "orders"}
            {workflowTab !== "all"
              ? ` · ${ORDER_WORKFLOW_TABS.find((t) => t.id === workflowTab)?.label ?? workflowTab}`
              : ""}
            {!isBin
              ? " · trash = delete · package = items · clipboard = approvals · truck = dispatches"
              : " · restore returns the order to the active sheet"}
          </span>
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            {isBin
              ? "Bin — soft-deleted orders"
              : "Super-admin bypass — orders + approvals writable"}
          </span>
        </div>

        {itemsOrder ? (
          <OrderItemsForm
            order={itemsOrder}
            products={products}
            saving={!!savingIds[refId(itemsOrder._id || itemsOrder.id)]}
            onClose={() => setItemsOrderId(null)}
            onSaved={() => setItemsOrderId(null)}
            onSave={async (patch) => {
              await saveOrderPatch(
                refId(itemsOrder._id || itemsOrder.id),
                patch,
              );
            }}
          />
        ) : null}

        {approvalsOrder ? (
          <OrderApprovalsForm
            order={approvalsOrder}
            approvals={approvalsForSelectedOrder}
            users={userOptions}
            products={products}
            saving={Object.values(savingApprovalIds).some(Boolean)}
            onClose={() => setApprovalsOrderId(null)}
            onSave={async (approvalId, patch) => {
              await saveApprovalPatch(approvalId, patch);
            }}
          />
        ) : null}

        {dispatchesOrder ? (
          <OrderDispatchesForm
            order={dispatchesOrder}
            dispatches={dispatchesForSelectedOrder}
            approvals={approvalsByOrderId.get(refId(dispatchesOrder._id || dispatchesOrder.id)) || []}
            users={userOptions}
            saving={Object.values(savingDispatchIds).some(Boolean)}
            onClose={() => setDispatchesOrderId(null)}
            onSave={async (dispatchId, patch) => {
              await saveDispatchPatch(dispatchId, patch);
            }}
            onCreate={async (formData) => {
              await handleCreateDispatch(formData);
            }}
            onSettleClick={(approval, releaseNo) => {
              setSettleApproval(approval);
              setSettleReleaseNo(releaseNo);
            }}
          />
        ) : null}

        {transportsOrder ? (
          <OrderTransportsForm
            order={transportsOrder}
            dispatches={dispatchesForTransportsOrder}
            transports={transportsForSelectedOrder}
            users={userOptions}
            saving={Object.values(savingTransportIds).some(Boolean)}
            onClose={() => setTransportsOrderId(null)}
            onCreate={async (payload) => {
              await handleCreateTransport(payload);
            }}
            onSave={async (transportId, patch) => {
              await handleSaveTransport(transportId, patch);
            }}
          />
        ) : null}

        {deliveriesOrder ? (
          <OrderDeliveriesForm
            order={deliveriesOrder}
            dispatches={dispatchesForDeliveriesOrder}
            transports={transportsForDeliveriesOrder}
            deliveries={deliveriesForSelectedOrder}
            saving={savingDeliveryId}
            onClose={() => setDeliveriesOrderId(null)}
            onLogDelivery={async (payload) => {
              await handleLogDelivery(payload);
            }}
          />
        ) : null}

        {returnsOrder ? (
          <OrderReturnsForm
            order={returnsOrder}
            dispatches={dispatchesForReturnsOrder}
            returns={returnsForSelectedOrder}
            saving={savingReturnId}
            onClose={() => setReturnsOrderId(null)}
            onCreateReturn={async (payload) => {
              await handleCreateReturn(payload);
            }}
          />
        ) : null}

        {settleApproval ? (
          <SettleRestOrderModal
            open={Boolean(settleApproval)}
            onClose={() => {
              setSettleApproval(null);
              setSettleReleaseNo("");
            }}
            orderId={refId(dispatchesOrder?._id || dispatchesOrder?.id || "")}
            approval={settleApproval}
            dispatches={dispatchesForSelectedOrder}
            orderItems={dispatchesOrder?.order_items || []}
            releaseNo={settleReleaseNo}
            onSettled={async () => {
              setSettleApproval(null);
              setSettleReleaseNo("");
              await Promise.all([
                dispatchesQ.refetch(),
                approvalsQ.refetch(),
                refetch(),
              ]);
            }}
          />
        ) : null}

        {deleteTarget ? (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
            role="presentation"
            onClick={() => !isDeletingOrder && setDeleteTarget(null)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="super-sheet-delete-title"
              className="w-full max-w-md overflow-hidden rounded-xl border border-rose-200/90 bg-white shadow-xl dark:border-rose-900/40 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-rose-100 px-5 py-4 dark:border-rose-900/30">
                <h2
                  id="super-sheet-delete-title"
                  className="text-lg font-semibold text-rose-950 dark:text-rose-100"
                >
                  Move order to bin?
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  This will soft-delete order{" "}
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                    {deleteTarget.label}
                  </span>
                  . You can restore it later from the Bin tab.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
                <button
                  type="button"
                  disabled={isDeletingOrder}
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-white/15"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingOrder}
                  onClick={() => void confirmDeleteOrder()}
                  className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {isDeletingOrder ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </LargeModalPortal>
  );
}

export default SuperAdminOrdersSheetModal;
