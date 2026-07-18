"use client";

import { useMemo } from "react";
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

      {["dispatch", "delivery", "return"].includes(String(box.id || "").toLowerCase()) ? (
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

function ItemsFulfillmentTable({ lines }: { lines: FulfillmentLine[] }) {
  if (lines.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">No order lines to display.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10">
      <table className="w-full min-w-[980px] text-left text-xs">
        <thead className="bg-slate-50/90 text-2xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-400">
              Approved
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
          {lines.map((line) => (
            <tr key={line.order_item_id} className="bg-white dark:bg-slate-900">
              <td className="px-3 py-2">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {line.product_name}
                </span>
                {line.sku ? (
                  <span className="mt-0.5 block font-mono text-2xs text-slate-400">
                    {line.sku}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                {line.accountCleared}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{line.dispatched}</td>
              <td className="px-3 py-2 text-right tabular-nums">{line.delivered}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-rose-700 dark:text-rose-400">
                {line.returned}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-700 dark:text-blue-400">
                {line.pendingDispatch}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-violet-700 dark:text-violet-400">
                {line.pendingDelivery}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-orange-700 dark:text-orange-400">
                {line.pendingReturn}
              </td>
            </tr>
          ))}
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

  if (!dimensions) return null;

  return (
    <div className={`space-y-3 ${className}`} aria-label="Order workflow and fulfillment">
      {showDepartmentBoxes ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
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
          <ItemsFulfillmentTable lines={lines} />
        </div>
      ) : null}
    </div>
  );
}
