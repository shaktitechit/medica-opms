"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useListOrdersQuery, useListPartiesQuery } from "@/store/api";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import {
  ClipboardList,
  Search,
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";

function fmt(status?: string): string {
  if (!status) return "—";
  return status.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function getStatusBadgeClass(status?: string): string {
  const s = (status || "").toLowerCase();
  if (s === "draft") return "bg-slate-100 text-slate-800 ring-1 ring-slate-600/10 dark:bg-slate-900/40 dark:text-slate-400 dark:ring-white/10";
  if (["submitted", "sales_approved", "on_hold"].includes(s))
    return "bg-amber-50 text-amber-800 ring-1 ring-amber-600/10 dark:bg-amber-950/20 dark:text-amber-400";
  if (["finance_review", "finance_rejected"].includes(s))
    return "bg-rose-50 text-rose-800 ring-1 ring-rose-600/10 dark:bg-rose-950/20 dark:text-rose-400";
  if (s.includes("dispatch") || s.includes("transport") || s.includes("transit"))
    return "bg-blue-50 text-blue-800 ring-1 ring-blue-600/10 dark:bg-blue-950/20 dark:text-blue-400";
  if (s === "delivered" || s.includes("paid") || s === "closed")
    return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/10 dark:bg-emerald-950/20 dark:text-emerald-400";
  return "bg-slate-50 text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900/20 dark:text-slate-400";
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "finance_review", label: "Finance Review" },
  { value: "dispatch_pending", label: "Dispatch Pending" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "on_hold", label: "On Hold" },
];

const PAGE_SIZE = 20;

export default function SuperAdminOrdersPage() {
  const { data: ordersRaw, isFetching, isError, refetch } = useListOrdersQuery({});
  const { data: partiesRaw } = useListPartiesQuery({});

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const partyNameById = useMemo(() => {
    const list = Array.isArray(partiesRaw) ? partiesRaw : (partiesRaw as any)?.data ?? [];
    const map = new Map<string, string>();
    for (const p of list) {
      const id = String(p._id || p.id || "");
      if (id) map.set(id, p.party_name || p.name || id.slice(0, 8));
    }
    return map;
  }, [partiesRaw]);

  const allOrders = useMemo(() => pickOrders(ordersRaw) as any[], [ordersRaw]);

  const filtered = useMemo(() => {
    let list = allOrders;
    if (statusFilter !== "all") list = list.filter((o: any) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o: any) => {
        const ref = (o.order_no || o.order_number || "").toLowerCase();
        const partyId = String(o.party || o.customer || "");
        const partyName = (partyNameById.get(partyId) || "").toLowerCase();
        return ref.includes(q) || partyName.includes(q);
      });
    }
    return [...list].sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
  }, [allOrders, statusFilter, search, partyNameById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page on filter change
  const setFilter = (v: string) => { setStatusFilter(v); setPage(1); };
  const setQ = (v: string) => { setSearch(v); setPage(1); };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">All Orders</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} orders {statusFilter !== "all" ? `(${fmt(statusFilter)})` : "system-wide"}</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search order ref or party name…"
            value={search}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${statusFilter === value ? "bg-violet-600 text-white shadow" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 overflow-hidden">
        {isError && (
          <div className="flex items-center gap-2 p-5 text-sm text-rose-700 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Could not load orders.
          </div>
        )}
        {isFetching && !allOrders.length ? (
          <div className="space-y-3 p-5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500 dark:border-white/5 dark:text-slate-400">
                    <th className="px-4 py-3 font-semibold">Order Ref</th>
                    <th className="px-4 py-3 font-semibold">Party</th>
                    <th className="px-4 py-3 font-semibold text-right">Amount (₹)</th>
                    <th className="px-4 py-3 font-semibold text-center hidden md:table-cell">Priority</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold hidden sm:table-cell">Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                        No orders match your search/filter.
                      </td>
                    </tr>
                  ) : (
                    paginated.map((o: any) => {
                      const id = String(o._id || o.id || "");
                      const ref = o.order_no || id.slice(0, 10) || "—";
                      const partyId = String(o.party || o.customer || "");
                      const partyName = partyNameById.get(partyId) || partyId.slice(0, 8) || "—";
                      const total = Number(o.grand_total ?? o.total ?? 0);
                      const pri = o.priority || "normal";
                      const date = o.order_date || o.createdAt;
                      return (
                        <tr key={id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition">
                          <td className="px-4 py-3 font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-100">{ref.slice(0, 14)}</td>
                          <td className="max-w-[140px] truncate px-4 py-3 text-xs text-slate-800 dark:text-slate-200" title={partyName}>{partyName}</td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">
                            {Number.isFinite(total) ? total.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "0.00"}
                          </td>
                          <td className="px-4 py-3 text-center hidden md:table-cell">
                            <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${["high", "urgent"].includes(pri) ? "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400" : "text-slate-500"}`}>
                              {pri}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium tracking-wide ${getStatusBadgeClass(o.status)}`}>
                              {fmt(o.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-xs text-slate-500 dark:text-slate-400">
                            {date ? new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/super_admin/order/${id}`} className="text-xs font-semibold text-violet-600 hover:underline dark:text-violet-400">
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-white/5">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Page {page} of {totalPages} — {filtered.length} total
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-3 w-3" /> Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Next <ChevronRightIcon className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
