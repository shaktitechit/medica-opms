"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { resolveOrderCounterparty } from "../../partyDisplay";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useGetOrderQuery,
  useListPartiesQuery,
  useListProductsQuery,
  usePatchOrderMutation,
  useTransitionOrderMutation,
} from "@/store/api";
import {
  OrderFulfillmentPipelineStrip,
  buildListOrderFulfillmentPipeline,
} from "@/components/portal/shared/FulfillmentCircleStep";

export type OrderDetailModalProps = {
  orderId: string | null;
  partyNameById: Map<string, string>;
  onClose: () => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}



function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function toDateInputValue(v: unknown): string {
  if (v == null || v === "") return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

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
    applied_rate_type: "SR",
  };
}

function getPriceForRateType(p: Record<string, any> | undefined, rateType: string): number {
  if (!p) return 0;
  if (rateType === "SR") return Number(p.base_price ?? 0);
  if (rateType === "SRA") return Number(p.minimum_sale_rate ?? p.base_price ?? 0);
  if (rateType === "CR") return Number(p.mrp ?? p.base_price ?? 0);
  return Number(p.base_price ?? 0); // Fallback
}

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
      quantity: Number(l.quantity ?? 1),
      unit_price: Number(l.unit_price ?? 0),
      discount_amount: Number(l.discount_amount ?? 0),
      gst_percent: Number(l.gst_percent ?? 18),
      applied_rate_type: !l.applied_rate_type || l.applied_rate_type === "MANUAL" ? "SR" : String(l.applied_rate_type),
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
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        discount_amount: 0,
        gst_percent: Number(l.gst_percent ?? 18),
        applied_rate_type: l.applied_rate_type,
      };
      if (isLikelyObjectId(l.key)) o._id = l.key;
      return o;
    });
}

export function OrderDetailModal({
  orderId,
  partyNameById,
  onClose,
}: OrderDetailModalProps) {
  const open = orderId != null && orderId !== "";
  const { data, isFetching, isError, refetch } = useGetOrderQuery(
    orderId ?? "",
    { skip: !open },
  );

  const [editing, setEditing] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [expectedDate, setExpectedDate] = useState("");
  const headerDiscount = "0";
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<LineRow[]>(() => [newLine()]);

  const detail =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  const status =
    detail && typeof detail.status === "string" ? detail.status : "";
  const isDraft = status === "draft";

  const partiesQ = useListPartiesQuery(
    { status: "active" },
    { skip: !open || !isDraft || !editing },
  );
  const productsQ = useListProductsQuery(
    {},
    { skip: !open || !isDraft || !editing },
  );

  const [patchOrder, { isLoading: isPatching }] = usePatchOrderMutation();
  const [transitionOrder, { isLoading: isSubmitting }] =
    useTransitionOrderMutation();

  const parties = useMemo(
    () => pickList(partiesQ.data),
    [partiesQ.data],
  );
  const products = useMemo(() => pickList(productsQ.data), [productsQ.data]);

  const readOnlyItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return (detail.order_items as Record<string, any>[]).map((item) => {
      const prod = item.product && typeof item.product === "object" ? item.product : {};
      return {
        product_name: prod.product_name ?? item.product_name ?? "—",
        sku: prod.sku ?? item.sku ?? "",
        quantity: item.ordered_quantity ?? item.quantity ?? 0,
        applied_rate_type: item.applied_rate_type ?? "SR",
        _id: item._id,
      };
    });
  }, [detail]);

  useEffect(() => {
    setEditing(false);
  }, [orderId]);

  useEffect(() => {
    if (!isDraft) setEditing(false);
  }, [isDraft]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const startEdit = useCallback(() => {
    if (!detail || !isDraft) return;
    setPartyId(partyIdFromDetail(detail));
    setPriority(
      typeof detail.priority === "string" ? detail.priority : "normal",
    );
    setExpectedDate(toDateInputValue(detail.expected_delivery_date));
    setRemarks(
      typeof detail.remarks === "string" ? detail.remarks : "",
    );
    setLines(linesFromDetail(detail.order_items));
    setEditing(true);
  }, [detail, isDraft]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const onProductRowChange = useCallback(
    (key: string, productId: string) => {
      const p = products.find(
        (x) => String((x as { _id?: unknown })._id ?? (x as { id?: unknown }).id ?? "") === String(productId),
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
        }),
      );
    },
    [products],
  );

  const onRateTypeChange = useCallback(
    (key: string, rateType: string) => {
      setLines((prev) =>
        prev.map((row) => {
          if (row.key !== key) return row;
          const p = products.find(
            (x) => String((x as { _id?: unknown })._id ?? (x as { id?: unknown }).id ?? "") === String(row.productId),
          ) as Record<string, unknown> | undefined;
          const price = getPriceForRateType(p, rateType);
          return {
            ...row,
            applied_rate_type: rateType,
            unit_price: price,
          };
        }),
      );
    },
    [products],
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
      (l) =>
        !Number.isFinite(Number(l.quantity)) || Number(l.quantity) < 1,
    );
    if (badQty) {
      toast.error("Each line needs quantity ≥ 1.");
      return false;
    }
    return true;
  }, [partyId, lines]);

  const persistDraft = useCallback(async (): Promise<boolean> => {
    if (!orderId || !isDraft) return true;
    if (!validateForm()) return false;
    const patch = {
      party: partyId,
      order_items: buildPatchItems(lines),
      discount_amount: Number(headerDiscount || 0),
      priority,
      remarks: remarks.trim() || "",
      ...(expectedDate
        ? { expected_delivery_date: expectedDate }
        : { expected_delivery_date: null }),
    };
    try {
      await patchOrder({ id: orderId, patch }).unwrap();
      toast.success(mutationSuccessCopy("patchOrder"));
      await refetch();
      setEditing(false);
      return true;
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
      return false;
    }
  }, [
    partyId,
    expectedDate,
    isDraft,
    lines,
    orderId,
    patchOrder,
    priority,
    refetch,
    remarks,
    validateForm,
  ]);

  const handleSave = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      await persistDraft();
    },
    [persistDraft],
  );

  const handleSubmitToAdmin = useCallback(async () => {
    if (!orderId || !isDraft) return;
    if (editing) {
      if (!validateForm()) return;
      const patch = {
        party: partyId,
        order_items: buildPatchItems(lines),
        discount_amount: Number(headerDiscount || 0),
        priority,
        remarks: remarks.trim() || "",
        ...(expectedDate
          ? { expected_delivery_date: expectedDate }
          : { expected_delivery_date: null }),
      };
      try {
        await patchOrder({ id: orderId, patch }).unwrap();
        await refetch();
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
        return;
      }
    }
    try {
      await transitionOrder({
        id: orderId,
        body: {
          next_status: "submitted",
          remarks:
            (editing
              ? remarks.trim()
              : typeof detail?.remarks === "string"
                ? detail.remarks.trim()
                : "") || undefined,
        },
      }).unwrap();
      toast.success("Order submitted for admin review");
      setEditing(false);
      onClose();
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [
    partyId,
    detail,
    editing,
    expectedDate,
    headerDiscount,
    isDraft,
    lines,
    onClose,
    orderId,
    patchOrder,
    priority,
    refetch,
    remarks,
    transitionOrder,
    validateForm,
  ]);

  if (!open) return null;

  const custLabel = detail
    ? resolveOrderCounterparty(detail, partyNameById)
    : "—";

  const busy = isPatching || isSubmitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-detail-title"
        className="flex max-h-[min(90dvh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/90 px-5 py-4 dark:border-white/10">
          <div>
            <h2
              id="order-detail-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-50"
            >
              {editing && isDraft ? "Edit order" : "Order details"}
            </h2>
            {detail && typeof detail.order_no === "string" ? (
              <p className="mt-0.5 font-mono text-sm text-slate-600 dark:text-slate-400">
                {detail.order_no}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isDraft && !editing ? (
              <>
                <button
                  type="button"
                  onClick={startEdit}
                  disabled={busy || isFetching || !detail}
                  className="rounded-lg border border-slate-200/95 px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmitToAdmin()}
                  disabled={busy || isFetching || !detail}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  {isSubmitting ? "Submitting…" : "Submit to admin"}
                </button>
              </>
            ) : null}
            {isDraft && editing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={busy}
                  className={btnSecondaryClass}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={busy}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {isPatching ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmitToAdmin()}
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  {isSubmitting ? "Submitting…" : "Submit to admin"}
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {detail && !editing && (
          <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-3 dark:border-white/5 dark:bg-slate-950/20">
            <OrderFulfillmentPipelineStrip
              steps={buildListOrderFulfillmentPipeline(detail)}
              size="sm"
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isFetching && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          )}
          {isError && (
            <p className="text-sm text-rose-600 dark:text-rose-400">
              Could not load order.
            </p>
          )}
          {!isFetching && !isError && detail && (!editing || !isDraft) && (
            <div className="space-y-5 text-sm">
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className={labelClass + " block text-slate-500 dark:text-slate-400"}>
                    Party
                  </dt>
                  <dd className="text-slate-900 dark:text-slate-100">{custLabel}</dd>
                </div>
                <div>
                  <dt className={labelClass + " block text-slate-500 dark:text-slate-400"}>
                    Status
                  </dt>
                  <dd className="capitalize text-slate-900 dark:text-slate-100">
                    {typeof detail.status === "string" ? detail.status : "—"}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass + " block text-slate-500 dark:text-slate-400"}>
                    Priority
                  </dt>
                  <dd className="capitalize text-slate-900 dark:text-slate-100">
                    {typeof detail.priority === "string" ? detail.priority : "—"}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass + " block text-slate-500 dark:text-slate-400"}>
                    Expected delivery
                  </dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {formatDate(detail.expected_delivery_date)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className={labelClass + " block text-slate-500 dark:text-slate-400"}>
                    Remarks
                  </dt>
                  <dd className="whitespace-pre-wrap text-slate-900 dark:text-slate-100">
                    {typeof detail.remarks === "string" && detail.remarks.trim()
                      ? detail.remarks
                      : "—"}
                  </dd>
                </div>
              </dl>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Line items
                </h3>
                {!readOnlyItems.length ? (
                  <p className="text-slate-500 dark:text-slate-400">No lines.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md ring-1 ring-slate-200/90 dark:ring-white/10">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">Product</th>
                          <th className="px-2 py-1.5 font-medium">Qty</th>
                          <th className="px-2 py-1.5 font-medium text-right">Rate Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                        {readOnlyItems.map((line, idx) => {
                          const name =
                            typeof line.product_name === "string"
                              ? line.product_name
                              : "—";
                          const qty = line.quantity;
                          const rateType = !line.applied_rate_type || line.applied_rate_type === "MANUAL" ? "SR" : String(line.applied_rate_type);
                          const key =
                            line._id != null
                              ? String(line._id)
                              : `line-${idx}`;
                          return (
                            <tr key={key}>
                              <td className="max-w-[200px] px-2 py-1.5">
                                <span className="line-clamp-2">{name}</span>
                                {typeof line.sku === "string" && line.sku ? (
                                  <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                                    SKU {line.sku}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">{String(qty ?? "—")}</td>
                              <td className="px-2 py-1.5 text-right">
                                {rateType}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {!isFetching && !isError && detail && isDraft && editing && (
            <form onSubmit={(e) => void handleSave(e)} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="od-party" className={labelClass}>
                    Party
                  </label>
                  <select
                    id="od-party"
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
                          "",
                      );
                      const name =
                        typeof (c as { party_name?: string }).party_name === "string"
                          ? (c as { party_name: string }).party_name
                          : id || "Party";
                      const typ =
                        typeof (c as { party_type?: string }).party_type === "string" &&
                        (c as { party_type: string }).party_type
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
                  {partiesQ.isError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400">
                      Could not load parties.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="od-priority" className={labelClass}>
                    Priority
                  </label>
                  <select
                    id="od-priority"
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
                  <label htmlFor="od-eta" className={labelClass}>
                    Expected delivery
                  </label>
                  <input
                    id="od-eta"
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="od-remarks" className={labelClass}>
                    Remarks
                  </label>
                  <textarea
                    id="od-remarks"
                    rows={2}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Line items
                </h3>
                {productsQ.isError && (
                  <p className="mb-2 text-sm text-rose-600 dark:text-rose-400">
                    Could not load products.
                  </p>
                )}
                <div className="space-y-4">
                  {lines.map((row, idx) => (
                    <div
                      key={row.key}
                      className="grid gap-3 rounded-lg border border-slate-200/90 p-3 dark:border-white/10 sm:grid-cols-12 sm:items-end"
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
                              "",
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
                                  : l,
                              ),
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
                        </select>
                      </div>
                      <div className="flex gap-1 sm:col-span-2 sm:justify-end">
                        <button
                          type="button"
                          className={`${btnSecondaryClass} text-rose-700 dark:text-rose-400`}
                          disabled={lines.length <= 1}
                          onClick={() =>
                            setLines((prev) => prev.filter((l) => l.key !== row.key))
                          }
                        >
                          Remove
                        </button>
                        {idx === lines.length - 1 ? (
                          <button
                            type="button"
                            className={btnSecondaryClass}
                            onClick={() => setLines((prev) => [...prev, newLine()])}
                          >
                            Add line
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
