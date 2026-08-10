"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Receipt, Search, Tag, Trash2, User, X } from "lucide-react";

import {
  lineApprovalQuantities,
  resolveAccountApprovalStatus,
} from "@/components/portal/shared/orderLineQuantities";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCreateUnbilledOrderMutation,
  useListProductsQuery,
  usePatchUnbilledOrderMutation,
  type UnbilledOrderRecord,
} from "@/store/api";

export type AddUnbilledOrderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  orders?: unknown[];
  existingUnbilledOrderIds?: Set<string>;
  partyNameById: Map<string, string>;
  mode?: "create" | "edit";
  initialRecord?: UnbilledOrderRecord | null;
};

export type ManualAddItem = {
  key: string;
  orderItemId?: string;
  productId: string;
  productName: string;
  sku: string;
  lastQuantity: number;
  quantity: number;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";

type Entity = Record<string, unknown>;

function orderRefId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}

function resolveProductLabel(line: Record<string, unknown>): {
  id: string;
  name: string;
  sku: string;
} {
  const product = line.product;
  if (product && typeof product === "object") {
    const p = product as Record<string, unknown>;
    return {
      id: String(p._id ?? p.id ?? ""),
      name: String(p.product_name ?? p.name ?? line.product_name ?? "Item"),
      sku: String(p.sku ?? line.sku ?? ""),
    };
  }
  if (typeof product === "string" && product) {
    return {
      id: product,
      name: String(line.product_name ?? line.name ?? "Item"),
      sku: String(line.sku ?? ""),
    };
  }
  return {
    id: "",
    name: String(line.product_name ?? line.name ?? "Item"),
    sku: String(line.sku ?? ""),
  };
}

interface OrderAutocompleteProps {
  availableOrders: { id: string; orderNo: string; party: string }[];
  selectedId: string;
  onChange: (id: string) => void;
  className?: string;
}

function OrderAutocomplete({
  availableOrders,
  selectedId,
  onChange,
  className,
}: OrderAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOrder = useMemo(() => {
    return availableOrders.find((o) => o.id === selectedId);
  }, [availableOrders, selectedId]);

  useEffect(() => {
    if (selectedOrder) {
      setSearch(`${selectedOrder.orderNo} — ${selectedOrder.party}`);
    } else {
      setSearch("");
    }
  }, [selectedOrder]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return availableOrders;
    return availableOrders.filter((o) => {
      const no = o.orderNo.toLowerCase();
      const party = o.party.toLowerCase();
      return no.includes(q) || party.includes(q);
    });
  }, [availableOrders, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedOrder) {
          setSearch(`${selectedOrder.orderNo} — ${selectedOrder.party}`);
        } else {
          setSearch("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedOrder]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search reference order or party..."
          className={`${className} pr-10`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400 dark:text-slate-500">
          <Search className="h-4 w-4" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              No orders found
            </div>
          ) : (
            filtered.map((o) => {
              const isSelected = o.id === selectedId;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    onChange(o.id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-white/5 ${
                    isSelected
                      ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400 font-semibold"
                      : "text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <span className="truncate">
                    <span className="font-mono font-bold">{o.orderNo}</span>
                    <span className="ml-2 text-slate-500 dark:text-slate-400">({o.party})</span>
                  </span>
                  {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-cyan-600 dark:text-cyan-400" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

interface ProductAutocompleteProps {
  products: Entity[];
  selectedId: string;
  onChange: (id: string) => void;
  className?: string;
}

function ProductAutocomplete({
  products,
  selectedId,
  onChange,
  className,
}: ProductAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo(() => {
    return products.find((p) => String(p._id ?? p.id ?? "") === String(selectedId));
  }, [products, selectedId]);

  useEffect(() => {
    if (selectedProduct) {
      const name = String(selectedProduct.product_name || selectedProduct.name || "");
      const sku = selectedProduct.sku ? ` (${selectedProduct.sku})` : "";
      setSearch(`${name}${sku}`);
    } else {
      setSearch("");
    }
  }, [selectedProduct]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products;
    return products.filter((p) => {
      const name = String(p.product_name || p.name || "").toLowerCase();
      const sku = String(p.sku || "").toLowerCase();
      const brand = String(p.brand || "").toLowerCase();
      return name.includes(q) || sku.includes(q) || brand.includes(q);
    });
  }, [products, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedProduct) {
          const name = String(selectedProduct.product_name || selectedProduct.name || "");
          const sku = selectedProduct.sku ? ` (${selectedProduct.sku})` : "";
          setSearch(`${name}${sku}`);
        } else {
          setSearch("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedProduct]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search product..."
          className={`${className} pr-10`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400 dark:text-slate-500">
          <Search className="h-4 w-4" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              No products found
            </div>
          ) : (
            filtered.map((p) => {
              const id = String(p._id ?? p.id ?? "");
              const isSelected = id === selectedId;
              const name = String(p.product_name || p.name || "Product");
              const sku = p.sku ? ` · ${p.sku}` : "";
              const brand = p.brand ? ` (${p.brand})` : "";
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onChange(id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-white/5 ${
                    isSelected
                      ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400 font-medium"
                      : "text-slate-800 dark:text-slate-200"
                  }`}
                >
                  <span className="truncate">
                    {name}
                    {sku && <span className="text-2xs text-slate-500 dark:text-slate-400 ml-1">{sku}</span>}
                    {brand && <span className="text-2xs text-slate-400 ml-1">{brand}</span>}
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0 text-cyan-600 dark:text-cyan-400" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function AddUnbilledOrderModal({
  isOpen,
  onClose,
  onSuccess,
  orders,
  existingUnbilledOrderIds = new Set(),
  partyNameById,
  mode = "create",
  initialRecord = null,
}: AddUnbilledOrderModalProps) {
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [items, setItems] = useState<ManualAddItem[]>([]);
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [createUnbilledOrder] = useCreateUnbilledOrderMutation();
  const [patchUnbilledOrder] = usePatchUnbilledOrderMutation();
  const productsQ = useListProductsQuery(undefined, { skip: !isOpen });

  const isEditMode = mode === "edit" && Boolean(initialRecord);

  useEffect(() => {
    if (!isOpen) return;
    if (isEditMode && initialRecord) {
      const orderIdVal = orderRefId(initialRecord.order);
      setSelectedOrderId(orderIdVal);
      setRemarks(initialRecord.remarks ?? "");
      const recordItems = Array.isArray(initialRecord.unbilled_items)
        ? initialRecord.unbilled_items
        : [];
      const mappedItems: ManualAddItem[] = recordItems.map((item, idx) => {
        const prodId = orderRefId(item.product);
        const name = String(item.product_name ?? (typeof item.product === "object" && item.product ? (item.product as any).product_name : "") ?? "Item");
        const sku = String(item.sku ?? (typeof item.product === "object" && item.product ? (item.product as any).sku : "") ?? "");
        return {
          key: item._id ?? `edit-item-${idx}-${Date.now()}`,
          orderItemId: item.order_item_id,
          productId: prodId,
          productName: name,
          sku,
          lastQuantity: Number(item.approved_quantity ?? item.remaining_quantity ?? 0),
          quantity: Number(item.remaining_quantity ?? 0),
        };
      });
      setItems(mappedItems);
    } else {
      setSelectedOrderId("");
      setItems([]);
      setRemarks("");
    }
  }, [isOpen, isEditMode, initialRecord]);

  const rawProducts = useMemo(() => {
    if (!productsQ.data || typeof productsQ.data !== "object") return [];
    const res = productsQ.data as Record<string, unknown>;
    const list = Array.isArray(res.data)
      ? res.data
      : Array.isArray(res.items)
        ? res.items
        : Array.isArray(res)
          ? res
          : [];
    return list.filter((p) => p && typeof p === "object") as Entity[];
  }, [productsQ.data]);

  const availableOrders = useMemo(() => {
    const list: { id: string; orderNo: string; party: string }[] = [];
    for (const raw of Array.isArray(orders) ? orders : []) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const id = orderRefId(row._id ?? row.id);
      if (!id) continue;
      if (!isEditMode && existingUnbilledOrderIds.has(id)) continue;
      const status = String(row.status ?? "").toLowerCase();
      if (status === "cancelled" || status === "draft" || status === "on_hold") {
        continue;
      }
      const orderNo = String(row.order_no ?? row.order_number ?? "").trim() || id;
      const partyObj =
        row.party && typeof row.party === "object"
          ? String(
              (row.party as Record<string, unknown>).party_name ??
                (row.party as Record<string, unknown>).name ??
                "",
            ).trim()
          : "";
      const partyId = orderRefId(row.party);
      const party = partyObj || (partyId && partyNameById.get(partyId)) || "—";
      list.push({ id, orderNo, party });
    }
    return list.sort((a, b) => a.orderNo.localeCompare(b.orderNo));
  }, [orders, existingUnbilledOrderIds, partyNameById, isEditMode]);

  const handleSelectOrder = useCallback(
    (orderId: string) => {
      setSelectedOrderId(orderId);
      if (!orderId) {
        setItems([]);
        return;
      }
      const raw = (Array.isArray(orders) ? orders : []).find((o) => {
        if (!o || typeof o !== "object") return false;
        const r = o as Record<string, unknown>;
        return orderRefId(r._id ?? r.id) === orderId;
      });
      if (raw && typeof raw === "object") {
        const row = raw as Record<string, unknown>;
        const rawItems = Array.isArray(row.order_items) ? row.order_items : [];
        const accountStatus = resolveAccountApprovalStatus(row);
        const autoItems: ManualAddItem[] = [];
        for (let i = 0; i < rawItems.length; i++) {
          const itemRaw = rawItems[i];
          if (!itemRaw || typeof itemRaw !== "object") continue;
          const line = itemRaw as Record<string, unknown>;
          const q = lineApprovalQuantities(line, {
            accountApprovalStatus: accountStatus,
          });
          const approvedQty =
            q.accountCleared > 0
              ? q.accountCleared
              : q.salesApproved > 0
                ? q.salesApproved
                : q.ordered;
          const remaining = Math.max(0, approvedQty - q.dispatched);
          if (remaining <= 0 && q.ordered <= 0) continue;
          const { id: pIdVal, name, sku } = resolveProductLabel(line);
          const lastQty = remaining > 0 ? remaining : q.ordered;
          autoItems.push({
            key: `auto-${i}-${Date.now()}`,
            orderItemId: String(line._id ?? line.id ?? ""),
            productId: pIdVal,
            productName: name,
            sku,
            lastQuantity: lastQty,
            quantity: 0,
          });
        }
        setItems(autoItems);
      }
    },
    [orders],
  );

  const handleAddItemRow = useCallback(() => {
    setItems((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}-${Math.random()}`,
        productId: "",
        productName: "",
        sku: "",
        lastQuantity: 0,
        quantity: 0,
      },
    ]);
  }, []);

  const handleRemoveItemRow = useCallback((key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const handleUpdateItemRow = useCallback(
    (key: string, patch: Partial<ManualAddItem>) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.key !== key) return item;
          const updated = { ...item, ...patch };
          if (patch.productId && rawProducts.length > 0) {
            const match = rawProducts.find(
              (p) => String(p._id ?? p.id ?? "") === patch.productId,
            );
            if (match) {
              updated.productName = String(match.product_name ?? match.name ?? "");
              updated.sku = String(match.sku ?? "");
            }
          }
          return updated;
        }),
      );
    },
    [rawProducts],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedOrderId) {
        toast.error("Please select a reference order.");
        return;
      }
      const validItems = items.filter(
        (item) => (item.productId || item.productName.trim()) && item.quantity > 0,
      );
      if (validItems.length === 0) {
        toast.error("Please enter unbilled quantity (> 0) for at least one item.");
        return;
      }
      setIsSubmitting(true);
      try {
        if (isEditMode && initialRecord?._id) {
          await patchUnbilledOrder({
            id: initialRecord._id,
            patch: {
              remarks: remarks.trim() || undefined,
              items: validItems.map((it) => ({
                order_item_id: it.orderItemId,
                productId: it.productId || undefined,
                productName: it.productName,
                sku: it.sku,
                lastQuantity: it.lastQuantity,
                quantity: it.quantity,
              })),
            },
          }).unwrap();
          toast.success("Unbilled order updated successfully.");
        } else {
          await createUnbilledOrder({
            order: selectedOrderId,
            remarks: remarks.trim() || undefined,
            items: validItems.map((it) => ({
              order_item_id: it.orderItemId,
              productId: it.productId || undefined,
              productName: it.productName,
              sku: it.sku,
              lastQuantity: it.lastQuantity,
              quantity: it.quantity,
            })),
          }).unwrap();
          toast.success("Unbilled order added successfully.");
        }
        setSelectedOrderId("");
        setItems([]);
        setRemarks("");
        onSuccess?.();
        onClose();
      } catch (rejected) {
        toast.error(
          mutationRejectedMessage(rejected) ||
            "Failed to save unbilled order. Please check inputs.",
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      selectedOrderId,
      items,
      remarks,
      isEditMode,
      initialRecord,
      createUnbilledOrder,
      patchUnbilledOrder,
      onSuccess,
      onClose,
    ],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-unbilled-title"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-5 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="add-unbilled-title"
                className="text-base font-bold text-slate-900 dark:text-slate-50"
              >
                {isEditMode ? "Edit Unbilled Order" : "Add Unbilled Order"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEditMode
                  ? "Modify unbilled tracking items, quantities, and remarks"
                  : "Select reference order and configure undispatched items & quantities"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body Form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto p-5 lg:grid-cols-3 gap-6">
            {/* Left Column: Reference Order + Items */}
            <div className="lg:col-span-2 space-y-5">
              {/* Reference Order Selection Card */}
              <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
                <header className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2.5 dark:border-white/5">
                  <User className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-50">
                      Reference Order
                    </h3>
                    <p className="text-2xs text-slate-500 dark:text-slate-400">
                      Select pipeline order to track unbilled balance
                    </p>
                  </div>
                </header>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Reference Order <span className="text-rose-500">*</span>
                  </label>
                  <OrderAutocomplete
                    availableOrders={availableOrders}
                    selectedId={selectedOrderId}
                    onChange={handleSelectOrder}
                    className={inputClass}
                  />
                  {availableOrders.length === 0 && (
                    <p className="text-2xs text-amber-600 dark:text-amber-400 mt-1">
                      No untracked pipeline orders available.
                    </p>
                  )}
                </div>
              </section>

              {/* Line Items Card */}
              <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
                <header className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-white/5">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-slate-50">
                        Unbilled Line Items
                      </h3>
                      <p className="text-2xs text-slate-500 dark:text-slate-400">
                        Quantities to track in unbilled balance
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-semibold text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </span>
                </header>

                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 dark:border-white/10">
                    Select a reference order above to auto-populate items, or click &quot;Add Item Line&quot; below.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((row, idx) => (
                      <div
                        key={row.key}
                        className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-slate-955/30"
                      >
                        <div className="grid gap-3 grid-cols-1 lg:grid-cols-12 items-center">
                          {/* Product */}
                          <div className="space-y-1 lg:col-span-6">
                            <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Item #{idx + 1}
                            </span>
                            {rawProducts.length > 0 ? (
                              <ProductAutocomplete
                                products={rawProducts}
                                selectedId={row.productId}
                                onChange={(val) => handleUpdateItemRow(row.key, { productId: val })}
                                className={inputClass}
                              />
                            ) : (
                              <input
                                type="text"
                                value={row.productName}
                                onChange={(e) =>
                                  handleUpdateItemRow(row.key, { productName: e.target.value })
                                }
                                placeholder="Product Name"
                                className={inputClass}
                              />
                            )}
                          </div>

                          {/* Last Qty */}
                          <div className="space-y-1 lg:col-span-2">
                            <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Last Qty
                            </span>
                            <input
                              type="number"
                              readOnly
                              disabled
                              value={row.lastQuantity || 0}
                              className={`${inputClass} bg-slate-100/80 font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-400 cursor-not-allowed`}
                            />
                          </div>

                          {/* Unbilled Qty (Blank) */}
                          <div className="space-y-1 lg:col-span-3">
                            <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Unbilled Qty
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={row.quantity === 0 ? "" : row.quantity}
                              onChange={(e) =>
                                handleUpdateItemRow(row.key, {
                                  quantity: e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)),
                                })
                              }
                              placeholder="Qty"
                              className={inputClass}
                            />
                          </div>

                          {/* Delete Action */}
                          <div className="lg:col-span-1 flex items-end justify-end pb-0.5">
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(row.key)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/95 bg-white text-rose-500 shadow-sm transition hover:bg-rose-50 hover:text-rose-600 dark:border-white/15 dark:bg-slate-950 dark:hover:bg-rose-950/20"
                              title="Remove item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex justify-between items-center border-t border-slate-100 pt-3 dark:border-white/5">
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Item Line
                  </button>
                </div>
              </section>
            </div>

            {/* Right Column: Metadata & Action Sidebar */}
            <div className="space-y-5">
              <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-4">
                <header className="border-b border-slate-100 pb-2.5 dark:border-white/5">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-50">
                    Order Summary &amp; Remarks
                  </h3>
                  <p className="text-2xs text-slate-500 dark:text-slate-400">
                    Complete unbilled order setup
                  </p>
                </header>

                <div className="space-y-1">
                  <label htmlFor="unbilled-remarks" className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Remarks (optional)
                  </label>
                  <textarea
                    id="unbilled-remarks"
                    rows={4}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className={`${inputClass} resize-none`}
                    placeholder="Notes or instructions for unbilled tracking..."
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-white/5 space-y-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || !selectedOrderId}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-cyan-600/25 transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    {isSubmitting
                      ? isEditMode
                        ? "Saving…"
                        : "Adding…"
                      : isEditMode
                        ? "Update Unbilled Order"
                        : "Add Unbilled Order"}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={onClose}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-955 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              </section>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
