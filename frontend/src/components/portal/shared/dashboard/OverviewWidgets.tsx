"use client";

import { useMemo } from "react";
import {
  Ban,
  LayoutGrid,
  PackageCheck,
  PauseCircle,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import OrderQuickAccess from "@/components/portal/shared/orderList/OrderQuickAccess";
import type { OrderQuickAccessRole } from "@/components/portal/shared/orderList/orderQuickAccessConfig";
import {
  computeOrderWorkflowTabStats,
  type OrderWorkflowCategoryOptions,
  type OrderWorkflowTabCategory,
  type OrderWorkflowTabStat,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import PeriodHeadingCaption from "./PeriodHeadingCaption";
import ReportDownloadButton from "./ReportDownloadButton";
import { formatPeriodLabel } from "./periodFilterUtils";
import { downloadCsvFile, reportFilename } from "./reportDownloadUtils";

interface OverviewWidgetsProps {
  orders: any[];
  filteredOrders: any[];
  isOrdersFetching: boolean;
  categoryOptions?: OrderWorkflowCategoryOptions;
  role: OrderQuickAccessRole;
  portalHome?: string;
  selectedYears: number[];
  selectedMonths?: number[];
  dateFilter?: string;
  customDateFrom?: string;
  customDateTo?: string;
}

const IN_TRANSIT_PIPELINE_TABS: OrderWorkflowTabCategory[] = [
  "pending_admin_approval",
  "due_sheet_pending",
  "pending_finance_approval",
  "pending_account_approval",
  "open_dispatched",
  "transport_pending",
  "in_transit",
];

const EMPTY_STAT: OrderWorkflowTabStat = { count: 0, quantity: 0, amount: 0 };

function formatMoney(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function sumStats(stats: OrderWorkflowTabStat[]): OrderWorkflowTabStat {
  return stats.reduce(
    (acc, row) => ({
      count: acc.count + row.count,
      quantity: acc.quantity + row.quantity,
      amount: acc.amount + row.amount,
    }),
    { ...EMPTY_STAT },
  );
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
  const tabStats = useMemo(
    () => computeOrderWorkflowTabStats(filteredOrders, categoryOptions),
    [filteredOrders, categoryOptions],
  );

  const kpis = useMemo(() => {
    const delivered = tabStats.closed_delivered ?? EMPTY_STAT;
    const inTransit = sumStats(
      IN_TRANSIT_PIPELINE_TABS.map((id) => tabStats[id] ?? EMPTY_STAT),
    );
    // Order Volume = all approved / active pipeline orders (delivered + in-transit buckets)
    const orderVolume = sumStats([delivered, inTransit]);
    const cancelled = tabStats.cancelled ?? EMPTY_STAT;
    const rejected = tabStats.rejected ?? EMPTY_STAT;
    const onHold = tabStats.on_hold ?? EMPTY_STAT;

    return {
      orderVolume,
      delivered,
      inTransit,
      cancelled,
      rejected,
      onHold,
    };
  }, [tabStats]);

  const cards = useMemo(() => {
    const isSales = role === "sales";
    return [
      {
        key: "order_volume",
        label: isSales ? "Order Quantity" : "Order Volume",
        ...kpis.orderVolume,
        hint: "All approved orders (delivered + pipeline)",
        accent: "bg-slate-500",
        iconWrap: "bg-slate-50 dark:bg-slate-950/30",
        iconTone: "text-slate-600 dark:text-slate-400",
        Icon: LayoutGrid,
      },
      {
        key: "delivered",
        label: isSales ? "Delivered Quantity" : "Delivered Volume",
        ...kpis.delivered,
        hint: "Closed / delivered orders",
        accent: "bg-emerald-500",
        iconWrap: "bg-emerald-50 dark:bg-emerald-950/30",
        iconTone: "text-emerald-600 dark:text-emerald-400",
        Icon: PackageCheck,
      },
      {
        key: "in_transit",
        label: isSales ? "In Transit Quantity" : "In Transit Volume",
        ...kpis.inTransit,
        hint: "Admin, due sheet, finance, account, dispatch, transport pending + in transit",
        accent: "bg-sky-500",
        iconWrap: "bg-sky-50 dark:bg-sky-950/30",
        iconTone: "text-sky-600 dark:text-sky-400",
        Icon: Truck,
      },
      {
        key: "cancelled",
        label: isSales ? "Cancelled Quantity" : "Cancelled Volume",
        ...kpis.cancelled,
        hint: "Cancelled orders",
        accent: "bg-rose-500",
        iconWrap: "bg-rose-50 dark:bg-rose-950/30",
        iconTone: "text-rose-600 dark:text-rose-400",
        Icon: Ban,
      },
      {
        key: "rejected",
        label: isSales ? "Rejected Quantity" : "Rejected Volume",
        ...kpis.rejected,
        hint: "Rejected orders",
        accent: "bg-red-500",
        iconWrap: "bg-red-50 dark:bg-red-950/30",
        iconTone: "text-red-600 dark:text-red-400",
        Icon: XCircle,
      },
      {
        key: "on_hold",
        label: isSales ? "On Hold Quantity" : "On Hold Volume",
        ...kpis.onHold,
        hint: "On-hold orders",
        accent: "bg-orange-500",
        iconWrap: "bg-orange-50 dark:bg-orange-950/30",
        iconTone: "text-orange-600 dark:text-orange-400",
        Icon: PauseCircle,
      },
    ] as Array<{
      key: string;
      label: string;
      amount: number;
      quantity: number;
      count: number;
      hint: string;
      accent: string;
      iconWrap: string;
      iconTone: string;
      Icon: LucideIcon;
    }>;
  }, [kpis, role]);

  const handleDownload = () => {
    const isSales = role === "sales";
    const headers = isSales
      ? ["Metric Category", "Quantity (Items)", "Order Count"]
      : ["Metric Category", "Amount (INR)", "Quantity (Items)", "Order Count"];

    const rows = cards.map((card) =>
      isSales
        ? [
            card.label,
            card.quantity.toLocaleString(),
            card.count.toLocaleString(),
          ]
        : [
            card.label,
            `₹${formatMoney(card.amount)}`,
            card.quantity.toLocaleString(),
            card.count.toLocaleString(),
          ],
    );

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
    <div className="w-full space-y-6 font-sans">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const { Icon } = card;
            const isSales = role === "sales";
            const orderLabel = `${card.count.toLocaleString()} ${
              card.count === 1 ? "order" : "orders"
            }`;
            return (
              <div
                key={card.key}
                className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900"
              >
                <div className={`absolute top-0 left-0 h-1 w-full ${card.accent}`} />
                <div className="flex items-start justify-between">
                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {card.label}
                  </span>
                  <div className={`shrink-0 rounded p-1 ${card.iconWrap}`}>
                    <Icon className={`h-4 w-4 ${card.iconTone}`} />
                  </div>
                </div>
                <div className="mt-2.5">
                  <h3 className="font-sans text-xl font-bold text-slate-900 dark:text-slate-100">
                    {isOrdersFetching ? (
                      <span className="inline-block h-6 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    ) : isSales ? (
                      card.quantity.toLocaleString()
                    ) : (
                      `₹${formatMoney(card.amount)}`
                    )}
                  </h3>
                  <p className="mt-1 text-2xs font-medium text-slate-500 dark:text-slate-400">
                    {isOrdersFetching ? (
                      <span className="inline-block h-3 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    ) : isSales ? (
                      orderLabel
                    ) : (
                      `${card.quantity.toLocaleString()} items · ${orderLabel}`
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <OrderQuickAccess
        orders={orders}
        isOrdersFetching={isOrdersFetching}
        categoryOptions={categoryOptions}
        role={role}
        portalHome={portalHome}
      />
    </div>
  );
}
