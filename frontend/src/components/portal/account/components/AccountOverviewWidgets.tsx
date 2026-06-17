"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  Clock,
  Coins,
  Layers,
  Package,
  type LucideIcon,
} from "lucide-react";

import {
  ACCOUNT_ORDER_TABS,
  computeAccountOrderStats,
  type AccountOrderTabCategory,
} from "../accountOrderUtils";

interface AccountOverviewWidgetsProps {
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
  AccountOrderTabCategory,
  {
    accent: string;
    labelTone: string;
    iconWrap: string;
    iconTone: string;
    Icon: LucideIcon;
  }
> = {
  pending_account_approval: {
    accent: "bg-purple-500",
    labelTone: "text-purple-500 dark:text-purple-400",
    iconWrap: "bg-purple-50 dark:bg-purple-950/30 border border-purple-100/45 dark:border-purple-500/10",
    iconTone: "text-purple-600 dark:text-purple-400",
    Icon: ClipboardCheck,
  },
  pending_approvals: {
    accent: "bg-violet-500",
    labelTone: "text-violet-500 dark:text-violet-400",
    iconWrap: "bg-violet-50 dark:bg-violet-950/30 border border-violet-100/45 dark:border-violet-500/10",
    iconTone: "text-violet-600 dark:text-violet-400",
    Icon: Layers,
  },
  open: {
    accent: "bg-teal-500",
    labelTone: "text-teal-500 dark:text-teal-400",
    iconWrap: "bg-teal-50 dark:bg-teal-950/30 border border-teal-100/45 dark:border-teal-500/10",
    iconTone: "text-teal-600 dark:text-teal-400",
    Icon: Package,
  },
  closed: {
    accent: "bg-emerald-500",
    labelTone: "text-emerald-500 dark:text-emerald-400",
    iconWrap: "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100/45 dark:border-emerald-500/10",
    iconTone: "text-emerald-600 dark:text-emerald-400",
    Icon: Coins,
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
}: AccountOverviewWidgetsProps) {
  const orderStats = useMemo(
    () => computeAccountOrderStats(orders),
    [orders],
  );

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 font-sans">
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
