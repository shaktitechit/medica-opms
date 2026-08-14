"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Search, Trash2, X, Plus, Pencil, Check } from "lucide-react";

import {
  LineRateStatusBadge,
  applyNegotiatedRatesToApprovedPrices,
  normalizeRateTypeForLookup,
  rateLookupKey,
  resolveRateDisplayStatus,
  resolveLineUnitPrice,
} from "@/components/portal/shared/orderLineRateDisplay";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCheckPartyLineRatesQuery,
  useCreateOrderApprovalMutation,
  useApproveOrderApprovalMutation,
  useAmendOrderApprovalMutation,
  useFinanceAmendOrderApprovalMutation,
  usePatchOrderMutation,
  useListProductsQuery,
  useListProductKitItemsQuery,
  useCreateProductKitItemMutation,
  useAddProductKitItemLineMutation,
  usePatchProductKitItemLineMutation,
  useDeleteProductKitItemLineMutation,
  useGetPartyQuery,
  type ProductKitItemRecord,
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
import { ConfirmRemoveKitItemModal } from "@/components/portal/shared/ConfirmRemoveKitItemModal";

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

export type ApprovalMode = "admin" | "finance" | "account";

type ApprovalModalProps = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  readOnlyItems: any[];
  refetchOrder?: () => void;
  orderStatus?: string;
  detail?: any;
  onApproved?: () => void; // alias for success
  onSuccess?: () => void;
  mode?: ApprovalMode;
  approval?: Record<string, any> | null;
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

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

/** Kit component qty from kit line qty using percentage scale (÷ 100). */
function kitBucketItemQty(kitQty: number, percentage: number): number {
  const k = Number(kitQty);
  const pct = Number(percentage);
  if (!Number.isFinite(k) || k <= 0 || !Number.isFinite(pct) || pct <= 0) {
    return 0;
  }
  return Math.round((k * pct) / 100);
}

function kitComponentLabel(ref: unknown): {
  name: string;
  sku: string;
} {
  if (!ref) return { name: "—", sku: "" };
  if (typeof ref === "string") return { name: ref, sku: "" };
  if (typeof ref === "object") {
    const o = ref as {
      product_name?: string;
      _id?: string;
      sku?: string;
    };
    return {
      name: String(o.product_name || o._id || "—"),
      sku: String(o.sku || ""),
    };
  }
  return { name: "—", sku: "" };
}

function hasKitParent(ref: unknown): boolean {
  return Boolean(idFromRef(ref));
}

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";

function accountOverrideLineStatus(approvedQty: number): ApprovalLineStatus {
  return approvedQty > 0 ? "fully_approved" : "rejected";
}

function approvalItems(approval: Record<string, any>): Record<string, any>[] {
  return Array.isArray(approval.approval_items)
    ? (approval.approval_items as Record<string, any>[])
    : [];
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
  onSuccess,
  mode = "admin",
  approval = null,
}: ApprovalModalProps) {
  const [formLines, setFormLines] = useState<EditableLine[]>([]);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const partyId = useMemo(() => idFromRef(detail?.party), [detail]);
  const approvalKey = String(approval?._id ?? approval?.id ?? "");

  const [mappedRateOverrides, setMappedRateOverrides] = useState<
    Map<string, CheckOrderRatesItem>
  >(() => new Map());
  const [priceTouchedIds, setPriceTouchedIds] = useState<Set<string>>(
    () => new Set(),
  );

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
  const kitItemsQ = useListProductKitItemsQuery(
    { paginate: "false" },
    { skip: !open },
  );
  const [createKitComposition, { isLoading: isCreatingKit }] =
    useCreateProductKitItemMutation();
  const [addKitLine, { isLoading: isAddingKitLine }] =
    useAddProductKitItemLineMutation();
  const [patchKitLine, { isLoading: isPatchingKitLine }] =
    usePatchProductKitItemLineMutation();
  const [deleteKitLine, { isLoading: isDeletingKitLine }] =
    useDeleteProductKitItemLineMutation();
  const kitBusy =
    isCreatingKit || isAddingKitLine || isPatchingKitLine || isDeletingKitLine;

  const [bucketAddKitId, setBucketAddKitId] = useState<string | null>(null);
  const [bucketSearch, setBucketSearch] = useState("");
  const [bucketAddPct, setBucketAddPct] = useState("100");
  const [bucketPctDrafts, setBucketPctDrafts] = useState<Record<string, string>>(
    {},
  );
  const [removeKitItem, setRemoveKitItem] = useState<{
    compositionId: string;
    itemId: string;
    label: string;
  } | null>(null);

  const [createAdminApproval, { isLoading: isCreating }] =
    useCreateOrderApprovalMutation();
  const [approveAdminApproval, { isLoading: isApproving }] =
    useApproveOrderApprovalMutation();
  const [amendApproval, { isLoading: isAmendingStandard }] =
    useAmendOrderApprovalMutation();
  const [financeAmend, { isLoading: isAmendingFinance }] =
    useFinanceAmendOrderApprovalMutation();
  const [patchOrder, { isLoading: isPatching }] = usePatchOrderMutation();

  const isAmending = isAmendingStandard || isAmendingFinance;
  const syncOrderedToApproved = mode !== "finance";

  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const { data: partyData } = useGetPartyQuery(partyId ?? "", {
    skip: !open || !partyId,
  });
  const contacts = useMemo(() => contactsFromParty(partyData), [partyData]);

  useEffect(() => {
    if (open && contacts.length > 0 && !approval) {
      const firstWithPhone = contacts.find((c) => c.phone.trim());
      if (firstWithPhone) {
        setSelectedContacts([firstWithPhone.phone.trim()]);
      } else {
        setSelectedContacts([]);
      }
    } else if (!open) {
      setSelectedContacts([]);
    }
  }, [open, contacts, approval]);

  // Price mapping states
  const [mapTarget, setMapTarget] = useState<MapOrderLinePriceTarget | null>(
    null,
  );
  const [mapModalOpen, setMapModalOpen] = useState(false);

  const canMapPrice = Boolean(partyId);

  const rateItemByLine = useMemo(() => {
    const map = new Map<string, CheckOrderRatesItem>();
    for (const item of rateCheckQ.data?.items ?? []) {
      map.set(rateLookupKey(item.product, item.applied_rate_type), item);
    }
    for (const [key, override] of mappedRateOverrides) {
      map.set(key, { ...(map.get(key) ?? ({} as CheckOrderRatesItem)), ...override });
    }
    return map;
  }, [rateCheckQ.data, mappedRateOverrides]);

  const products = useMemo(() => {
    if (!productsQ.data) return [];
    if (Array.isArray(productsQ.data)) return productsQ.data as Record<string, unknown>[];
    const o = productsQ.data as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
    return [];
  }, [productsQ.data]);

  const productTypeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      const id = String(p._id ?? p.id ?? "");
      if (id) {
        map.set(id, String(p.product_type || "individual").toLowerCase());
      }
    }
    return map;
  }, [products]);

  /** kit product id → composition doc (items + composition _id) */
  const kitCompositionByProductId = useMemo(() => {
    const map = new Map<string, ProductKitItemRecord>();
    for (const row of pickList(kitItemsQ.data) as ProductKitItemRecord[]) {
      const kitId = idFromRef(row.kit);
      if (!kitId) continue;
      map.set(kitId, {
        ...row,
        items: Array.isArray(row.items)
          ? [...row.items].sort(
              (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
            )
          : [],
      });
    }
    return map;
  }, [kitItemsQ.data]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of kitCompositionByProductId.values()) {
      for (const item of row.items ?? []) {
        const id = String(item._id ?? "");
        if (id) next[id] = String(item.percentage ?? 0);
      }
    }
    setBucketPctDrafts(next);
  }, [kitCompositionByProductId]);

  useEffect(() => {
    if (!open) {
      setBucketAddKitId(null);
      setBucketSearch("");
      setBucketAddPct("100");
      setRemoveKitItem(null);
    }
  }, [open]);

  const isKitProduct = useCallback(
    (productId: string) => {
      if (!productId) return false;
      if (productTypeById.get(productId) === "kit") return true;
      return kitCompositionByProductId.has(productId);
    },
    [productTypeById, kitCompositionByProductId],
  );

  const bucketAddCandidates = useMemo(() => {
    if (!bucketAddKitId || !bucketSearch.trim()) return [];
    const q = bucketSearch.toLowerCase().trim();
    const composition = kitCompositionByProductId.get(bucketAddKitId);
    const mapped = new Set(
      (composition?.items ?? []).map((c) => idFromRef(c.individual)),
    );
    return products.filter((p) => {
      const id = String(p._id ?? p.id ?? "");
      if (!id || mapped.has(id) || id === bucketAddKitId) return false;
      if (String(p.product_type || "individual").toLowerCase() === "kit") {
        return false;
      }
      const name = String(p.product_name || "").toLowerCase();
      const sku = String(p.sku || "").toLowerCase();
      return name.includes(q) || sku.includes(q);
    }).slice(0, 12);
  }, [
    bucketAddKitId,
    bucketSearch,
    products,
    kitCompositionByProductId,
  ]);

  const handleSaveKitBucketPct = useCallback(
    async (kitProductId: string, itemId: string) => {
      const composition = kitCompositionByProductId.get(kitProductId);
      if (!composition?._id || !itemId) return;
      const draft = bucketPctDrafts[itemId];
      const pct = Number(draft);
      if (!Number.isFinite(pct) || pct < 0 || pct > 1000) {
        toast.error("Percentage must be between 0 and 1000");
        return;
      }
      const current = composition.items.find((i) => String(i._id) === itemId);
      if (current && Number(current.percentage) === pct) return;
      try {
        await patchKitLine({
          id: composition._id,
          itemId,
          patch: { percentage: pct },
        }).unwrap();
        toast.success("Kit bucket item updated");
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      }
    },
    [kitCompositionByProductId, bucketPctDrafts, patchKitLine],
  );

  const handleAddKitBucketItem = useCallback(
    async (kitProductId: string, individualId: string) => {
      if (!kitProductId || !individualId) return;
      const pct = Number(bucketAddPct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 1000) {
        toast.error("Percentage must be between 0 and 1000");
        return;
      }
      const lineBody = { individual: individualId, percentage: pct };
      try {
        const composition = kitCompositionByProductId.get(kitProductId);
        if (!composition?._id) {
          await createKitComposition({
            kit: kitProductId,
            items: [lineBody],
          }).unwrap();
        } else {
          await addKitLine({
            id: composition._id,
            body: lineBody,
          }).unwrap();
        }
        toast.success("Item added to kit bucket");
        setBucketSearch("");
        setBucketAddPct("100");
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      }
    },
    [
      bucketAddPct,
      kitCompositionByProductId,
      createKitComposition,
      addKitLine,
    ],
  );

  const handleConfirmRemoveKitItem = useCallback(async () => {
    if (!removeKitItem) return;
    try {
      await deleteKitLine({
        id: removeKitItem.compositionId,
        itemId: removeKitItem.itemId,
      }).unwrap();
      toast.success("Item removed from kit bucket");
      setRemoveKitItem(null);
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  }, [removeKitItem, deleteKitLine]);

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
      if (hasKitParent(line.kit_parent_product)) return false;
      const id = String(line._id ?? line.id ?? "");
      return id && !inBatch.has(id);
    });
  }, [approval, readOnlyItems]);

  const expandKitBucketLines = useCallback(
    (lines: EditableLine[]) => {
      const orderItems = Array.isArray(detail?.order_items)
        ? (detail.order_items as Record<string, unknown>[])
        : [];
      const expanded: Array<{
        product: string;
        product_name: string;
        sku: string;
        ordered_quantity: number;
        approved_quantity: number;
        free_quantity: number;
        kit_parent_product: string;
        remarks: string;
        order_item_id?: string;
      }> = [];

      for (const line of lines) {
        if (!line.product || line.approved_quantity <= 0) continue;
        if (!isKitProduct(line.product)) continue;
        const composition = kitCompositionByProductId.get(line.product);
        const comps = (composition?.items ?? []).filter((c) => c.is_active !== false);
        for (const comp of comps) {
          const individualId = idFromRef(comp.individual);
          if (!individualId) continue;
          const itemId = String(comp._id ?? "");
          const pct =
            itemId && bucketPctDrafts[itemId] != null
              ? Number(bucketPctDrafts[itemId])
              : Number(comp.percentage) || 0;
          const qty = kitBucketItemQty(line.approved_quantity, pct);
          if (qty < 1) continue;
          const freeQty = kitBucketItemQty(line.free_quantity, pct);
          const label = kitComponentLabel(comp.individual);
          const existing = orderItems.find((oi) => {
            return (
              idFromRef(oi.product) === individualId &&
              idFromRef(oi.kit_parent_product) === line.product
            );
          });
          expanded.push({
            product: individualId,
            product_name: label.name,
            sku: label.sku,
            ordered_quantity: qty,
            approved_quantity: qty,
            free_quantity: freeQty,
            kit_parent_product: line.product,
            remarks: `Kit bucket of ${line.product_name}`,
            order_item_id: existing
              ? String(existing._id ?? existing.id ?? "")
              : undefined,
          });
        }
      }
      return expanded;
    },
    [
      detail,
      isKitProduct,
      kitCompositionByProductId,
      bucketPctDrafts,
    ],
  );

  const initFormLines = useCallback(() => {
    if (approval) {
      // Seed from existing approval batch (exclude expanded kit bucket lines)
      setFormLines(
        approvalItems(approval)
          .filter((it) => !hasKitParent(it.kit_parent_product))
          .map((it) => {
          const orderItemId = idFromRef(it.order_item_id) || String(it.order_item_id ?? "").trim();
          const orderItems = Array.isArray(detail?.order_items) ? (detail.order_items as any[]) : [];
          const orderLine = orderItems.find((x: any) => String(x._id ?? x.id) === orderItemId) || {};

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
            ) as ApprovalLineStatus,
            remarks: String(it.remarks ?? ""),
          };
        }),
      );
      setApprovalNotes("");
      setSearchQuery("");
      setMappedRateOverrides(new Map());
      setPriceTouchedIds(new Set());
    } else {
      // Seed from order items (exclude expanded kit bucket lines)
      setFormLines(
        readOnlyItems
          .filter((line) => !hasKitParent(line.kit_parent_product))
          .map((line) => {
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
    }
  }, [approval, readOnlyItems, detail]);

  useEffect(() => {
    if (open) initFormLines();
  }, [open, approvalKey]);

  useEffect(() => {
    if (!open || !rateCheckQ.data) return;
    setFormLines((prev) =>
      applyNegotiatedRatesToApprovedPrices(prev, rateItemByLine, priceTouchedIds),
    );
  }, [open, rateCheckQ.data, rateItemByLine, priceTouchedIds]);

  const unmappedActiveLines = useMemo(() => {
    return formLines.filter((line) => {
      if (!line.product) return true;
      if (line.approved_quantity <= 0) return false;
      const rateItem = rateItemByLine.get(rateLookupKey(line.product, line.applied_rate_type));
      return resolveRateDisplayStatus(rateItem) !== "negotiated";
    });
  }, [formLines, rateItemByLine]);

  const approvedTotal = useMemo(() => {
    return formLines.reduce((sum, line) => {
      const qty = line.approved_quantity;
      const price = line.approved_unit_price;
      const gross = qty * price;
      const disc = line.discount_percent > 0 ? (gross * line.discount_percent) / 100 : line.discount_amount;
      const taxable = Math.max(0, gross - disc);
      const gstAmt = (taxable * line.gst_percent) / 100;
      return sum + (taxable + gstAmt);
    }, 0);
  }, [formLines]);

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
      const rateType = normalizeRateTypeForLookup(result.appliedRateType);
      const lookupKey = rateLookupKey(result.productId, rateType);

      setMappedRateOverrides((prev) => {
        const next = new Map(prev);
        next.set(lookupKey, {
          product: result.productId,
          product_name: "",
          applied_rate_type: rateType,
          unit_price: result.negotiatedRate,
          isMapped: true,
          mappingId: prev.get(lookupKey)?.mappingId ?? null,
          hasRate: true,
          rateId: null,
          currentMappedRate: result.negotiatedRate,
          isRateExpired: false,
        });
        return next;
      });

      setFormLines((prev) => {
        const touched: string[] = [];
        const next = prev.map((line) => {
          if (line.product !== result.productId) return line;
          touched.push(line.order_item_id);
          return {
            ...line,
            approved_unit_price: result.negotiatedRate,
            applied_rate_type: rateType,
          };
        });
        if (touched.length) {
          setPriceTouchedIds((ids) => {
            const copy = new Set(ids);
            for (const id of touched) copy.delete(id);
            return copy;
          });
        }
        return next;
      });

      if (approval && orderId && detail && Array.isArray(detail.order_items)) {
        const existsOnOrder = (detail.order_items as Record<string, unknown>[]).some(
          (item) => idFromRef(item.product) === result.productId,
        );

        if (existsOnOrder) {
          const orderItems = (detail.order_items as Record<string, unknown>[]).map(
            (item) => {
              const pid = idFromRef(item.product);
              if (pid === result.productId) {
                return {
                  ...item,
                  unit_price: result.negotiatedRate,
                  applied_rate_type: rateType,
                  manual_price_override: false,
                };
              }
              return item;
            },
          );
          try {
            await patchOrder({
              id: orderId,
              patch: { order_items: orderItems },
            }).unwrap();
            refetchOrder?.();
          } catch (rejected) {
            toast.error(mutationRejectedMessage(rejected));
            return;
          }
        }
      }

      toast.success("Rate mapped and price updated.");
      if (!rateCheckQ.isUninitialized) {
        void rateCheckQ.refetch();
      }
    },
    [approval, detail, orderId, patchOrder, rateCheckQ, refetchOrder],
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
          approval_status: "fully_approved" as ApprovalLineStatus,
          remarks: "",
          isNew: true,
        },
      ];
    });
  }, []);

  const handleRemoveProduct = (orderItemId: string) => {
    setFormLines((prev) => prev.filter((l) => l.order_item_id !== orderItemId));
  };

  const updateLine = (orderItemId: string, patch: Partial<EditableLine>) => {
    if (patch.approved_unit_price !== undefined) {
      setPriceTouchedIds((prev) => new Set(prev).add(orderItemId));
    }
    setFormLines((prev) =>
      prev.map((line) => {
        if (line.order_item_id !== orderItemId) return line;
        const next = { ...line, ...patch };
        if (patch.approved_quantity !== undefined) {
          const qty = Math.max(0, Number(patch.approved_quantity));
          next.approved_quantity = qty;
          if (syncOrderedToApproved) next.ordered_quantity = qty;
          next.approval_status = accountOverrideLineStatus(qty);
        }
        if (patch.ordered_quantity !== undefined) {
          const qty = Math.max(0, Number(patch.ordered_quantity));
          next.ordered_quantity = qty;
          next.approved_quantity = qty;
          next.approval_status = accountOverrideLineStatus(qty);
        }
        return next;
      })
    );
  };

  const onRateTypeChange = (orderItemId: string, rateType: string) => {
    setPriceTouchedIds((prev) => {
      const copy = new Set(prev);
      copy.delete(orderItemId);
      return copy;
    });
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

  const submitAction = useCallback(async () => {
    if (!orderId) return;

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

    if (unmappedActiveLines.length > 0) {
      toast.error(
        `${unmappedActiveLines.length} active line(s) need negotiated mapped rates.`,
      );
      return;
    }

    try {
      const kitBuckets = expandKitBucketLines(activeLines);

      if (!approval) {
        // --- CREATE MODE ---
        const orderItemsPayload = [
          ...formLines.map((line) => {
            const approvedQty = Math.max(0, Number(line.approved_quantity) || 0);
            const orderedQty = syncOrderedToApproved
              ? approvedQty
              : Math.max(0, Number(line.ordered_quantity) || 0);
            const item: Record<string, unknown> = {
              product: line.product,
              product_name: line.product_name,
              sku: line.sku || "",
              ordered_quantity: Math.max(orderedQty, approvedQty > 0 ? approvedQty : orderedQty),
              approved_quantity: approvedQty,
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
          }),
          ...kitBuckets.map((bucket) => ({
            product: bucket.product,
            product_name: bucket.product_name,
            sku: bucket.sku || "",
            ordered_quantity: bucket.ordered_quantity,
            approved_quantity: bucket.approved_quantity,
            free_quantity: bucket.free_quantity,
            unit_price: 0,
            discount_percent: 0,
            discount_amount: 0,
            gst_percent: 0,
            applied_rate_type: "MANUAL",
            manual_price_override: true,
            kit_parent_product: bucket.kit_parent_product,
            remarks: bucket.remarks,
            ...(bucket.order_item_id ? { _id: bucket.order_item_id } : {}),
          })),
        ];

        const approvalItemsPayload = [
          ...formLines.map((line) => {
            const approvedQty = Math.max(0, Number(line.approved_quantity) || 0);
            const orderedQty = syncOrderedToApproved
              ? approvedQty
              : Math.max(0, Number(line.ordered_quantity) || 0);
            return {
              product: line.product,
              ...(line.order_item_id.startsWith("new-line-")
                ? {}
                : { order_item_id: line.order_item_id }),
              ordered_quantity: Math.max(orderedQty, approvedQty > 0 ? approvedQty : orderedQty),
              approved_quantity: approvedQty,
              approved_unit_price: line.approved_unit_price,
              ordered_unit_price: line.approved_unit_price,
              free_quantity: line.free_quantity,
              discount_percent: line.discount_percent,
              discount_amount: line.discount_amount,
              gst_percent: line.gst_percent,
              applied_rate_type: line.applied_rate_type,
              approved_total_amount: approvedTotal,
              approval_status: "fully_approved" as ApprovalLineStatus,
              remarks: line.remarks.trim() || "",
            };
          }),
          ...kitBuckets.map((bucket) => ({
            product: bucket.product,
            ...(bucket.order_item_id ? { order_item_id: bucket.order_item_id } : {}),
            ordered_quantity: bucket.ordered_quantity,
            approved_quantity: bucket.approved_quantity,
            approved_unit_price: 0,
            ordered_unit_price: 0,
            free_quantity: bucket.free_quantity,
            discount_percent: 0,
            discount_amount: 0,
            gst_percent: 0,
            applied_rate_type: "MANUAL",
            manual_price_override: true,
            rate_mapped: true,
            approved_total_amount: 0,
            approval_status: "fully_approved" as ApprovalLineStatus,
            kit_parent_product: bucket.kit_parent_product,
            remarks: bucket.remarks,
          })),
        ];

        const selectedContactNames = selectedContacts.map((phone) => {
          const found = contacts.find((c) => c.phone.trim() === phone);
          return found ? found.name : "";
        }).filter(Boolean);

        await createAdminApproval({
          order: orderId,
          approve_immediately: true,
          replace_snapshot: true,
          order_items: orderItemsPayload,
          approval_notes: approvalNotes.trim() || undefined,
          approved_total_amount: approvedTotal,
          approval_items: approvalItemsPayload,
          contact_number: selectedContacts,
          contact_name: selectedContactNames,
        }).unwrap();

        toast.success("Order and approval updated successfully.");
      } else {
        // --- APPROVE (pending stage) or AMEND (already cleared) ---
        const approvalId = String(approval._id ?? approval.id ?? "");
        const stageAlreadyCleared =
          mode === "admin"
            ? Boolean(approval.is_admin_approved)
            : mode === "finance"
              ? Boolean(approval.is_finance_approved)
              : Boolean(approval.is_account_approved);

        const existingLines = activeLines.filter((line) => !line.isNew);
        const newLines = activeLines.filter((line) => line.isNew);
        const existingBuckets = kitBuckets.filter((b) => Boolean(b.order_item_id));
        const newBuckets = kitBuckets.filter((b) => !b.order_item_id);

        // First admin sign-off on a sales-submitted / pending batch uses /approve
        // (sets is_admin_approved + workflow). Amend is only for post-approval edits.
        if (mode === "admin" && !stageAlreadyCleared) {
          const orderItemsPayload = [
            ...formLines.map((line) => {
              const approvedQty = Math.max(0, Number(line.approved_quantity) || 0);
              const orderedQty = syncOrderedToApproved
                ? approvedQty
                : Math.max(0, Number(line.ordered_quantity) || 0);
              const item: Record<string, unknown> = {
                product: line.product,
                product_name: line.product_name,
                sku: line.sku || "",
                ordered_quantity: Math.max(
                  orderedQty,
                  approvedQty > 0 ? approvedQty : orderedQty,
                ),
                approved_quantity: approvedQty,
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
            }),
            ...kitBuckets.map((bucket) => ({
              product: bucket.product,
              product_name: bucket.product_name,
              sku: bucket.sku || "",
              ordered_quantity: bucket.ordered_quantity,
              approved_quantity: bucket.approved_quantity,
              free_quantity: bucket.free_quantity,
              unit_price: 0,
              discount_percent: 0,
              discount_amount: 0,
              gst_percent: 0,
              applied_rate_type: "MANUAL",
              manual_price_override: true,
              kit_parent_product: bucket.kit_parent_product,
              remarks: bucket.remarks,
              ...(bucket.order_item_id ? { _id: bucket.order_item_id } : {}),
            })),
          ];

          const approvalItemsPayload = [
            ...formLines.map((line) => {
              const approvedQty = Math.max(0, Number(line.approved_quantity) || 0);
              const orderedQty = syncOrderedToApproved
                ? approvedQty
                : Math.max(0, Number(line.ordered_quantity) || 0);
              return {
                product: line.product,
                ...(line.order_item_id.startsWith("new-line-")
                  ? {}
                  : { order_item_id: line.order_item_id }),
                ordered_quantity: Math.max(
                  orderedQty,
                  approvedQty > 0 ? approvedQty : orderedQty,
                ),
                approved_quantity: approvedQty,
                approved_unit_price: line.approved_unit_price,
                ordered_unit_price: line.approved_unit_price,
                free_quantity: line.free_quantity,
                discount_percent: line.discount_percent,
                discount_amount: line.discount_amount,
                gst_percent: line.gst_percent,
                applied_rate_type: line.applied_rate_type,
                approved_total_amount: 0,
                approval_status: "fully_approved" as ApprovalLineStatus,
                rate_mapped: true,
                remarks: line.remarks.trim() || "",
              };
            }),
            ...kitBuckets.map((bucket) => ({
              product: bucket.product,
              ...(bucket.order_item_id ? { order_item_id: bucket.order_item_id } : {}),
              ordered_quantity: bucket.ordered_quantity,
              approved_quantity: bucket.approved_quantity,
              approved_unit_price: 0,
              ordered_unit_price: 0,
              free_quantity: bucket.free_quantity,
              discount_percent: 0,
              discount_amount: 0,
              gst_percent: 0,
              applied_rate_type: "MANUAL",
              manual_price_override: true,
              rate_mapped: true,
              approved_total_amount: 0,
              approval_status: "fully_approved" as ApprovalLineStatus,
              kit_parent_product: bucket.kit_parent_product,
              remarks: bucket.remarks,
            })),
          ];

          await approveAdminApproval({
            id: approvalId,
            body: {
              order_items: orderItemsPayload,
              approval_items: approvalItemsPayload,
              approval_notes: approvalNotes.trim() || undefined,
              approved_total_amount: approvedTotal,
            },
          }).unwrap();

          toast.success("Order admin-approved successfully.");
        } else {
          const body = {
            mode, // Pass to let backend identify account vs admin amend for super_admin
            amendment_notes: approvalNotes.trim() || undefined,
            approval_notes: approvalNotes.trim() || undefined,
            approval_items: [
              ...existingLines.map((line) => {
                const gross = line.approved_quantity * line.approved_unit_price;
                const disc =
                  line.discount_percent > 0
                    ? (gross * line.discount_percent) / 100
                    : line.discount_amount;
                const taxable = Math.max(0, gross - disc);
                const lineTotal = taxable + (taxable * line.gst_percent) / 100;

                return {
                  order_item_id: line.order_item_id,
                  product: line.product,
                  ordered_quantity: syncOrderedToApproved
                    ? line.approved_quantity
                    : line.ordered_quantity,
                  approved_quantity: line.approved_quantity,
                  approved_unit_price: line.approved_unit_price,
                  free_quantity: line.free_quantity,
                  discount_percent: line.discount_percent,
                  discount_amount: disc,
                  gst_percent: line.gst_percent,
                  approved_total_amount: lineTotal,
                  approval_status: "fully_approved" as ApprovalLineStatus,
                  rate_mapped: true,
                  remarks: line.remarks.trim(),
                };
              }),
              ...existingBuckets.map((bucket) => ({
                order_item_id: bucket.order_item_id!,
                product: bucket.product,
                ordered_quantity: bucket.ordered_quantity,
                approved_quantity: bucket.approved_quantity,
                approved_unit_price: 0,
                free_quantity: bucket.free_quantity,
                discount_percent: 0,
                discount_amount: 0,
                gst_percent: 0,
                approved_total_amount: 0,
                approval_status: "fully_approved" as ApprovalLineStatus,
                rate_mapped: true,
                applied_rate_type: "MANUAL",
                manual_price_override: true,
                kit_parent_product: bucket.kit_parent_product,
                remarks: bucket.remarks,
              })),
            ],
            new_items: [
              ...newLines.map((line) => {
                const gross = line.approved_quantity * line.approved_unit_price;
                const disc =
                  line.discount_percent > 0
                    ? (gross * line.discount_percent) / 100
                    : line.discount_amount;

                return {
                  order_item_id: line.order_item_id.startsWith("new-line-")
                    ? undefined
                    : line.order_item_id,
                  product: line.product,
                  approved_quantity: line.approved_quantity,
                  approved_unit_price: line.approved_unit_price,
                  free_quantity: line.free_quantity,
                  discount_percent: line.discount_percent,
                  discount_amount: disc,
                  gst_percent: line.gst_percent,
                  approval_status: "fully_approved" as ApprovalLineStatus,
                  rate_mapped: true,
                  remarks: line.remarks.trim(),
                };
              }),
              ...newBuckets.map((bucket) => ({
                product: bucket.product,
                product_name: bucket.product_name,
                sku: bucket.sku,
                approved_quantity: bucket.approved_quantity,
                approved_unit_price: 0,
                free_quantity: bucket.free_quantity,
                discount_percent: 0,
                discount_amount: 0,
                gst_percent: 0,
                applied_rate_type: "MANUAL",
                manual_price_override: true,
                rate_mapped: true,
                approval_status: "fully_approved" as ApprovalLineStatus,
                kit_parent_product: bucket.kit_parent_product,
                remarks: bucket.remarks,
              })),
            ],
          };

          if (mode === "finance") {
            await financeAmend({ id: approvalId, body }).unwrap();
          } else {
            await amendApproval({ id: approvalId, body }).unwrap();
          }

          toast.success(
            mode === "admin"
              ? "Admin approval amended successfully."
              : mode === "finance"
                ? stageAlreadyCleared
                  ? "Finance clearance amended successfully."
                  : "Order finance-approved successfully."
                : stageAlreadyCleared
                  ? "Account clearance amended successfully."
                  : "Order account-approved successfully.",
          );
        }
      }

      onClose();
      if (onApproved) onApproved();
      if (onSuccess) onSuccess();

      if (refetchOrder) {
        const res = refetchOrder() as unknown;
        if (res instanceof Promise) await res;
      }
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [
    approval,
    mode,
    syncOrderedToApproved,
    orderId,
    formLines,
    unmappedActiveLines.length,
    approvalNotes,
    approvedTotal,
    createAdminApproval,
    approveAdminApproval,
    amendApproval,
    financeAmend,
    onClose,
    onApproved,
    onSuccess,
    refetchOrder,
    selectedContacts,
    contacts,
    expandKitBucketLines,
  ]);

  const busy = isCreating || isApproving || isAmending || isPatching;

  if (!open) return null;

  // Match ApprovalsTab / ApprovalRecordCard: amend only after that stage has signed off.
  const isAlreadyApproved =
    approval
      ? mode === "admin"
        ? Boolean(approval.is_admin_approved)
        : mode === "finance"
          ? Boolean(approval.is_finance_approved)
          : Boolean(approval.is_account_approved)
      : false;

  const approvalNo = approval ? String(approval.approval_no ?? "—") : "";

  const modalTitle = approval
    ? mode === "admin"
      ? isAlreadyApproved
        ? "Amend admin approval"
        : "Approve order"
      : mode === "finance"
        ? isAlreadyApproved
          ? "Amend finance clearance"
          : "Approve order"
        : isAlreadyApproved
          ? "Amend account clearance"
          : "Approve order"
    : "Create and Modify Approval";

  const modalDescription = approval
    ? isAlreadyApproved
      ? `${approvalNo} — update quantities, rates, or items. Changes sync to the approval batch and order.`
      : mode === "admin"
        ? `${approvalNo} — review sales-submitted items, map rates, then approve. Order and workflow update after submission.`
        : mode === "finance"
          ? `${approvalNo} — review admin-cleared items, then approve. Order and workflow update after submission.`
          : `${approvalNo} — review finance-cleared items, then approve. Order and workflow update after submission.`
    : "Edit the full order line list, verify negotiated rates, then save order and approval together.";

  const notesLabel = isAlreadyApproved ? "Amendment notes" : "Approval notes";
  const notesPlaceholder = approval
    ? isAlreadyApproved
      ? mode === "admin"
        ? "Reason for admin amendment…"
        : mode === "finance"
          ? "Reason for finance amendment…"
          : "Reason for account amendment…"
      : mode === "admin"
        ? "Optional notes for this admin approval…"
        : mode === "finance"
          ? "Optional notes for this finance approval…"
          : "Optional notes for this account approval…"
    : "Describe changes or review context for this approval…";

  const submitLabel = approval
    ? isAlreadyApproved
      ? "Amend"
      : "Approve"
    : "Approve";

  const SubmitIcon = isAlreadyApproved ? Pencil : CheckCircle2;

  return (
    <LargeModalPortal>
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
              void submitAction();
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
                                  <span className="ml-2 text-2xs text-slate-400 font-mono">
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
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-955/20 dark:text-amber-300">
                  {unmappedActiveLines.length} line(s) need negotiated mapped rates. Use inline <b>Map</b> buttons to map rates.
                </p>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-slate-200/90 dark:border-white/10">
                <table className="w-full min-w-[1250px] text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950">
                    <tr>
                      <th className="px-2 py-2 w-8 text-center"></th>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium w-24 text-right">Qty</th>
                      <th className="px-3 py-2 font-medium w-24 text-right">Free Qty</th>
                      <th className="px-3 py-2 font-medium w-28">Rate Type</th>
                      <th className="px-3 py-2 font-medium w-28 text-right">Unit Price (₹)</th>
                      <th className="px-3 py-2 font-medium w-24 text-right">Disc %</th>
                      <th className="px-3 py-2 font-medium w-20 text-right">GST %</th>
                      <th className="px-3 py-2 font-medium">Rate Status</th>
                      <th className="px-3 py-2 font-medium text-right">Line Total (₹)</th>
                      <th className="px-3 py-2 font-medium w-28">Map</th>
                      <th className="px-3 py-2 font-medium">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                    {formLines.map((line) => {
                      const rateItem = rateItemByLine.get(
                        rateLookupKey(line.product, line.applied_rate_type),
                      );
                      const rateStatus = resolveRateDisplayStatus(rateItem);

                      const qty = line.approved_quantity;
                      const price = line.approved_unit_price;
                      const gross = qty * price;
                      const disc = line.discount_percent > 0 ? (gross * line.discount_percent) / 100 : line.discount_amount;
                      const taxable = Math.max(0, gross - disc);
                      const gstAmt = (taxable * line.gst_percent) / 100;
                      const lineTotalVal = taxable + gstAmt;

                      const lineIsKit = isKitProduct(line.product);
                      const kitComposition = lineIsKit
                        ? kitCompositionByProductId.get(line.product)
                        : undefined;
                      const kitBucket = (kitComposition?.items ?? []).filter(
                        (c) => c.is_active !== false,
                      );
                      const showBucketAdd =
                        lineIsKit && bucketAddKitId === line.product;

                      return (
                        <Fragment key={line.order_item_id}>
                        <tr
                          className="bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-900/50"
                        >
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveProduct(line.order_item_id)}
                              disabled={busy}
                              className="text-slate-400 hover:text-red-650 dark:hover:text-red-400 p-1 rounded transition-colors cursor-pointer disabled:opacity-50"
                              title="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {line.product_name}
                              {lineIsKit ? (
                                <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
                                  KIT
                                </span>
                              ) : null}
                              {line.isNew && (
                                <span className="ml-1.5 text-2xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-955/40 px-1 py-0.5 rounded">
                                  NEW
                                </span>
                              )}
                            </span>
                            {line.sku ? (
                              <span className="mt-0.5 block text-2xs text-slate-500 font-mono">
                                {line.sku}
                              </span>
                            ) : null}
                            {lineIsKit ? (
                              <button
                                type="button"
                                disabled={busy || kitBusy}
                                onClick={() => {
                                  setBucketAddKitId((prev) =>
                                    prev === line.product ? null : line.product,
                                  );
                                  setBucketSearch("");
                                  setBucketAddPct("100");
                                }}
                                className="mt-1 inline-flex items-center gap-1 text-2xs font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100 cursor-pointer disabled:opacity-50"
                              >
                                <Plus className="h-3 w-3" />
                                {showBucketAdd ? "Hide add item" : "Add bucket item"}
                              </button>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={line.approved_quantity}
                              disabled={busy}
                              onChange={(e) =>
                                updateLine(line.order_item_id, {
                                  approved_quantity: Math.max(0, Number(e.target.value) || 0),
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
                            <LineRateStatusBadge
                              status={rateStatus}
                              rateItem={rateItem}
                              formatMoney={(v) =>
                                Number(v) > 0 ? `₹${Number(v).toFixed(2)}` : "—"
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100 bg-slate-50/15 dark:bg-slate-955/15">
                            ₹{formatMoney(lineTotalVal)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => openMapModal(line)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
                              title="Map rate"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>Map</span>
                            </button>
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
                        </tr>
                        {kitBucket.map((comp, idx) => {
                          const label = kitComponentLabel(comp.individual);
                          const itemId = String(comp._id ?? "");
                          const compKey =
                            itemId ||
                            idFromRef(comp.individual) ||
                            String(idx);
                          const pctDraft =
                            itemId && bucketPctDrafts[itemId] != null
                              ? bucketPctDrafts[itemId]
                              : String(comp.percentage ?? 0);
                          const pctNum = Number(pctDraft) || 0;
                          const bucketQty = kitBucketItemQty(
                            line.approved_quantity,
                            pctNum,
                          );
                          const bucketFreeQty = kitBucketItemQty(
                            line.free_quantity,
                            pctNum,
                          );
                          const pctDirty =
                            itemId &&
                            Number(comp.percentage) !== Number(pctDraft);
                          return (
                            <tr
                              key={`${line.order_item_id}-kit-${compKey}`}
                              className="bg-slate-50/80 dark:bg-slate-950/60"
                            >
                              <td className="px-2 py-1.5 text-center">
                                {kitComposition?._id && itemId ? (
                                  <button
                                    type="button"
                                    disabled={busy || kitBusy}
                                    onClick={() =>
                                      setRemoveKitItem({
                                        compositionId: kitComposition._id,
                                        itemId,
                                        label: label.name,
                                      })
                                    }
                                    className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer disabled:opacity-50"
                                    title="Remove from kit bucket"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                              </td>
                              <td className="px-3 py-1.5">
                                <div className="ml-4 border-l-2 border-violet-300 pl-3 dark:border-violet-700">
                                  <span className="text-slate-800 dark:text-slate-200">
                                    {label.name}
                                  </span>
                                  {label.sku ? (
                                    <span className="mt-0.5 block text-2xs text-slate-500 font-mono">
                                      {label.sku}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                                {bucketQty}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                                {bucketFreeQty}
                              </td>
                              <td className="px-3 py-1.5" colSpan={2}>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    max={1000}
                                    step="0.1"
                                    value={pctDraft}
                                    disabled={busy || kitBusy || !itemId}
                                    onChange={(e) => {
                                      if (!itemId) return;
                                      const v = e.target.value;
                                      setBucketPctDrafts((prev) => ({
                                        ...prev,
                                        [itemId]: v,
                                      }));
                                    }}
                                    onBlur={() => {
                                      if (itemId && pctDirty) {
                                        void handleSaveKitBucketPct(
                                          line.product,
                                          itemId,
                                        );
                                      }
                                    }}
                                    className={`${inputClass} w-20`}
                                    title="Percentage"
                                  />
                                  <span className="text-2xs text-slate-500">%</span>
                                  {pctDirty && itemId ? (
                                    <button
                                      type="button"
                                      disabled={busy || kitBusy}
                                      onClick={() =>
                                        void handleSaveKitBucketPct(
                                          line.product,
                                          itemId,
                                        )
                                      }
                                      className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer disabled:opacity-50"
                                      title="Save percentage"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                              <td colSpan={6} className="px-3 py-1.5 text-2xs text-slate-500">
                                Kit bucket · qty = kit qty × % / 100
                              </td>
                            </tr>
                          );
                        })}
                        {showBucketAdd ? (
                          <tr className="bg-violet-50/50 dark:bg-violet-950/20">
                            <td className="px-2 py-2" />
                            <td className="px-3 py-2" colSpan={4}>
                              <div className="ml-4 space-y-2 border-l-2 border-dashed border-violet-300 pl-3 dark:border-violet-700">
                                <div className="relative">
                                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                  <input
                                    type="text"
                                    value={bucketSearch}
                                    disabled={busy || kitBusy}
                                    onChange={(e) =>
                                      setBucketSearch(e.target.value)
                                    }
                                    placeholder="Search individual product…"
                                    className={`${inputClass} pl-8`}
                                  />
                                  {bucketSearch.trim() ? (
                                    <div className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-900">
                                      {bucketAddCandidates.length === 0 ? (
                                        <p className="px-3 py-2 text-2xs text-slate-500">
                                          No matching individual products
                                        </p>
                                      ) : (
                                        bucketAddCandidates.map((p) => {
                                          const id = String(p._id ?? p.id ?? "");
                                          return (
                                            <button
                                              key={id}
                                              type="button"
                                              disabled={busy || kitBusy}
                                              onClick={() =>
                                                void handleAddKitBucketItem(
                                                  line.product,
                                                  id,
                                                )
                                              }
                                              className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                                            >
                                              <span className="font-medium text-slate-800 dark:text-slate-100">
                                                {String(p.product_name || "—")}
                                              </span>
                                              {p.sku ? (
                                                <span className="font-mono text-2xs text-slate-500">
                                                  {String(p.sku)}
                                                </span>
                                              ) : null}
                                            </button>
                                          );
                                        })
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-2xs text-slate-500">
                                    %
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={1000}
                                    step="0.1"
                                    value={bucketAddPct}
                                    disabled={busy || kitBusy}
                                    onChange={(e) =>
                                      setBucketAddPct(e.target.value)
                                    }
                                    className={`${inputClass} w-24`}
                                  />
                                  <span className="text-2xs text-slate-500">
                                    Select a product above to add
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td colSpan={7} />
                          </tr>
                        ) : null}
                        {lineIsKit && kitBucket.length === 0 && !showBucketAdd ? (
                          <tr className="bg-slate-50/60 dark:bg-slate-950/40">
                            <td className="px-2 py-1.5" />
                            <td
                              className="px-3 py-1.5 text-2xs text-slate-500"
                              colSpan={11}
                            >
                              <span className="ml-4">
                                No kit bucket items mapped yet. Use “Add bucket item”.
                              </span>
                            </td>
                          </tr>
                        ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {approval && addableOrderLines.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Add Existing Order Lines Not In Approval Batch:
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {addableOrderLines.map((line) => (
                      <button
                        key={String(line._id ?? line.id)}
                        type="button"
                        onClick={() => addOrderLineToBatch(line)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-350 dark:hover:bg-slate-900 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{line.product_name || "—"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Notification options (Only for initial creation) */}
              {!approval && contacts.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Send WhatsApp Notification
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {contacts.map((contact) => {
                      const phone = contact.phone.trim();
                      return (
                        <label
                          key={phone}
                          className="flex items-start gap-2.5 rounded-lg border border-slate-200/90 bg-slate-50/50 p-2.5 transition hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900/30 dark:hover:bg-slate-900/50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedContacts.includes(phone)}
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
                              <p className="text-2xs text-slate-500 dark:text-slate-400 font-medium truncate">
                                {contact.department}
                              </p>
                            )}
                            <p className="font-mono text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {phone || "No phone number"}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes field */}
              <div className="space-y-1">
                <label htmlFor="notes" className={labelClass}>
                  {notesLabel}
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  placeholder={notesPlaceholder}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 dark:border-white/5 bg-slate-50/60 dark:bg-slate-950/40">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {!approval
                  ? "One request updates order lines, creates the approval, and queues fulfillment sync."
                  : "Changes will sync across order lines, the approval revision, and workflow metrics."}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="rounded-lg border border-slate-200/95 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-900 dark:text-slate-350 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || unmappedActiveLines.length > 0 || formLines.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400 cursor-pointer"
                >
                  <SubmitIcon className="h-4 w-4" />
                  {busy ? "Saving…" : submitLabel}
                </button>
              </div>
            </div>
          </form>
        </div>
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

      <ConfirmRemoveKitItemModal
        itemId={removeKitItem?.itemId ?? null}
        itemLabel={removeKitItem?.label ?? ""}
        isRemoving={isDeletingKitLine}
        onClose={() => {
          if (!isDeletingKitLine) setRemoveKitItem(null);
        }}
        onConfirm={handleConfirmRemoveKitItem}
      />
    </LargeModalPortal>
  );
}

export default ApprovalModal;
