"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { OrderDetailModal } from "@/components/portal/sales/components/modals/OrderDetailModal";
import {
  buildPartyNameById,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { DashboardCard } from "@/components/widgets";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useListPartiesQuery, useListOrdersQuery } from "@/store/api";

const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

type OrderRow = {
  _id?: string;
  id?: string;
  order_no?: string;
  order_number?: string;
  grand_total?: unknown;
  total?: unknown;
  priority?: string;
  status?: string;
  party?: unknown;
  customer?: unknown;
};

function orderKey(row: unknown): string {
  if (row && typeof row === "object") {
    const o = row as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return "";
}

export default function ListSubmittedOrdersPage() {
  const { data, isFetching, isError, refetch } = useListOrdersQuery({
    status: "submitted", // Verify this matches your backend status name
  });
  const partiesQ = useListPartiesQuery({});

  const orders = useMemo(() => pickOrders(data) as OrderRow[], [data]);

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );

  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);

  const closeModal = useCallback(() => setDetailOrderId(null), []);

  return (
    <div className="space-y-8">
      <OrderDetailModal
        orderId={detailOrderId}
        partyNameById={partyNameById}
        onClose={closeModal}
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Submitted Orders
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Rows from{" "}
            <code className="rounded bg-slate-200/80 px-1 text-xs dark:bg-slate-800">
              GET /api/orders?status=submitted
            </code>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            className={btnSecondaryClass}
          >
            Refresh
          </button>
          <Link href="/sales" className={`${btnSecondaryClass} inline-flex`}>
            Back to overview
          </Link>

          <Link
            href="/sales/create-order"
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 dark:bg-blue-500 dark:shadow-none dark:hover:bg-blue-400"
          >
            New Draft
          </Link>
        </div>
      </div>

      <DashboardCard
        title="Submitted List"
        description="Orders that have been submitted but not yet fulfilled or processed."
      >
        {partiesQ.isError && (
          <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
            Party directory failed to load — names may show as shortened IDs.
          </p>
        )}
        {isFetching && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        )}
        {isError && (
          <p className="text-sm text-rose-600 dark:text-rose-400">
            Could not load submitted orders.
          </p>
        )}
        {!isFetching && !isError && !orders.length && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No submitted orders yet.
          </p>
        )}
        {!isFetching && !isError && orders.length > 0 && (
          <div className="overflow-x-auto rounded-md ring-1 ring-slate-200/90 dark:ring-white/10">
            <table className="min-w-[820px] w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Party</th>
                  <th className="px-3 py-2 font-medium text-right">
                    Grand total
                  </th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                {orders.map((o) => {
                  const id = orderKey(o);
                  const ref =
                    typeof o.order_no === "string"
                      ? o.order_no
                      : typeof o.order_number === "string"
                        ? o.order_number
                        : id || "—";
                  const total = Number(o.grand_total ?? o.total ?? 0);
                  const pri = typeof o.priority === "string" ? o.priority : "—";
                  const st =
                    typeof o.status === "string" ? o.status : "submitted";
                  const cust = resolveOrderCounterparty(
                    o as Record<string, unknown>,
                    partyNameById,
                  );
                  return (
                    <tr key={id || ref} className="bg-white dark:bg-slate-900">
                      <td className="px-3 py-2 font-mono">{ref}</td>
                      <td
                        className="max-w-[220px] truncate px-3 py-2"
                        title={cust}
                      >
                        {cust}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number.isFinite(total) ? total.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 capitalize">{pri}</td>
                      <td className="px-3 py-2 capitalize">{st}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-3">
                          {id ? (
                            <Link
                              href={`/sales/order/${id}`}
                              className="text-blue-600 underline decoration-blue-600/40 underline-offset-2 hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-400/40"
                            >
                              View
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
