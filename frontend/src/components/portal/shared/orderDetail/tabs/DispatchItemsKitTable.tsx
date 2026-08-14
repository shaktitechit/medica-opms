"use client";

import { Fragment } from "react";
import {
  nestDispatchLinesForDisplay,
  type DispatchLineDisplay,
} from "../dispatchKitDisplay";

type DispatchItemsKitTableProps = {
  dispatchItems: Record<string, unknown>[];
  orderItems?: Record<string, unknown>[];
  showDeliveredReturned?: boolean;
};

function ProductCell({
  name,
  sku,
  isKitParent,
  isKitBucket,
}: {
  name: string;
  sku?: string;
  isKitParent?: boolean;
  isKitBucket?: boolean;
}) {
  return (
    <div
      className={
        isKitBucket
          ? "ml-3 border-l-2 border-violet-300 pl-2 dark:border-violet-700"
          : undefined
      }
    >
      <span className="font-medium text-slate-800 dark:text-slate-200">{name}</span>
      {isKitParent ? (
        <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
          KIT
        </span>
      ) : null}
      {isKitBucket ? (
        <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
          KIT BUCKET
        </span>
      ) : null}
      {sku ? (
        <span className="mt-0.5 block text-2xs text-slate-400">SKU {sku}</span>
      ) : null}
    </div>
  );
}

function QtyBadge({
  qty,
  tone,
}: {
  qty: number;
  tone: "emerald" | "rose";
}) {
  if (qty <= 0) {
    return <span className="text-slate-350 dark:text-slate-600">—</span>;
  }
  if (tone === "rose") {
    return (
      <span className="inline-flex items-center justify-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
        {qty}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
      {qty}
    </span>
  );
}

function LineRow({
  line,
  isBucket,
  hasDelivered,
  hasReturned,
}: {
  line: DispatchLineDisplay;
  isBucket?: boolean;
  hasDelivered: boolean;
  hasReturned: boolean;
}) {
  return (
    <tr
      className={
        isBucket
          ? "bg-slate-50/80 dark:bg-slate-950/60"
          : line.isKitParent
            ? "bg-violet-50/40 dark:bg-violet-950/20"
            : "bg-white dark:bg-slate-900"
      }
    >
      <td className="px-3 py-2">
        <ProductCell
          name={line.productName}
          sku={line.sku}
          isKitParent={line.isKitParent && !isBucket}
          isKitBucket={isBucket}
        />
      </td>
      <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">
        {line.orderedQty}
      </td>
      <td className="px-3 py-2 text-center font-semibold text-blue-600 dark:text-blue-400">
        {line.dispatchedQty}
      </td>
      {hasDelivered ? (
        <td className="px-3 py-2 text-center">
          <QtyBadge qty={line.deliveredQty} tone="emerald" />
        </td>
      ) : null}
      {hasReturned ? (
        <td className="px-3 py-2 text-center">
          <QtyBadge qty={line.returnedQty} tone="rose" />
        </td>
      ) : null}
    </tr>
  );
}

export function DispatchItemsKitTable({
  dispatchItems,
  orderItems = [],
  showDeliveredReturned = true,
}: DispatchItemsKitTableProps) {
  const hasDelivered =
    showDeliveredReturned &&
    dispatchItems.some((item) => Number(item.delivered_quantity ?? 0) > 0);
  const hasReturned =
    showDeliveredReturned &&
    dispatchItems.some((item) => Number(item.returned_quantity ?? 0) > 0);
  const groups = nestDispatchLinesForDisplay(dispatchItems, orderItems);

  return (
    <table className="w-full text-left text-xs">
      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-medium">
        <tr>
          <th className="px-3 py-2">Product</th>
          <th className="px-3 py-2 text-center w-20">Ordered</th>
          <th className="px-3 py-2 text-center w-22">Dispatched</th>
          {hasDelivered ? (
            <th className="px-3 py-2 text-center w-22 text-emerald-600 dark:text-emerald-400">
              Delivered
            </th>
          ) : null}
          {hasReturned ? (
            <th className="px-3 py-2 text-center w-22 text-rose-600 dark:text-rose-400">
              Returned
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
        {groups.map((group, gIdx) => {
          if (group.line) {
            return (
              <LineRow
                key={group.line.key}
                line={group.line}
                hasDelivered={hasDelivered}
                hasReturned={hasReturned}
              />
            );
          }

          const headerLine: DispatchLineDisplay | null = group.parent
            ? {
                ...group.parent,
                isKitParent:
                  group.parent.isKitParent || group.buckets.length > 0,
              }
            : group.kitHeader
              ? {
                  key: `kit-header-${group.kitHeader.productId}-${gIdx}`,
                  item: {},
                  productName: group.kitHeader.productName,
                  sku: group.kitHeader.sku,
                  orderedQty: group.kitHeader.orderedQty,
                  dispatchedQty: group.kitHeader.dispatchedQty,
                  deliveredQty: group.kitHeader.deliveredQty,
                  returnedQty: group.kitHeader.returnedQty,
                  remainingQty: group.kitHeader.remainingQty,
                  productId: group.kitHeader.productId,
                  kitParentProduct: "",
                  isKitBucket: false,
                  isKitParent: true,
                }
              : null;

          return (
            <Fragment key={headerLine?.key ?? `group-${gIdx}`}>
              {headerLine ? (
                <LineRow
                  line={headerLine}
                  hasDelivered={hasDelivered}
                  hasReturned={hasReturned}
                />
              ) : null}
              {group.buckets.map((bucket) => (
                <LineRow
                  key={bucket.key}
                  line={bucket}
                  isBucket
                  hasDelivered={hasDelivered}
                  hasReturned={hasReturned}
                />
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
