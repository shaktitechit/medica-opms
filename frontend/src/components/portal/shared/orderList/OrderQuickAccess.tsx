"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  ORDER_QUICK_ACCESS_ROLE_CONFIG,
  type OrderQuickAccessRole,
} from "./orderQuickAccessConfig";
import { getOrderListTabIcon } from "./orderListTabIcons";
import { getOrderWorkflowTabAccent } from "./orderWorkflowTabMeta";
import type { OrderWorkflowCategoryOptions } from "./orderWorkflowTabs";

export type OrderQuickAccessProps = {
  orders: unknown[];
  isOrdersFetching: boolean;
  categoryOptions?: OrderWorkflowCategoryOptions;
  role: OrderQuickAccessRole;
  /** Overrides role default path (e.g. super_admin). */
  portalHome?: string;
};

/**
 * Dashboard Quick Access — same tabs, counts, and icons as ListOrdersPage
 * workflow tabs (`ORDER_WORKFLOW_TABS` + `computeOrderWorkflowTabStats`).
 */
export default function OrderQuickAccess({
  orders,
  isOrdersFetching,
  categoryOptions,
  role,
  portalHome,
}: OrderQuickAccessProps) {
  const config = ORDER_QUICK_ACCESS_ROLE_CONFIG[role] ?? ORDER_QUICK_ACCESS_ROLE_CONFIG.admin;
  const basePath = portalHome ?? config.path;

  const orderStats = useMemo(
    () => config.compute(orders, categoryOptions),
    [config, orders, categoryOptions],
  );

  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Quick Access
      </h3>
      <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
        {config.tabs.map((tab) => {
          const meta = getOrderWorkflowTabAccent(tab.id);
          const Icon = getOrderListTabIcon(tab.id);
          const stat = orderStats[tab.id] || { count: 0 };

          return (
            <Link
              key={tab.id}
              href={`${basePath}/orders?tab=${tab.id}`}
              className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-500/20 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-emerald-500/30"
            >
              <div className={`absolute top-0 left-0 h-1 w-full ${meta.accent}`} />
              <div className="flex items-start justify-between gap-1.5">
                <span
                  className={`line-clamp-2 text-2xs font-bold uppercase tracking-wider ${meta.labelTone}`}
                >
                  {tab.label}
                </span>
                <div className={`shrink-0 rounded p-1 ${meta.iconWrap}`}>
                  <Icon className={`h-3.5 w-3.5 ${meta.iconTone}`} />
                </div>
              </div>
              <div className="mt-2.5">
                <h3 className="font-sans text-xl font-bold text-slate-900 dark:text-slate-100">
                  {isOrdersFetching ? (
                    <span className="inline-block h-5 w-10 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                  ) : (
                    stat.count
                  )}
                </h3>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
