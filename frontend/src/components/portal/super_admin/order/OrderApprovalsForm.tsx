"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RefreshCw, Save, X } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  NamedOption,
  ProductOption,
  refId,
  formatMoney,
  RATE_TYPES,
} from "./utils";

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
  is_due_sheet_uploaded: boolean;
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
    is_due_sheet_uploaded: Boolean(approval.is_due_sheet_uploaded),
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

export function OrderApprovalsForm({
  order,
  approvals,
  users,
  products,
  saving,
  onClose,
  onSave,
}: {
  order: any;
  approvals: Record<string, unknown>[];
  users: NamedOption[];
  products: ProductOption[];
  saving: boolean;
  onClose: () => void;
  onSave: (approvalId: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const orderId = refId(order._id || order.id);
  const sortedApprovals = useMemo(
    () =>
      [...approvals].sort((a, b) => {
        const ra = Number(a.revision_number ?? 0);
        const rb = Number(b.revision_number ?? 0);
        if (rb !== ra) return rb - ra;
        return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
      }),
    [approvals],
  );

  const productById = useMemo(() => {
    const map = new Map<string, ProductOption>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const [selectedId, setSelectedId] = useState(
    () => refId(sortedApprovals[0]?._id || sortedApprovals[0]?.id) || "",
  );
  const [header, setHeader] = useState<ApprovalHeaderDraft>(() =>
    headerFromApproval(sortedApprovals[0] || {}),
  );
  const [lines, setLines] = useState<ApprovalItemDraft[]>(() =>
    (Array.isArray(sortedApprovals[0]?.approval_items)
      ? (sortedApprovals[0].approval_items as unknown[])
      : []
    ).map((item, i) => approvalItemFromRaw(item, i)),
  );
  const [totalsManual, setTotalsManual] = useState(false);

  const selectedApproval = useMemo(
    () =>
      sortedApprovals.find(
        (a) => refId(a._id || a.id) === selectedId,
      ) || null,
    [sortedApprovals, selectedId],
  );

  useEffect(() => {
    if (!sortedApprovals.length) {
      setSelectedId("");
      setHeader(headerFromApproval({}));
      setLines([]);
      return;
    }
    const stillValid = sortedApprovals.some(
      (a) => refId(a._id || a.id) === selectedId,
    );
    const nextId = stillValid
      ? selectedId
      : refId(sortedApprovals[0]._id || sortedApprovals[0].id);
    if (nextId !== selectedId) setSelectedId(nextId);
  }, [sortedApprovals, selectedId]);

  useEffect(() => {
    if (!selectedApproval) return;
    setHeader(headerFromApproval(selectedApproval));
    setLines(
      (Array.isArray(selectedApproval.approval_items)
        ? (selectedApproval.approval_items as unknown[])
        : []
      ).map((item, i) => approvalItemFromRaw(item, i)),
    );
    setTotalsManual(false);
  }, [selectedApproval]);

  const linesTotal = useMemo(
    () =>
      Number(
        lines
          .reduce((sum, l) => sum + Number(l.approved_total_amount || 0), 0)
          .toFixed(2),
      ),
    [lines],
  );

  useEffect(() => {
    if (totalsManual) return;
    setHeader((prev) =>
      prev.approved_total_amount === linesTotal
        ? prev
        : { ...prev, approved_total_amount: linesTotal },
    );
  }, [linesTotal, totalsManual]);

  const updateLine = (
    key: string,
    field: keyof ApprovalItemDraft,
    value: unknown,
  ) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, [field]: value } as ApprovalItemDraft;
        if (
          [
            "approved_quantity",
            "approved_unit_price",
            "discount_percent",
            "gst_percent",
            "ordered_quantity",
            "ordered_unit_price",
          ].includes(String(field))
        ) {
          if (
            field === "ordered_quantity" ||
            field === "ordered_unit_price"
          ) {
            const oq = Number(next.ordered_quantity) || 0;
            const op = Number(next.ordered_unit_price) || 0;
            next.ordered_total_amount = Number((oq * op).toFixed(2));
          }
          if (
            [
              "approved_quantity",
              "approved_unit_price",
              "discount_percent",
              "gst_percent",
            ].includes(String(field))
          ) {
            const calc = calcApprovalLineTotal(
              Number(next.approved_quantity) || 0,
              Number(next.approved_unit_price) || 0,
              Number(next.discount_percent) || 0,
              Number(next.gst_percent) || 0,
            );
            return { ...next, ...calc };
          }
        }
        return next;
      }),
    );
  };

  const selectProduct = (key: string, productId: string) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const product = productId ? productById.get(productId) || null : null;
        if (!product) {
          return {
            ...line,
            product: "",
            product_label: "",
            gst_percent: 0,
            approved_unit_price: 0,
            ordered_unit_price: 0,
            approved_total_amount: 0,
            ordered_total_amount: 0,
            discount_amount: 0,
          };
        }
        const next: ApprovalItemDraft = {
          ...line,
          product: product.id,
          product_label: product.product_name,
          gst_percent: product.gst_percent,
          approved_unit_price: product.base_price || line.approved_unit_price,
          ordered_unit_price: product.base_price || line.ordered_unit_price,
          manual_price_override: true,
          rate_mapped: false,
        };
        const oq = Number(next.ordered_quantity) || 0;
        const op = Number(next.ordered_unit_price) || 0;
        next.ordered_total_amount = Number((oq * op).toFixed(2));
        const calc = calcApprovalLineTotal(
          Number(next.approved_quantity) || 0,
          Number(next.approved_unit_price) || 0,
          Number(next.discount_percent) || 0,
          Number(next.gst_percent) || 0,
        );
        return { ...next, ...calc };
      }),
    );
  };

  const addLine = () => setLines((prev) => [...prev, emptyApprovalLine()]);

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const handleSave = async () => {
    if (!selectedId) {
      toast.error("No approval batch selected");
      return;
    }
    for (const line of lines) {
      if (!line.product?.trim()) {
        toast.error("Every approval line needs a product");
        return;
      }
    }
    const approval_items = lines.map((line) => ({
      order_item_id: line.order_item_id || undefined,
      product: line.product || undefined,
      ordered_quantity: line.ordered_quantity,
      ordered_unit_price: line.ordered_unit_price,
      ordered_total_amount: line.ordered_total_amount,
      approved_quantity: line.approved_quantity,
      approved_unit_price: line.approved_unit_price,
      approved_total_amount: line.approved_total_amount,
      applied_rate_type: line.applied_rate_type,
      pricing_reference: line.pricing_reference || undefined,
      manual_price_override: line.manual_price_override,
      rate_mapped: line.rate_mapped,
      discount_percent: line.discount_percent,
      discount_amount: line.discount_amount,
      gst_percent: line.gst_percent,
      free_quantity: line.free_quantity,
      remarks: line.remarks,
    }));

    await onSave(selectedId, {
      ...header,
      assigned_finance_user: header.assigned_finance_user || null,
      assigned_account_user: header.assigned_account_user || null,
      approval_items,
    });
  };

  const inputClass =
    "w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs outline-none focus:border-amber-500";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-blue-800/40 dark:bg-amber-950/40">
          <div>
            <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
              Order Approvals — {order.order_no || orderId}
            </h3>
            <p className="text-2xs text-amber-800/80 dark:text-amber-200/70">
              Select a batch, edit header + approval lines, then Save (super-admin bypass).
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
          {!sortedApprovals.length ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
              No approval batches for this order.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {sortedApprovals.map((a) => {
                  const id = refId(a._id || a.id);
                  const active = id === selectedId;
                  const label =
                    String(a.approval_no || "").trim() ||
                    `Rev ${a.revision_number ?? "—"}`;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedId(id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      }`}
                    >
                      {label}
                      <span className="ml-2 text-2xs font-normal opacity-70">
                        {a.is_admin_approved ? "A" : "—"}/
                        {a.is_finance_approved ? "F" : "—"}/
                        {a.is_account_approved ? "C" : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-950/40">
                <div className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                  Header
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
                  <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                    approved_total_amount
                    <input
                      type="number"
                      className={inputClass}
                      value={header.approved_total_amount}
                      onChange={(e) => {
                        setTotalsManual(true);
                        setHeader((h) => ({
                          ...h,
                          approved_total_amount: Number(e.target.value) || 0,
                        }));
                      }}
                    />
                  </label>
                  <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                    rejected_total_amount
                    <input
                      type="number"
                      className={inputClass}
                      value={header.rejected_total_amount}
                      onChange={(e) =>
                        setHeader((h) => ({
                          ...h,
                          rejected_total_amount: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                    ordered_total_amount
                    <input
                      type="number"
                      className={inputClass}
                      value={header.ordered_total_amount}
                      onChange={(e) =>
                        setHeader((h) => ({
                          ...h,
                          ordered_total_amount: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                    risk_level
                    <select
                      className={inputClass}
                      value={header.risk_level}
                      onChange={(e) =>
                        setHeader((h) => ({ ...h, risk_level: e.target.value }))
                      }
                    >
                      {RISK_LEVEL_OPTS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                    assigned_finance_user
                    <select
                      className={inputClass}
                      value={header.assigned_finance_user}
                      onChange={(e) =>
                        setHeader((h) => ({
                          ...h,
                          assigned_finance_user: e.target.value,
                        }))
                      }
                    >
                      <option value="">—</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                    assigned_account_user
                    <select
                      className={inputClass}
                      value={header.assigned_account_user}
                      onChange={(e) =>
                        setHeader((h) => ({
                          ...h,
                          assigned_account_user: e.target.value,
                        }))
                      }
                    >
                      <option value="">—</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-3">
                  {(
                    [
                      ["is_admin_approved", "Admin approved"],
                      ["is_finance_approved", "Finance approved"],
                      ["is_account_approved", "Account approved"],
                      ["rates_reviewed", "Rates reviewed"],
                      ["all_rates_mapped", "All rates mapped"],
                      ["is_due_sheet_uploaded", "Due sheet uploaded"],
                      ["credit_limit_checked", "Credit checked"],
                      ["outstanding_checked", "Outstanding checked"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(header[key])}
                        onChange={(e) =>
                          setHeader((h) => ({ ...h, [key]: e.target.checked }))
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                    approval_notes
                    <textarea
                      rows={2}
                      className={inputClass}
                      value={header.approval_notes}
                      onChange={(e) =>
                        setHeader((h) => ({
                          ...h,
                          approval_notes: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                    rejection_reason
                    <textarea
                      rows={2}
                      className={inputClass}
                      value={header.rejection_reason}
                      onChange={(e) =>
                        setHeader((h) => ({
                          ...h,
                          rejection_reason: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                    hold_reason
                    <input
                      className={inputClass}
                      value={header.hold_reason}
                      onChange={(e) =>
                        setHeader((h) => ({
                          ...h,
                          hold_reason: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                    remarks
                    <input
                      className={inputClass}
                      value={header.remarks}
                      onChange={(e) =>
                        setHeader((h) => ({ ...h, remarks: e.target.value }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Approval items ({lines.length})
                </div>
                {lines.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700">
                    No approval lines yet. Add a line below.
                  </div>
                ) : null}
                {lines.map((line, idx) => {
                  const isNew = !line.order_item_id;
                  return (
                    <div
                      key={line.key}
                      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/40"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          Line {idx + 1}
                          {isNew ? (
                            <span className="ml-2 text-2xs font-normal text-amber-600">
                              new
                            </span>
                          ) : null}
                        </div>
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
                            onChange={(e) =>
                              selectProduct(line.key, e.target.value)
                            }
                          >
                            <option value="">Select product…</option>
                            {line.product && !productById.has(line.product) ? (
                              <option value={line.product}>
                                {line.product_label || "Current product"}
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
                        <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                          ordered_qty
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
                          ordered_unit_price
                          <input
                            type="number"
                            className={inputClass}
                            value={line.ordered_unit_price}
                            onChange={(e) =>
                              updateLine(
                                line.key,
                                "ordered_unit_price",
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
                          approved_unit_price
                          <input
                            type="number"
                            className={inputClass}
                            value={line.approved_unit_price}
                            onChange={(e) =>
                              updateLine(
                                line.key,
                                "approved_unit_price",
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
                          applied_rate_type
                          <select
                            className={inputClass}
                            value={line.applied_rate_type}
                            onChange={(e) =>
                              updateLine(
                                line.key,
                                "applied_rate_type",
                                e.target.value,
                              )
                            }
                          >
                            {RATE_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-0.5 text-2xs font-semibold text-slate-500">
                          approved_total
                          <input
                            type="number"
                            className={`${inputClass} bg-slate-100 dark:bg-slate-900`}
                            value={line.approved_total_amount}
                            readOnly
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
                    </div>
                  );
                })}
                <button
                  type="button"
                  disabled={!selectedId}
                  onClick={addLine}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add line
                </button>
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              Lines total:{" "}
              <strong className="font-mono">₹{formatMoney(linesTotal)}</strong>
              {!totalsManual ? (
                <span className="ml-2 text-2xs text-slate-400">
                  (syncing to approved_total_amount)
                </span>
              ) : (
                <button
                  type="button"
                  className="ml-2 text-2xs font-semibold text-amber-700 underline"
                  onClick={() => {
                    setTotalsManual(false);
                    setHeader((h) => ({
                      ...h,
                      approved_total_amount: linesTotal,
                    }));
                  }}
                >
                  Reset to lines total
                </button>
              )}
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
                disabled={saving || !selectedId}
                onClick={() => void handleSave()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {saving ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save approval
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderApprovalsForm;
