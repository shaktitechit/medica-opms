"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Download, Receipt, Search, X } from "lucide-react";

import { downloadCsvFile } from "@/components/portal/admin/components/reportDownloadUtils";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import {
  buildSubmittedDispatchQtyByOrderId,
  filterUnbilledOrders,
  orderUnbilledQuantityTotals,
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
  /** Optional workflow badge renderer */
  renderStatusBadge?: (order: unknown) => ReactNode;
  /**
   * @deprecated Modal loads its own post-approval order pool when open.
   * Kept for call-site compatibility; ignored.
   */
  orders?: unknown[];
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
 * Lists unbilled orders: all departments approved, with OrderDispatch created
 * and submitted, where that submitted qty is still less than approved qty.
 */
export function UnbilledOrdersModal({
  isOpen,
  onClose,
  partyNameById,
  portalBasePath,
  renderStatusBadge,
}: UnbilledOrdersModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const ordersQ = useListOrdersQuery(UNBILLED_LIST_PARAMS, { skip: !isOpen });
  const dispatchesQ = useListDispatchesQuery({}, { skip: !isOpen });

  const loadedOrders = useMemo(() => pickOrders(ordersQ.data), [ordersQ.data]);
  const submittedDispatchQtyByOrderId = useMemo(
    () => buildSubmittedDispatchQtyByOrderId(pickList(dispatchesQ.data)),
    [dispatchesQ.data],
  );
  const categoryOptions = useMemo(
    () => ({ submittedDispatchQtyByOrderId }),
    [submittedDispatchQtyByOrderId],
  );

  const unbilledOrders = useMemo(
    () => filterUnbilledOrders(loadedOrders, categoryOptions),
    [loadedOrders, categoryOptions],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return unbilledOrders;
    return unbilledOrders.filter((raw) => {
      if (!raw || typeof raw !== "object") return false;
      const o = raw as Record<string, unknown>;
      const ref = String(o.order_no ?? o.order_number ?? o._id ?? o.id ?? "");
      const party = resolveOrderCounterparty(o, partyNameById);
      return ref.toLowerCase().includes(q) || party.toLowerCase().includes(q);
    });
  }, [unbilledOrders, searchQuery, partyNameById]);

  const handleDownloadCsv = useCallback(() => {
    const headers = [
      "Order No",
      "Party",
      "Approved Qty",
      "Dispatch Submitted Qty",
      "Remaining Qty",
      "Grand Total",
      "Created",
      "Order Id",
    ];
    const rows = filtered.map((raw) => {
      const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const id = orderKey(o);
      const ref = String(o.order_no ?? o.order_number ?? id ?? "");
      const party = resolveOrderCounterparty(o, partyNameById);
      const { approved, submittedDispatch } = orderUnbilledQuantityTotals(o, categoryOptions);
      const remaining = Math.max(0, approved - submittedDispatch);
      const total = Number(o.grand_total ?? o.total ?? 0);
      const created = formatDateShort(o.order_date ?? o.created_at ?? o.createdAt);
      return [
        ref,
        party,
        approved,
        submittedDispatch,
        remaining,
        total.toFixed(2),
        created === "—" ? "" : created,
        id,
      ];
    });
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsvFile(`un_billed_orders_${dateStamp}.csv`, headers, rows, [
      `Un Billed Orders export · ${dateStamp}`,
      `Rows: ${rows.length}`,
    ]);
  }, [filtered, partyNameById, categoryOptions]);

  if (!isOpen) return null;

  const busy =
    ordersQ.isLoading ||
    ordersQ.isFetching ||
    dispatchesQ.isLoading ||
    dispatchesQ.isFetching;
  const isError = ordersQ.isError || dispatchesQ.isError;
  const canDownload = !busy && !isError && filtered.length > 0;

  return (
    <ModalOverlay onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unbilled-orders-title"
        className="flex max-h-[min(90vh,820px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
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
                  {!busy && unbilledOrders.length > 0
                    ? ` · ${unbilledOrders.length} order${unbilledOrders.length === 1 ? "" : "s"}`
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
              title={
                canDownload
                  ? "Download visible un billed orders as CSV"
                  : "Nothing to download"
              }
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
              placeholder="Search by order no or party…"
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
                    Order No
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Party
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Qty (approved / dispatch submitted)
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Remaining
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Total
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Created
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-slate-500">
                    Open
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filtered.map((raw) => {
                  const o = raw as Record<string, unknown>;
                  const id = orderKey(o);
                  const ref = String(o.order_no ?? o.order_number ?? id ?? "—");
                  const party = resolveOrderCounterparty(o, partyNameById);
                  const { approved, submittedDispatch } = orderUnbilledQuantityTotals(
                    o,
                    categoryOptions,
                  );
                  const remaining = Math.max(0, approved - submittedDispatch);
                  const total = Number(o.grand_total ?? o.total ?? 0);
                  const created = formatDateShort(o.order_date ?? o.created_at ?? o.createdAt);
                  const href = id ? `${portalBasePath}/order/${id}` : portalBasePath;

                  return (
                    <tr
                      key={id || ref}
                      className="transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-800 dark:text-slate-100">
                        {ref}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{party}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">
                        {approved} / {submittedDispatch}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-cyan-700 dark:text-cyan-400">
                        {remaining}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                        ₹{formatMoney(total)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{created}</td>
                      <td className="px-4 py-2.5">
                        {renderStatusBadge ? renderStatusBadge(raw) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={href}
                          onClick={onClose}
                          className="inline-flex rounded-md bg-cyan-600 px-2.5 py-1 text-2xs font-semibold text-white transition hover:bg-cyan-700"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
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
