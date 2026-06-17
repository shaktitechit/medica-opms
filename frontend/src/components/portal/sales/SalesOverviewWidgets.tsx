"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertTriangle,
  Ban,
  Clock,
  FileText,
  ListChecks,
  Package,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import {
  SALES_ORDER_TABS,
  computeSalesOrderStats,
  type SalesOrderTabCategory,
} from "./orderUtils";

interface SalesOverviewWidgetsProps {
  orders: unknown[];
  isOrdersFetching: boolean;
}

const WIDGET_META: Record<
  SalesOrderTabCategory,
  {
    accent: string;
    labelTone: string;
    iconWrap: string;
    iconTone: string;
    Icon: LucideIcon;
  }
> = {
  draft: {
    accent: "bg-slate-400",
    labelTone: "text-slate-400 dark:text-slate-500",
    iconWrap: "bg-slate-50 dark:bg-slate-800",
    iconTone: "text-slate-500 dark:text-slate-400",
    Icon: FileText,
  },
  pending_approval: {
    accent: "bg-purple-500",
    labelTone: "text-purple-500 dark:text-purple-400",
    iconWrap: "bg-purple-50 dark:bg-purple-950/30",
    iconTone: "text-purple-600 dark:text-purple-400",
    Icon: ListChecks,
  },
  open: {
    accent: "bg-blue-500",
    labelTone: "text-blue-500 dark:text-blue-400",
    iconWrap: "bg-blue-50 dark:bg-blue-950/30",
    iconTone: "text-blue-600 dark:text-blue-400",
    Icon: TrendingUp,
  },
  closed: {
    accent: "bg-emerald-500",
    labelTone: "text-emerald-500 dark:text-emerald-400",
    iconWrap: "bg-emerald-50 dark:bg-emerald-950/30",
    iconTone: "text-emerald-600 dark:text-emerald-400",
    Icon: Package,
  },
  on_hold: {
    accent: "bg-amber-500",
    labelTone: "text-amber-500 dark:text-amber-400",
    iconWrap: "bg-amber-50 dark:bg-amber-950/30",
    iconTone: "text-amber-600 dark:text-amber-400",
    Icon: Clock,
  },
  rejected: {
    accent: "bg-red-500",
    labelTone: "text-red-500 dark:text-red-400",
    iconWrap: "bg-rose-50 dark:bg-rose-950/30",
    iconTone: "text-red-500 dark:text-red-400",
    Icon: AlertTriangle,
  },
  cancelled: {
    accent: "bg-rose-500",
    labelTone: "text-rose-500 dark:text-rose-400",
    iconWrap: "bg-rose-50 dark:bg-rose-950/30",
    iconTone: "text-rose-600 dark:text-rose-400",
    Icon: Ban,
  },
};

export default function SalesOverviewWidgets({
  orders,
  isOrdersFetching,
}: SalesOverviewWidgetsProps) {
  const orderStats = useMemo(() => computeSalesOrderStats(orders), [orders]);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {SALES_ORDER_TABS.map((tab) => {
        const meta = WIDGET_META[tab.id];
        const { Icon } = meta;
        const stat = orderStats[tab.id];

        return (
          <Link
            key={tab.id}
            href={`/sales/orders?tab=${tab.id}`}
            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-500/20 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-500/30"
          >
            <div className={`absolute top-0 left-0 h-1 w-full ${meta.accent}`} />
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-bold tracking-wider uppercase ${meta.labelTone}`}
              >
                {tab.label}
              </span>
              <div className={`rounded-lg p-1.5 ${meta.iconWrap}`}>
                <Icon className={`h-4 w-4 ${meta.iconTone}`} />
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {isOrdersFetching ? (
                  <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                ) : (
                  stat.count
                )}
              </h3>
              <p className="mt-1 text-[11px] font-medium text-slate-550 dark:text-slate-400">
                Total Items:{" "}
                <span className="font-semibold text-slate-750 dark:text-slate-300">
                  {stat.quantity}
                </span>
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
