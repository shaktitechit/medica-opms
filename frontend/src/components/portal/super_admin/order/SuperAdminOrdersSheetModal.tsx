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
} from "lucide-react";
import {
  useListOrdersQuery,
  useListOrderApprovalsQuery,
  useListPartiesQuery,
  useListProductsQuery,
  useListUsersQuery,
  useSuperSheetPatchOrderMutation,
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

type ProductOption = {
  id: string;
  product_name: string;
  sku: string;
  brand: string;
  manufacturer: string;
  unit: string;
  hsn_code: string;
  gst_percent: number;
  base_price: number;
};

type NamedOption = { id: string; name: string };

type LineDraft = {
  key: string;
  _id?: string;
  product: string;
  product_name: string;
  sku: string;
  brand: string;
  manufacturer: string;
  product_group: string;
  product_subgroup: string;
  unit: string;
  hsn_code: string;
  gst_percent: number;
  ordered_quantity: number;
  approved_quantity: number;
  dispatched_quantity: number;
  delivered_quantity: number;
  returned_quantity: number;
  line_status: string;
  free_quantity: number;
  unit_price: number;
  applied_rate_type: string;
  pricing_reference: string;
  pricing_validity_start: string;
  pricing_validity_end: string;
  manual_price_override: boolean;
  approval_required: boolean;
  approval_reason: string;
  approved_by: string;
  approved_at: string;
  discount_percent: number;
  discount_amount: number;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
  remarks: string;
};

function refId(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null) {
    const o = v as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return String(v);
}

function toDateInput(v: unknown): string {
  if (v == null || v === "") return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatMoney(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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

function applyProductSnapshot(
  line: LineDraft,
  product: ProductOption | null,
): LineDraft {
  if (!product) {
    return {
      ...line,
      product: "",
      product_name: "",
      sku: "",
      brand: "",
      manufacturer: "",
      unit: "pcs",
      hsn_code: "",
      gst_percent: 0,
      unit_price: 0,
      ...calcLineAmounts({
        ...line,
        product: "",
        ordered_quantity: line.ordered_quantity,
        unit_price: 0,
        gst_percent: 0,
        discount_percent: line.discount_percent,
        discount_amount: 0,
      }),
    };
  }
  const next: LineDraft = {
    ...line,
    product: product.id,
    product_name: product.product_name,
    sku: product.sku,
    brand: product.brand,
    manufacturer: product.manufacturer,
    unit: product.unit || line.unit || "pcs",
    hsn_code: product.hsn_code,
    gst_percent: product.gst_percent,
    unit_price: product.base_price || line.unit_price,
  };
  return { ...next, ...calcLineAmounts(next) };
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
  return v == null ? "" : String(v);
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

function calcLineAmounts(line: Partial<LineDraft>): {
  discount_amount: number;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
} {
  const qty = Number(line.ordered_quantity ?? 0) || 0;
  const price = Number(line.unit_price ?? 0) || 0;
  const gstPct = Number(line.gst_percent ?? 0) || 0;
  const discPct = Number(line.discount_percent ?? 0) || 0;
  const lineGross = qty * price;
  let disc = Number(line.discount_amount ?? 0) || 0;
  if (discPct > 0) {
    disc = (lineGross * discPct) / 100;
  }
  const taxable = Math.max(0, lineGross - disc);
  const gst = (taxable * gstPct) / 100;
  return {
    discount_amount: Number(disc.toFixed(2)),
    taxable_amount: Number(taxable.toFixed(2)),
    gst_amount: Number(gst.toFixed(2)),
    total_amount: Number((taxable + gst).toFixed(2)),
  };
}

function calcOrderTotals(
  lines: LineDraft[],
  header: {
    discount_amount?: number;
    extra_charges?: number;
    penalty_amount?: number;
    damage_charge?: number;
  },
) {
  let subtotal = 0;
  let gstAmount = 0;
  for (const line of lines) {
    const c = calcLineAmounts(line);
    subtotal += c.taxable_amount;
    gstAmount += c.gst_amount;
  }
  const headerDisc = Number(header.discount_amount ?? 0) || 0;
  const extra = Number(header.extra_charges ?? 0) || 0;
  const penalty = Number(header.penalty_amount ?? 0) || 0;
  const damage = Number(header.damage_charge ?? 0) || 0;
  const grand = subtotal + gstAmount - headerDisc + extra + penalty + damage;
  return {
    subtotal: Number(subtotal.toFixed(2)),
    taxable_amount: Number(subtotal.toFixed(2)),
    gst_amount: Number(gstAmount.toFixed(2)),
    grand_total: Number(grand.toFixed(2)),
  };
}

function lineFromRaw(line: any, idx: number, orderId: string): LineDraft {
  const id = refId(line?._id || line?.id);
  const base: LineDraft = {
    key: id || `${orderId}-new-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    _id: id || undefined,
    product: refId(line?.product),
    product_name: String(line?.product_name || ""),
    sku: String(line?.sku || ""),
    brand: String(line?.brand || ""),
    manufacturer: String(line?.manufacturer || ""),
    product_group: String(line?.product_group || ""),
    product_subgroup: String(line?.product_subgroup || ""),
    unit: String(line?.unit || "pcs"),
    hsn_code: String(line?.hsn_code || ""),
    gst_percent: Number(line?.gst_percent ?? 0),
    ordered_quantity: Number(line?.ordered_quantity ?? line?.quantity ?? 0),
    approved_quantity: Number(line?.approved_quantity ?? 0),
    dispatched_quantity: Number(line?.dispatched_quantity ?? 0),
    delivered_quantity: Number(line?.delivered_quantity ?? 0),
    returned_quantity: Number(line?.returned_quantity ?? 0),
    line_status: String(line?.line_status || "active"),
    free_quantity: Number(line?.free_quantity ?? 0),
    unit_price: Number(line?.unit_price ?? 0),
    applied_rate_type: String(line?.applied_rate_type || "MANUAL"),
    pricing_reference: refId(line?.pricing_reference),
    pricing_validity_start: toDateInput(line?.pricing_validity_start),
    pricing_validity_end: toDateInput(line?.pricing_validity_end),
    manual_price_override: Boolean(line?.manual_price_override),
    approval_required: Boolean(line?.approval_required),
    approval_reason: String(line?.approval_reason || ""),
    approved_by: refId(line?.approved_by),
    approved_at: toDateInput(line?.approved_at),
    discount_percent: Number(line?.discount_percent ?? 0),
    discount_amount: Number(line?.discount_amount ?? 0),
    taxable_amount: Number(line?.taxable_amount ?? 0),
    gst_amount: Number(line?.gst_amount ?? 0),
    total_amount: Number(line?.total_amount ?? 0),
    remarks: String(line?.remarks || ""),
  };
  return { ...base, ...calcLineAmounts(base) };
}

function emptyLine(): LineDraft {
  const base: LineDraft = {
    key: `new-${Math.random().toString(36).slice(2, 9)}`,
    product: "",
    product_name: "",
    sku: "",
    brand: "",
    manufacturer: "",
    product_group: "",
    product_subgroup: "",
    unit: "pcs",
    hsn_code: "",
    gst_percent: 0,
    ordered_quantity: 1,
    approved_quantity: 1,
    dispatched_quantity: 0,
    delivered_quantity: 0,
    returned_quantity: 0,
    line_status: "active",
    free_quantity: 0,
    unit_price: 0,
    applied_rate_type: "MANUAL",
    pricing_reference: "",
    pricing_validity_start: "",
    pricing_validity_end: "",
    manual_price_override: false,
    approval_required: false,
    approval_reason: "",
    approved_by: "",
    approved_at: "",
    discount_percent: 0,
    discount_amount: 0,
    taxable_amount: 0,
    gst_amount: 0,
    total_amount: 0,
    remarks: "",
  };
  return { ...base, ...calcLineAmounts(base) };
}

function linesToPayload(lines: LineDraft[]) {
  return lines.map((line) => {
    const calc = calcLineAmounts(line);
    const row: Record<string, unknown> = {
      product: line.product || undefined,
      product_name: line.product_name || "Item",
      sku: line.sku,
      brand: line.brand,
      manufacturer: line.manufacturer,
      product_group: line.product_group,
      product_subgroup: line.product_subgroup,
      unit: line.unit,
      hsn_code: line.hsn_code,
      gst_percent: line.gst_percent,
      ordered_quantity: line.ordered_quantity,
      approved_quantity: line.approved_quantity,
      dispatched_quantity: line.dispatched_quantity,
      delivered_quantity: line.delivered_quantity,
      returned_quantity: line.returned_quantity,
      line_status: line.line_status,
      free_quantity: line.free_quantity,
      unit_price: line.unit_price,
      applied_rate_type: line.applied_rate_type,
      pricing_reference: line.pricing_reference || undefined,
      pricing_validity_start: line.pricing_validity_start || undefined,
      pricing_validity_end: line.pricing_validity_end || undefined,
      manual_price_override: line.manual_price_override,
      approval_required: line.approval_required,
      approval_reason: line.approval_reason,
      approved_by: line.approved_by || undefined,
      approved_at: line.approved_at || undefined,
      discount_percent: line.discount_percent,
      discount_amount: calc.discount_amount,
      taxable_amount: calc.taxable_amount,
      gst_amount: calc.gst_amount,
      total_amount: calc.total_amount,
      remarks: line.remarks,
    };
    if (line._id) row._id = line._id;
    return row;
  });
}

/* ─── Order Items Form Panel ───────────────────────────────────────────── */

function OrderItemsForm({
  order,
  onClose,
  onSaved,
  saving,
  onSave,
  products,
}: {
  order: any;
  onClose: () => void;
  onSaved: () => void;
  saving: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  products: ProductOption[];
}) {
  const orderId = refId(order._id || order.id);
  const [lines, setLines] = useState<LineDraft[]>(() =>
    (Array.isArray(order.order_items) ? order.order_items : []).map(
      (l: any, i: number) => lineFromRaw(l, i, orderId),
    ),
  );
  const [headerDiscount, setHeaderDiscount] = useState(
    Number(order.discount_amount ?? 0) || 0,
  );
  const [extraCharges, setExtraCharges] = useState(
    Number(order.extra_charges ?? 0) || 0,
  );
  const [penaltyAmount, setPenaltyAmount] = useState(
    Number(order.penalty_amount ?? 0) || 0,
  );
  const [damageCharge, setDamageCharge] = useState(
    Number(order.damage_charge ?? 0) || 0,
  );

  useEffect(() => {
    setLines(
      (Array.isArray(order.order_items) ? order.order_items : []).map(
        (l: any, i: number) => lineFromRaw(l, i, orderId),
      ),
    );
    setHeaderDiscount(Number(order.discount_amount ?? 0) || 0);
    setExtraCharges(Number(order.extra_charges ?? 0) || 0);
    setPenaltyAmount(Number(order.penalty_amount ?? 0) || 0);
    setDamageCharge(Number(order.damage_charge ?? 0) || 0);
  }, [order, orderId]);

  const totals = useMemo(
    () =>
      calcOrderTotals(lines, {
        discount_amount: headerDiscount,
        extra_charges: extraCharges,
        penalty_amount: penaltyAmount,
        damage_charge: damageCharge,
      }),
    [lines, headerDiscount, extraCharges, penaltyAmount, damageCharge],
  );

  const productById = useMemo(() => {
    const map = new Map<string, ProductOption>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const updateLine = (key: string, field: keyof LineDraft, value: unknown) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, [field]: value } as LineDraft;
        // Recalc when commercial inputs change
        if (
          [
            "ordered_quantity",
            "unit_price",
            "gst_percent",
            "discount_percent",
            "discount_amount",
          ].includes(String(field))
        ) {
          // If user edits discount_amount directly, clear percent-driven overwrite unless percent is 0
          if (field === "discount_amount") {
            const qty = Number(next.ordered_quantity) || 0;
            const price = Number(next.unit_price) || 0;
            const gstPct = Number(next.gst_percent) || 0;
            const disc = Number(value) || 0;
            const taxable = Math.max(0, qty * price - disc);
            const gst = (taxable * gstPct) / 100;
            return {
              ...next,
              discount_amount: disc,
              taxable_amount: Number(taxable.toFixed(2)),
              gst_amount: Number(gst.toFixed(2)),
              total_amount: Number((taxable + gst).toFixed(2)),
            };
          }
          return { ...next, ...calcLineAmounts(next) };
        }
        return next;
      }),
    );
  };

  const selectProduct = (key: string, productId: string) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        return applyProductSnapshot(
          line,
          productId ? productById.get(productId) || null : null,
        );
      }),
    );
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (key: string) => {
    if (lines.length <= 1) {
      toast.error("Order must keep at least one line item");
      return;
    }
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const handleSave = async () => {
    for (const line of lines) {
      if (!line.product?.trim()) {
        toast.error("Every line needs a product");
        return;
      }
      if (!line.product_name?.trim()) {
        toast.error("Every line needs a product name");
        return;
      }
    }
    await onSave({
      order_items: linesToPayload(lines),
      discount_amount: headerDiscount,
      extra_charges: extraCharges,
      penalty_amount: penaltyAmount,
      damage_charge: damageCharge,
      subtotal: totals.subtotal,
      taxable_amount: totals.taxable_amount,
      gst_amount: totals.gst_amount,
      grand_total: totals.grand_total,
    });
    onSaved();
  };

  const inputClass =
    "w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs outline-none focus:border-amber-500";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/40">
          <div>
            <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
              Order Items — {order.order_no || orderId}
            </h3>
            <p className="text-2xs text-amber-800/80 dark:text-amber-200/70">
              Add / edit / delete lines. Totals recalculate automatically, then Save to MongoDB (bypass).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {lines.map((line, idx) => (
            <div
              key={line.key}
              className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-950/40"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Line {idx + 1}
                  {!line._id ? (
                    <span className="ml-2 text-2xs font-normal text-amber-600">
                      new
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500 col-span-2">
                  product*
                  <select
                    className={inputClass}
                    value={line.product}
                    onChange={(e) => selectProduct(line.key, e.target.value)}
                  >
                    <option value="">Select product…</option>
                    {line.product && !productById.has(line.product) ? (
                      <option value={line.product}>
                        {line.product_name || "Current product"}
                      </option>
                    ) : null}
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.product_name}
                        {p.sku ? ` (${p.sku})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500 col-span-2">
                  product_name*
                  <input
                    className={inputClass}
                    value={line.product_name}
                    onChange={(e) =>
                      updateLine(line.key, "product_name", e.target.value)
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  sku
                  <input
                    className={inputClass}
                    value={line.sku}
                    onChange={(e) => updateLine(line.key, "sku", e.target.value)}
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  unit
                  <input
                    className={inputClass}
                    value={line.unit}
                    onChange={(e) =>
                      updateLine(line.key, "unit", e.target.value)
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  ordered_quantity
                  <input
                    type="number"
                    className={inputClass}
                    value={line.ordered_quantity}
                    onChange={(e) =>
                      updateLine(
                        line.key,
                        "ordered_quantity",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  approved_quantity
                  <input
                    type="number"
                    className={inputClass}
                    value={line.approved_quantity}
                    onChange={(e) =>
                      updateLine(
                        line.key,
                        "approved_quantity",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  unit_price
                  <input
                    type="number"
                    className={inputClass}
                    value={line.unit_price}
                    onChange={(e) =>
                      updateLine(
                        line.key,
                        "unit_price",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  gst_percent
                  <input
                    type="number"
                    className={inputClass}
                    value={line.gst_percent}
                    onChange={(e) =>
                      updateLine(
                        line.key,
                        "gst_percent",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  discount_percent
                  <input
                    type="number"
                    className={inputClass}
                    value={line.discount_percent}
                    onChange={(e) =>
                      updateLine(
                        line.key,
                        "discount_percent",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  discount_amount
                  <input
                    type="number"
                    className={inputClass}
                    value={line.discount_amount}
                    onChange={(e) =>
                      updateLine(
                        line.key,
                        "discount_amount",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  free_quantity
                  <input
                    type="number"
                    className={inputClass}
                    value={line.free_quantity}
                    onChange={(e) =>
                      updateLine(
                        line.key,
                        "free_quantity",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  line_status
                  <select
                    className={inputClass}
                    value={line.line_status}
                    onChange={(e) =>
                      updateLine(line.key, "line_status", e.target.value)
                    }
                  >
                    {LINE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  applied_rate_type
                  <select
                    className={inputClass}
                    value={line.applied_rate_type}
                    onChange={(e) =>
                      updateLine(line.key, "applied_rate_type", e.target.value)
                    }
                  >
                    {RATE_TYPES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  brand
                  <input
                    className={inputClass}
                    value={line.brand}
                    onChange={(e) =>
                      updateLine(line.key, "brand", e.target.value)
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  manufacturer
                  <input
                    className={inputClass}
                    value={line.manufacturer}
                    onChange={(e) =>
                      updateLine(line.key, "manufacturer", e.target.value)
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  hsn_code
                  <input
                    className={inputClass}
                    value={line.hsn_code}
                    onChange={(e) =>
                      updateLine(line.key, "hsn_code", e.target.value)
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500 col-span-2">
                  remarks
                  <input
                    className={inputClass}
                    value={line.remarks}
                    onChange={(e) =>
                      updateLine(line.key, "remarks", e.target.value)
                    }
                  />
                </label>
              </div>

              <div className="mt-2 flex flex-wrap gap-3 rounded-md bg-white px-2.5 py-2 text-2xs dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                <span>
                  Taxable:{" "}
                  <strong className="font-mono">
                    ₹{formatMoney(line.taxable_amount)}
                  </strong>
                </span>
                <span>
                  GST:{" "}
                  <strong className="font-mono">
                    ₹{formatMoney(line.gst_amount)}
                  </strong>
                </span>
                <span>
                  Line total:{" "}
                  <strong className="font-mono text-amber-700 dark:text-amber-400">
                    ₹{formatMoney(line.total_amount)}
                  </strong>
                </span>
                <span className="text-slate-400">
                  dispatched {line.dispatched_quantity} · delivered{" "}
                  {line.delivered_quantity} · returned {line.returned_quantity}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  dispatched_quantity
                  <input
                    type="number"
                    className={inputClass}
                    value={line.dispatched_quantity}
                    onChange={(e) =>
                      updateLine(
                        line.key,
                        "dispatched_quantity",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  delivered_quantity
                  <input
                    type="number"
                    className={inputClass}
                    value={line.delivered_quantity}
                    onChange={(e) =>
                      updateLine(
                        line.key,
                        "delivered_quantity",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  returned_quantity
                  <input
                    type="number"
                    className={inputClass}
                    value={line.returned_quantity}
                    onChange={(e) =>
                      updateLine(
                        line.key,
                        "returned_quantity",
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                  product_group
                  <input
                    className={inputClass}
                    value={line.product_group}
                    onChange={(e) =>
                      updateLine(line.key, "product_group", e.target.value)
                    }
                  />
                </label>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <Plus className="h-3.5 w-3.5" />
            Add line item
          </button>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
              Header discount_amount
              <input
                type="number"
                className={inputClass}
                value={headerDiscount}
                onChange={(e) =>
                  setHeaderDiscount(Number(e.target.value) || 0)
                }
              />
            </label>
            <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
              extra_charges
              <input
                type="number"
                className={inputClass}
                value={extraCharges}
                onChange={(e) => setExtraCharges(Number(e.target.value) || 0)}
              />
            </label>
            <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
              penalty_amount
              <input
                type="number"
                className={inputClass}
                value={penaltyAmount}
                onChange={(e) => setPenaltyAmount(Number(e.target.value) || 0)}
              />
            </label>
            <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
              damage_charge
              <input
                type="number"
                className={inputClass}
                value={damageCharge}
                onChange={(e) => setDamageCharge(Number(e.target.value) || 0)}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4 text-xs">
              <span>
                Subtotal:{" "}
                <strong className="font-mono">
                  ₹{formatMoney(totals.subtotal)}
                </strong>
              </span>
              <span>
                GST:{" "}
                <strong className="font-mono">
                  ₹{formatMoney(totals.gst_amount)}
                </strong>
              </span>
              <span>
                Grand total:{" "}
                <strong className="font-mono text-base text-amber-700 dark:text-amber-400">
                  ₹{formatMoney(totals.grand_total)}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {saving ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save items & totals
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Sheet Modal ─────────────────────────────────────────────────── */

export function SuperAdminOrdersSheetModal({
  isOpen,
  onClose,
  partyNameById: partyNameByIdProp,
}: SuperAdminOrdersSheetModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [localOrders, setLocalOrders] = useState<any[]>([]);
  const [itemsOrderId, setItemsOrderId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    orderId: string;
    colKey: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data, isFetching, isLoading, refetch } = useListOrdersQuery(
    {},
    { skip: !isOpen },
  );
  const partiesQ = useListPartiesQuery({}, { skip: !isOpen });
  const usersQ = useListUsersQuery({}, { skip: !isOpen });
  const productsQ = useListProductsQuery({}, { skip: !isOpen });
  const approvalsQ = useListOrderApprovalsQuery({}, { skip: !isOpen });
  const [superSheetPatch] = useSuperSheetPatchOrderMutation();

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
  }, [isOpen, rawOrders]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
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
  }, [isOpen, onClose, itemsOrderId]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return localOrders;
    return localOrders.filter((o) => {
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
          ? o.order_items.map((l: any) => l.product_name || l.sku || "")
          : []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [localOrders, searchQuery, partyNameById, userNameById, approvalById]);

  const itemsOrder = useMemo(
    () =>
      itemsOrderId
        ? localOrders.find((o) => refId(o._id || o.id) === itemsOrderId) ||
          rawOrders.find((o: any) => refId(o._id || o.id) === itemsOrderId)
        : null,
    [itemsOrderId, localOrders, rawOrders],
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

  const isSavingAny = Object.values(savingIds).some(Boolean);

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

    if (!col.editable) {
      return (
        <span className="block truncate text-slate-600 dark:text-slate-300">
          {displayValue || "—"}
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
                Click the package icon to open the items form (add / delete / auto totals).
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
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              Reload
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders…"
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
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
                <th className="sticky top-0 left-0 z-30 w-12 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 dark:border-slate-800 dark:bg-slate-900">
                  Items
                </th>
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
                    {col.editable ? (
                      <span className="ml-1 text-amber-600">✎</span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order, idx) => {
                const orderId = refId(order._id || order.id);
                const itemCount = Array.isArray(order.order_items)
                  ? order.order_items.length
                  : 0;
                return (
                  <tr
                    key={orderId}
                    className="bg-white hover:bg-amber-50/30 dark:bg-slate-900 dark:hover:bg-amber-950/20"
                  >
                    <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-1 py-1 dark:border-slate-800 dark:bg-slate-900">
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
                    <td className="border-b border-r border-slate-100 px-2 py-1 text-center font-mono text-slate-400 dark:border-slate-800">
                      {idx + 1}
                    </td>
                    {ORDER_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`border-b border-r border-slate-100 px-2 py-1 dark:border-slate-800 ${
                          col.editable
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

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 shrink-0 dark:border-slate-800 dark:bg-slate-900">
          <span>
            {filteredOrders.length} / {localOrders.length} orders · package icon
            opens items form
          </span>
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            Super-admin bypass — all Order.js fields writable
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
      </div>
    </LargeModalPortal>
  );
}

export default SuperAdminOrdersSheetModal;
