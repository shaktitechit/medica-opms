"use client";

import { useMemo } from "react";
import {
  Clock,
  TrendingUp,
  Package,
  AlertTriangle,
  XCircle,
  Layers,
  Coins
} from "lucide-react";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";

interface FinanceOverviewWidgetsProps {
  orders: any[];
  isOrdersFetching: boolean;
}

function formatMoney(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function FinanceOverviewWidgets({ orders, isOrdersFetching }: FinanceOverviewWidgetsProps) {
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
      if (status === "draft") {
        continue;
      }
      
      let cat: keyof typeof stats = "open";

      if (status === "on_hold") {
        cat = "on_hold";
      } else if (status === "cancelled") {
        cat = "cancelled";
      } else if (status === "finance_rejected" || status === "rejected") {
        cat = "rejected";
      } else if (status === "finance_review" || status === "submitted" || status === "sales_approved" || o.workflow_stage === "finance_review") {
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

  const widgetsData = [
    {
      title: "Review Pending",
      color: "bg-purple-500",
      iconColor: "text-purple-600 dark:text-purple-400",
      iconBg: "bg-purple-50 dark:bg-purple-950/30 border-purple-100/45 dark:border-purple-500/10",
      icon: Clock,
      count: orderStats.pending_review.count,
      quantity: orderStats.pending_review.quantity,
      amount: orderStats.pending_review.amount,
    },
    {
      title: "Open Orders",
      color: "bg-blue-500",
      iconColor: "text-blue-600 dark:text-blue-400",
      iconBg: "bg-blue-50 dark:bg-blue-950/30 border-blue-100/45 dark:border-blue-500/10",
      icon: TrendingUp,
      count: orderStats.open.count,
      quantity: orderStats.open.quantity,
      amount: orderStats.open.amount,
    },
    {
      title: "Closed Orders",
      color: "bg-emerald-500",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      iconBg: "bg-emerald-50 dark:bg-emerald-955/30 border-emerald-100/45 dark:border-emerald-500/10",
      icon: Package,
      count: orderStats.closed.count,
      quantity: orderStats.closed.quantity,
      amount: orderStats.closed.amount,
    },
    {
      title: "On Hold",
      color: "bg-amber-500",
      iconColor: "text-amber-600 dark:text-amber-400",
      iconBg: "bg-amber-50 dark:bg-amber-955/30 border-amber-105/45 dark:border-amber-500/10",
      icon: Clock,
      count: orderStats.on_hold.count,
      quantity: orderStats.on_hold.quantity,
      amount: orderStats.on_hold.amount,
    },
    {
      title: "Rejected",
      color: "bg-red-500",
      iconColor: "text-red-600 dark:text-red-400",
      iconBg: "bg-rose-50 dark:bg-rose-955/30 border-rose-100/45 dark:border-rose-500/10",
      icon: XCircle,
      count: orderStats.rejected.count,
      quantity: orderStats.rejected.quantity,
      amount: orderStats.rejected.amount,
    },
    {
      title: "Cancelled",
      color: "bg-rose-500",
      iconColor: "text-rose-600 dark:text-rose-455",
      iconBg: "bg-rose-50 dark:bg-rose-955/30 border-rose-100/45 dark:border-rose-500/10",
      icon: AlertTriangle,
      count: orderStats.cancelled.count,
      quantity: orderStats.cancelled.quantity,
      amount: orderStats.cancelled.amount,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 font-sans">
      {widgetsData.map((widget, idx) => {
        const Icon = widget.icon;
        return (
          <div
            key={idx}
            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-slate-900"
          >
            <div className={`absolute top-0 left-0 h-1 w-full ${widget.color}`} />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
                {widget.title}
              </span>
              <div className={`rounded-lg p-1.5 border ${widget.iconBg}`}>
                <Icon className={`h-4 w-4 ${widget.iconColor}`} />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-sans">
                {isOrdersFetching ? (
                  <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                ) : (
                  widget.count
                )}
              </h3>
              <div className="mt-4 space-y-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
                  <Layers className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span>Items:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">
                    {isOrdersFetching ? "..." : widget.quantity}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-955/20 border border-slate-100/40 dark:border-white/5">
                  <Coins className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span>Value:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">
                    ₹{isOrdersFetching ? "..." : formatMoney(widget.amount)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
