"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, X, CheckCircle2 } from "lucide-react";

import {
  MapOrderLinePriceModal,
  type MapOrderLinePriceSuccess,
  type MapOrderLinePriceTarget,
} from "@/components/portal/shared/MapOrderLinePriceModal";
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
  useAmendOrderApprovalMutation,
  usePatchOrderMutation,
  useListProductsQuery,
} from "@/store/api";
import type { CheckOrderRatesItem } from "@/store/api/slices/partyOrderProductsRateApi";
import {
  largeModalBackdropClass,
  largeModalPanelClass,
} from "@/components/portal/shared/modalLayout";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";

type LineStatus = "fully_approved" | "partially_approved" | "rejected";

type EditableLine = {
  order_item_id: string;
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
  approval_status: LineStatus;
  remarks: string;
  isNew?: boolean;
};

type AccountAmendFinanceApprovalModalProps = {
  open: boolean;
  onClose: () => void;
  approval: Record<string, any> | null;
  orderId: string;
  detail: Record<string, any> | null;
  readOnlyItems?: Record<string, any>[];
  refetchOrder?: () => void;
  onAmended?: () => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";

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

function accountOverrideLineStatus(approvedQty: number): LineStatus {
  return approvedQty > 0 ? "fully_approved" : "rejected";
}

function approvalItems(approval: Record<string, any>): Record<string, any>[] {
  return Array.isArray(approval.approval_items)
    ? (approval.approval_items as Record<string, any>[])
    : [];
}

export function AccountAmendFinanceApprovalModal({
  open,
  onClose,
  approval,
  orderId,
  detail,
  readOnlyItems = [],
  refetchOrder,
  onAmended,
}: AccountAmendFinanceApprovalModalProps) {
  const [formLines, setFormLines] = useState<EditableLine[]>([]);
  const [amendmentNotes, setAmendmentNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mapTarget, setMapTarget] = useState<MapOrderLinePriceTarget | null>(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);

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
  const [amendFinanceApproval, { isLoading: isAmending }] =
    useAmendOrderApprovalMutation();
  const [patchOrder, { isLoading: isPatching }] = usePatchOrderMutation();

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

  const addableOrderLines = useMemo(() => {
    if (!approval) return [];
    const inBatch = new Set(
      approvalItems(approval).map((it) => String(it.order_item_id ?? "")),
    );
    return readOnlyItems.filter((line) => {
      const id = String(line._id ?? line.id ?? "");
      return id && !inBatch.has(id);
    });
  }, [approval, readOnlyItems]);

  const initFormLines = useCallback(() => {
    if (!approval) return;
    setFormLines(
      approvalItems(approval).map((it) => {
        const orderItemId = String(it.order_item_id ?? "");
        const orderLine = detail?.order_items?.find((x: any) => String(x._id ?? x.id) === orderItemId) || {};

        const product = it.product as Record<string, unknown> | string | undefined;
        const productId = idFromRef(product);
        const productName =
          typeof product === "object" && product
            ? String(product.product_name ?? "—")
            : String(it.product_name ?? orderLine.product_name ?? "—");

        return {
          order_item_id: orderItemId,
          product: productId,
          product_name: productName,
          sku:
            typeof product === "object" && product
              ? String(product.sku ?? "")
              : String(it.sku ?? orderLine.sku ?? ""),
          ordered_quantity: Number(it.ordered_quantity ?? orderLine.ordered_quantity ?? 0),
          ordered_unit_price: Number(it.ordered_unit_price ?? orderLine.unit_price ?? 0),
          approved_quantity: Number(it.approved_quantity ?? 0),
          approved_unit_price: Number(
            it.approved_unit_price ?? it.ordered_unit_price ?? orderLine.unit_price ?? 0,
          ),
          free_quantity: Number(orderLine.free_quantity ?? 0),
          discount_percent: Number(orderLine.discount_percent ?? 0),
          discount_amount: Number(orderLine.discount_amount ?? 0),
          gst_percent: Number(orderLine.gst_percent ?? 18),
          applied_rate_type: !orderLine.applied_rate_type || orderLine.applied_rate_type === "MANUAL" ? "SR" : String(orderLine.applied_rate_type),
          approval_status: String(
            it.approval_status ?? "fully_approved",
          ) as LineStatus,
          remarks: String(it.remarks ?? ""),
        };
      }),
    );
    setAmendmentNotes("");
    setSearchQuery("");
  }, [approval, detail]);

  useEffect(() => {
    if (open) initFormLines();
  }, [open, initFormLines]);

  const orderLineById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const line of readOnlyItems) {
      map.set(String(line._id ?? line.id ?? ""), line);
    }
    return map;
  }, [readOnlyItems]);

  const updateLine = useCallback(
    (orderItemId: string, patch: Partial<EditableLine>) => {
      setFormLines((prev) =>
        prev.map((line) => {
          if (line.order_item_id !== orderItemId) return line;
          const next = { ...line, ...patch };
          if (patch.approved_quantity !== undefined) {
            const qty = Math.max(0, Number(patch.approved_quantity));
            next.approved_quantity = qty;
            next.ordered_quantity = qty;
            next.approval_status = accountOverrideLineStatus(qty);
          }
          const qty = next.approved_quantity;
          const price = next.approved_unit_price;
          const gross = qty * price;
          if (next.discount_percent > 0) {
            next.discount_amount = (gross * next.discount_percent) / 100;
          } else if (patch.discount_percent !== undefined) {
            next.discount_amount = 0;
          }
          return next;
        }),
      );
    },
    [],
  );

  const addOrderLineToBatch = useCallback((line: Record<string, unknown>) => {
    const orderItemId = String(line._id ?? line.id ?? "");
    const productId = idFromRef(line.product);
    const unitPrice = Number(line.unit_price ?? 0);
    const qty = Number(line.ordered_quantity ?? line.quantity ?? 0);
    setFormLines((prev) => {
      if (prev.some((row) => row.order_item_id === orderItemId)) return prev;
      return [
        ...prev,
        {
          order_item_id: orderItemId,
          product: productId,
          product_name: String(line.product_name ?? "—"),
          sku: String(line.sku ?? ""),
          ordered_quantity: qty,
          ordered_unit_price: unitPrice,
          approved_quantity: qty,
          approved_unit_price: unitPrice,
          free_quantity: Number(line.free_quantity ?? 0),
          discount_percent: Number(line.discount_percent ?? 0),
          discount_amount: Number(line.discount_amount ?? 0),
          gst_percent: Number(line.gst_percent ?? 0),
          applied_rate_type: !line.applied_rate_type || line.applied_rate_type === "MANUAL" ? "SR" : String(line.applied_rate_type),
          approval_status: "fully_approved" as LineStatus,
          remarks: "",
          isNew: true,
        },
      ];
    });
  }, []);

  const handleAddProduct = useCallback((p: Record<string, unknown>) => {
    const productId = String(p._id ?? p.id ?? "");
    const defaultPrice = Number(p.base_price ?? 0);
    const gstPercent = Number(p.gst_percent ?? p.default_gst_rate ?? p.gst_rate ?? 18);
    const lineKey = `new-line-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setFormLines((prev) => {
      if (prev.some((l) => l.product === productId)) {
        toast.error("Product already in the list.");
        return prev;
      }
      return [
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
          approval_status: "fully_approved" as LineStatus,
          remarks: "",
          isNew: true,
        },
      ];
    });
    setSearchQuery("");
  }, []);

  const removeLine = useCallback((orderItemId: string) => {
    setFormLines((prev) => prev.filter((line) => line.order_item_id !== orderItemId));
  }, []);

  const resolvePriceForLine = useCallback(
    (
      productId: string,
      rateType: string,
      catalogProduct: Record<string, unknown> | undefined,
    ) => {
      const rateItem = productId
        ? rateItemByLine.get(rateLookupKey(productId, rateType))
        : undefined;
      return resolveLineUnitPrice(rateItem, catalogProduct, rateType);
    },
    [rateItemByLine],
  );

  const onRateTypeChange = useCallback(
    (orderItemId: string, rateType: string) => {
      setFormLines((prev) =>
        prev.map((line) => {
          if (line.order_item_id !== orderItemId) return line;
          const p = products.find(
            (x) =>
              String(
                (x as { _id?: unknown })._id ?? (x as { id?: unknown }).id ?? ""
              ) === String(line.product)
          ) as Record<string, unknown> | undefined;
          const price = resolvePriceForLine(line.product, rateType, p);
          return {
            ...line,
            applied_rate_type: rateType,
            approved_unit_price: price,
          };
        })
      );
    },
    [products, resolvePriceForLine]
  );

  const openMapModal = useCallback(
    (line: EditableLine) => {
      const partyId = idFromRef(detail?.party);
      if (!partyId) {
        toast.error("No party linked to this order.");
        return;
      }
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
    [detail, rateItemByLine],
  );

  const handleMapPriceSuccess = useCallback(
    async (result: MapOrderLinePriceSuccess) => {
      if (!orderId || !detail || !Array.isArray(detail.order_items)) return;

      const existsOnOrder = (detail.order_items as Record<string, unknown>[]).some(
        (item) => idFromRef(item.product) === result.productId
      );

      if (existsOnOrder) {
        const orderItems = (detail.order_items as Record<string, unknown>[]).map(
          (item) => {
            const pid = idFromRef(item.product);
            if (pid === result.productId) {
              return {
                ...item,
                unit_price: result.negotiatedRate,
                applied_rate_type: result.appliedRateType,
                manual_price_override: false,
              };
            }
            return item;
          },
        );
        try {
          await patchOrder({ id: orderId, patch: { order_items: orderItems } }).unwrap();
          refetchOrder?.();
        } catch (rejected) {
          toast.error(mutationRejectedMessage(rejected));
          return;
        }
      }

      setFormLines((prev) =>
        prev.map((line) =>
          line.product === result.productId
            ? {
                ...line,
                approved_unit_price: result.negotiatedRate,
                applied_rate_type: result.appliedRateType,
              }
            : line,
        ),
      );
      toast.success("Rate mapped and price updated.");
      if (!rateCheckQ.isUninitialized) {
        void rateCheckQ.refetch();
      }
    },
    [detail, orderId, patchOrder, rateCheckQ, refetchOrder],
  );

  const submitAmendment = useCallback(async () => {
    if (!approval) return;
    const approvalId = String(approval._id ?? approval.id ?? "");
    if (!approvalId) return;
    const isAccountApproved = Boolean(approval.is_account_approved);

    for (const line of formLines) {
      if (!line.product) {
        toast.error("Please select a product for all catalog lines.");
        return;
      }
      if (line.approved_quantity < 0) {
        toast.error(`Quantity for ${line.product_name} cannot be negative.`);
        return;
      }
      if (line.approved_unit_price < 0) {
        toast.error(`Price for ${line.product_name} cannot be negative.`);
        return;
      }
      if (line.free_quantity < 0) {
        toast.error(`Free quantity for ${line.product_name} cannot be negative.`);
        return;
      }
      if (line.discount_percent < 0 || line.discount_percent > 100) {
        toast.error(`Discount % for ${line.product_name} must be between 0 and 100.`);
        return;
      }
    }

    const activeLines = formLines.filter(
      (line) => line.product && line.approved_quantity > 0,
    );
    if (activeLines.length === 0) {
      toast.error("Add at least one item with quantity greater than zero.");
      return;
    }

    const existingLines = activeLines.filter((line) => !line.isNew);
    const newLines = activeLines.filter((line) => line.isNew);

    const unmapped = activeLines.filter((line) => {
      if (line.approved_quantity <= 0) return false;
      const source = orderLineById.get(line.order_item_id);
      const rateType = String(source?.applied_rate_type ?? line.applied_rate_type ?? "SR");
      const rateItem = rateItemByLine.get(rateLookupKey(line.product, rateType));
      return resolveRateDisplayStatus(rateItem) !== "negotiated";
    });
    if (unmapped.length > 0) {
      toast.error(
        `${unmapped.length} active line(s) need negotiated mapped rates before ${isAccountApproved ? "amending" : "approving"}.`,
      );
      return;
    }

    try {
      await amendFinanceApproval({
        id: approvalId,
        body: {
          amendment_notes: amendmentNotes.trim() || undefined,
          approval_notes: amendmentNotes.trim() || undefined,
          approval_items: existingLines.map((line) => {
            const gross = line.approved_quantity * line.approved_unit_price;
            const disc = line.discount_percent > 0 ? (gross * line.discount_percent) / 100 : line.discount_amount;
            const taxable = Math.max(0, gross - disc);
            const lineTotal = taxable + (taxable * line.gst_percent) / 100;

            return {
              order_item_id: line.order_item_id,
              product: line.product,
              ordered_quantity: line.approved_quantity,
              approved_quantity: line.approved_quantity,
              approved_unit_price: line.approved_unit_price,
              free_quantity: line.free_quantity,
              discount_percent: line.discount_percent,
              discount_amount: disc,
              gst_percent: line.gst_percent,
              applied_rate_type: line.applied_rate_type,
              approved_total_amount: lineTotal,
              approval_status: "fully_approved" as LineStatus,
              rate_mapped: true,
              remarks: line.remarks.trim(),
            };
          }),
          new_items: newLines.map((line) => {
            const gross = line.approved_quantity * line.approved_unit_price;
            const disc = line.discount_percent > 0 ? (gross * line.discount_percent) / 100 : line.discount_amount;

            return {
              order_item_id:
                line.order_item_id.startsWith("new-line-") ||
                line.order_item_id.startsWith("new-catalog-")
                  ? undefined
                  : line.order_item_id,
              product: line.product,
              approved_quantity: line.approved_quantity,
              approved_unit_price: line.approved_unit_price,
              free_quantity: line.free_quantity,
              discount_percent: line.discount_percent,
              discount_amount: disc,
              gst_percent: line.gst_percent,
              applied_rate_type: line.applied_rate_type,
              approval_status: "fully_approved" as LineStatus,
              rate_mapped: true,
              remarks: line.remarks.trim(),
            };
          }),
        },
      }).unwrap();

      toast.success(
        isAccountApproved
          ? "Account clearance amended successfully."
          : "Order account-approved successfully.",
      );
      onClose();
      onAmended?.();
      
      const tasks: Promise<any>[] = [];
      if (refetchOrder) {
        const res = refetchOrder() as unknown;
        if (res instanceof Promise) tasks.push(res);
      }
      if (!rateCheckQ.isUninitialized) {
        tasks.push(rateCheckQ.refetch() as any);
      }
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [
    approval,
    formLines,
    amendmentNotes,
    amendFinanceApproval,
    orderLineById,
    rateItemByLine,
    onClose,
    onAmended,
    refetchOrder,
    rateCheckQ,
  ]);

  const busy = isAmending || isPatching;
  if (!open || !approval) return null;

  const approvalNo = String(approval.approval_no ?? "—");
  const isAccountApproved = Boolean(approval.is_account_approved);
  const modalTitle = isAccountApproved ? "Amend account clearance" : "Approve order";
  const modalDescription = isAccountApproved
    ? `${approvalNo} — update quantities, rates, or items. Changes sync to the approval batch and order.`
    : `${approvalNo} — review finance-cleared items, then approve. Order and workflow update after submission.`;
  const notesLabel = isAccountApproved ? "Amendment notes" : "Approval notes";
  const notesPlaceholder = isAccountApproved
    ? "Reason for account amendment…"
    : "Optional notes for this account approval…";
  const submitLabel = isAccountApproved ? "Amend" : "Approve";
  const SubmitIcon = isAccountApproved ? Pencil : CheckCircle2;

  return (
    <LargeModalPortal>
    <>
      <div className={largeModalBackdropClass}>
        <div className={largeModalPanelClass}>
          <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 dark:border-white/5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                {modalTitle}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {modalDescription}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void submitAmendment();
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
                    disabled={busy}
                    className={`${inputClass} pl-9 py-2.5 text-sm`}
                  />
                  {searchQuery.trim() !== "" && (
                    <div className="absolute left-0 right-0 z-[90] mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-white/15 dark:bg-slate-950">
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
                                  <span className="ml-2 text-2xs text-slate-400 font-mono">
                                    ({String(p.sku)})
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-slate-500">
                                ₹{Number(p.base_price ?? 0).toFixed(2)}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200/90 dark:border-white/10">
                <table className="w-full min-w-[1300px] text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950">
                    <tr>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium text-right">Batch Qty</th>
                      <th className="px-3 py-2 font-medium">Rate Status</th>
                      <th className="px-3 py-2 font-medium text-right">Approve Qty</th>
                      <th className="px-3 py-2 font-medium text-right">Free Qty</th>
                      <th className="px-3 py-2 font-medium">Rate Type</th>
                      <th className="px-3 py-2 font-medium text-right">Unit Price</th>
                      <th className="px-3 py-2 font-medium text-right">Disc %</th>
                      <th className="px-3 py-2 font-medium text-right">GST %</th>
                      <th className="px-3 py-2 font-medium text-right">Net Total</th>
                      <th className="px-3 py-2 font-medium">Map</th>
                      <th className="px-3 py-2 font-medium">Remarks</th>
                      <th className="px-3 py-2 font-medium text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                    {formLines.map((line) => {
                      const source = orderLineById.get(line.order_item_id);
                      const rateType = String(source?.applied_rate_type ?? line.applied_rate_type ?? "SR");
                      const rateItem = rateItemByLine.get(
                        rateLookupKey(line.product, rateType),
                      );

                      const qty = line.approved_quantity;
                      const price = line.approved_unit_price;
                      const gross = qty * price;
                      const disc = line.discount_percent > 0 ? (gross * line.discount_percent) / 100 : line.discount_amount;
                      const taxable = Math.max(0, gross - disc);
                      const gstAmt = (taxable * line.gst_percent) / 100;
                      const lineTotal = taxable + gstAmt;

                      return (
                        <tr key={line.order_item_id} className="bg-white dark:bg-slate-900">
                          <td className="px-3 py-2">
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {line.product_name}
                              {line.isNew ? (
                                <span className="ml-1.5 text-2xs font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 px-1 py-0.5 rounded">
                                  NEW
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {line.ordered_quantity}
                          </td>
                          <td className="px-3 py-2">
                            {line.product ? (
                              <LineRateStatusBadge
                                status={resolveRateDisplayStatus(rateItem)}
                                rateItem={rateItem}
                                formatMoney={(v) =>
                                  Number(v) > 0 ? `₹${Number(v).toFixed(2)}` : "—"
                                }
                              />
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2 w-20">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={line.approved_quantity}
                              disabled={busy || !line.product}
                              onChange={(e) =>
                                updateLine(line.order_item_id, {
                                  approved_quantity: Number(e.target.value),
                                })
                              }
                              className={inputClass}
                            />
                          </td>
                          <td className="px-3 py-2 w-20">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={line.free_quantity}
                              disabled={busy || !line.product}
                              onChange={(e) =>
                                updateLine(line.order_item_id, {
                                  free_quantity: Number(e.target.value),
                                })
                              }
                              className={inputClass}
                            />
                          </td>
                          <td className="px-3 py-2 w-24">
                            <select
                              value={line.applied_rate_type}
                              disabled={busy || !line.product}
                              onChange={(e) =>
                                onRateTypeChange(line.order_item_id, e.target.value)
                              }
                              className={inputClass}
                            >
                              <option value="SR">SR</option>
                              <option value="SRA">SRA</option>
                              <option value="CR">CR</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 w-24">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={line.approved_unit_price}
                              disabled={busy || !line.product}
                              onChange={(e) =>
                                updateLine(line.order_item_id, {
                                  approved_unit_price: Number(e.target.value),
                                })
                              }
                              className={inputClass}
                            />
                          </td>
                          <td className="px-3 py-2 w-20">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              value={line.discount_percent}
                              disabled={busy || !line.product}
                              onChange={(e) =>
                                updateLine(line.order_item_id, {
                                  discount_percent: Number(e.target.value),
                                })
                              }
                              className={inputClass}
                            />
                          </td>
                          <td className="px-3 py-2 w-20">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="1"
                              value={line.gst_percent}
                              disabled={busy || !line.product}
                              onChange={(e) =>
                                updateLine(line.order_item_id, {
                                  gst_percent: Number(e.target.value),
                                })
                              }
                              className={inputClass}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100 bg-slate-50/15 dark:bg-slate-950/15">
                            ₹{lineTotal.toFixed(2)}
                          </td>
                          <td className="px-3 py-2">
                            {line.product ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => openMapModal(line)}
                                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                title="Map negotiated rate for this party/product rate type combination"
                              >
                                <Pencil className="h-3 w-3" />
                                <span>Map</span>
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              placeholder="Remarks"
                              value={line.remarks}
                              disabled={busy}
                              onChange={(e) =>
                                updateLine(line.order_item_id, { remarks: e.target.value })
                              }
                              className={inputClass}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeLine(line.order_item_id)}
                              disabled={busy}
                              className="text-slate-400 transition hover:text-red-650 disabled:opacity-50 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {addableOrderLines.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Add Existing Order Lines Not In Finance Approval:
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {addableOrderLines.map((line) => (
                      <button
                        key={String(line._id ?? line.id)}
                        type="button"
                        onClick={() => addOrderLineToBatch(line)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-350 dark:hover:bg-slate-900"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{line.product_name || "—"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-1">
                <div className="space-y-1">
                  <label htmlFor="amendmentNotes" className={labelClass}>{notesLabel}</label>
                  <textarea
                    id="amendmentNotes"
                    rows={3}
                    placeholder={notesPlaceholder}
                    value={amendmentNotes}
                    onChange={(e) => setAmendmentNotes(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-white/5 dark:bg-slate-950/40">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  busy ||
                  formLines.filter((l) => l.product && l.approved_quantity > 0).length === 0
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                <SubmitIcon className="h-4 w-4" />
                {busy ? "Saving…" : submitLabel}
              </button>
            </div>
          </form>
        </div>
      </div>

      <MapOrderLinePriceModal
        open={mapModalOpen}
        onClose={() => {
          setMapModalOpen(false);
          setMapTarget(null);
        }}
        partyId={partyId}
        target={mapTarget}
        onSuccess={handleMapPriceSuccess}
      />
    </>
    </LargeModalPortal>
  );
}
