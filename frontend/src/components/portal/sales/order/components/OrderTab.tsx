"use client";

import { useMemo } from "react";

type OrderTabProps = {
  orderId: string;
  detail: Record<string, unknown> | null;
  isDraft: boolean;
  user: { _id?: unknown; id?: unknown } | null | undefined;
  refetchOrder: () => void;
};

export default function OrderTab({
  detail,
}: OrderTabProps) {
  const readOnlyItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

  return (
    <div className="space-y-5 text-sm">
      {!readOnlyItems.length ? (
        <p className="text-slate-505 dark:text-slate-400">
          No items in this order.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md ring-1 ring-slate-200/90 dark:ring-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-955 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium text-right">
                  Rate Type
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
              {readOnlyItems.map((line, idx) => {
                const name =
                  typeof line.product_name === "string"
                    ? line.product_name
                    : "—";
                const qty = line.ordered_quantity ?? line.quantity;
                const rateType =
                  typeof line.applied_rate_type === "string"
                    ? line.applied_rate_type
                    : "MANUAL";
                const key =
                  line._id != null ? String(line._id) : `line-${idx}`;
                return (
                  <tr
                    key={key}
                    className="bg-white dark:bg-slate-900"
                  >
                    <td className="max-w-[200px] px-3 py-2">
                      <span className="line-clamp-2 font-semibold text-slate-800 dark:text-slate-250">
                        {name}
                      </span>
                      {typeof line.sku === "string" && line.sku ? (
                        <span className="mt-0.5 block text-[10px] text-slate-550 dark:text-slate-400 font-mono">
                          SKU {line.sku}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {String(qty ?? "—")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {rateType}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
