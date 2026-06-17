"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertTriangle,
  Ban,
  Clock,
  Coins,
  FileText,
  Layers,
  ListChecks,
  Package,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import {
  ADMIN_ORDER_TABS,
  computeAdminOrderStats,
  type AdminOrderTabCategory,
} from "./adminOrderUtils";

interface AdminOverviewWidgetsProps {
  orders: unknown[];
  isOrdersFetching: boolean;
}

function formatMoney(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const WIDGET_META: Record<
  AdminOrderTabCategory,
  {
    accent: string;
    labelTone: string;
    iconWrap: string;
    iconTone: string;
    Icon: LucideIcon;
  }
> = {
  pending_admin_approval: {
    accent: "bg-purple-500",
    labelTone: "text-purple-500 dark:text-purple-400",
    iconWrap: "bg-purple-50 dark:bg-purple-950/30 border border-purple-100/45 dark:border-purple-500/10",
    iconTone: "text-purple-600 dark:text-purple-400",
    Icon: FileText,
  },
  pending_approvals: {
    accent: "bg-violet-500",
    labelTone: "text-violet-500 dark:text-violet-400",
    iconWrap: "bg-violet-50 dark:bg-violet-950/30 border border-violet-100/45 dark:border-violet-500/10",
    iconTone: "text-violet-600 dark:text-violet-400",
    Icon: ListChecks,
  },
  open: {
    accent: "bg-blue-500",
    labelTone: "text-blue-500 dark:text-blue-400",
    iconWrap: "bg-blue-50 dark:bg-blue-950/30 border border-blue-100/45 dark:border-blue-500/10",
    iconTone: "text-blue-600 dark:text-blue-400",
    Icon: TrendingUp,
  },
  closed: {
    accent: "bg-emerald-500",
    labelTone: "text-emerald-500 dark:text-emerald-400",
    iconWrap: "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100/45 dark:border-emerald-500/10",
    iconTone: "text-emerald-600 dark:text-emerald-400",
    Icon: Package,
  },
  on_hold: {
    accent: "bg-amber-500",
    labelTone: "text-amber-500 dark:text-amber-400",
    iconWrap: "bg-amber-50 dark:bg-amber-950/30 border border-amber-100/45 dark:border-amber-500/10",
    iconTone: "text-amber-600 dark:text-amber-400",
    Icon: Clock,
  },
  rejected: {
    accent: "bg-red-500",
    labelTone: "text-red-500 dark:text-red-400",
    iconWrap: "bg-rose-50 dark:bg-rose-950/30 border border-rose-100/45 dark:border-rose-500/10",
    iconTone: "text-red-500 dark:text-red-400",
    Icon: XCircle,
  },
  cancelled: {
    accent: "bg-rose-500",
    labelTone: "text-rose-500 dark:text-rose-400",
    iconWrap: "bg-rose-50 dark:bg-rose-950/30 border border-rose-100/45 dark:border-rose-500/10",
    iconTone: "text-rose-600 dark:text-rose-400",
    Icon: AlertTriangle,
  },
};

export default function AdminOverviewWidgets({
  orders,
  isOrdersFetching,
}: AdminOverviewWidgetsProps) {
  const orderStats = useMemo(() => computeAdminOrderStats(orders), [orders]);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 font-sans">
      {ADMIN_ORDER_TABS.map((tab) => {
        const meta = WIDGET_META[tab.id];
        const { Icon } = meta;
        const stat = orderStats[tab.id];

        return (
          <Link
            key={tab.id}
            href={`/admin/orders?tab=${tab.id}`}
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
