"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Ban,
  Clock,
  FileEdit,
  FileText,
  LayoutGrid,
  Layers,
  Package,
  PauseCircle,
  ShieldCheck,
  Truck,
  XCircle,
  TrendingUp,
  CheckCircle,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import PeriodHeadingCaption from "./PeriodHeadingCaption";
import ReportDownloadButton from "./ReportDownloadButton";
import { formatPeriodLabel } from "./periodFilterUtils";
import { downloadCsvFile, reportFilename } from "./reportDownloadUtils";

// Sales imports
import {
  SALES_ORDER_TABS,
  computeSalesOrderStats,
} from "@/components/portal/sales/orderUtils";

// Admin imports
import {
  ADMIN_ORDER_TABS,
  computeAdminOrderStats,
} from "@/components/portal/admin/adminOrderUtils";

// Finance imports
import {
  FINANCE_ORDER_TABS,
  computeFinanceOrderStats,
} from "@/components/portal/finance/financeOrderUtils";

// Dispatch imports
import {
  DISPATCH_ORDER_TABS,
  computeDispatchOrderStats,
} from "@/components/portal/dispatch/dispatchOrderUtils";

// Account imports
import {
  ACCOUNT_ORDER_TABS,
  computeAccountOrderStats,
} from "@/components/portal/account/accountOrderUtils";

interface OverviewWidgetsProps {
  orders: any[];
  filteredOrders: any[];
  isOrdersFetching: boolean;
  categoryOptions?: any;
  role: "sales" | "admin" | "super_admin" | "finance" | "dispatch" | "account";
  portalHome?: string;
  selectedYears: number[];
  selectedMonths?: number[];
  dateFilter?: string;
  customDateFrom?: string;
  customDateTo?: string;
}

const ROLE_CONFIG: Record<
  string,
  {
    tabs: readonly { id: string; label: string }[];
    compute: (orders: any[], options?: any) => Record<string, { count: number }>;
    path: string;
  }
> = {
  sales: {
    tabs: SALES_ORDER_TABS,
    compute: computeSalesOrderStats,
    path: "/sales",
  },
  admin: {
    tabs: ADMIN_ORDER_TABS,
    compute: computeAdminOrderStats,
    path: "/admin",
  },
  super_admin: {
    tabs: ADMIN_ORDER_TABS,
    compute: computeAdminOrderStats,
    path: "/super_admin",
  },
  finance: {
    tabs: FINANCE_ORDER_TABS,
    compute: computeFinanceOrderStats,
    path: "/finance",
  },
  dispatch: {
    tabs: DISPATCH_ORDER_TABS,
    compute: computeDispatchOrderStats,
    path: "/dispatch",
  },
  account: {
    tabs: ACCOUNT_ORDER_TABS,
    compute: computeAccountOrderStats,
    path: "/account",
  },
};

const WIDGET_META: Record<
  string,
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
  all: {
    accent: "bg-slate-500",
    labelTone: "text-slate-500 dark:text-slate-400",
    iconWrap: "bg-slate-50 dark:bg-slate-950/30",
    iconTone: "text-slate-600 dark:text-slate-400",
    Icon: LayoutGrid,
  },
  pending_admin_approval: {
    accent: "bg-indigo-500",
    labelTone: "text-indigo-500 dark:text-indigo-400",
    iconWrap: "bg-indigo-50 dark:bg-indigo-950/30",
    iconTone: "text-indigo-600 dark:text-indigo-400",
    Icon: ShieldCheck,
  },
  due_sheet_pending: {
    accent: "bg-orange-500",
    labelTone: "text-orange-500 dark:text-orange-400",
    iconWrap: "bg-orange-50 dark:bg-orange-950/30",
    iconTone: "text-orange-600 dark:text-orange-400",
    Icon: FileEdit,
  },
  pending_finance_approval: {
    accent: "bg-purple-500",
    labelTone: "text-purple-500 dark:text-purple-400",
    iconWrap: "bg-purple-50 dark:bg-purple-950/30",
    iconTone: "text-purple-600 dark:text-purple-400",
    Icon: Clock,
  },
  pending_account_approval: {
    accent: "bg-violet-500",
    labelTone: "text-violet-500 dark:text-violet-400",
    iconWrap: "bg-violet-50 dark:bg-violet-950/30",
    iconTone: "text-violet-600 dark:text-violet-400",
    Icon: Layers,
  },
  open_dispatched: {
    accent: "bg-teal-500",
    labelTone: "text-teal-500 dark:text-teal-400",
    iconWrap: "bg-teal-50 dark:bg-teal-950/30",
    iconTone: "text-teal-600 dark:text-teal-400",
    Icon: Truck,
  },
  dispatch_created: {
    accent: "bg-cyan-500",
    labelTone: "text-cyan-500 dark:text-cyan-400",
    iconWrap: "bg-cyan-50 dark:bg-cyan-950/30",
    iconTone: "text-cyan-600 dark:text-cyan-400",
    Icon: Package,
  },
  dispatched: {
    accent: "bg-blue-500",
    labelTone: "text-blue-500 dark:text-blue-400",
    iconWrap: "bg-blue-50 dark:bg-blue-950/30",
    iconTone: "text-blue-600 dark:text-blue-400",
    Icon: Truck,
  },
  completed: {
    accent: "bg-emerald-500",
    labelTone: "text-emerald-500 dark:text-emerald-400",
    iconWrap: "bg-emerald-50 dark:bg-emerald-950/30",
    iconTone: "text-emerald-600 dark:text-emerald-400",
    Icon: CheckCircle,
  },
  cancelled: {
    accent: "bg-rose-500",
    labelTone: "text-rose-500 dark:text-rose-400",
    iconWrap: "bg-rose-50 dark:bg-rose-950/30",
    iconTone: "text-rose-600 dark:text-rose-400",
    Icon: Ban,
  },
  on_hold: {
    accent: "bg-orange-500",
    labelTone: "text-orange-500 dark:text-orange-400",
    iconWrap: "bg-orange-50 dark:bg-orange-950/30",
    iconTone: "text-orange-600 dark:text-orange-400",
    Icon: PauseCircle,
  },
  rejected: {
    accent: "bg-red-500",
    labelTone: "text-red-550 dark:text-red-400",
    iconWrap: "bg-red-50 dark:bg-red-950/30",
    iconTone: "text-red-600 dark:text-red-400",
    Icon: XCircle,
  },
  submitted: {
    accent: "bg-blue-500",
    labelTone: "text-blue-500 dark:text-blue-400",
    iconWrap: "bg-blue-50 dark:bg-blue-950/30",
    iconTone: "text-blue-600 dark:text-blue-400",
    Icon: Clock,
  },
};

function formatMoney(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function OverviewWidgets({
  orders,
  filteredOrders,
  isOrdersFetching,
  categoryOptions,
  role,
  portalHome,
  selectedYears,
  selectedMonths,
  dateFilter,
  customDateFrom,
  customDateTo,
}: OverviewWidgetsProps) {
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.admin;
  const basePath = portalHome ?? config.path;

  const orderStats = useMemo(
    () => config.compute(orders, categoryOptions),
    [config, orders, categoryOptions],
  );

  const kpis = useMemo(() => {
    let orderSum = 0;
    let orderVal = 0;
    let salesSum = 0;
    let salesVal = 0;
    let approvedSum = 0;
    let approvedVal = 0;
    let returnedSum = 0;
    let returnedVal = 0;
    let cancelledSum = 0;
    let cancelledVal = 0;
    let rejectedSum = 0;
    let rejectedVal = 0;
    let onHoldSum = 0;
    let onHoldVal = 0;
    let inTransitSum = 0;
    let inTransitVal = 0;

    for (const o of filteredOrders) {
      if (!o || typeof o !== "object") continue;
      const status = deriveOrderWorkflowStatus(o);
      const isDeleted = (o as any).is_deleted === true || (o as any).isDeleted === true || (o as any).deletedAt != null;
      if (status === "draft" || status === "deleted" || isDeleted) {
        continue;
      }

      const isCancelled = status === "cancelled";
      const isRejected = status === "finance_rejected" || status === "rejected";
      const isOnHold = status === "on_hold";
      const items = (o as any).order_items;
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const del = Number(item.delivered_quantity) || 0;
        const ret = Number(item.returned_quantity) || 0;
        const app = Number(item.approved_quantity) || 0;
        const ordered = Number(item.ordered_quantity ?? item.quantity ?? 0) || 0;
        const price = Number(item.unit_price ?? item.approved_unit_price ?? 0) || 0;

        const statusQty = app > 0 ? app : ordered;
        const isApprovedOrder = status !== "submitted" && !isCancelled && !isRejected && !isOnHold;
        const qtyToUseForOrderValue = isApprovedOrder ? app : ordered;

        orderSum += qtyToUseForOrderValue;
        orderVal += qtyToUseForOrderValue * price;

        salesSum += del - ret;
        salesVal += (del - ret) * price;

        if (!isCancelled && !isRejected && !isOnHold) {
          approvedSum += app;
          approvedVal += app * price;
        }

        returnedSum += ret;
        returnedVal += ret * price;

        if (isCancelled) {
          cancelledSum += statusQty;
          cancelledVal += statusQty * price;
        }
        if (isRejected) {
          rejectedSum += statusQty;
          rejectedVal += statusQty * price;
        }
        if (isOnHold) {
          onHoldSum += statusQty;
          onHoldVal += statusQty * price;
        }
      }
    }

    inTransitSum = Math.max(0, approvedSum - salesSum - cancelledSum - rejectedSum - onHoldSum);
    inTransitVal = Math.max(0, approvedVal - salesVal - cancelledVal - rejectedVal - onHoldVal);

    return {
      orderQty: orderSum,
      orderAmt: orderVal,
      salesQty: salesSum,
      salesAmt: salesVal,
      approvedQty: approvedSum,
      approvedAmt: approvedVal,
      returnedQty: returnedSum,
      returnedAmt: returnedVal,
      cancelledQty: cancelledSum,
      cancelledAmt: cancelledVal,
      rejectedQty: rejectedSum,
      rejectedAmt: rejectedVal,
      onHoldQty: onHoldSum,
      onHoldAmt: onHoldVal,
      inTransitQty: inTransitSum,
      inTransitAmt: inTransitVal,
    };
  }, [orders]);

  const cards = useMemo(() => {
    const isSales = role === "sales";
    return [
      {
        key: "total_orders",
        label: isSales ? "Total Quantity" : "Total Volume",
        amount: kpis.orderAmt,
        qty: kpis.orderQty,
        labelPrefix: "Order",
        hint: "All non-draft, non-deleted orders",
        accent: "bg-slate-500",
        iconWrap: "bg-slate-50 dark:bg-slate-950/30",
        iconTone: "text-slate-600 dark:text-slate-400",
        Icon: LayoutGrid,
      },
      {
        key: "net_sales",
        label: isSales ? "Sales Quantity" : "Sales Volume",
        amount: kpis.salesAmt,
        qty: kpis.salesQty,
        labelPrefix: "Net",
        hint: "Delivered minus returned items",
        accent: "bg-blue-500",
        iconWrap: "bg-blue-50 dark:bg-blue-950/30",
        iconTone: "text-blue-600 dark:text-blue-400",
        Icon: TrendingUp,
      },
      {
        key: "approved",
        label: isSales ? "Approved Quantity" : "Approved Volume",
        amount: kpis.approvedAmt,
        qty: kpis.approvedQty,
        labelPrefix: "Approved",
        hint: "Items approved by admins",
        accent: "bg-emerald-500",
        iconWrap: "bg-emerald-50 dark:bg-emerald-950/30",
        iconTone: "text-emerald-600 dark:text-emerald-400",
        Icon: CheckCircle,
      },
      {
        key: "in_transit",
        label: isSales ? "In Transit Quantity" : "In Transit Volume",
        amount: kpis.inTransitAmt,
        qty: kpis.inTransitQty,
        labelPrefix: "In Transit",
        hint: "Approved − sales − cancelled − hold − rejected",
        accent: "bg-teal-500",
        iconWrap: "bg-teal-50 dark:bg-teal-950/30",
        iconTone: "text-teal-600 dark:text-teal-400",
        Icon: Truck,
      },
      {
        key: "returned",
        label: isSales ? "Returned Quantity" : "Returned Volume",
        amount: kpis.returnedAmt,
        qty: kpis.returnedQty,
        labelPrefix: "Returned",
        hint: "Returned items",
        accent: "bg-amber-500",
        iconWrap: "bg-amber-50 dark:bg-amber-950/30",
        iconTone: "text-amber-600 dark:text-amber-400",
        Icon: Undo2,
      },
      {
        key: "cancelled",
        label: isSales ? "Cancelled Quantity" : "Cancelled Volume",
        amount: kpis.cancelledAmt,
        qty: kpis.cancelledQty,
        labelPrefix: "Cancelled",
        hint: "Cancelled items",
        accent: "bg-rose-500",
        iconWrap: "bg-rose-50 dark:bg-rose-950/30",
        iconTone: "text-rose-600 dark:text-rose-400",
        Icon: Ban,
      },
      {
        key: "rejected",
        label: isSales ? "Rejected Quantity" : "Rejected Volume",
        amount: kpis.rejectedAmt,
        qty: kpis.rejectedQty,
        labelPrefix: "Rejected",
        hint: "Rejected items",
        accent: "bg-red-500",
        iconWrap: "bg-red-50 dark:bg-red-950/30",
        iconTone: "text-red-600 dark:text-red-400",
        Icon: XCircle,
      },
      {
        key: "on_hold",
        label: isSales ? "On Hold Quantity" : "On Hold Volume",
        amount: kpis.onHoldAmt,
        qty: kpis.onHoldQty,
        labelPrefix: "On Hold",
        hint: "On-hold items",
        accent: "bg-orange-500",
        iconWrap: "bg-orange-50 dark:bg-orange-950/30",
        iconTone: "text-orange-600 dark:text-orange-400",
        Icon: PauseCircle,
      },
    ];
  }, [kpis, role]);

  const handleDownload = () => {
    const isSales = role === "sales";
    const headers = isSales
      ? ["Metric Category", "Quantity (Items)", "Order Count"]
      : ["Metric Category", "Amount (INR)", "Quantity (Items)", "Order Count"];

    const rows = cards.map((card) => {
      const statKey = card.key === "total_orders" ? "all" : card.key;
      const count = (orderStats[statKey] || orderStats[card.key] || { count: 0 }).count;
      return isSales
        ? [card.label, card.qty.toLocaleString(), count.toLocaleString()]
        : [card.label, `₹${formatMoney(card.amount)}`, card.qty.toLocaleString(), count.toLocaleString()];
    });

    downloadCsvFile(
      reportFilename(`overview_widgets_${role}`, selectedYears, selectedMonths),
      headers,
      rows,
      [
        `Report: Overview Widgets (${role.toUpperCase()})`,
        `Period: ${formatPeriodLabel(selectedYears, selectedMonths)}`,
      ],
    );
  };

  return (
    <div className="space-y-6 font-sans w-full">
      {/* KPI Section */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              KPI
            </h3>
            <PeriodHeadingCaption
              selectedYears={selectedYears}
              selectedMonths={selectedMonths}
              dateFilter={dateFilter}
              customDateFrom={customDateFrom}
              customDateTo={customDateTo}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ReportDownloadButton
              onDownload={handleDownload}
              disabled={isOrdersFetching}
              label="Export"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => {
            const { Icon } = card;
            const isSales = role === "sales";
            return (
              <div
                key={card.key}
                className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900"
              >
                <div className={`absolute top-0 left-0 h-1 w-full ${card.accent}`} />
                <div className="flex items-start justify-between">
                  <span className="text-2xs font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
                    {card.label}
                  </span>
                  <div className={`rounded p-1 shrink-0 ${card.iconWrap}`}>
                    <Icon className={`h-4 w-4 ${card.iconTone}`} />
                  </div>
                </div>
                <div className="mt-2.5">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">
                    {isOrdersFetching ? (
                      <span className="inline-block h-6 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    ) : isSales ? (
                      card.qty.toLocaleString()
                    ) : (
                      `₹${formatMoney(card.amount)}`
                    )}
                  </h3>
                  <p className="mt-1 text-2xs font-medium text-slate-500 dark:text-slate-400">
                    {isSales ? card.hint : `${card.labelPrefix} Qty: ${card.qty.toLocaleString()} items`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Access Section */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Quick Access
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-4 w-full">
          {config.tabs.map((tab) => {
            const meta = WIDGET_META[tab.id] || WIDGET_META.all;
            const { Icon } = meta;
            const stat = orderStats[tab.id] || { count: 0 };

            return (
              <Link
                key={tab.id}
                href={`${basePath}/orders?tab=${tab.id}`}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-500/20 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-emerald-500/30 flex flex-col justify-between"
              >
                <div className={`absolute top-0 left-0 h-1 w-full ${meta.accent}`} />
                <div className="flex items-start justify-between gap-1.5">
                  <span className={`text-2xs font-bold tracking-wider uppercase line-clamp-2 ${meta.labelTone}`}>
                    {tab.label}
                  </span>
                  <div className={`rounded p-1 shrink-0 ${meta.iconWrap}`}>
                    <Icon className={`h-3.5 w-3.5 ${meta.iconTone}`} />
                  </div>
                </div>
                <div className="mt-2.5">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">
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
    </div>
  );
}
