"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertTriangle,
  Ban,
  Clock,
  FileEdit,
  LayoutGrid,
  Layers,
  Package,
  PauseCircle,
  ShoppingCart,
  ShieldCheck,
  Truck,
  XCircle,
  TrendingUp,
  CheckCircle,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import {
  ADMIN_ORDER_TABS,
  computeAdminOrderStats,
  type AdminOrderCategoryOptions,
  type AdminOrderTabCategory,
} from "./adminOrderUtils";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import AdminPeriodFilter from "./components/AdminPeriodFilter";
import { useAdminPeriodFilter } from "./components/useAdminPeriodFilter";
import PeriodHeadingCaption from "./components/PeriodHeadingCaption";
import ReportDownloadButton from "./components/ReportDownloadButton";
import { formatPeriodLabel } from "./components/periodFilterUtils";
import { downloadCsvFile, reportFilename } from "./components/reportDownloadUtils";

interface AdminOverviewWidgetsProps {
  orders: unknown[];
  isOrdersFetching: boolean;
  categoryOptions?: AdminOrderCategoryOptions;
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
  all: {
    accent: "bg-slate-500",
    labelTone: "text-slate-500 dark:text-slate-400",
    iconWrap: "bg-slate-50 dark:bg-slate-950/30 border border-slate-100/45 dark:border-slate-500/10",
    iconTone: "text-slate-600 dark:text-slate-400",
    Icon: LayoutGrid,
  },
  pending_admin_approval: {
    accent: "bg-indigo-500",
    labelTone: "text-indigo-500 dark:text-indigo-400",
    iconWrap: "bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100/45 dark:border-indigo-500/10",
    iconTone: "text-indigo-600 dark:text-indigo-400",
    Icon: ShieldCheck,
  },
  due_sheet_pending: {
    accent: "bg-orange-500",
    labelTone: "text-orange-500 dark:text-orange-400",
    iconWrap: "bg-orange-50 dark:bg-orange-950/30 border border-orange-100/45 dark:border-orange-500/10",
    iconTone: "text-orange-600 dark:text-orange-400",
    Icon: FileEdit,
  },
  pending_finance_approval: {
    accent: "bg-purple-500",
    labelTone: "text-purple-500 dark:text-purple-400",
    iconWrap: "bg-purple-50 dark:bg-purple-950/30 border border-purple-100/45 dark:border-purple-500/10",
    iconTone: "text-purple-600 dark:text-purple-400",
    Icon: Clock,
  },
  pending_account_approval: {
    accent: "bg-violet-500",
    labelTone: "text-violet-500 dark:text-violet-400",
    iconWrap: "bg-violet-50 dark:bg-violet-950/30 border border-violet-100/45 dark:border-violet-500/10",
    iconTone: "text-violet-600 dark:text-violet-400",
    Icon: Layers,
  },
  open_dispatched: {
    accent: "bg-teal-500",
    labelTone: "text-teal-500 dark:text-teal-400",
    iconWrap: "bg-teal-50 dark:bg-teal-950/30 border border-teal-100/45 dark:border-teal-500/10",
    iconTone: "text-teal-600 dark:text-teal-400",
    Icon: Truck,
  },
  transport_return_pending: {
    accent: "bg-amber-500",
    labelTone: "text-amber-500 dark:text-amber-400",
    iconWrap: "bg-amber-50 dark:bg-amber-950/30 border border-amber-100/45 dark:border-amber-500/10",
    iconTone: "text-amber-600 dark:text-amber-400",
    Icon: Truck,
  },
  closed_delivered: {
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
  categoryOptions,
}: AdminOverviewWidgetsProps) {
  const {
    availableYears,
    selectedYears,
    setSelectedYears,
    selectedMonths,
    setSelectedMonths,
    filteredOrders,
  } = useAdminPeriodFilter(orders);

  const orderStats = useMemo(
    () => computeAdminOrderStats(orders, categoryOptions),
    [orders, categoryOptions],
  );

  const {
    orderQty,
    orderAmt,
    salesQty,
    salesAmt,
    approvedQty,
    approvedAmt,
    returnedQty,
    returnedAmt,
    cancelledQty,
    cancelledAmt,
    rejectedQty,
    rejectedAmt,
    onHoldQty,
    onHoldAmt,
    inTransitQty,
    inTransitAmt,
  } = useMemo(() => {
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

    for (const o of filteredOrders) {
      if (!o || typeof o !== "object") continue;
      const status = deriveOrderWorkflowStatus(o);
      const isCancelled = status === "cancelled";
      const isRejected = status === "finance_rejected" || status === "rejected";
      const isOnHold = status === "on_hold";
      const items = (o as any).order_items;
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const del = Number(item.delivered_quantity) || 0;
        const ret = Number(item.returned_quantity) || 0;
        const app = Number(item.approved_quantity) || 0;
        const ordered =
          Number(item.ordered_quantity ?? item.quantity ?? 0) || 0;
        const price = Number(item.unit_price) || 0;
        const statusQty = app > 0 ? app : ordered;
        const netSales = del - ret;

        orderSum += ordered;
        orderVal += ordered * price;
        salesSum += netSales;
        salesVal += netSales * price;
        approvedSum += app;
        approvedVal += app * price;
        returnedSum += ret;
        returnedVal += ret * price;

        if (isCancelled) {
          cancelledSum += statusQty;
          cancelledVal += statusQty * price;
        } else if (isRejected) {
          rejectedSum += statusQty;
          rejectedVal += statusQty * price;
        } else if (isOnHold) {
          onHoldSum += statusQty;
          onHoldVal += statusQty * price;
        }
      }
    }

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
      inTransitQty: Math.max(
        0,
        approvedSum - salesSum - cancelledSum - onHoldSum - rejectedSum,
      ),
      inTransitAmt: Math.max(
        0,
        approvedVal - salesVal - cancelledVal - onHoldVal - rejectedVal,
      ),
    };
  }, [filteredOrders]);


  const handleKpiDownload = () => {
    const headers = ["KPI", "Quantity", "Amount (INR)"];
    const rows = [
      ["Order", orderQty, orderAmt],
      ["Sales (Net)", salesQty, salesAmt],
      ["Approved", approvedQty, approvedAmt],
      ["Returned", returnedQty, returnedAmt],
      ["Cancelled", cancelledQty, cancelledAmt],
      ["Rejected", rejectedQty, rejectedAmt],
      ["On Hold", onHoldQty, onHoldAmt],
      ["In Transit", inTransitQty, inTransitAmt],
    ];
    downloadCsvFile(
      reportFilename("kpi_overview", selectedYears, selectedMonths),
      headers,
      rows,
      [
        "Report: KPI Overview",
        `Period: ${formatPeriodLabel(selectedYears, selectedMonths)}`,
      ],
    );
  };

  function formatMoney(v: number): string {
    return v.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

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
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminPeriodFilter
              availableYears={availableYears}
              selectedYears={selectedYears}
              selectedMonths={selectedMonths}
              onYearsChange={setSelectedYears}
              onMonthsChange={setSelectedMonths}
              size="sm"
            />
            <ReportDownloadButton
              onDownload={handleKpiDownload}
              disabled={isOrdersFetching}
              size="sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
          {(
            [
              {
                key: "order",
                label: "Order Volume",
                amount: orderAmt,
                qtyLabel: `Order Qty: ${orderQty.toLocaleString()} items`,
                accent: "bg-slate-500",
                iconWrap: "bg-slate-50 dark:bg-slate-800",
                iconTone: "text-slate-600 dark:text-slate-300",
                Icon: ShoppingCart,
              },
              {
                key: "sales",
                label: "Sales Volume",
                amount: salesAmt,
                qtyLabel: `Net Qty: ${salesQty.toLocaleString()} items`,
                accent: "bg-blue-500",
                iconWrap: "bg-blue-50 dark:bg-blue-950/30",
                iconTone: "text-blue-600 dark:text-blue-400",
                Icon: TrendingUp,
              },
              {
                key: "approved",
                label: "Approved Volume",
                amount: approvedAmt,
                qtyLabel: `Approved Qty: ${approvedQty.toLocaleString()} items`,
                accent: "bg-emerald-500",
                iconWrap: "bg-emerald-50 dark:bg-emerald-950/30",
                iconTone: "text-emerald-600 dark:text-emerald-400",
                Icon: CheckCircle,
              },
              {
                key: "in_transit",
                label: "In Transit Volume",
                amount: inTransitAmt,
                qtyLabel: `In Transit Qty: ${inTransitQty.toLocaleString()} items`,
                accent: "bg-teal-500",
                iconWrap: "bg-teal-50 dark:bg-teal-950/30",
                iconTone: "text-teal-600 dark:text-teal-400",
                Icon: Truck,
              },
              {
                key: "returned",
                label: "Returned Volume",
                amount: returnedAmt,
                qtyLabel: `Returned Qty: ${returnedQty.toLocaleString()} items`,
                accent: "bg-amber-500",
                iconWrap: "bg-amber-50 dark:bg-amber-950/30",
                iconTone: "text-amber-600 dark:text-amber-400",
                Icon: Undo2,
              },
              {
                key: "cancelled",
                label: "Cancelled Volume",
                amount: cancelledAmt,
                qtyLabel: `Cancelled Qty: ${cancelledQty.toLocaleString()} items`,
                accent: "bg-rose-500",
                iconWrap: "bg-rose-50 dark:bg-rose-950/30",
                iconTone: "text-rose-600 dark:text-rose-400",
                Icon: Ban,
              },
              {
                key: "rejected",
                label: "Rejected Volume",
                amount: rejectedAmt,
                qtyLabel: `Rejected Qty: ${rejectedQty.toLocaleString()} items`,
                accent: "bg-red-500",
                iconWrap: "bg-red-50 dark:bg-red-950/30",
                iconTone: "text-red-600 dark:text-red-400",
                Icon: XCircle,
              },
              {
                key: "on_hold",
                label: "On Hold Volume",
                amount: onHoldAmt,
                qtyLabel: `On Hold Qty: ${onHoldQty.toLocaleString()} items`,
                accent: "bg-orange-500",
                iconWrap: "bg-orange-50 dark:bg-orange-950/30",
                iconTone: "text-orange-600 dark:text-orange-400",
                Icon: PauseCircle,
              },
            ] as const
          ).map((card) => {
            const { Icon } = card;
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
                    ) : (
                      `₹${formatMoney(card.amount)}`
                    )}
                  </h3>
                  <p className="mt-1 text-2xs font-medium text-slate-500 dark:text-slate-400">
                    {card.qtyLabel}
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
        <div className="grid grid-cols-3 lg:grid-cols-11 gap-4 w-full">
          {ADMIN_ORDER_TABS.map((tab) => {
            const meta = WIDGET_META[tab.id];
            const { Icon } = meta;
            const stat = orderStats[tab.id];

            return (
              <Link
                key={tab.id}
                href={`/admin/orders?tab=${tab.id}`}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-500/20 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-500/30 flex flex-col justify-between"
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
