"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, X } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  applyKitDispatchQtyToBuckets,
  buildAccountDispatchPreviewRows,
  buildDispatchItemsPayload,
  computeReleaseDispatchedByLine,
  getReleaseDispatches,
  inferKitQtyFromBucketQuantities,
  isDispatchReleaseResolved,
  kitBucketsForParent,
  resolveOrderItemIdForLine,
  summarizeReleaseDispatchState,
  type AccountDispatchPreviewRow,
} from "@/components/portal/shared/orderDetail/accountDispatchAvailability";
import { isKitShellDispatchSource } from "@/components/portal/shared/orderDetail/dispatchKitDisplay";
import {
  NamedOption,
  refId,
  toDateInput,
  formatDateOnly,
} from "./utils";

type DispatchItemDraft = {
  key: string;
  order_item_id: string;
  product: string;
  product_label: string;
  ordered_quantity: number;
  dispatched_quantity: number;
  delivered_quantity: number;
  returned_quantity: number;
  kit_parent_product?: string;
  is_kit_parent?: boolean;
  is_kit_bucket?: boolean;
  dispatchable?: number;
  kit_base_cleared?: number;
};

type DispatchHeaderDraft = {
  finance_approval: string;
  dispatch_status: string;
  bill_number: string;
  billing_date: string;
  warehouse: string;
  warehouse_location: string;
  remarks: string;
  dispatch_assignee_user: string;
  dispatched_at: string;
};

function dispatchItemFromRaw(item: any, idx: number, orderItems: any[] = []): DispatchItemDraft {
  const pObj = item?.product;
  const pId = typeof pObj === "object" && pObj ? refId(pObj._id || pObj.id) : refId(pObj || item?.product_id);
  const pName = typeof pObj === "object" && pObj ? String(pObj.product_name || pObj.name || "") : String(item?.product_name || "");
  const orderItemId = refId(item?.order_item_id);
  const match = orderItems.find((o: any) => refId(o._id || o.id) === orderItemId);
  const kitParent =
    refId(item?.kit_parent_product) ||
    refId(match?.kit_parent_product) ||
    undefined;
  const productId = pId;
  const isKitParent =
    !kitParent &&
    Boolean(
      productId &&
        orderItems.some(
          (o: any) => refId(o?.kit_parent_product) === productId,
        ),
    );
  return {
    key: `di-${idx}-${Date.now()}-${Math.random()}`,
    order_item_id: orderItemId,
    product: pId,
    product_label: pName,
    ordered_quantity: Number(match?.ordered_quantity ?? match?.quantity ?? match?.qty ?? 0),
    dispatched_quantity: Number(item?.dispatched_quantity ?? item?.dispatch_quantity ?? 0),
    delivered_quantity: Number(item?.delivered_quantity ?? 0),
    returned_quantity: Number(item?.returned_quantity ?? 0),
    kit_parent_product: kitParent,
    is_kit_parent: isKitParent,
    is_kit_bucket: Boolean(kitParent),
  };
}

function seedKitQuantities(
  rows: AccountDispatchPreviewRow[],
  init: Record<string, number>,
): Record<string, number> {
  for (const row of rows) {
    if (!row.isKitParent || !row.productId) continue;
    const kitCleared = Number(row.kitBaseCleared || row.clearedQty || 0);
    const buckets = kitBucketsForParent(rows, row.productId);
    if (buckets.length === 0 || kitCleared <= 0) continue;
    const kitQty = Math.min(
      row.dispatchable,
      Math.max(0, Number(init[row.orderItemId] ?? row.dispatchable) || 0),
    );
    init[row.orderItemId] = kitQty;
    Object.assign(init, applyKitDispatchQtyToBuckets(kitQty, kitCleared, buckets));
  }
  return init;
}

function draftsFromPreviewRows(
  rows: AccountDispatchPreviewRow[],
  quantities: Record<string, number>,
  savedByLine: Record<
    string,
    { delivered: number; returned: number }
  > = {},
): DispatchItemDraft[] {
  return rows.map((row, i) => {
    const saved = savedByLine[row.orderItemId];
    return {
      key: `di-${row.orderItemId}-${i}`,
      order_item_id: row.orderItemId,
      product: row.productId || "",
      product_label: row.productName,
      ordered_quantity: row.clearedQty,
      dispatched_quantity: quantities[row.orderItemId] ?? 0,
      delivered_quantity: saved?.delivered ?? 0,
      returned_quantity: saved?.returned ?? 0,
      kit_parent_product: row.kitParentProduct,
      is_kit_parent:
        Boolean(row.isKitParent) || row.orderItemId.startsWith("__kit__"),
      is_kit_bucket: Boolean(row.isKitBucket),
      dispatchable: row.dispatchable,
      kit_base_cleared: row.kitBaseCleared,
    };
  });
}

/** Seed create-mode lines from approval clearance (kit headers + bucket cascade). */
function dispatchItemsFromApproval(
  approval: Record<string, unknown> | null,
  orderItems: Record<string, unknown>[],
  dispatches: Record<string, unknown>[],
): DispatchItemDraft[] {
  if (!approval) return [];
  const appId = refId(approval._id || approval.id);
  const dispatchedMap = computeReleaseDispatchedByLine(
    dispatches,
    appId,
    orderItems,
    approval,
  );
  const rows = buildAccountDispatchPreviewRows(
    approval,
    orderItems,
    dispatchedMap,
    {},
    { skipClearanceCheck: true },
  );
  const init: Record<string, number> = {};
  for (const row of rows) {
    if (row.isKitParent || row.orderItemId.startsWith("__kit__")) continue;
    if (row.dispatchable > 0) init[row.orderItemId] = row.dispatchable;
  }
  seedKitQuantities(rows, init);
  return draftsFromPreviewRows(rows, init);
}

/** Map a saved dispatch line onto a preview-row order_item_id (avoid orphan duplicates). */
function resolveSavedDispatchLineId(
  item: Record<string, unknown>,
  orderItems: Record<string, unknown>[],
  previewRows: AccountDispatchPreviewRow[],
): string {
  const resolved = resolveOrderItemIdForLine(item, orderItems);
  if (resolved && previewRows.some((row) => row.orderItemId === resolved)) {
    return resolved;
  }

  const productId = refId(item.product);
  if (productId) {
    const kitParent = refId(item.kit_parent_product);
    const byProduct = previewRows.find((row) => {
      if (row.isKitParent || row.orderItemId.startsWith("__kit__")) return false;
      if (row.productId !== productId) return false;
      if (kitParent) return row.kitParentProduct === kitParent;
      // Prefer non-bucket individual when kit_parent is absent on the saved line.
      return !row.isKitBucket;
    });
    if (byProduct) return byProduct.orderItemId;

    // Fallback: any matching product row (bucket) when individual match missing.
    const anyProduct = previewRows.find(
      (row) =>
        !row.isKitParent &&
        !row.orderItemId.startsWith("__kit__") &&
        row.productId === productId,
    );
    if (anyProduct) return anyProduct.orderItemId;
  }

  return resolved;
}

/**
 * Edit-mode seed — mirrors CreateAccountDispatchModal.buildQuantitiesFromDispatch:
 * exclude this batch from "already dispatched", nest kit headers, infer kit qty from buckets.
 * Only preview rows are shown (no orphan extras — those caused "—" duplicates).
 */
function dispatchItemsFromExistingDispatch(
  disp: Record<string, unknown>,
  approval: Record<string, unknown> | null,
  orderItems: Record<string, unknown>[],
  allDispatches: Record<string, unknown>[],
): DispatchItemDraft[] {
  const dispId = refId(disp._id || disp.id);
  const rawItems = (
    Array.isArray(disp.dispatch_items)
      ? disp.dispatch_items
      : Array.isArray(disp.items)
        ? disp.items
        : []
  ) as Record<string, unknown>[];

  if (!approval) {
    return rawItems.map((item, i) => dispatchItemFromRaw(item, i, orderItems));
  }

  // Exclude this dispatch so its qty counts as still-editable (same as create modal).
  const otherDispatches = allDispatches.filter(
    (d) => refId(d._id || d.id) !== dispId,
  );
  const appId = refId(approval._id || approval.id);
  const dispatchedMap = computeReleaseDispatchedByLine(
    otherDispatches,
    appId,
    orderItems,
    approval,
  );
  const rows = buildAccountDispatchPreviewRows(
    approval,
    orderItems,
    dispatchedMap,
    {},
    { skipClearanceCheck: true },
  );

  const savedByLine: Record<
    string,
    { delivered: number; returned: number }
  > = {};
  const init: Record<string, number> = {};

  for (const item of rawItems) {
    const dispatched = Number(
      item.dispatched_quantity ?? item.dispatch_quantity ?? 0,
    );

    // Kit shells seed the synthetic UI key; buckets/individuals seed real line ids.
    if (isKitShellDispatchSource(item, rawItems, orderItems)) {
      const productId =
        refId(item.product) ||
        refId(
          orderItems.find(
            (line) => refId(line._id || line.id) === refId(item.order_item_id),
          )?.product,
        );
      if (productId && dispatched > 0) {
        init[`__kit__${productId}`] = dispatched;
      }
      continue;
    }

    const lineId = resolveSavedDispatchLineId(item, orderItems, rows);
    if (!lineId || lineId.startsWith("__kit__")) continue;

    if (dispatched > 0) {
      init[lineId] = (init[lineId] || 0) + dispatched;
    }
    const prev = savedByLine[lineId] || { delivered: 0, returned: 0 };
    savedByLine[lineId] = {
      delivered: prev.delivered + Number(item.delivered_quantity ?? 0),
      returned: prev.returned + Number(item.returned_quantity ?? 0),
    };
  }

  for (const row of rows) {
    if (!row.isKitParent || !row.productId) continue;
    const kitCleared = Number(row.kitBaseCleared || row.clearedQty || 0);
    const buckets = kitBucketsForParent(rows, row.productId);
    if (kitCleared <= 0 || buckets.length === 0) continue;
    const savedKit = Number(init[row.orderItemId] || 0);
    init[row.orderItemId] = Math.min(
      row.dispatchable,
      savedKit > 0
        ? savedKit
        : inferKitQtyFromBucketQuantities(kitCleared, buckets, init),
    );
  }

  // Only nested preview rows — same surface as CreateAccountDispatchModal.
  // Drop blank orphan drafts (no product / no label) if any slip through.
  return draftsFromPreviewRows(rows, init, savedByLine).filter((line) => {
    if (line.order_item_id.startsWith("__kit__") || line.is_kit_parent) {
      return true;
    }
    return Boolean(line.product || (line.product_label && line.product_label !== "—"));
  });
}

function headerFromDispatch(disp: any): DispatchHeaderDraft {
  return {
    finance_approval: refId(disp?.finance_approval),
    dispatch_status: disp?.dispatch_status || disp?.status || "draft",
    bill_number: disp?.bill_number || "",
    billing_date: toDateInput(disp?.billing_date) || new Date().toISOString().split("T")[0],
    warehouse: refId(disp?.warehouse),
    warehouse_location: disp?.warehouse_location || "",
    remarks: disp?.remarks || "",
    dispatch_assignee_user: refId(disp?.dispatch_assignee_user),
    dispatched_at: toDateInput(disp?.dispatched_at ?? disp?.dispatch_date) || new Date().toISOString().split("T")[0],
  };
}

export function OrderDispatchesForm({
  order,
  dispatches,
  approvals,
  users,
  saving,
  onClose,
  onSave,
  onCreate,
  onSettleClick,
  onCreatedWithApproval,
}: {
  order: any;
  dispatches: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  users: NamedOption[];
  saving: boolean;
  onClose: () => void;
  onSave: (dispatchId: string, patch: Record<string, unknown>) => Promise<void>;
  onCreate: (body: FormData) => Promise<void>;
  onSettleClick?: (approval: Record<string, unknown>, releaseNo: string) => void;
  /** Fired after a new dispatch is created so parent can prompt settle vs keep unsettled. */
  onCreatedWithApproval?: (approval: Record<string, unknown>, releaseNo: string) => void;
}) {
  const orderId = refId(order._id || order.id);
  const orderItems = (order.order_items || []) as Record<string, unknown>[];

  /** Approvals available to link when creating the single dispatch. */
  const linkableApprovals = useMemo(
    () =>
      approvals.filter((app) => {
        if (isDispatchReleaseResolved(app)) return false;
        const appId = refId(app._id || app.id);
        return getReleaseDispatches(dispatches, appId).length === 0;
      }),
    [approvals, dispatches],
  );

  const sortedDispatches = useMemo(
    () =>
      [...dispatches].sort((a, b) => {
        return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
      }),
    [dispatches],
  );

  /** Only one dispatch for this wizard — create when none exist, otherwise edit. */
  const isCreateMode = sortedDispatches.length === 0;

  const [selectedId, setSelectedId] = useState(
    () => refId(sortedDispatches[0]?._id || sortedDispatches[0]?.id) || "new",
  );
  const [billDocumentFile, setBillDocumentFile] = useState<File | null>(null);

  const [header, setHeader] = useState<DispatchHeaderDraft>(() =>
    sortedDispatches[0]
      ? headerFromDispatch(sortedDispatches[0])
      : {
          finance_approval: approvals[0] ? refId(approvals[0]._id || approvals[0].id) : "",
          dispatch_status: "submitted",
          bill_number: "",
          billing_date: new Date().toISOString().split("T")[0],
          warehouse: "",
          warehouse_location: "",
          remarks: "",
          dispatch_assignee_user: "",
          dispatched_at: new Date().toISOString().split("T")[0],
        },
  );
  const [lines, setLines] = useState<DispatchItemDraft[]>(() => {
    if (sortedDispatches[0]) {
      const appId = refId(sortedDispatches[0].finance_approval);
      const approval =
        approvals.find((app) => refId(app._id || app.id) === appId) || null;
      return dispatchItemsFromExistingDispatch(
        sortedDispatches[0] as Record<string, unknown>,
        approval,
        orderItems,
        dispatches,
      );
    }
    const seedApproval = approvals[0] || null;
    return dispatchItemsFromApproval(seedApproval, orderItems, dispatches);
  });

  const selectedDispatch = useMemo(
    () =>
      selectedId !== "new"
        ? sortedDispatches.find((d) => refId(d._id || d.id) === selectedId) || null
        : null,
    [sortedDispatches, selectedId],
  );

  useEffect(() => {
    if (isCreateMode) {
      setSelectedId("new");
      return;
    }
    const firstId = refId(sortedDispatches[0]._id || sortedDispatches[0].id);
    if (selectedId === "new" || !sortedDispatches.some((d) => refId(d._id || d.id) === selectedId)) {
      setSelectedId(firstId);
    }
  }, [isCreateMode, sortedDispatches, selectedId]);

  const selectedApprovalObj = useMemo(() => {
    const appId = selectedId === "new" ? header.finance_approval : refId(selectedDispatch?.finance_approval);
    return approvals.find(app => refId(app._id || app.id) === appId) || null;
  }, [selectedId, header.finance_approval, selectedDispatch, approvals]);

  useEffect(() => {
    if (selectedId === "new") return;
    if (!selectedDispatch) return;
    setHeader(headerFromDispatch(selectedDispatch));
    setLines(
      dispatchItemsFromExistingDispatch(
        selectedDispatch as Record<string, unknown>,
        selectedApprovalObj,
        orderItems,
        dispatches,
      ),
    );
    setBillDocumentFile(null);
  }, [selectedDispatch, selectedId, selectedApprovalObj, orderItems, dispatches]);

  // Create mode: reseed items when linked approval changes (kit nest + cascade defaults).
  useEffect(() => {
    if (selectedId !== "new") return;
    setLines(
      dispatchItemsFromApproval(selectedApprovalObj, orderItems, dispatches),
    );
  }, [selectedId, selectedApprovalObj, orderItems, dispatches]);

  const releaseSummary = useMemo(() => {
    if (!selectedApprovalObj) return null;
    return summarizeReleaseDispatchState(selectedApprovalObj, dispatches, orderItems);
  }, [selectedApprovalObj, dispatches, orderItems]);

  const clearedTotal = useMemo(() => {
    if (!selectedApprovalObj) return 0;
    const items = Array.isArray(selectedApprovalObj.approval_items)
      ? (selectedApprovalObj.approval_items as any[])
      : [];
    return items.reduce((sum, item) => sum + Number(item.approved_quantity || 0), 0);
  }, [selectedApprovalObj]);

  /** Stable kit cascade rows from approval (not derived from draft lines). */
  const kitCascadeRows = useMemo((): AccountDispatchPreviewRow[] => {
    if (!selectedApprovalObj) return [];
    const editingId =
      selectedId !== "new" ? refId(selectedDispatch?._id || selectedDispatch?.id) : "";
    const dispatchesForAvailability = editingId
      ? dispatches.filter((d) => refId(d._id || d.id) !== editingId)
      : dispatches;
    const appId = refId(selectedApprovalObj._id || selectedApprovalObj.id);
    const dispatchedMap = computeReleaseDispatchedByLine(
      dispatchesForAvailability,
      appId,
      orderItems,
      selectedApprovalObj,
    );
    return buildAccountDispatchPreviewRows(
      selectedApprovalObj,
      orderItems,
      dispatchedMap,
      {},
      { skipClearanceCheck: true },
    );
  }, [selectedApprovalObj, selectedId, selectedDispatch, dispatches, orderItems]);

  const updateLine = (
    key: string,
    field: keyof DispatchItemDraft,
    value: unknown,
  ) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        return { ...line, [field]: value } as DispatchItemDraft;
      }),
    );
  };

  const handleKitQtyChange = useCallback(
    (kitLine: DispatchItemDraft, nextKitQty: number) => {
      const kitProductId = kitLine.product || "";
      const kitRow =
        kitCascadeRows.find(
          (row) =>
            (row.isKitParent || row.orderItemId.startsWith("__kit__")) &&
            row.productId === kitProductId,
        ) || null;
      const kitCleared = Number(
        kitRow?.kitBaseCleared ||
          kitRow?.clearedQty ||
          kitLine.kit_base_cleared ||
          kitLine.ordered_quantity ||
          0,
      );
      const maxQty = Number(
        kitRow?.dispatchable ??
          kitLine.dispatchable ??
          kitLine.ordered_quantity ??
          0,
      );
      const kitQty = Math.min(maxQty, Math.max(0, Number(nextKitQty) || 0));
      const buckets = kitBucketsForParent(kitCascadeRows, kitProductId);
      const bucketQtys = applyKitDispatchQtyToBuckets(kitQty, kitCleared, buckets);
      setLines((prev) =>
        prev.map((line) => {
          if (line.key === kitLine.key || line.order_item_id === kitLine.order_item_id) {
            return {
              ...line,
              dispatched_quantity: kitQty,
              dispatchable: maxQty,
              kit_base_cleared: kitCleared,
            };
          }
          if (line.order_item_id in bucketQtys) {
            return {
              ...line,
              dispatched_quantity: bucketQtys[line.order_item_id] ?? 0,
            };
          }
          return line;
        }),
      );
    },
    [kitCascadeRows],
  );

  const handleSave = async () => {
    if (!selectedId) {
      toast.error("No dispatch batch selected");
      return;
    }
    // Kit shells + buckets + individuals (`__kit__*` → commercial kit order line).
    const physicalLines = lines.filter((line) => Number(line.dispatched_quantity) > 0);
    const qtyByLine: Record<string, number> = {};
    for (const line of physicalLines) {
      qtyByLine[line.order_item_id] = Number(line.dispatched_quantity) || 0;
    }
    const payloadItems = buildDispatchItemsPayload(
      qtyByLine,
      orderItems,
      approvals.find((app) => refId(app._id || app.id) === header.finance_approval) ||
        null,
    );

    if (payloadItems.length === 0) {
      toast.error("Please enter a dispatch quantity for at least one item");
      return;
    }

    if (selectedId === "new") {
      if (!isCreateMode) {
        toast.error("A dispatch already exists for this order.");
        return;
      }
      if (!header.finance_approval) {
        toast.error("Linked approval batch is required");
        return;
      }
      if (getReleaseDispatches(dispatches, header.finance_approval).length > 0) {
        toast.error("This approval already has a dispatch.");
        return;
      }
      if (!header.bill_number.trim()) {
        toast.error("Bill number is required");
        return;
      }

      const formData = new FormData();
      formData.append("order", orderId);
      formData.append("finance_approval", header.finance_approval);
      // Super-admin create flow: always submit the batch (not draft).
      formData.append("dispatch_status", "submitted");
      formData.append(
        "dispatch_date",
        header.dispatched_at
          ? new Date(header.dispatched_at).toISOString()
          : new Date().toISOString(),
      );
      formData.append("bill_number", header.bill_number.trim());
      formData.append("billing_date", new Date(header.billing_date).toISOString());
      formData.append("items", JSON.stringify(payloadItems));
      if (header.warehouse_location.trim()) {
        formData.append("warehouse_location", header.warehouse_location.trim());
      }
      if (header.remarks.trim()) {
        formData.append("remarks", header.remarks.trim());
      }
      if (header.dispatch_assignee_user) {
        formData.append("dispatch_assignee_user", header.dispatch_assignee_user);
      }
      if (billDocumentFile) {
        formData.append("bill_document", billDocumentFile);
      }

      try {
        await onCreate(formData);
      } catch {
        // Parent already toasts the mutation error.
        return;
      }

      const linkedApproval =
        approvals.find(
          (app) => refId(app._id || app.id) === header.finance_approval,
        ) || null;
      if (linkedApproval) {
        onCreatedWithApproval?.(
          linkedApproval,
          String(linkedApproval.approval_no || ""),
        );
      }
    } else {
      const draftMetaByKey = new Map(
        lines.map((line) => [
          line.order_item_id,
          {
            delivered: Number(line.delivered_quantity || 0),
            returned: Number(line.returned_quantity || 0),
            product: line.product,
          },
        ]),
      );
      const items = payloadItems.map((item) => {
        const byId = draftMetaByKey.get(item.order_item_id);
        const byKitKey = draftMetaByKey.get(`__kit__${item.product}`);
        const meta = byId || byKitKey;
        return {
          order_item_id: item.order_item_id,
          product: item.product,
          dispatch_quantity: item.dispatch_quantity,
          delivered_quantity: meta?.delivered ?? 0,
          returned_quantity: meta?.returned ?? 0,
        };
      });

      await onSave(selectedId, {
        ...header,
        dispatch_assignee_user: header.dispatch_assignee_user || null,
        items,
        dispatch_items: items.map((item) => ({
          order_item_id: item.order_item_id,
          product: item.product,
          dispatched_quantity: item.dispatch_quantity,
          delivered_quantity: item.delivered_quantity,
          returned_quantity: item.returned_quantity,
        })),
      });
    }
  };

  const inputClass =
    "w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs outline-none focus:border-blue-500";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/40 dark:bg-blue-950/40">
          <div>
            <h3 className="text-sm font-bold text-blue-950 dark:text-blue-100">
              Order Dispatches — {order.order_no || orderId}
            </h3>
            <p className="text-2xs text-blue-800/80 dark:text-blue-200/70">
              Create one submitted dispatch for this order. After create you can settle remaining qty to Unbilled, or keep unsettled.
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

        <div className="flex-1 overflow-auto p-4 space-y-4 font-sans">
          {!isCreateMode && sortedDispatches[0] ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
              Editing dispatch{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {String(sortedDispatches[0].dispatch_no || "").trim() ||
                  formatDateOnly(sortedDispatches[0].createdAt)}
              </span>
              {" · "}status{" "}
              <span className="font-mono">
                {String(
                  sortedDispatches[0].dispatch_status ??
                    sortedDispatches[0].status ??
                    "submitted",
                )}
              </span>
            </div>
          ) : null}

          {isCreateMode && approvals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-amber-300 px-4 py-8 text-center text-sm text-amber-800 bg-amber-50/50">
              No approval batches are available for this order to link with a dispatch.
            </div>
          ) : (
            <>
              {/* Header Editor */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Batch Header Properties
                  </h4>
                  {releaseSummary ? (
                    <div className="rounded bg-blue-50 px-2 py-1 text-2xs text-blue-800 flex items-center gap-2 dark:bg-blue-950/40 dark:text-blue-300">
                      <span>
                        Cleared: <span className="font-semibold text-emerald-700 dark:text-emerald-300">{clearedTotal}</span> &middot;{" "}
                        Available: <span className="font-semibold text-indigo-700 dark:text-indigo-300">{releaseSummary.dispatchableTotal}</span> &middot;{" "}
                        Remaining: <span className="font-semibold text-rose-600 dark:text-rose-400">{releaseSummary.remainingTotal}</span>
                      </span>
                      {releaseSummary.canResolveRelease && onSettleClick && (
                        <button
                          type="button"
                          onClick={() => onSettleClick(selectedApprovalObj!, String(selectedApprovalObj!.approval_no || ""))}
                          className="rounded bg-indigo-600 px-1.5 py-0.5 text-3xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
                        >
                          Settle & Unbilled
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-4">
                  {isCreateMode ? (
                    <div>
                      <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                        Linked Approval Batch *
                      </label>
                      <select
                        value={header.finance_approval}
                        onChange={(e) =>
                          setHeader((prev) => ({
                            ...prev,
                            finance_approval: e.target.value,
                          }))
                        }
                        className={inputClass}
                        required
                      >
                        <option value="">— Select Approval —</option>
                        {(linkableApprovals.length ? linkableApprovals : approvals).map((app) => (
                          <option key={refId(app._id || app.id)} value={refId(app._id || app.id)}>
                            {String(app.approval_no || "")} · Rev #{String(app.revision_number ?? 1)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-2xs text-slate-500">
                        Only one dispatch for this order.
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Dispatch Status
                    </label>
                    {isCreateMode ? (
                      <input
                        type="text"
                        value="submitted"
                        readOnly
                        className={`${inputClass} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300`}
                        title="Dispatch is created as submitted"
                      />
                    ) : (
                      <select
                        value={header.dispatch_status}
                        onChange={(e) =>
                          setHeader((prev) => ({
                            ...prev,
                            dispatch_status: e.target.value,
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="draft">draft</option>
                        <option value="submitted">submitted</option>
                        <option value="transport_created">transport_created</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Bill Number *
                    </label>
                    <input
                      type="text"
                      value={header.bill_number}
                      onChange={(e) =>
                        setHeader((prev) => ({
                          ...prev,
                          bill_number: e.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder="INV-XXXX"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Billing Date *
                    </label>
                    <input
                      type="date"
                      value={header.billing_date}
                      onChange={(e) =>
                        setHeader((prev) => ({
                          ...prev,
                          billing_date: e.target.value,
                        }))
                      }
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Dispatch Date
                    </label>
                    <input
                      type="date"
                      value={header.dispatched_at}
                      onChange={(e) =>
                        setHeader((prev) => ({
                          ...prev,
                          dispatched_at: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Warehouse Location
                    </label>
                    <input
                      type="text"
                      value={header.warehouse_location}
                      onChange={(e) =>
                        setHeader((prev) => ({
                          ...prev,
                          warehouse_location: e.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder="Shelf A1"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Assignee Staff
                    </label>
                    <select
                      value={header.dispatch_assignee_user}
                      onChange={(e) =>
                        setHeader((prev) => ({
                          ...prev,
                          dispatch_assignee_user: e.target.value,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="">— Unassigned —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isCreateMode ? (
                    <div>
                      <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                        Bill Document Copy
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                        onChange={(e) => setBillDocumentFile(e.target.files?.[0] ?? null)}
                        className="block w-full text-[10px] text-slate-500 file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-2 file:py-1 file:text-[10px] file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                      />
                    </div>
                  ) : null}
                  <div className={isCreateMode ? "sm:col-span-4" : "sm:col-span-2"}>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Remarks / Notes
                    </label>
                    <input
                      type="text"
                      value={header.remarks}
                      onChange={(e) =>
                        setHeader((prev) => ({ ...prev, remarks: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* Items Editor */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Dispatched Items
                </h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950 font-medium">
                      <tr>
                        <th className="px-3 py-2">Product Name</th>
                        <th className="px-3 py-2 text-center w-28">Ordered Qty</th>
                        <th className="px-3 py-2 text-center w-28">Dispatched Qty</th>
                        {!isCreateMode && (
                          <>
                            <th className="px-3 py-2 text-center w-28">Delivered Qty</th>
                            <th className="px-3 py-2 text-center w-28">Returned Qty</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {lines.map((line) => {
                        const isBucket = Boolean(line.is_kit_bucket);
                        const isKitParent =
                          Boolean(line.is_kit_parent) ||
                          line.order_item_id.startsWith("__kit__");
                        const maxQty = Number(
                          line.dispatchable ?? line.ordered_quantity ?? 0,
                        );
                        return (
                          <tr
                            key={line.key}
                            className={
                              isBucket
                                ? "bg-slate-50/80 dark:bg-slate-950/60"
                                : isKitParent
                                  ? "bg-violet-50/40 dark:bg-violet-950/20"
                                  : "bg-white dark:bg-slate-900"
                            }
                          >
                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                              <div
                                className={
                                  isBucket
                                    ? "ml-3 border-l-2 border-violet-300 pl-2 dark:border-violet-700"
                                    : undefined
                                }
                              >
                                {line.product_label || line.product || "—"}
                                {isKitParent ? (
                                  <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-950/50 px-1.5 py-0.5 rounded">
                                    KIT
                                  </span>
                                ) : null}
                                {isBucket ? (
                                  <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-950/50 px-1.5 py-0.5 rounded">
                                    KIT BUCKET
                                  </span>
                                ) : null}
                                {isKitParent ? (
                                  <span className="mt-0.5 block text-2xs text-violet-600/80 dark:text-violet-300/80">
                                    Edit kit qty — buckets update automatically
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-center font-semibold text-slate-500 dark:text-slate-400">
                              {line.ordered_quantity}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {isBucket ? (
                                <span className="inline-block w-20 tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                                  {line.dispatched_quantity}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  max={maxQty || undefined}
                                  value={line.dispatched_quantity}
                                  onChange={(e) => {
                                    const val = Math.max(
                                      0,
                                      Number(e.target.value) || 0,
                                    );
                                    const capped =
                                      maxQty > 0 ? Math.min(maxQty, val) : val;
                                    if (isKitParent) {
                                      handleKitQtyChange(line, capped);
                                      return;
                                    }
                                    updateLine(
                                      line.key,
                                      "dispatched_quantity",
                                      capped,
                                    );
                                  }}
                                  className={`w-20 rounded border bg-white px-2 py-1 text-center font-semibold text-slate-800 outline-none focus:border-blue-500 dark:bg-slate-950 dark:text-slate-100 ${
                                    isKitParent
                                      ? "border-violet-300 dark:border-violet-700"
                                      : "border-slate-200 dark:border-slate-700"
                                  }`}
                                />
                              )}
                            </td>
                            {!isCreateMode && (
                              <>
                                <td className="px-3 py-1.5 text-center">
                                  <input
                                    type="number"
                                    value={line.delivered_quantity}
                                    onChange={(e) =>
                                      updateLine(
                                        line.key,
                                        "delivered_quantity",
                                        Math.max(0, Number(e.target.value) || 0),
                                      )
                                    }
                                    className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-center font-semibold text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                  />
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  <input
                                    type="number"
                                    value={line.returned_quantity}
                                    onChange={(e) =>
                                      updateLine(
                                        line.key,
                                        "returned_quantity",
                                        Math.max(0, Number(e.target.value) || 0),
                                      )
                                    }
                                    className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-center font-semibold text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                  />
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 shrink-0 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-950 dark:text-slate-350 dark:hover:bg-white/5"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving || (isCreateMode && approvals.length === 0)}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {isCreateMode ? "Create & submit dispatch" : "Save dispatch"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderDispatchesForm;
