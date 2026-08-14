"use client";

export type NamedOption = { id: string; name: string };

export type ProductOption = {
  id: string;
  product_name: string;
  sku: string;
  brand: string;
  manufacturer: string;
  unit: string;
  hsn_code: string;
  gst_percent: number;
  base_price: number;
  product_type?: string;
};

export type LineDraft = {
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
  /** When set, this row is a kit bucket component (not a commercial parent). */
  kit_parent_product?: string;
};

export function refId(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null) {
    const o = v as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return String(v);
}

export function toDateInput(v: unknown): string {
  if (v == null || v === "") return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function formatMoney(v: number): string {
  if (v == null || isNaN(v)) return "0.00";
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDateOnly(v: unknown): string {
  if (!v) return "";
  try {
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export const LINE_STATUSES = ["active", "partial", "fulfilled", "cancelled"] as const;
export const RATE_TYPES = ["SR", "SRA", "CR", "MANUAL"] as const;

export function calcLineAmounts(line: Partial<LineDraft>): {
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

export function calcOrderTotals(
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
    // Kit bucket rows are zero-priced fulfillment components — skip from commercials.
    if (line.kit_parent_product) continue;
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

export function applyProductSnapshot(
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

export function lineFromRaw(line: any, idx: number, orderId: string): LineDraft {
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
    kit_parent_product: refId(line?.kit_parent_product) || undefined,
  };
  return { ...base, ...calcLineAmounts(base) };
}

export function emptyLine(): LineDraft {
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

export function linesToPayload(lines: LineDraft[]) {
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
    if (line.kit_parent_product) {
      row.kit_parent_product = line.kit_parent_product;
      row.manual_price_override = true;
    }
    if (line._id) row._id = line._id;
    return row;
  });
}
