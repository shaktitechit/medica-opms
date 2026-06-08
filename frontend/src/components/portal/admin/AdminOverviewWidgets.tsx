"use client";

import { useMemo } from "react";
import {
  FileText,
  TrendingUp,
  Package,
  Clock,
  AlertTriangle,
  XCircle,
  Layers,
  Coins
} from "lucide-react";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";

interface AdminOverviewWidgetsProps {
  orders: any[];
  isOrdersFetching: boolean;
}

function formatMoney(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function AdminOverviewWidgets({ orders, isOrdersFetching }: AdminOverviewWidgetsProps) {
  const orderStats = useMemo(() => {
    const stats = {
      pending_review: { count: 0, quantity: 0, amount: 0 },
      open: { count: 0, quantity: 0, amount: 0 },
      closed: { count: 0, quantity: 0, amount: 0 },
      on_hold: { count: 0, quantity: 0, amount: 0 },
      rejected: { count: 0, quantity: 0, amount: 0 },
      cancelled: { count: 0, quantity: 0, amount: 0 },
    };

    for (const o of orders) {
      const status = deriveOrderWorkflowStatus(o);
      let cat: keyof typeof stats = "open";

      if (status === "draft") {
        continue;
      }
      
      if (status === "on_hold") {
        cat = "on_hold";
      } else if (status === "cancelled") {
        cat = "cancelled";
      } else if (status === "finance_rejected") {
        cat = "rejected";
      } else if (status === "submitted") {
        cat = "pending_review";
      } else {
        const items = Array.isArray(o.order_items) ? o.order_items : [];
        let ordered = 0;
        let delivered = 0;
        items.forEach((line: any) => {
          ordered += Number(line.ordered_quantity ?? line.quantity ?? 0);
          delivered += Number(line.delivered_quantity ?? 0);
        });

        if (ordered > 0 && delivered >= ordered) {
          cat = "closed";
        } else {
          cat = "open";
        }
      }

      const items = Array.isArray(o.order_items) ? o.order_items : [];
      let orderQty = 0;
      items.forEach((item: any) => {
        orderQty += Number(item.ordered_quantity ?? item.quantity ?? 0);
      });
      const orderAmount = Number(o.grand_total ?? o.total ?? 0);

      stats[cat].count++;
      stats[cat].quantity += orderQty;
      stats[cat].amount += orderAmount;
    }

    return stats;
  }, [orders]);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 font-sans">
      {/* CARD 1: PENDING REVIEW */}
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="absolute top-0 left-0 h-1 w-full bg-purple-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-purple-500 uppercase dark:text-purple-400">
            Pending Review
          </span>
          <div className="rounded-lg bg-purple-50 p-1.5 dark:bg-purple-950/30 border border-purple-100/45 dark:border-purple-500/10">
            <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-sans">
            {isOrdersFetching ? (
              <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              orderStats.pending_review.count
            )}
          </h3>
          <div className="mt-4 space-y-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
              <Layers className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Items:</span>
              <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">{orderStats.pending_review.quantity}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
              <Coins className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Value:</span>
              <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">₹{formatMoney(orderStats.pending_review.amount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 2: OPEN ORDERS */}
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="absolute top-0 left-0 h-1 w-full bg-blue-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-blue-500 uppercase dark:text-blue-400">
            Open Orders
          </span>
          <div className="rounded-lg bg-blue-50 p-1.5 dark:bg-blue-950/30 border border-blue-100/45 dark:border-blue-500/10">
            <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-sans">
            {isOrdersFetching ? (
              <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              orderStats.open.count
            )}
          </h3>
          <div className="mt-4 space-y-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
              <Layers className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Items:</span>
              <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">{orderStats.open.quantity}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
              <Coins className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Value:</span>
              <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">₹{formatMoney(orderStats.open.amount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 3: CLOSED ORDERS */}
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-emerald-500 uppercase dark:text-emerald-400">
            Closed Orders
          </span>
          <div className="rounded-lg bg-emerald-50 p-1.5 dark:bg-emerald-950/30 border border-emerald-100/45 dark:border-emerald-500/10">
            <Package className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-sans">
            {isOrdersFetching ? (
              <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              orderStats.closed.count
            )}
          </h3>
          <div className="mt-4 space-y-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
              <Layers className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Items:</span>
              <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">{orderStats.closed.quantity}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
              <Coins className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Value:</span>
              <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">₹{formatMoney(orderStats.closed.amount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 4: ON HOLD ORDERS */}
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="absolute top-0 left-0 h-1 w-full bg-amber-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-amber-500 uppercase dark:text-amber-455">
            On Hold
          </span>
          <div className="rounded-lg bg-amber-50 p-1.5 dark:bg-amber-955/30 border border-amber-105/45 dark:border-amber-500/10">
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-sans">
            {isOrdersFetching ? (
              <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              orderStats.on_hold.count
            )}
          </h3>
          <div className="mt-4 space-y-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
              <Layers className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Items:</span>
              <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">{orderStats.on_hold.quantity}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
              <Coins className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Value:</span>
              <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">₹{formatMoney(orderStats.on_hold.amount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 5: REJECTED ORDERS */}
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="absolute top-0 left-0 h-1 w-full bg-red-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-red-500 uppercase dark:text-red-400">
            Rejected
          </span>
          <div className="rounded-lg bg-rose-50 p-1.5 dark:bg-rose-955/30 border border-rose-100/45 dark:border-rose-500/10">
            <XCircle className="h-4 w-4 text-red-650 dark:text-red-400" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-sans">
            {isOrdersFetching ? (
              <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              orderStats.rejected.count
            )}
          </h3>
          <div className="mt-4 space-y-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
              <Layers className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Items:</span>
              <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">{orderStats.rejected.quantity}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
              <Coins className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Value:</span>
              <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">₹{formatMoney(orderStats.rejected.amount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 6: CANCELLED ORDERS */}
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="absolute top-0 left-0 h-1 w-full bg-rose-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-rose-555 uppercase dark:text-rose-450">
            Cancelled
          </span>
          <div className="rounded-lg bg-rose-50 p-1.5 dark:bg-rose-955/30 border border-rose-100/45 dark:border-rose-500/10">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-sans">
            {isOrdersFetching ? (
              <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              orderStats.cancelled.count
            )}
          </h3>
          <div className="mt-4 space-y-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
              <Layers className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Items:</span>
              <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">{orderStats.cancelled.quantity}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
              <Coins className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Value:</span>
              <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">₹{formatMoney(orderStats.cancelled.amount)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
