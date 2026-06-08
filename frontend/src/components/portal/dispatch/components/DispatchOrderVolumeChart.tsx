"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";

interface DispatchOrderVolumeChartProps {
  orders: any[];
  isOrdersFetching: boolean;
}

const STATUS_COLORS: Record<
  "pending_dispatch" | "pending_delivery" | "closed" | "on_hold" | "cancelled",
  { fill: string; hover: string; dot: string; label: string }
> = {
  pending_dispatch: {
    fill: "fill-amber-500/85 dark:fill-amber-500/60",
    hover: "fill-amber-600 dark:fill-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
    label: "Pending Dispatch",
  },
  pending_delivery: {
    fill: "fill-blue-500/85 dark:fill-blue-500/60",
    hover: "fill-blue-600 dark:fill-blue-400",
    dot: "bg-blue-500 dark:bg-blue-400",
    label: "Pending Delivery",
  },
  closed: {
    fill: "fill-emerald-500/85 dark:fill-emerald-550/60",
    hover: "fill-emerald-600 dark:fill-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-450",
    label: "Closed Orders",
  },
  on_hold: {
    fill: "fill-amber-500/50 dark:fill-amber-500/35",
    hover: "fill-amber-500 dark:fill-amber-300",
    dot: "bg-amber-400 dark:bg-amber-300",
    label: "On Hold",
  },
  cancelled: {
    fill: "fill-rose-500/85 dark:fill-rose-500/60",
    hover: "fill-rose-600 dark:fill-rose-450",
    dot: "bg-rose-500 dark:bg-rose-400",
    label: "Cancelled",
  },
};

function formatMoney(v: number): string {
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMoneyAbbr(v: number): string {
  if (v >= 10000000) return `${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return String(Math.round(v));
}

function getDispatchOrderTabCategory(order: any): "pending_dispatch" | "pending_delivery" | "closed" | "on_hold" | "cancelled" {
  if (!order || typeof order !== "object") return "pending_delivery";
  const status = deriveOrderWorkflowStatus(order);

  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";

  if (status === "dispatch_pending" || status === "partially_finance_approved" || status === "fully_finance_approved" || order.workflow_stage === "dispatch_review") {
    return "pending_dispatch";
  }

  if (status === "delivered") {
    return "closed";
  }

  const items = Array.isArray(order.order_items) ? order.order_items : [];
  let ordered = 0;
  let delivered = 0;
  items.forEach((line: any) => {
    ordered += Number(line.ordered_quantity ?? line.quantity ?? 0);
    delivered += Number(line.delivered_quantity ?? 0);
  });

  if (ordered > 0 && delivered >= ordered) {
    return "closed";
  }

  // upstream / draft fallbacks
  if (status === "draft" || status === "submitted" || status === "sales_approved" || status === "finance_review" || status === "finance_rejected") {
    return "pending_dispatch";
  }

  return "pending_delivery";
}

export default function DispatchOrderVolumeChart({ orders, isOrdersFetching }: DispatchOrderVolumeChartProps) {
  const [showMetric, setShowMetric] = useState<"orders" | "quantities" | "volume">("orders");
  const [timeframe, setTimeframe] = useState<"monthly" | "daily">("monthly");
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  const totalOrdersCount = orders.length;

  const monthlyData = useMemo(() => {
    type ChartBucket = {
      key: string;
      label: string;
      ordersCount: number;
      totalQty: number;
      totalVolume: number;
      breakdown: Record<
        "pending_dispatch" | "pending_delivery" | "closed" | "on_hold" | "cancelled",
        { count: number; quantity: number; amount: number }
      >;
    };
    const months: ChartBucket[] = [];
    const now = new Date();
    // Generate last 6 months in chronological order
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-US", { month: "short" }),
        ordersCount: 0,
        totalQty: 0,
        totalVolume: 0,
        breakdown: {
          pending_dispatch: { count: 0, quantity: 0, amount: 0 },
          pending_delivery: { count: 0, quantity: 0, amount: 0 },
          closed: { count: 0, quantity: 0, amount: 0 },
          on_hold: { count: 0, quantity: 0, amount: 0 },
          cancelled: { count: 0, quantity: 0, amount: 0 },
        },
      });
    }

    orders.forEach((o) => {
      const dateStr = o.order_date ?? o.created_at ?? o.createdAt;
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) {
        const cat = getDispatchOrderTabCategory(o);

        bucket.ordersCount++;
        bucket.breakdown[cat].count++;
        const items = Array.isArray(o.order_items) ? o.order_items : [];
        let orderQty = 0;
        items.forEach((item: any) => {
          orderQty += Number(item.ordered_quantity ?? item.quantity ?? 0);
        });
        bucket.totalQty += orderQty;
        bucket.breakdown[cat].quantity += orderQty;

        const orderAmount = Number(o.grand_total ?? o.total ?? 0);
        bucket.totalVolume += orderAmount;
        bucket.breakdown[cat].amount += orderAmount;
      }
    });

    return months;
  }, [orders]);

  const dailyData = useMemo(() => {
    type ChartBucket = {
      key: string;
      label: string;
      ordersCount: number;
      totalQty: number;
      totalVolume: number;
      breakdown: Record<
        "pending_dispatch" | "pending_delivery" | "closed" | "on_hold" | "cancelled",
        { count: number; quantity: number; amount: number }
      >;
    };
    const days: ChartBucket[] = [];
    const now = new Date();
    // Generate last 10 days in chronological order
    for (let i = 9; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        label: `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`,
        ordersCount: 0,
        totalQty: 0,
        totalVolume: 0,
        breakdown: {
          pending_dispatch: { count: 0, quantity: 0, amount: 0 },
          pending_delivery: { count: 0, quantity: 0, amount: 0 },
          closed: { count: 0, quantity: 0, amount: 0 },
          on_hold: { count: 0, quantity: 0, amount: 0 },
          cancelled: { count: 0, quantity: 0, amount: 0 },
        },
      });
    }

    orders.forEach((o) => {
      const dateStr = o.order_date ?? o.created_at ?? o.createdAt;
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const bucket = days.find((day) => day.key === key);
      if (bucket) {
        const cat = getDispatchOrderTabCategory(o);

        bucket.ordersCount++;
        bucket.breakdown[cat].count++;
        const items = Array.isArray(o.order_items) ? o.order_items : [];
        let orderQty = 0;
        items.forEach((item: any) => {
          orderQty += Number(item.ordered_quantity ?? item.quantity ?? 0);
        });
        bucket.totalQty += orderQty;
        bucket.breakdown[cat].quantity += orderQty;

        const orderAmount = Number(o.grand_total ?? o.total ?? 0);
        bucket.totalVolume += orderAmount;
        bucket.breakdown[cat].amount += orderAmount;
      }
    });

    return days;
  }, [orders]);

  const activeData = timeframe === "monthly" ? monthlyData : dailyData;

  const maxVal = useMemo(() => {
    const vals = activeData.map((d) => {
      if (showMetric === "orders") return d.ordersCount;
      if (showMetric === "quantities") return d.totalQty;
      return d.totalVolume;
    });
    const max = Math.max(...vals, 1);
    if (max <= 5) return 5;
    if (max <= 10) return 10;
    if (max <= 20) return 20;
    if (max <= 55) return 55;
    if (max <= 100) return 100;
    if (max <= 500) return Math.ceil(max / 50) * 50;
    if (max <= 1000) return Math.ceil(max / 100) * 100;
    if (max <= 5000) return Math.ceil(max / 500) * 500;
    if (max <= 10000) return Math.ceil(max / 1000) * 1000;
    return Math.ceil(max / 5000) * 5000;
  }, [activeData, showMetric]);

  const gridTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 font-sans relative z-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-sans">
            Fulfillment & Shipping Volumes
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
            Monitor package dispatches, cargo item quantities, and delivery valuations in real-time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Metric Selector */}
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setShowMetric("orders")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                showMetric === "orders"
                  ? "bg-white text-amber-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Orders
            </button>
            <button
              type="button"
              onClick={() => setShowMetric("quantities")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                showMetric === "quantities"
                  ? "bg-white text-amber-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Quantities
            </button>
            <button
              type="button"
              onClick={() => setShowMetric("volume")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                showMetric === "volume"
                  ? "bg-white text-amber-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Cargo Value (₹)
            </button>
          </div>

          {/* Timeframe Toggle */}
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setTimeframe("monthly")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                timeframe === "monthly"
                  ? "bg-white text-amber-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setTimeframe("daily")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                timeframe === "daily"
                  ? "bg-white text-amber-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Daily (10d)
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100/50 pb-3 dark:border-white/5">
        {(["pending_dispatch", "pending_delivery", "closed", "on_hold", "cancelled"] as const).map((key) => {
          const colorInfo = STATUS_COLORS[key];
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${colorInfo.dot}`} />
              <span>{colorInfo.label}</span>
            </div>
          );
        })}
      </div>

      {/* Bar Chart Container */}
      <div className="mt-6 relative z-20 h-[250px] w-full flex items-center justify-center">
        {isOrdersFetching ? (
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Loading analytics...</p>
          </div>
        ) : totalOrdersCount === 0 ? (
          <div className="text-center py-12">
            <Info className="h-8 w-8 text-slate-450 mx-auto mb-2 dark:text-slate-500" />
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">No dispatch history available to graph.</p>
          </div>
        ) : (
          <svg viewBox="0 0 500 200" className="w-full h-full select-none overflow-visible">
            {/* Grids and Axes */}
            {gridTicks.map((tick, index) => {
              const y = 15 + 155 - (tick / maxVal) * 155;
              return (
                <g key={index} className="opacity-40 dark:opacity-20">
                  {/* Grid Line */}
                  <line
                    x1={45}
                    y1={y}
                    x2={485}
                    y2={y}
                    className="stroke-slate-200 dark:stroke-slate-700"
                    strokeDasharray="4 4"
                  />
                  {/* Y-Axis tick label */}
                  <text
                    x={38}
                    y={y + 3}
                    textAnchor="end"
                    className="text-[9px] font-semibold fill-slate-400 dark:fill-slate-500 font-mono"
                  >
                    {showMetric === "volume" ? `₹${formatMoneyAbbr(tick)}` : Math.round(tick)}
                  </text>
                </g>
              );
            })}

            {/* X-Axis base line */}
            <line
              x1={45}
              y1={170}
              x2={485}
              y2={170}
              className="stroke-slate-200 dark:stroke-slate-700 opacity-60"
            />

            {/* Bars */}
            {activeData.map((d, i) => {
              const slotWidth = 440 / activeData.length;
              const barWidth = slotWidth * 0.6;
              const x = 45 + i * slotWidth + slotWidth / 2;
              const barX = x - barWidth / 2;
              const isHovered = hoveredBarIndex === i;

              const statusKeys = ["pending_dispatch", "pending_delivery", "closed", "on_hold", "cancelled"] as const;

              let currentY = 170;

              return (
                <g
                  key={i}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredBarIndex(i)}
                  onMouseLeave={() => setHoveredBarIndex(null)}
                >
                  {statusKeys.map((statusKey) => {
                    const stats = d.breakdown[statusKey];
                    const segmentVal = showMetric === "orders" ? stats.count : showMetric === "quantities" ? stats.quantity : stats.amount;

                    if (segmentVal <= 0) return null;

                    const segmentHeight = (segmentVal / maxVal) * 155;
                    const segmentY = currentY - segmentHeight;
                    currentY = segmentY;

                    const colorInfo = STATUS_COLORS[statusKey];

                    return (
                      <rect
                        key={statusKey}
                        x={barX}
                        y={segmentY}
                        width={barWidth}
                        height={segmentHeight}
                        className={`transition-all duration-300 ${
                          isHovered ? `${colorInfo.hover} filter drop-shadow-md` : colorInfo.fill
                        }`}
                      />
                    );
                  })}

                  {/* Invisible overlay for easier hovering */}
                  <rect x={barX} y={15} width={barWidth} height={155} className="fill-transparent" />

                  {/* X-Axis labels */}
                  <text
                    x={x}
                    y={185}
                    textAnchor="middle"
                    className="text-[8px] font-semibold fill-slate-400 dark:fill-slate-500 font-sans"
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}

            {/* Floating Tooltip */}
            {hoveredBarIndex !== null &&
              (() => {
                const item = activeData[hoveredBarIndex];
                const val = showMetric === "orders" ? item.ordersCount : showMetric === "quantities" ? item.totalQty : item.totalVolume;
                const barHeight = (val / maxVal) * 155;
                const barY = 15 + 155 - barHeight;
                const slotWidth = 440 / activeData.length;
                const x = 45 + hoveredBarIndex * slotWidth + slotWidth / 2;

                const activeBreakdowns = (["pending_dispatch", "pending_delivery", "closed", "on_hold", "cancelled"] as const)
                  .map((key) => {
                    const stats = item.breakdown[key];
                    const segmentVal = showMetric === "orders" ? stats.count : showMetric === "quantities" ? stats.quantity : stats.amount;
                    return {
                      key,
                      label: STATUS_COLORS[key].label,
                      val: segmentVal,
                    };
                  })
                  .filter((ab) => ab.val > 0);

                const tooltipHeight = 20 + activeBreakdowns.length * 12 + 6;
                let tooltipY = barY - tooltipHeight - 8;
                let arrowD = `M ${x - 4} ${barY - 9} L ${x} ${barY - 5} L ${x + 4} ${barY - 9} Z`;

                if (tooltipY < 5) {
                  tooltipY = barY + 12;
                  arrowD = `M ${x - 4} ${barY + 13} L ${x} ${barY + 9} L ${x + 4} ${barY + 13} Z`;
                }

                return (
                  <g className="pointer-events-none transition-all duration-200">
                    <rect
                      x={x - 75}
                      y={tooltipY}
                      width={150}
                      height={tooltipHeight}
                      rx={6}
                      className="fill-slate-900/95 dark:fill-slate-800/95 stroke-slate-200 dark:stroke-white/10 stroke-[0.5] shadow-lg"
                    />
                    <text
                      x={x}
                      y={tooltipY + 13}
                      textAnchor="middle"
                      className="text-[9px] font-bold fill-white/80 font-sans tracking-wide uppercase"
                    >
                      {item.label}
                    </text>

                    {activeBreakdowns.map((ab, idx) => {
                      const lineY = tooltipY + 26 + idx * 12;
                      const colorInfo = STATUS_COLORS[ab.key];
                      const displayVal = showMetric === "volume" ? `₹${formatMoney(ab.val)}` : ab.val.toLocaleString();
                      return (
                        <g key={ab.key}>
                          <circle cx={x - 57} cy={lineY - 3} r={3} className={colorInfo.hover} />
                          <text
                            x={x - 47}
                            y={lineY}
                            textAnchor="start"
                            className="text-[8px] font-semibold fill-white font-sans"
                          >
                            {colorInfo.label}
                          </text>
                          <text
                            x={x + 57}
                            y={lineY}
                            textAnchor="end"
                            className="text-[8px] font-bold fill-slate-300 font-mono"
                          >
                            {displayVal}
                          </text>
                        </g>
                      );
                    })}

                    <path
                      d={arrowD}
                      className="fill-slate-900/95 dark:fill-slate-800/95"
                    />
                  </g>
                );
              })()}
          </svg>
        )}
      </div>
    </div>
  );
}
