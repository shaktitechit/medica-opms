"use client";

import { useMemo, Fragment } from "react";
import {
  computeDepartmentStageBoxes,
  computeOrderStatusDimensions,
  fulfillmentLinesFromSnapshot,
  type DepartmentStageBox,
  type FulfillmentLine,
} from "./orderDepartmentStages";
import {
  dimensionToneClass,
  type OrderStatusDimensions,
} from "./orderStatusDimensions";
import {
  isAccountCleared,
  isAdminCleared,
  isDueSheetStageCleared,
  isFinanceCleared,
} from "./orderList/orderWorkflowTabs";

type Props = {
  order: Record<string, unknown> | null;
  fulfillmentSnapshot?: Record<string, unknown> | null;
  dimensions?: OrderStatusDimensions | null;
  returns?: Record<string, unknown>[];
  dispatches?: Record<string, unknown>[];
  className?: string;
  /** Hide per-line table when space is tight */
  showItemsTable?: boolean;
  showDepartmentBoxes?: boolean;
};

function SummaryPill({
  title,
  dimension,
}: {
  title: string;
  dimension: OrderStatusDimensions["departmental"];
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2.5 py-2 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </div>
      <div
        className={`mt-1 inline-flex max-w-full rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ${dimensionToneClass(dimension.tone)}`}
      >
        <span className="truncate">{dimension.label}</span>
      </div>
      {dimension.detail ? (
        <p className="mt-1 truncate text-2xs text-slate-500 dark:text-slate-400">
          {dimension.detail}
        </p>
      ) : null}
    </div>
  );
}

function DepartmentBox({ box }: { box: DepartmentStageBox }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {box.department}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ${dimensionToneClass(box.status.tone)}`}
        >
          {box.status.label}
        </span>
      </div>

      {box.status.detail ? (
        <p className="mt-1.5 text-2xs leading-snug text-slate-600 dark:text-slate-400">
          {box.status.detail}
        </p>
      ) : null}

      {["finance", "account", "dispatch", "delivery", "return"].includes(
        String(box.id || "").toLowerCase(),
      ) ? (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 dark:border-white/10">
          <div>
            <div className="text-2xs font-medium uppercase text-slate-400">Done</div>
            <div className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {box.completedQty}
            </div>
            <div className="text-2xs text-slate-500">{box.progressLabel}</div>
          </div>
          <div>
            <div className="text-2xs font-medium uppercase text-slate-400">Remaining</div>
            <div
              className={`text-sm font-bold tabular-nums ${
                box.remainingQty > 0
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {box.remainingQty}
            </div>
            <div className="text-2xs text-slate-500">of {box.totalQty} cap</div>
          </div>
        </div>
      ) : null}

      {box.action ? (
        <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/10">
          <div className="text-2xs font-medium uppercase text-slate-400">Latest action</div>
          <span
            className={`mt-1 inline-flex max-w-full rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ${dimensionToneClass(box.action.tone)}`}
          >
            {box.action.label}
          </span>
        </div>
      ) : null}
    </div>
  );
}

type WorkflowGates = {
  adminCleared: boolean;
  dueSheetUploaded: boolean;
  financeCleared: boolean;
  accountCleared: boolean;
};

function ItemsFulfillmentTable({
  lines,
  gates,
}: {
  lines: FulfillmentLine[];
  gates: WorkflowGates;
}) {
  const parentLines = useMemo(
    () => lines.filter((line) => !line.kit_parent_product),
    [lines],
  );

  const bucketsByParent = useMemo(() => {
    const map = new Map<string, FulfillmentLine[]>();
    for (const line of lines) {
      if (!line.kit_parent_product) continue;
      const list = map.get(line.kit_parent_product) ?? [];
      list.push(line);
      map.set(line.kit_parent_product, list);
    }
    return map;
  }, [lines]);

  const parentProductIds = useMemo(() => {
    const set = new Set<string>();
    for (const line of parentLines) {
      if (line.product) set.add(line.product);
    }
    return set;
  }, [parentLines]);

  const orphanBuckets = useMemo(() => {
    const out: FulfillmentLine[] = [];
    for (const [parentId, rows] of bucketsByParent) {
      if (!parentProductIds.has(parentId)) out.push(...rows);
    }
    return out;
  }, [bucketsByParent, parentProductIds]);

  if (lines.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">No order lines to display.</p>
    );
  }

  const renderRow = (
    line: FulfillmentLine,
    opts: { nested?: boolean; isKitParent?: boolean; key: string },
  ) => {
    const financeQty = gates.dueSheetUploaded ? line.approved : 0;
    const accountQty = gates.financeCleared ? line.accountCleared : 0;
    const pendingDispatch = gates.accountCleared ? line.pendingDispatch : 0;
    const pendingDelivery = gates.accountCleared ? line.pendingDelivery : 0;
    const nested = Boolean(opts.nested);

    return (
      <tr
        key={opts.key}
        className={
          nested
            ? "bg-slate-50/80 dark:bg-slate-950/60"
            : "bg-white dark:bg-slate-900"
        }
      >
        <td className="px-3 py-2">
          {nested ? (
            <div className="ml-4 border-l-2 border-violet-300 pl-3 dark:border-violet-700">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {line.product_name}
              </span>
              <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
                KIT BUCKET
              </span>
              {line.sku ? (
                <span className="mt-0.5 block font-mono text-2xs text-slate-400">
                  {line.sku}
                </span>
              ) : null}
            </div>
          ) : (
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {line.product_name}
              </span>
              {opts.isKitParent ? (
                <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
                  KIT
                </span>
              ) : null}
              {line.sku ? (
                <span className="mt-0.5 block font-mono text-2xs text-slate-400">
                  {line.sku}
                </span>
              ) : null}
            </div>
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{line.salesApproved}</td>
        <td className="px-3 py-2 text-right tabular-nums">{financeQty}</td>
        <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
          {accountQty}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{line.dispatched}</td>
        <td className="px-3 py-2 text-right tabular-nums">{line.delivered}</td>
        <td className="px-3 py-2 text-right tabular-nums font-medium text-rose-700 dark:text-rose-400">
          {line.returned}
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-700 dark:text-blue-400">
          {pendingDispatch}
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-medium text-violet-700 dark:text-violet-400">
          {pendingDelivery}
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-medium text-orange-700 dark:text-orange-400">
          {line.pendingReturn}
        </td>
      </tr>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10">
      <table className="w-full min-w-[1100px] text-left text-xs">
        <thead className="bg-slate-50/90 text-2xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2 text-right">Admin</th>
            <th className="px-3 py-2 text-right">Finance</th>
            <th className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-400">
              Account
            </th>
            <th className="px-3 py-2 text-right">Dispatched</th>
            <th className="px-3 py-2 text-right">Delivered</th>
            <th className="px-3 py-2 text-right text-rose-700 dark:text-rose-400">Returned</th>
            <th className="px-3 py-2 text-right text-blue-700 dark:text-blue-400">Pending dispatch</th>
            <th className="px-3 py-2 text-right text-violet-700 dark:text-violet-400">Pending delivery</th>
            <th className="px-3 py-2 text-right text-orange-700 dark:text-orange-400">Pending return</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
          {parentLines.map((line) => {
            const buckets = line.product
              ? bucketsByParent.get(line.product) ?? []
              : [];
            return (
              <Fragment key={line.order_item_id}>
                {renderRow(line, {
                  key: `parent-${line.order_item_id}`,
                  isKitParent: buckets.length > 0,
                })}
                {buckets.map((bucket) =>
                  renderRow(bucket, {
                    nested: true,
                    key: `bucket-${bucket.order_item_id}`,
                  }),
                )}
              </Fragment>
            );
          })}
          {orphanBuckets.map((line) =>
            renderRow(line, {
              nested: true,
              key: `orphan-${line.order_item_id}`,
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Header panel: summary strip + per-department boxes + item fulfillment table. */
export function OrderDepartmentFulfillmentPanel({
  order,
  fulfillmentSnapshot,
  dimensions: dimensionsProp,
  returns,
  dispatches,
  className = "",
  showItemsTable = true,
  showDepartmentBoxes = true,
}: Props) {
  const fulfillmentOptions = useMemo(
    () => ({ returns, dispatches }),
    [returns, dispatches],
  );

  const dimensions =
    dimensionsProp ?? computeOrderStatusDimensions(order, fulfillmentSnapshot);
  const departmentBoxes = computeDepartmentStageBoxes(
    order,
    fulfillmentSnapshot,
    fulfillmentOptions,
  );
  const lines = fulfillmentLinesFromSnapshot(order, fulfillmentSnapshot, fulfillmentOptions);
  const workflowGates = useMemo<WorkflowGates>(() => {
    if (!order) {
      return {
        adminCleared: false,
        dueSheetUploaded: false,
        financeCleared: false,
        accountCleared: false,
      };
    }
    return {
      adminCleared: isAdminCleared(order),
      dueSheetUploaded: isDueSheetStageCleared(order),
      financeCleared: isFinanceCleared(order),
      accountCleared: isAccountCleared(order),
    };
  }, [order]);

  if (!dimensions) return null;

  return (
    <div className={`space-y-3 ${className}`} aria-label="Order workflow and fulfillment">
      {showDepartmentBoxes ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
          {departmentBoxes.map((box) => (
            <DepartmentBox key={box.id} box={box} />
          ))}
        </div>
      ) : null}

      {showItemsTable ? (
        <div>
          <h3 className="mb-2 text-2xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Item fulfillment &amp; remaining quantities
          </h3>
          {!workflowGates.dueSheetUploaded && workflowGates.adminCleared ? (
            <p className="mb-2 text-2xs text-amber-700 dark:text-amber-400">
              Finance quantities stay at 0 until the due sheet is uploaded or
              marked uploaded on the approval.
            </p>
          ) : null}
          <ItemsFulfillmentTable lines={lines} gates={workflowGates} />
        </div>
      ) : null}
    </div>
  );
}
