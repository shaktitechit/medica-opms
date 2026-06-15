"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertTriangle,
  Clock,
  Coins,
  Layers,
  Package,
  RotateCcw,
  Send,
  Truck,
  type LucideIcon,
} from "lucide-react";

import {
  ACCOUNT_ORDER_TABS,
  computeAccountOrderStats,
  type AccountOrderCategoryOptions,
  type AccountOrderTabCategory,
} from "../accountOrderUtils";

interface AccountOverviewWidgetsProps {
  orders: unknown[];
  isOrdersFetching: boolean;
  categoryOptions?: AccountOrderCategoryOptions;
}

function formatMoney(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const WIDGET_META: Record<
  AccountOrderTabCategory,
  {
    accent: string;
    labelTone: string;
    iconWrap: string;
    iconTone: string;
    Icon: LucideIcon;
  }
> = {
  dispatch_pending: {
    accent: "bg-amber-500",
    labelTone: "text-amber-500 dark:text-amber-400",
    iconWrap: "bg-amber-50 dark:bg-amber-950/30 border border-amber-100/45 dark:border-amber-500/10",
    iconTone: "text-amber-600 dark:text-amber-400",
    Icon: Clock,
  },
  dispatched: {
    accent: "bg-blue-500",
    labelTone: "text-blue-500 dark:text-blue-400",
    iconWrap: "bg-blue-50 dark:bg-blue-950/30 border border-blue-100/45 dark:border-blue-500/10",
    iconTone: "text-blue-600 dark:text-blue-400",
    Icon: Send,
  },
  pending_delivery: {
    accent: "bg-indigo-500",
    labelTone: "text-indigo-500 dark:text-indigo-400",
    iconWrap: "bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100/45 dark:border-indigo-500/10",
    iconTone: "text-indigo-600 dark:text-indigo-400",
    Icon: Truck,
  },
  returns_pending: {
    accent: "bg-rose-500",
    labelTone: "text-rose-500 dark:text-rose-400",
    iconWrap: "bg-rose-50 dark:bg-rose-950/30 border border-rose-100/45 dark:border-rose-500/10",
    iconTone: "text-rose-600 dark:text-rose-400",
    Icon: RotateCcw,
  },
  closed: {
    accent: "bg-emerald-500",
    labelTone: "text-emerald-500 dark:text-emerald-400",
    iconWrap: "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100/45 dark:border-emerald-500/10",
    iconTone: "text-emerald-600 dark:text-emerald-400",
    Icon: Package,
  },
  on_hold: {
    accent: "bg-orange-500",
    labelTone: "text-orange-500 dark:text-orange-400",
    iconWrap: "bg-orange-50 dark:bg-orange-950/30 border border-orange-100/45 dark:border-orange-500/10",
    iconTone: "text-orange-600 dark:text-orange-400",
    Icon: Clock,
  },
  cancelled: {
    accent: "bg-slate-500",
    labelTone: "text-slate-500 dark:text-slate-400",
    iconWrap: "bg-slate-50 dark:bg-slate-950/30 border border-slate-100/45 dark:border-slate-500/10",
    iconTone: "text-slate-600 dark:text-slate-400",
    Icon: AlertTriangle,
  },
};

export default function AccountOverviewWidgets({
  orders,
  isOrdersFetching,
  categoryOptions,
}: AccountOverviewWidgetsProps) {
  const orderStats = useMemo(
    () => computeAccountOrderStats(orders, categoryOptions),
    [orders, categoryOptions],
  );

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 font-sans">
      {ACCOUNT_ORDER_TABS.map((tab) => {
        const meta = WIDGET_META[tab.id];
        const { Icon } = meta;
        const stat = orderStats[tab.id];

        return (
          <Link
            key={tab.id}
            href={`/account/orders?tab=${tab.id}`}
            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-500/20 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-500/30"
          >
            <div className={`absolute top-0 left-0 h-1 w-full ${meta.accent}`} />
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold tracking-wider uppercase ${meta.labelTone}`}>
                {tab.label}
              </span>
              <div className={`rounded-lg p-1.5 ${meta.iconWrap}`}>
                <Icon className={`h-4 w-4 ${meta.iconTone}`} />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-sans">
                {isOrdersFetching ? (
                  <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                ) : (
                  stat.count
                )}
              </h3>
              <div className="mt-4 space-y-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-950/20 border border-slate-100/40 dark:border-white/5">
                  <Layers className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span>Items:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">
                    {stat.quantity}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-50/50 p-1.5 rounded-lg dark:bg-slate-950/20 border border-slate-100/40 dark:border-white/5">
                  <Coins className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span>Value:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-250 ml-auto">
                    ₹{formatMoney(stat.amount)}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
