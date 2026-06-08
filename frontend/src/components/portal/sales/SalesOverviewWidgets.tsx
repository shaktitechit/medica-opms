"use client";

import { useMemo } from "react";
import { FileText, TrendingUp, Package, Clock, AlertTriangle } from "lucide-react";
import { getOrderTabCategory } from "./orderUtils";

interface SalesOverviewWidgetsProps {
  orders: any[];
  isOrdersFetching: boolean;
}

export default function SalesOverviewWidgets({ orders, isOrdersFetching }: SalesOverviewWidgetsProps) {
  const orderStats = useMemo(() => {
    const stats = {
      draft: { count: 0, quantity: 0 },
      open: { count: 0, quantity: 0 },
      closed: { count: 0, quantity: 0 },
      on_hold: { count: 0, quantity: 0 },
      rejected: { count: 0, quantity: 0 },
      cancelled: { count: 0, quantity: 0 },
    };

    for (const o of orders) {
      const cat = getOrderTabCategory(o);
      const items = Array.isArray(o.order_items) ? o.order_items : [];
      let orderQty = 0;
      items.forEach((item: any) => {
        orderQty += Number(item.ordered_quantity ?? item.quantity ?? 0);
      });

      if (cat in stats) {
        stats[cat].count++;
        stats[cat].quantity += orderQty;
      }
    }

    return stats;
  }, [orders]);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {/* CARD 1: DRAFT ORDERS */}
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="absolute top-0 left-0 h-1 w-full bg-slate-400" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
            Draft Orders
          </span>
          <div className="rounded-lg bg-slate-50 p-1.5 dark:bg-slate-800">
            <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {isOrdersFetching ? (
              <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              orderStats.draft.count
            )}
          </h3>
          <p className="mt-1 text-[11px] font-medium text-slate-550 dark:text-slate-400">
            Total Items: <span className="font-semibold text-slate-750 dark:text-slate-300">{orderStats.draft.quantity}</span>
          </p>
        </div>
      </div>

      {/* CARD 2: OPEN ORDERS */}
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="absolute top-0 left-0 h-1 w-full bg-blue-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-blue-500 uppercase dark:text-blue-400">
            Open Orders
          </span>
          <div className="rounded-lg bg-blue-50 p-1.5 dark:bg-blue-955/30">
            <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {isOrdersFetching ? (
              <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              orderStats.open.count
            )}
          </h3>
          <p className="mt-1 text-[11px] font-medium text-slate-555 dark:text-slate-400">
            Total Items: <span className="font-semibold text-slate-750 dark:text-slate-300">{orderStats.open.quantity}</span>
          </p>
        </div>
      </div>

      {/* CARD 3: CLOSED ORDERS */}
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-emerald-500 uppercase dark:text-emerald-400">
            Closed Orders
          </span>
          <div className="rounded-lg bg-emerald-50 p-1.5 dark:bg-emerald-950/30">
            <Package className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {isOrdersFetching ? (
              <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              orderStats.closed.count
            )}
          </h3>
          <p className="mt-1 text-[11px] font-medium text-slate-555 dark:text-slate-400">
            Total Items: <span className="font-semibold text-slate-750 dark:text-slate-300">{orderStats.closed.quantity}</span>
          </p>
        </div>
      </div>

      {/* CARD 4: ON HOLD ORDERS */}
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="absolute top-0 left-0 h-1 w-full bg-amber-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-amber-500 uppercase dark:text-amber-450">
            On Hold
          </span>
          <div className="rounded-lg bg-amber-50 p-1.5 dark:bg-amber-955/30">
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {isOrdersFetching ? (
              <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              orderStats.on_hold.count
            )}
          </h3>
          <p className="mt-1 text-[11px] font-medium text-slate-555 dark:text-slate-400">
            Total Items: <span className="font-semibold text-slate-750 dark:text-slate-300">{orderStats.on_hold.quantity}</span>
          </p>
        </div>
      </div>

      {/* CARD 5: REJECTED ORDERS */}
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="absolute top-0 left-0 h-1 w-full bg-red-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-red-500 uppercase dark:text-red-400">
            Rejected
          </span>
          <div className="rounded-lg bg-rose-50 p-1.5 dark:bg-rose-955/30">
            <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {isOrdersFetching ? (
              <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              orderStats.rejected.count
            )}
          </h3>
          <p className="mt-1 text-[11px] font-medium text-slate-555 dark:text-slate-400">
            Total Items: <span className="font-semibold text-slate-750 dark:text-slate-300">{orderStats.rejected.quantity}</span>
          </p>
        </div>
      </div>

      {/* CARD 6: CANCELLED ORDERS */}
      <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900">
        <div className="absolute top-0 left-0 h-1 w-full bg-rose-500" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider text-rose-555 uppercase dark:text-rose-450">
            Cancelled
          </span>
          <div className="rounded-lg bg-rose-50 p-1.5 dark:bg-rose-955/30">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {isOrdersFetching ? (
              <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            ) : (
              orderStats.cancelled.count
            )}
          </h3>
          <p className="mt-1 text-[11px] font-medium text-slate-555 dark:text-slate-400">
            Total Items: <span className="font-semibold text-slate-750 dark:text-slate-300">{orderStats.cancelled.quantity}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
