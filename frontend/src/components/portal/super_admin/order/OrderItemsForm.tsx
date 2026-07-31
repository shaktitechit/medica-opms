"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RefreshCw, Save, X } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  LineDraft,
  ProductOption,
  refId,
  lineFromRaw,
  calcOrderTotals,
  calcLineAmounts,
  applyProductSnapshot,
  emptyLine,
  linesToPayload,
  formatMoney,
  LINE_STATUSES,
  RATE_TYPES,
} from "./utils";

export function OrderItemsForm({
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
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-blue-800/40 dark:bg-amber-950/40">
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
                <label className="space-y-0.5 text-2xs font-semibold text-slate-500 col-span-2 col-span-2">
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

export default OrderItemsForm;
