"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Search, X } from "lucide-react";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { useLazyListOrdersQuery } from "@/store/api";

type Entity = Record<string, unknown>;

function pickList(raw: unknown): Entity[] {
  if (Array.isArray(raw)) return raw as Entity[];
  if (
    raw &&
    typeof raw === "object" &&
    "items" in raw &&
    Array.isArray((raw as { items: unknown }).items)
  ) {
    return (raw as { items: Entity[] }).items;
  }
  if (
    raw &&
    typeof raw === "object" &&
    "data" in raw &&
    Array.isArray((raw as { data: unknown }).data)
  ) {
    return (raw as { data: Entity[] }).data;
  }
  return [];
}

function productIdFromItem(item: Entity): string {
  const product = item.product;
  if (product && typeof product === "object" && !Array.isArray(product)) {
    const p = product as Entity;
    return String(p._id ?? p.id ?? "");
  }
  return String(product ?? "");
}

function itemKey(productId: string, rateType: string): string {
  return `${productId}::${rateType || "SR"}`;
}

export type PreviousPartyOrderItem = {
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
  free_qty: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  gst_percent: number;
  applied_rate_type: string;
  remarks: string;
  lastOrderNo: string;
  lastOrderedAt: string;
  timesOrdered: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  partyId: string;
  partyName?: string;
  /** When true, hide historical unit prices in the list (e.g. sales create order). */
  hidePrice?: boolean;
  onLoad: (items: PreviousPartyOrderItem[]) => void;
};

function mapOrderItem(
  item: Entity,
  order: Entity,
  timesOrdered = 1,
): PreviousPartyOrderItem | null {
  const productId = productIdFromItem(item);
  if (!productId) return null;
  const rateType = String(item.applied_rate_type || "SR");
  return {
    key: itemKey(productId, rateType),
    productId,
    product_name: String(item.product_name ?? ""),
    sku: String(item.sku ?? ""),
    brand: String(item.brand ?? ""),
    manufacturer: String(item.manufacturer ?? ""),
    product_group: String(item.product_group ?? ""),
    product_subgroup: String(item.product_subgroup ?? ""),
    unit: String(item.unit ?? ""),
    quantity: Number(item.ordered_quantity ?? item.quantity ?? 1) || 1,
    free_qty: Number(item.free_quantity ?? item.free_qty ?? 0) || 0,
    unit_price: Number(item.unit_price ?? 0) || 0,
    discount_percent: Number(item.discount_percent ?? 0) || 0,
    discount_amount: Number(item.discount_amount ?? 0) || 0,
    gst_percent: Number(item.gst_percent ?? 18) || 18,
    applied_rate_type: rateType,
    remarks: String(item.remarks ?? ""),
    lastOrderNo: String(order.order_no ?? order.order_number ?? ""),
    lastOrderedAt: String(
      order.createdAt ?? order.order_date ?? order.created_at ?? "",
    ),
    timesOrdered,
  };
}

function aggregatePreviousItems(orders: Entity[]): PreviousPartyOrderItem[] {
  const byKey = new Map<string, PreviousPartyOrderItem>();

  // Orders are newest-first from the API; first seen wins for latest qty/price.
  for (const order of orders) {
    const items = Array.isArray(order.order_items)
      ? (order.order_items as Entity[])
      : [];
    for (const item of items) {
      const mapped = mapOrderItem(item, order);
      if (!mapped) continue;
      const existing = byKey.get(mapped.key);
      if (existing) {
        existing.timesOrdered += 1;
      } else {
        byKey.set(mapped.key, mapped);
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.product_name.localeCompare(b.product_name, undefined, {
      sensitivity: "base",
    }),
  );
}

function formatDate(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PreviousPartyItemsModal({
  open,
  onClose,
  partyId,
  partyName,
  hidePrice = false,
  onLoad,
}: Props) {
  const [triggerListOrders] = useLazyListOrdersQuery();
  const [items, setItems] = useState<PreviousPartyOrderItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !partyId) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setSearch("");
    setSelectedKeys(new Set());
    setItems([]);

    (async () => {
      try {
        const res = await triggerListOrders({ party: partyId }).unwrap();
        if (cancelled) return;
        const aggregated = aggregatePreviousItems(pickList(res));
        setItems(aggregated);
        setSelectedKeys(new Set(aggregated.map((i) => i.key)));
      } catch {
        if (!cancelled) {
          setError("Could not load previous orders for this party.");
          setItems([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, partyId, triggerListOrders]);

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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter((item) => {
      return (
        item.product_name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.applied_rate_type.toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((i) => selectedKeys.has(i.key));

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const item of filtered) next.add(item.key);
      return next;
    });
  }, [filtered]);

  const clearFiltered = useCallback(() => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const item of filtered) next.delete(item.key);
      return next;
    });
  }, [filtered]);

  const handleLoad = useCallback(() => {
    const selected = items.filter((i) => selectedKeys.has(i.key));
    if (selected.length === 0) return;
    onLoad(selected);
    onClose();
  }, [items, selectedKeys, onLoad, onClose]);

  if (!open) return null;

  const selectedCount = selectedKeys.size;
  const titleParty = partyName?.trim() || "party";

  return (
    <LargeModalPortal>
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="previous-party-items-title"
          className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 p-5 dark:border-white/5">
            <div>
              <h3
                id="previous-party-items-title"
                className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-50"
              >
                <History className="h-5 w-5 text-blue-500" />
                Previous ordered items
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Select items previously ordered by{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {titleParty}
                </span>{" "}
                and load them into this order.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 transition hover:bg-slate-100 dark:hover:bg-white/5"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-white/5">
            <div className="relative min-w-[12rem] flex-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, SKU, brand…"
                className="w-full rounded-lg border border-slate-200/95 bg-white py-2 pl-3 pr-9 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              />
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                disabled={filtered.length === 0 || allFilteredSelected}
                onClick={selectAllFiltered}
                className="font-semibold text-blue-600 hover:underline disabled:opacity-40 dark:text-blue-400"
              >
                Select all
              </button>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <button
                type="button"
                disabled={selectedCount === 0}
                onClick={clearFiltered}
                className="font-semibold text-slate-500 hover:underline disabled:opacity-40"
              >
                Clear
              </button>
              <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                {selectedCount} selected
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-10 text-center text-sm text-slate-500 dark:border-white/10">
                Loading previous items…
              </p>
            ) : error ? (
              <p className="rounded-lg border border-dashed border-rose-200 px-3 py-10 text-center text-sm text-rose-600 dark:border-rose-900/40 dark:text-rose-400">
                {error}
              </p>
            ) : filtered.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-10 text-center text-sm text-slate-500 dark:border-white/10">
                {items.length === 0
                  ? "No previous ordered items found for this party."
                  : "No items match your search."}
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map((item) => {
                  const checked = selectedKeys.has(item.key);
                  return (
                    <label
                      key={item.key}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                        checked
                          ? "border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-950/30"
                          : "border-slate-200 hover:bg-slate-50/80 dark:border-white/10 dark:hover:bg-white/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleKey(item.key)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.product_name || "Product"}
                          </p>
                          {item.sku ? (
                            <span className="font-mono text-2xs text-slate-500 dark:text-slate-400">
                              {item.sku}
                            </span>
                          ) : null}
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-slate-600 dark:bg-white/10 dark:text-slate-300">
                            {item.applied_rate_type}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-slate-500 dark:text-slate-400">
                          {item.brand ? <span>{item.brand}</span> : null}
                          <span>
                            Last qty {item.quantity}
                            {item.free_qty > 0 ? ` + ${item.free_qty} free` : ""}
                          </span>
                          {!hidePrice ? (
                            <span>₹{Number(item.unit_price).toFixed(2)}</span>
                          ) : null}
                          {item.lastOrderNo ? (
                            <span>Order {item.lastOrderNo}</span>
                          ) : null}
                          <span>{formatDate(item.lastOrderedAt)}</span>
                          {item.timesOrdered > 1 ? (
                            <span>Ordered {item.timesOrdered}×</span>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200/95 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
            >
              Skip
            </button>
            <button
              type="button"
              disabled={selectedCount === 0 || isLoading}
              onClick={handleLoad}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              Load {selectedCount > 0 ? `${selectedCount} item${selectedCount === 1 ? "" : "s"}` : "selected"}
            </button>
          </div>
        </div>
      </div>
    </LargeModalPortal>
  );
}
