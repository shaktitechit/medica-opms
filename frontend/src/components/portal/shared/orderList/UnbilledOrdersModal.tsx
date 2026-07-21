"use client";

import Link from "next/link";
import { Fragment, useCallback, useMemo, useState } from "react";
import { Download, Receipt, Search, X } from "lucide-react";

import { downloadCsvFile } from "@/components/portal/admin/components/reportDownloadUtils";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import {
  buildSubmittedDispatchQtyByOrderId,
  buildSubmittedDispatchQtyByOrderLineId,
  filterUnbilledOrders,
  listUnbilledOrderLines,
  orderUnbilledQuantityTotals,
  type UnbilledOrderLine,
} from "@/components/portal/shared/orderList/unbilledOrders";
import { resolveOrderCounterparty } from "@/components/portal/sales/partyDisplay";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { useListDispatchesQuery, useListOrdersQuery } from "@/store/api";

/** Broad pool for unbilled candidates — not scoped to the current workflow tab. */
const UNBILLED_LIST_PARAMS: Record<string, string> = {
  exclude_status: "draft,submitted,on_hold,cancelled,finance_rejected",
};

export type UnbilledOrdersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  partyNameById: Map<string, string>;
  /** Portal prefix for order detail links, e.g. "/account" */
  portalBasePath: string;
  /**
   * @deprecated Modal loads its own post-approval order pool when open.
   * Kept for call-site compatibility; ignored.
   */
  orders?: unknown[];
};

type UnbilledOrderView = {
  orderId: string;
  orderNo: string;
  party: string;
  approved: number;
  submittedDispatch: number;
  remaining: number;
  total: number;
  created: string;
  href: string;
  lines: UnbilledOrderLine[];
};

function pickList(raw: unknown): unknown[] {
  return pickOrders(raw);
}

function orderKey(row: unknown): string {
  if (row && typeof row === "object") {
    const o = row as { _id?: unknown; id?: unknown };
    if (o._id != null) return String(o._id);
    if (o.id != null) return String(o.id);
  }
  return "";
}

function formatMoney(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateShort(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Un Billed Orders modal — orders with their line items listed underneath.
 */
export function UnbilledOrdersModal({
  isOpen,
  onClose,
  partyNameById,
  portalBasePath,
}: UnbilledOrdersModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const ordersQ = useListOrdersQuery(UNBILLED_LIST_PARAMS, { skip: !isOpen });
  const dispatchesQ = useListDispatchesQuery({}, { skip: !isOpen });

  const loadedOrders = useMemo(() => pickOrders(ordersQ.data), [ordersQ.data]);
  const dispatchRows = useMemo(() => pickList(dispatchesQ.data), [dispatchesQ.data]);

  const categoryOptions = useMemo(
    () => ({
      submittedDispatchQtyByOrderId: buildSubmittedDispatchQtyByOrderId(dispatchRows),
      submittedDispatchQtyByOrderLineId: buildSubmittedDispatchQtyByOrderLineId(dispatchRows),
    }),
    [dispatchRows],
  );

  const unbilledOrders = useMemo(
    () => filterUnbilledOrders(loadedOrders, categoryOptions),
    [loadedOrders, categoryOptions],
  );

  const orderViews = useMemo((): UnbilledOrderView[] => {
    return unbilledOrders.map((raw) => {
      const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const orderId = orderKey(o);
      const orderNo = String(o.order_no ?? o.order_number ?? orderId ?? "—");
      const { approved, submittedDispatch } = orderUnbilledQuantityTotals(o, categoryOptions);
      return {
        orderId,
        orderNo,
        party: resolveOrderCounterparty(o, partyNameById),
        approved,
        submittedDispatch,
        remaining: Math.max(0, approved - submittedDispatch),
        total: Number(o.grand_total ?? o.total ?? 0),
        created: formatDateShort(o.order_date ?? o.created_at ?? o.createdAt),
        href: orderId ? `${portalBasePath}/order/${orderId}` : portalBasePath,
        lines: listUnbilledOrderLines(o, categoryOptions),
      };
    });
  }, [unbilledOrders, partyNameById, categoryOptions, portalBasePath]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orderViews;
    return orderViews.filter((view) => {
      if (view.orderNo.toLowerCase().includes(q) || view.party.toLowerCase().includes(q)) {
        return true;
      }
      return view.lines.some(
        (line) =>
          line.productName.toLowerCase().includes(q) ||
          line.sku.toLowerCase().includes(q),
      );
    });
  }, [orderViews, searchQuery]);

  const handleDownloadCsv = useCallback(() => {
    const headers = [
      "Order No",
      "Party",
      "Product",
      "SKU",
      "Approved Qty",
      "Dispatch Submitted Qty",
      "Unbilled Qty",
      "Order Grand Total",
      "Created",
      "Order Id",
    ];
    const rows: Array<Array<string | number>> = [];
    for (const view of filtered) {
      if (view.lines.length === 0) {
        rows.push([
          view.orderNo,
          view.party,
          "",
          "",
          view.approved,
          view.submittedDispatch,
          view.remaining,
          view.total.toFixed(2),
          view.created === "—" ? "" : view.created,
          view.orderId,
        ]);
        continue;
      }
      for (const line of view.lines) {
        rows.push([
          view.orderNo,
          view.party,
          line.productName,
          line.sku,
          line.approved,
          line.submittedDispatch,
          line.remaining,
          view.total.toFixed(2),
          view.created === "—" ? "" : view.created,
          view.orderId,
        ]);
      }
    }
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsvFile(`un_billed_orders_${dateStamp}.csv`, headers, rows, [
      `Un Billed Orders export · ${dateStamp}`,
      `Orders: ${filtered.length} · Line rows: ${rows.length}`,
    ]);
  }, [filtered]);

  if (!isOpen) return null;

  const busy =
    ordersQ.isLoading ||
    ordersQ.isFetching ||
    dispatchesQ.isLoading ||
    dispatchesQ.isFetching;
  const isError = ordersQ.isError || dispatchesQ.isError;
  const canDownload = !busy && !isError && filtered.length > 0;
  const lineCount = filtered.reduce((sum, view) => sum + view.lines.length, 0);

  return (
    <ModalOverlay onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unbilled-orders-title"
        className="flex max-h-[min(90vh,820px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400">
                <Receipt className="h-4 w-4" />
              </span>
              <div>
                <h2
                  id="unbilled-orders-title"
                  className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50"
                >
                  Un Billed Orders
                </h2>
                <p className="mt-0.5 text-2xs text-slate-500 dark:text-slate-400">
                  Fully approved with dispatch created &amp; submitted — qty still below approved
                  {!busy && filtered.length > 0
                    ? ` · ${filtered.length} order${filtered.length === 1 ? "" : "s"} · ${lineCount} item${lineCount === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={!canDownload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 shadow-sm transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-cyan-700/50 dark:bg-cyan-950/40 dark:text-cyan-400 dark:hover:bg-cyan-900/30"
              title={canDownload ? "Download visible orders and items as CSV" : "Nothing to download"}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-slate-100 px-5 py-3 dark:border-white/5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by order no, party, or product…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-800 outline-none ring-cyan-500/30 placeholder:text-slate-400 focus:border-cyan-400 focus:bg-white focus:ring-2 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {isError ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Failed to load orders
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Could not fetch un billed orders or dispatches. Try again.
              </p>
            </div>
          ) : busy && loadedOrders.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Loading un billed orders…
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                No un billed orders
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {unbilledOrders.length === 0
                  ? "No fully approved orders have a created & submitted dispatch with qty still below approved."
                  : "No orders match your search."}
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur dark:bg-slate-900/95">
                <tr className="border-b border-slate-100 dark:border-white/5">
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Order / Item
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Party
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Qty (approved / dispatch submitted)
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Unbilled
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Total
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Created
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-slate-500">
                    Open
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((view) => (
                  <Fragment key={view.orderId || view.orderNo}>
                    <tr className="border-t border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-800 dark:text-slate-100">
                        {view.orderNo}
                        <span className="ml-2 font-sans text-2xs font-medium text-slate-500">
                          {view.lines.length} item{view.lines.length === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                        {view.party}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                        {view.approved} / {view.submittedDispatch}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-cyan-700 dark:text-cyan-400">
                        {view.remaining}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                        ₹{formatMoney(view.total)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{view.created}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={view.href}
                          onClick={onClose}
                          className="inline-flex rounded-md bg-cyan-600 px-2.5 py-1 text-2xs font-semibold text-white transition hover:bg-cyan-700"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                    {view.lines.map((line) => (
                      <tr
                        key={`${view.orderId}-${line.orderItemId}`}
                        className="border-t border-slate-100 bg-white dark:border-white/5 dark:bg-slate-900"
                      >
                        <td className="px-4 py-2 pl-8 text-slate-700 dark:text-slate-300">
                          <div className="font-medium">{line.productName}</div>
                          {line.sku ? (
                            <div className="text-2xs text-slate-400">SKU {line.sku}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-slate-400">—</td>
                        <td className="px-4 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                          {line.approved} / {line.submittedDispatch}
                        </td>
                        <td className="px-4 py-2 tabular-nums font-semibold text-cyan-700 dark:text-cyan-400">
                          {line.remaining}
                        </td>
                        <td className="px-4 py-2 text-slate-400">—</td>
                        <td className="px-4 py-2 text-slate-400">—</td>
                        <td className="px-4 py-2" />
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}

/** @deprecated Use UnbilledOrdersModal */
export const OpenOrdersModal = UnbilledOrdersModal;
export type OpenOrdersModalProps = UnbilledOrdersModalProps;
