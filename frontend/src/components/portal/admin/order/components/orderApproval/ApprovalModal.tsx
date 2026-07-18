"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Search, Trash2, X } from "lucide-react";

import {
  LineRateStatusBadge,
  rateLookupKey,
  resolveRateDisplayStatus,
  resolveLineUnitPrice,
} from "@/components/portal/shared/orderLineRateDisplay";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCheckPartyLineRatesQuery,
  useCreateOrderApprovalMutation,
  useListProductsQuery,
  useGetPartyQuery,
} from "@/store/api";
import type { CheckOrderRatesItem } from "@/store/api/slices/partyOrderProductsRateApi";
import { contactsFromParty } from "@/lib/partyContacts";
import {
  MapOrderLinePriceModal,
  type MapOrderLinePriceSuccess,
  type MapOrderLinePriceTarget,
} from "@/components/portal/shared/MapOrderLinePriceModal";
import {
  largeModalBackdropClass,
  largeModalPanelClass,
} from "@/components/portal/shared/modalLayout";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";

type ApprovalLineStatus =
  | "fully_approved"
  | "partially_approved"
  | "rejected";

type EditableLine = {
  order_item_id: string; // Will hold order item _id, or a temp new-line-* key
  product: string;
  product_name: string;
  sku: string;
  ordered_quantity: number;
  ordered_unit_price: number;
  approved_quantity: number;
  approved_unit_price: number;
  free_quantity: number;
  discount_percent: number;
  discount_amount: number;
  gst_percent: number;
  applied_rate_type: string;
  approval_status: ApprovalLineStatus;
  remarks: string;
  isNew?: boolean;
};

type ApprovalModalProps = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  readOnlyItems: Record<string, unknown>[];
  refetchOrder?: () => void;
  orderStatus?: string;
  detail?: Record<string, unknown> | null;
  onApproved?: () => void;
};

function idFromRef(ref: unknown): string {
  if (typeof ref === "string") return ref.trim();
  if (ref && typeof ref === "object" && "_id" in ref) {
    return String((ref as { _id: unknown })._id ?? "").trim();
  }
  if (ref && typeof ref === "object" && "id" in ref) {
    return String((ref as { id: unknown }).id ?? "").trim();
  }
  return "";
}

function formatMoney(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";

function lineGross(line: EditableLine): number {
  return line.ordered_quantity * line.approved_unit_price;
}

function lineDiscount(line: EditableLine): number {
  const gross = lineGross(line);
  if (line.discount_percent > 0) return (gross * line.discount_percent) / 100;
  return line.discount_amount;
}

function lineTaxable(line: EditableLine): number {
  return Math.max(0, lineGross(line) - lineDiscount(line));
}

function lineGst(line: EditableLine): number {
  return (lineTaxable(line) * line.gst_percent) / 100;
}

function lineTotal(line: EditableLine): number {
  return lineTaxable(line) + lineGst(line);
}

export function ApprovalModal({
  open,
  onClose,
  orderId,
  readOnlyItems,
  refetchOrder,
  orderStatus = "",
  detail = null,
  onApproved,
}: ApprovalModalProps) {
  const [formLines, setFormLines] = useState<EditableLine[]>([]);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const partyId = useMemo(() => idFromRef(detail?.party), [detail]);

  const lineRateCheckInput = useMemo(() => {
    if (!partyId) return null;
    const items = formLines
      .filter((l) => l.product)
      .map((l) => ({
        product: l.product,
        applied_rate_type: l.applied_rate_type,
        product_name: l.product_name,
        sku: l.sku,
        unit_price: l.approved_unit_price,
      }));
    if (!items.length) return null;
    return { party: partyId, items };
  }, [partyId, formLines]);

  const rateCheckQ = useCheckPartyLineRatesQuery(lineRateCheckInput!, {
    skip: !open || !lineRateCheckInput,
  });

  const productsQ = useListProductsQuery({}, { skip: !open });

  const [createAdminApproval, { isLoading: isCreating }] =
    useCreateOrderApprovalMutation();

  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const { data: partyData } = useGetPartyQuery(partyId ?? "", {
    skip: !open || !partyId,
  });
  const contacts = useMemo(() => contactsFromParty(partyData), [partyData]);

  useEffect(() => {
    if (open && contacts.length > 0) {
      const firstWithPhone = contacts.find((c) => c.phone.trim());
      if (firstWithPhone) {
        setSelectedContacts([firstWithPhone.phone.trim()]);
      } else {
        setSelectedContacts([]);
      }
    } else if (!open) {
      setSelectedContacts([]);
    }
  }, [open, contacts]);

  // Price mapping states
  const [mapTarget, setMapTarget] = useState<MapOrderLinePriceTarget | null>(
    null,
  );
  const [mapModalOpen, setMapModalOpen] = useState(false);

  const canMapPrice =
    (orderStatus === "submitted" || orderStatus === "on_hold") && Boolean(partyId);

  const rateItemByLine = useMemo(() => {
    const map = new Map<string, CheckOrderRatesItem>();
    for (const item of rateCheckQ.data?.items ?? []) {
      map.set(rateLookupKey(item.product, item.applied_rate_type), item);
    }
    return map;
  }, [rateCheckQ.data]);

  const products = useMemo(() => {
    if (!productsQ.data) return [];
    if (Array.isArray(productsQ.data)) return productsQ.data as Record<string, unknown>[];
    const o = productsQ.data as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
    return [];
  }, [productsQ.data]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      const name = String(p.product_name || "").toLowerCase();
      const sku = String(p.sku || "").toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [searchQuery, products]);

  const initFormLines = useCallback(() => {
    setFormLines(
      readOnlyItems.map((line) => {
        const unitPrice = Number(line.unit_price ?? 0);
        const orderedQty = Number(line.ordered_quantity ?? line.quantity ?? 0);
        return {
          order_item_id: String(line._id ?? line.id ?? ""),
          product: idFromRef(line.product),
          product_name: String(line.product_name ?? "—"),
          sku: typeof line.sku === "string" ? line.sku : "",
          ordered_quantity: orderedQty,
          ordered_unit_price: unitPrice,
          approved_quantity: orderedQty,
          approved_unit_price: unitPrice,
          free_quantity: Number(line.free_quantity ?? line.free_qty ?? 0),
          discount_percent: Number(line.discount_percent ?? 0),
          discount_amount: Number(line.discount_amount ?? 0),
          gst_percent: Number(line.gst_percent ?? 18),
          applied_rate_type: !line.applied_rate_type || line.applied_rate_type === "MANUAL" ? "SR" : String(line.applied_rate_type),
          approval_status: "fully_approved" as ApprovalLineStatus,
          remarks: "",
        };
      }),
    );
    setApprovalNotes("Approved by admin after rate review.");
    setSearchQuery("");
  }, [readOnlyItems]);

  useEffect(() => {
    if (open) initFormLines();
  }, [open, initFormLines]);

  const unmappedActiveLines = useMemo(() => {
    return formLines.filter((line) => {
      if (!line.product) return true;
      const rateItem = rateItemByLine.get(rateLookupKey(line.product, line.applied_rate_type));
      return resolveRateDisplayStatus(rateItem) !== "negotiated";
    });
  }, [formLines, rateItemByLine]);

  const approvedTotal = useMemo(
    () =>
      formLines.reduce(
        (sum, line) => sum + lineTotal(line),
        0,
      ),
    [formLines],
  );

  const openMapModal = useCallback(
    (line: EditableLine) => {
      if (!canMapPrice || !line.product) return;
      const appliedRateType = line.applied_rate_type || "SR";
      const rateItem = rateItemByLine.get(
        rateLookupKey(line.product, appliedRateType),
      );
      setMapTarget({
        productId: line.product,
        productName: line.product_name,
        sku: line.sku || undefined,
        appliedRateType,
        unitPrice: line.approved_unit_price,
        mappingId: rateItem?.mappingId ?? null,
        isMapped: Boolean(rateItem?.isMapped),
        hasRate: Boolean(rateItem?.hasRate),
      });
      setMapModalOpen(true);
    },
    [canMapPrice, rateItemByLine],
  );

  const closeMapModal = useCallback(() => {
    setMapModalOpen(false);
    setMapTarget(null);
  }, []);

  const handleMapPriceSuccess = useCallback(
    async (result: MapOrderLinePriceSuccess) => {
      setFormLines((prev) =>
        prev.map((line) => {
          if (line.product === result.productId && line.applied_rate_type === result.appliedRateType) {
            return {
              ...line,
              ordered_unit_price: result.negotiatedRate,
              approved_unit_price: result.negotiatedRate,
            };
          }
          return line;
        })
      );
      toast.success("Rate mapped and price updated in preview.");
      if (!rateCheckQ.isUninitialized) {
        void rateCheckQ.refetch();
      }
    },
    [rateCheckQ],
  );

  const handleAddProduct = (p: Record<string, unknown>) => {
    const productId = String(p._id ?? p.id ?? "");
    if (formLines.some((l) => l.product === productId)) {
      toast.error("Product already in the list.");
      return;
    }
    const defaultPrice = Number(p.base_price ?? 0);
    const gstPercent = Number(p.gst_percent ?? p.default_gst_rate ?? p.gst_rate ?? 18);
    const lineKey = `new-line-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setFormLines((prev) => [
      ...prev,
      {
        order_item_id: lineKey,
        product: productId,
        product_name: String(p.product_name ?? "—"),
        sku: String(p.sku ?? ""),
        ordered_quantity: 1,
        ordered_unit_price: defaultPrice,
        approved_quantity: 1,
        approved_unit_price: defaultPrice,
        free_quantity: 0,
        discount_percent: 0,
        discount_amount: 0,
        gst_percent: gstPercent,
        applied_rate_type: "SR",
        approval_status: "fully_approved" as ApprovalLineStatus,
        remarks: "",
        isNew: true,
      },
    ]);
    setSearchQuery("");
  };

  const handleRemoveProduct = (orderItemId: string) => {
    setFormLines((prev) => prev.filter((l) => l.order_item_id !== orderItemId));
  };

  const updateLine = (orderItemId: string, patch: Partial<EditableLine>) => {
    setFormLines((prev) =>
      prev.map((line) => {
        if (line.order_item_id !== orderItemId) return line;
        const next = { ...line, ...patch };
        if (patch.ordered_quantity !== undefined) {
          next.approved_quantity = patch.ordered_quantity;
        }
        return next;
      })
    );
  };

  const onRateTypeChange = (orderItemId: string, rateType: string) => {
    setFormLines((prev) =>
      prev.map((line) => {
        if (line.order_item_id !== orderItemId) return line;
        const p = products.find(
          (x) => String(x._id ?? x.id ?? "") === line.product
        ) as Record<string, unknown> | undefined;
        const price = resolveLineUnitPrice(
          rateItemByLine.get(rateLookupKey(line.product, rateType)),
          p,
          rateType
        );
        return {
          ...line,
          applied_rate_type: rateType,
          ordered_unit_price: price,
          approved_unit_price: price,
        };
      })
    );
  };

  const submitApproval = useCallback(async () => {
    if (!orderId) return;

    if (formLines.length === 0) {
      toast.error("Order must have at least one product line.");
      return;
    }

    if (unmappedActiveLines.length > 0) {
      toast.error(
        "All lines must have negotiated mapped rates before creating approval.",
      );
      return;
    }

    const orderItemsPayload = formLines.map((line) => {
      const item: Record<string, unknown> = {
        product: line.product,
        product_name: line.product_name,
        sku: line.sku || "",
        ordered_quantity: line.ordered_quantity,
        free_quantity: line.free_quantity,
        unit_price: line.approved_unit_price,
        discount_percent: line.discount_percent,
        discount_amount: line.discount_amount,
        gst_percent: line.gst_percent,
        applied_rate_type: line.applied_rate_type,
        remarks: line.remarks.trim() || "",
      };
      if (line.order_item_id && !line.order_item_id.startsWith("new-line-")) {
        item._id = line.order_item_id;
      }
      return item;
    });

    const approvalItems = formLines.map((line) => ({
      product: line.product,
      ...(line.order_item_id.startsWith("new-line-")
        ? {}
        : { order_item_id: line.order_item_id }),
      ordered_quantity: line.ordered_quantity,
      approved_quantity: line.ordered_quantity,
      approved_unit_price: line.approved_unit_price,
      ordered_unit_price: line.approved_unit_price,
      free_quantity: line.free_quantity,
      discount_percent: line.discount_percent,
      discount_amount: line.discount_amount,
      gst_percent: line.gst_percent,
      applied_rate_type: line.applied_rate_type,
      approved_total_amount: lineTotal(line),
      approval_status: "fully_approved" as ApprovalLineStatus,
      remarks: line.remarks.trim() || "",
    }));

    const selectedContactNames = selectedContacts.map((phone) => {
      const found = contacts.find((c) => c.phone.trim() === phone);
      return found ? found.name : "";
    }).filter(Boolean);

    try {
      await createAdminApproval({
        order: orderId,
        approve_immediately: true,
        replace_snapshot: true,
        order_items: orderItemsPayload,
        approval_notes: approvalNotes.trim() || undefined,
        approved_total_amount: approvedTotal,
        approval_items: approvalItems,
        contact_number: selectedContacts,
        contact_name: selectedContactNames,
      }).unwrap();

      toast.success("Order and approval updated successfully.");
      onClose();
      onApproved?.();

      if (refetchOrder) {
        const res = refetchOrder() as unknown;
        if (res instanceof Promise) await res;
      }
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [
    orderId,
    formLines,
    unmappedActiveLines.length,
    approvalNotes,
    approvedTotal,
    createAdminApproval,
    onClose,
    onApproved,
    refetchOrder,
    selectedContacts,
    contacts,
  ]);

  const busy = isCreating;

  if (!open) return null;

  return (
    <LargeModalPortal>
    <div className={largeModalBackdropClass}>
      <div className={largeModalPanelClass}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 dark:border-white/5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Create and Modify Approval
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Edit the full order line list, verify negotiated rates, then save order and approval together.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void submitApproval();
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Search Input for Adding Items */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Add Items from Catalog
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search product name or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`${inputClass} pl-9 py-2.5 text-sm`}
                />
                {searchQuery.trim() !== "" && (
                  <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-white/15 dark:bg-slate-950">
                    {filteredProducts.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-500">No products found</div>
                    ) : (
                      filteredProducts.map((p) => {
                        const id = String(p._id ?? p.id ?? "");
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => handleAddProduct(p)}
                            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer border-b border-slate-100 last:border-0 dark:border-white/5"
                          >
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {String(p.product_name)}
                              </span>
                              {Boolean(p.sku) && (
                                <span className="ml-2 text-[10px] text-slate-400 font-mono">
                                  ({String(p.sku)})
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-slate-500">₹{Number(p.base_price ?? 0).toFixed(2)}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Items: {formLines.length} · Net Total{" "}
                <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                  ₹{formatMoney(approvedTotal)}
                </span>
              </p>
            </div>

            {unmappedActiveLines.length > 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                {unmappedActiveLines.length} line(s) need negotiated mapped rates. Use inline <b>Map</b> buttons to map rates.
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-slate-200/90 dark:border-white/10">
              <table className="w-full min-w-[1250px] text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950">
                  <tr>
                    <th className="px-3 py-2 font-medium w-8 text-center"></th>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium w-24 text-right">Qty</th>
                    <th className="px-3 py-2 font-medium w-24 text-right">Free Qty</th>
                    <th className="px-3 py-2 font-medium w-28">Rate Type</th>
                    <th className="px-3 py-2 font-medium w-28 text-right">Unit Price (₹)</th>
                    <th className="px-3 py-2 font-medium w-24 text-right">Disc %</th>
                    <th className="px-3 py-2 font-medium w-20 text-right">GST %</th>
                    <th className="px-3 py-2 font-medium">Rate Status</th>
                    <th className="px-3 py-2 font-medium text-right">Line Total (₹)</th>
                    <th className="px-3 py-2 font-medium">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                  {formLines.map((line) => {
                    const rateItem = rateItemByLine.get(
                      rateLookupKey(line.product, line.applied_rate_type),
                    );
                    const rateStatus = resolveRateDisplayStatus(rateItem);

                    return (
                      <tr
                        key={line.order_item_id}
                        className="bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-900/50"
                      >
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(line.order_item_id)}
                            disabled={busy}
                            className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded transition-colors cursor-pointer disabled:opacity-50"
                            title="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {line.product_name}
                            {line.isNew && (
                              <span className="ml-1.5 text-[9px] font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-1 py-0.5 rounded">
                                NEW
                              </span>
                            )}
                          </span>
                          {line.sku ? (
                            <span className="mt-0.5 block text-[10px] text-slate-500 font-mono">
                              {line.sku}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={line.ordered_quantity}
                            disabled={busy}
                            onChange={(e) =>
                              updateLine(line.order_item_id, {
                                ordered_quantity: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={line.free_quantity}
                            disabled={busy}
                            onChange={(e) =>
                              updateLine(line.order_item_id, {
                                free_quantity: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={line.applied_rate_type}
                            disabled={busy}
                            onChange={(e) => onRateTypeChange(line.order_item_id, e.target.value)}
                            className={inputClass}
                          >
                            <option value="SR">SR</option>
                            <option value="SRA">SRA</option>
                            <option value="CR">CR</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.approved_unit_price}
                            disabled={busy}
                            onChange={(e) =>
                              updateLine(line.order_item_id, {
                                approved_unit_price: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={line.discount_percent}
                            disabled={busy}
                            onChange={(e) =>
                              updateLine(line.order_item_id, {
                                discount_percent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                              })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="1"
                            value={line.gst_percent}
                            disabled={busy}
                            onChange={(e) =>
                              updateLine(line.order_item_id, {
                                gst_percent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                              })
                            }
                            className={inputClass}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <LineRateStatusBadge
                              status={rateStatus}
                              rateItem={rateItem}
                              formatMoney={(v) =>
                                Number(v) > 0 ? Number(v).toFixed(2) : "—"
                              }
                            />
                            {canMapPrice && line.product && (
                              <button
                                type="button"
                                onClick={() => openMapModal(line)}
                                disabled={busy}
                                className="inline-flex items-center justify-center rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer transition-colors"
                              >
                                Map
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100 bg-slate-50/20 dark:bg-slate-950/20">
                          {formatMoney(lineTotal(line))}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={line.remarks}
                            placeholder="Line remarks..."
                            disabled={busy}
                            onChange={(e) =>
                              updateLine(line.order_item_id, {
                                remarks: e.target.value,
                              })
                            }
                            className={inputClass}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-1.5">
              <label className={labelClass}>Approval notes</label>
              <textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                rows={3}
                disabled={busy}
                className={inputClass}
                placeholder="Notes for the approval record…"
              />
            </div>

            {contacts.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-white/5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Send WhatsApp Notification
                </label>
                <p className="text-[10px] text-slate-450 dark:text-slate-400">
                  Select contacts to receive WhatsApp approval notification:
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {contacts.map((contact, index) => {
                    const phone = contact.phone.trim();
                    const hasPhone = Boolean(phone);
                    return (
                      <label
                        key={`${phone}-${index}`}
                        className={`flex items-start gap-2.5 rounded-lg border p-2.5 transition ${
                          !hasPhone
                            ? "opacity-50 cursor-not-allowed border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/50"
                            : "hover:bg-slate-50/50 dark:hover:bg-white/5 cursor-pointer border-slate-200 dark:border-white/10"
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={!hasPhone || busy}
                          checked={hasPhone && selectedContacts.includes(phone)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedContacts((prev) => [...prev, phone]);
                            } else {
                              setSelectedContacts((prev) => prev.filter((p) => p !== phone));
                            }
                          }}
                          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1 text-xs">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {contact.name || "Unnamed Contact"}
                          </p>
                          {contact.department && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
                              {contact.department}
                            </p>
                          )}
                          <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {phone || "No phone number"}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 dark:border-white/5">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              One request updates order lines, creates the approval, and queues fulfillment sync.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-slate-200/95 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || unmappedActiveLines.length > 0 || formLines.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                {busy ? "Approving…" : "Approve"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {partyId && (
        <MapOrderLinePriceModal
          open={mapModalOpen}
          onClose={closeMapModal}
          partyId={partyId}
          target={mapTarget}
          onSuccess={handleMapPriceSuccess}
        />
      )}
    </div>
    </LargeModalPortal>
  );
}

export default ApprovalModal;
