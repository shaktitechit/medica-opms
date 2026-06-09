"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useListPartiesQuery,
  useListProductsQuery,
  useListUsersQuery,
  usePatchOrderMutation,
} from "@/store/api";

type EditOrderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  detail: Record<string, unknown> | null;
  user: { _id?: unknown; id?: unknown } | null | undefined;
  refetchOrder: () => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-350";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5 cursor-pointer";

type LineRow = {
  key: string;
  productId: string;
  product_name: string;
  sku: string;
  brand: string;
  manufacturer: string;
  product_group: string;
  product_subgroup: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  gst_percent: number;
  applied_rate_type: string;
};

function newLine(): LineRow {
  return {
    key:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    productId: "",
    product_name: "",
    sku: "",
    brand: "",
    manufacturer: "",
    product_group: "",
    product_subgroup: "",
    unit: "",
    quantity: 1,
    unit_price: 0,
    discount_amount: 0,
    gst_percent: 18,
    applied_rate_type: "MANUAL",
  };
}

function getPriceForRateType(p: Record<string, unknown> | undefined, rateType: string): number {
  if (!p) return 0;
  if (rateType === "SR") return Number(p.base_price ?? 0);
  if (rateType === "SRA") return Number(p.minimum_sale_rate ?? p.base_price ?? 0);
  if (rateType === "CR") return Number(p.mrp ?? p.base_price ?? 0);
  return Number(p.base_price ?? 0); // MANUAL
}

function isLikelyObjectId(s: string): boolean {
  return /^[a-f0-9]{24}$/i.test(s);
}

function linesFromDetail(raw: unknown): LineRow[] {
  const items = Array.isArray(raw) ? raw : [];
  if (items.length === 0) return [newLine()];
  return items.map((item, idx) => {
    const l = item as Record<string, unknown>;
    const prod = l.product;
    const productId =
      typeof prod === "string"
        ? prod
        : prod && typeof prod === "object" && (prod as { _id?: unknown })._id != null
          ? String((prod as { _id: unknown })._id)
          : "";
    const key =
      l._id != null
        ? String(l._id)
        : typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `line-${idx}-${Math.random().toString(36).slice(2)}`;
    return {
      key,
      productId,
      product_name: String(l.product_name ?? ""),
      sku: String(l.sku ?? ""),
      brand: String(l.brand ?? ""),
      manufacturer: String(l.manufacturer ?? ""),
      product_group: String(l.product_group ?? ""),
      product_subgroup: String(l.product_subgroup ?? ""),
      unit: String(l.unit ?? ""),
      quantity: Number(l.ordered_quantity ?? l.quantity ?? 1),
      unit_price: Number(l.unit_price ?? 0),
      discount_amount: Number(l.discount_amount ?? 0),
      gst_percent: Number(l.gst_percent ?? 18),
      applied_rate_type: String(l.applied_rate_type ?? "MANUAL"),
    };
  });
}

function partyIdFromDetail(detail: Record<string, unknown>): string {
  const p = detail.party;
  if (typeof p === "string") return p.trim();
  if (p && typeof p === "object" && "_id" in p)
    return String((p as { _id: unknown })._id ?? "");
  return "";
}

function toDateInputValue(v: unknown): string {
  if (v == null || v === "") return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function buildPatchItems(lines: LineRow[]): Record<string, unknown>[] {
  return lines
    .filter((l) => l.productId)
    .map((l) => {
      const o: Record<string, unknown> = {
        product: l.productId,
        product_name: l.product_name,
        sku: l.sku || "",
        brand: l.brand || "",
        manufacturer: l.manufacturer || "",
        product_group: l.product_group || "",
        product_subgroup: l.product_subgroup || "",
        unit: l.unit || "",
        ordered_quantity: Number(l.quantity),
        free_quantity: 0,
        allocated_quantity: 0,
        dispatched_quantity: 0,
        delivered_quantity: 0,
        cancelled_quantity: 0,
        unit_price: Number(l.unit_price),
        discount_amount: 0,
        gst_percent: Number(l.gst_percent ?? 18),
        applied_rate_type: l.applied_rate_type,
      };
      if (isLikelyObjectId(l.key)) o._id = l.key;
      return o;
    });
}

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

export default function EditOrderModal({
  isOpen,
  onClose,
  orderId,
  detail,
  user,
  refetchOrder,
}: EditOrderModalProps) {
  const [partyId, setPartyId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [expectedDate, setExpectedDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<LineRow[]>([]);

  // Initialize fields from order details when modal opens
  useEffect(() => {
    if (isOpen && detail) {
      setPartyId(partyIdFromDetail(detail));
      setPriority(typeof detail.priority === "string" ? detail.priority : "normal");
      setExpectedDate(toDateInputValue(detail.expected_delivery_date));
      setRemarks(typeof detail.remarks === "string" ? detail.remarks : "");
      setLines(linesFromDetail(detail.order_items));
    }
  }, [isOpen, detail]);

  const partiesQ = useListPartiesQuery({}, { skip: !isOpen });
  const productsQ = useListProductsQuery({}, { skip: !isOpen });

  const [patchOrder, { isLoading: isPatching }] = usePatchOrderMutation();

  const parties = useMemo(() => pickList(partiesQ.data), [partiesQ.data]);
  const products = useMemo(() => pickList(productsQ.data), [productsQ.data]);

  const onProductRowChange = useCallback(
    (key: string, productId: string) => {
      const p = products.find(
        (x) =>
          String(
            (x as { _id?: unknown })._id ?? (x as { id?: unknown }).id ?? ""
          ) === String(productId)
      ) as Record<string, unknown> | undefined;
      setLines((prev) =>
        prev.map((row) => {
          if (row.key !== key) return row;
          if (!p) {
            return {
              ...row,
              productId: "",
              product_name: "",
              sku: "",
              brand: "",
              manufacturer: "",
              product_group: "",
              product_subgroup: "",
              unit: "",
              unit_price: 0,
              gst_percent: 18,
            };
          }
          const price = getPriceForRateType(p, row.applied_rate_type);
          return {
            ...row,
            productId: String(p._id ?? p.id ?? ""),
            product_name: String(p.product_name ?? ""),
            sku: String(p.sku ?? ""),
            brand: String(p.brand ?? ""),
            manufacturer: String(p.manufacturer ?? ""),
            product_group: String(p.product_group ?? ""),
            product_subgroup: String(p.product_subgroup ?? ""),
            unit: String(p.unit ?? ""),
            unit_price: price,
            gst_percent: Number(p.gst_percent ?? p.default_gst_rate ?? p.gst_rate ?? 18),
          };
        })
      );
    },
    [products]
  );

  const onRateTypeChange = useCallback(
    (key: string, rateType: string) => {
      setLines((prev) =>
        prev.map((row) => {
          if (row.key !== key) return row;
          const p = products.find(
            (x) =>
              String(
                (x as { _id?: unknown })._id ?? (x as { id?: unknown }).id ?? ""
              ) === String(row.productId)
          ) as Record<string, unknown> | undefined;
          const price = getPriceForRateType(p, rateType);
          return {
            ...row,
            applied_rate_type: rateType,
            unit_price: price,
          };
        })
      );
    },
    [products]
  );

  const validateForm = useCallback((): boolean => {
    if (!partyId) {
      toast.error("Select a party.");
      return false;
    }
    const prepared = buildPatchItems(lines);
    if (!prepared.length) {
      toast.error("Add at least one line with a product.");
      return false;
    }
    const badQty = prepared.some(
      (l) => !Number.isFinite(Number(l.ordered_quantity)) || Number(l.ordered_quantity) < 1
    );
    if (badQty) {
      toast.error("Each line needs quantity ≥ 1.");
      return false;
    }
    return true;
  }, [partyId, lines]);

  const handleSave = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!orderId) return;
      if (!validateForm()) return;
      const patch = {
        party: partyId,
        order_items: buildPatchItems(lines),
        discount_amount: 0,
        priority,
        remarks: remarks.trim() || "",
        ...(expectedDate
          ? { expected_delivery_date: expectedDate }
          : { expected_delivery_date: null }),
        assigned_sales_user:
          user?._id || user?.id ? String(user?._id || user?.id) : undefined,
      };
      try {
        await patchOrder({ id: orderId, patch }).unwrap();
        toast.success(mutationSuccessCopy("patchOrder"));
        refetchOrder();
        onClose();
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
      }
    },
    [
      partyId,
      expectedDate,
      lines,
      orderId,
      patchOrder,
      priority,
      refetchOrder,
      remarks,
      validateForm,
      user,
      onClose,
    ]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-4xl rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Edit Draft Order
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Update draft items, delivery requirements, priorities, and remarks.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1 cursor-pointer"
          >
            <span className="sr-only">Close</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="mt-4 overflow-y-auto flex-1 pr-1 space-y-5">
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="modal-party" className={labelClass}>
                  Party
                </label>
                <select
                  id="modal-party"
                  value={partyId}
                  onChange={(e) => setPartyId(e.target.value)}
                  className={inputClass}
                  required
                >
                  <option value="">— Select —</option>
                  {parties.map((c) => {
                    const id = String(
                      (c as { _id?: unknown })._id ??
                        (c as { id?: unknown }).id ??
                        ""
                    );
                    const name =
                      typeof (c as { party_name?: string }).party_name ===
                      "string"
                        ? (c as { party_name: string }).party_name
                        : id || "Party";
                    const typ =
                      typeof (c as { party_type?: string }).party_type ===
                        "string" && (c as { party_type: string }).party_type
                        ? ` (${(c as { party_type: string }).party_type})`
                        : "";
                    return (
                      <option key={id || name} value={id}>
                        {name}
                        {typ}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="modal-priority" className={labelClass}>
                  Priority
                </label>
                <select
                  id="modal-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className={inputClass}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="modal-eta" className={labelClass}>
                  Expected delivery
                </label>
                <input
                  id="modal-eta"
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="modal-remarks" className={labelClass}>
                  Remarks
                </label>
                <textarea
                  id="modal-remarks"
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Line items
                </h3>
                <button
                  type="button"
                  className="rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 cursor-pointer"
                  onClick={() => setLines((prev) => [...prev, newLine()])}
                >
                  + Add line
                </button>
              </div>
              <div className="space-y-3">
                {lines.map((row, idx) => (
                  <div
                    key={row.key}
                    className="grid gap-3 rounded-lg border border-slate-200/90 p-3 dark:border-white/10 sm:grid-cols-12 sm:items-end bg-slate-50/[0.3] dark:bg-slate-900/40"
                  >
                    <div className="space-y-1.5 sm:col-span-5">
                      <span className={labelClass}>Product</span>
                      <select
                        value={row.productId}
                        onChange={(e) =>
                          onProductRowChange(row.key, e.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">— Select —</option>
                        {products.map((p) => {
                          const id = String(
                            (p as { _id?: unknown })._id ??
                              (p as { id?: unknown }).id ??
                              ""
                          );
                          const plab = `${(p as { product_name?: string }).product_name ?? id}${(p as { sku?: string }).sku ? ` · ${(p as { sku: string }).sku}` : ""}`;
                          return (
                            <option key={id || plab} value={id}>
                              {plab}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <span className={labelClass}>Qty</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={row.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === row.key
                                ? {
                                    ...l,
                                    quantity: Number(e.target.value) || 0,
                                  }
                                : l
                            )
                          )
                        }
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-3">
                      <span className={labelClass}>Rate Type</span>
                      <select
                        value={row.applied_rate_type}
                        onChange={(e) =>
                          onRateTypeChange(row.key, e.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="SR">SR</option>
                        <option value="SRA">SRA</option>
                        <option value="CR">CR</option>
                        <option value="MANUAL">MANUAL</option>
                      </select>
                    </div>
                    <div className="flex sm:col-span-2 sm:justify-end">
                      <button
                        type="button"
                        className={`${btnSecondaryClass} text-rose-700 dark:text-rose-455 py-1.5 w-full text-center hover:bg-rose-50 dark:hover:bg-rose-950/20`}
                        disabled={lines.length <= 1}
                        onClick={() =>
                          setLines((prev) =>
                            prev.filter((l) => l.key !== row.key)
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-5 flex justify-end gap-3 border-t border-slate-100 pt-3 dark:border-white/5">
          <button
            type="button"
            onClick={onClose}
            disabled={isPatching}
            className={btnSecondaryClass}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isPatching}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer active:scale-[0.98]"
          >
            {isPatching ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
