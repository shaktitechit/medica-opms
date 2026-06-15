"use client";

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
      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </div>
      <div
        className={`mt-1 inline-flex max-w-full rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${dimensionToneClass(dimension.tone)}`}
      >
        <span className="truncate">{dimension.label}</span>
      </div>
      {dimension.detail ? (
        <p className="mt-1 truncate text-[10px] text-slate-500 dark:text-slate-400">
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
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {box.department}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ${dimensionToneClass(box.status.tone)}`}
        >
          {box.status.label}
        </span>
      </div>

      {box.status.detail ? (
        <p className="mt-1.5 text-[10px] leading-snug text-slate-600 dark:text-slate-400">
          {box.status.detail}
        </p>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 dark:border-white/10">
        <div>
          <div className="text-[9px] font-medium uppercase text-slate-400">Done</div>
          <div className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {box.completedQty}
          </div>
          <div className="text-[9px] text-slate-500">{box.progressLabel}</div>
        </div>
        <div>
          <div className="text-[9px] font-medium uppercase text-slate-400">Remaining</div>
          <div
            className={`text-sm font-bold tabular-nums ${
              box.remainingQty > 0
                ? "text-amber-700 dark:text-amber-400"
                : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {box.remainingQty}
          </div>
          <div className="text-[9px] text-slate-500">of {box.totalQty} cap</div>
        </div>
      </div>

      {box.action ? (
        <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/10">
          <div className="text-[9px] font-medium uppercase text-slate-400">Latest action</div>
          <span
            className={`mt-1 inline-flex max-w-full rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ${dimensionToneClass(box.action.tone)}`}
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
      <table className="w-full min-w-[900px] text-left text-[11px]">
        <thead className="bg-slate-50/90 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2 text-right">Ordered</th>
            <th className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-400">
              Sales approved
            </th>
            <th className="px-3 py-2 text-right text-indigo-700 dark:text-indigo-400">
              Finance approved
            </th>
            <th className="px-3 py-2 text-right text-teal-700 dark:text-teal-400">
              Account cleared
            </th>
            <th className="px-3 py-2 text-right">Dispatched</th>
            <th className="px-3 py-2 text-right">Delivered</th>
            <th className="px-3 py-2 text-right text-amber-700 dark:text-amber-400">
              Pending sales approval
            </th>
            <th className="px-3 py-2 text-right text-sky-700 dark:text-sky-400">
              Pending finance
            </th>
            <th className="px-3 py-2 text-right text-teal-700 dark:text-teal-400">
              Pending account
            </th>
            <th className="px-3 py-2 text-right text-blue-700 dark:text-blue-400">Pending dispatch</th>
            <th className="px-3 py-2 text-right text-violet-700 dark:text-violet-400">Pending delivery</th>
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
                  <span className="mt-0.5 block font-mono text-[9px] text-slate-400">
                    {line.sku}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{line.ordered}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                {line.salesApproved}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-indigo-700 dark:text-indigo-400">
                {line.approved}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-teal-700 dark:text-teal-400">
                {line.accountCleared}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{line.dispatched}</td>
              <td className="px-3 py-2 text-right tabular-nums">{line.delivered}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-amber-700 dark:text-amber-400">
                {line.pendingAdmin}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-sky-700 dark:text-sky-400">
                {line.pendingFinance}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-teal-700 dark:text-teal-400">
                {line.pendingAccount}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-700 dark:text-blue-400">
                {line.pendingDispatch}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-violet-700 dark:text-violet-400">
                {line.pendingDelivery}
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
  className = "",
  showItemsTable = true,
  showDepartmentBoxes = true,
}: Props) {
  const dimensions =
    dimensionsProp ?? computeOrderStatusDimensions(order, fulfillmentSnapshot);
  const departmentBoxes = computeDepartmentStageBoxes(order, fulfillmentSnapshot);
  const lines = fulfillmentLinesFromSnapshot(order, fulfillmentSnapshot);

  if (!dimensions) return null;

  return (
    <div className={`space-y-3 ${className}`} aria-label="Order workflow and fulfillment">
      {/* <div className="grid gap-2 sm:grid-cols-3">
        <SummaryPill title="Department" dimension={dimensions.departmental} />
        <SummaryPill title="Fulfillment" dimension={dimensions.fulfillment} />
        <SummaryPill title="Action" dimension={dimensions.action} />
      </div> */}

      {showDepartmentBoxes ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {departmentBoxes.map((box) => (
            <DepartmentBox key={box.id} box={box} />
          ))}
        </div>
      ) : null}

      {showItemsTable ? (
        <div>
          <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Item fulfillment &amp; remaining quantities
          </h3>
          <ItemsFulfillmentTable lines={lines} />
        </div>
      ) : null}
    </div>
  );
}
