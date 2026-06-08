"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { getOrderTabCategory } from "./orderUtils";

interface OrderVolumeChartProps {
  orders: any[];
  isOrdersFetching: boolean;
}

const STATUS_COLORS: Record<
  "draft" | "open" | "closed" | "on_hold" | "rejected" | "cancelled",
  { fill: string; hover: string; dot: string; label: string }
> = {
  draft: {
    fill: "fill-slate-400/85 dark:fill-slate-500/60",
    hover: "fill-slate-500 dark:fill-slate-400",
    dot: "bg-slate-400 dark:bg-slate-500",
    label: "Draft",
  },
  open: {
    fill: "fill-blue-500/85 dark:fill-blue-500/60",
    hover: "fill-blue-600 dark:fill-blue-400",
    dot: "bg-blue-500 dark:bg-blue-400",
    label: "Open",
  },
  closed: {
    fill: "fill-emerald-500/85 dark:fill-emerald-550/60",
    hover: "fill-emerald-600 dark:fill-emerald-400",
    dot: "bg-emerald-500 dark:bg-emerald-450",
    label: "Closed",
  },
  on_hold: {
    fill: "fill-amber-500/85 dark:fill-amber-500/60",
    hover: "fill-amber-600 dark:fill-amber-400",
    dot: "bg-amber-500 dark:bg-amber-450",
    label: "On Hold",
  },
  rejected: {
    fill: "fill-red-500/85 dark:fill-red-550/60",
    hover: "fill-red-600 dark:fill-red-400",
    dot: "bg-red-500 dark:bg-red-450",
    label: "Rejected",
  },
  cancelled: {
    fill: "fill-rose-500/85 dark:fill-rose-500/60",
    hover: "fill-rose-600 dark:fill-rose-450",
    dot: "bg-rose-500 dark:bg-rose-400",
    label: "Cancelled",
  },
};

export default function OrderVolumeChart({ orders, isOrdersFetching }: OrderVolumeChartProps) {
  const [showMetric, setShowMetric] = useState<"orders" | "quantities">("orders");
  const [timeframe, setTimeframe] = useState<"monthly" | "daily">("monthly");
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  const totalOrdersCount = orders.length;

  const monthlyData = useMemo(() => {
    type ChartBucket = {
      key: string;
      label: string;
      ordersCount: number;
      totalQty: number;
      breakdown: Record<
        "draft" | "open" | "closed" | "on_hold" | "rejected" | "cancelled",
        { count: number; quantity: number }
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
        breakdown: {
          draft: { count: 0, quantity: 0 },
          open: { count: 0, quantity: 0 },
          closed: { count: 0, quantity: 0 },
          on_hold: { count: 0, quantity: 0 },
          rejected: { count: 0, quantity: 0 },
          cancelled: { count: 0, quantity: 0 },
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
        const cat = getOrderTabCategory(o);
        bucket.ordersCount++;
        bucket.breakdown[cat].count++;
        const items = Array.isArray(o.order_items) ? o.order_items : [];
        let orderQty = 0;
        items.forEach((item: any) => {
          orderQty += Number(item.ordered_quantity ?? item.quantity ?? 0);
        });
        bucket.totalQty += orderQty;
        bucket.breakdown[cat].quantity += orderQty;
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
      breakdown: Record<
        "draft" | "open" | "closed" | "on_hold" | "rejected" | "cancelled",
        { count: number; quantity: number }
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
        breakdown: {
          draft: { count: 0, quantity: 0 },
          open: { count: 0, quantity: 0 },
          closed: { count: 0, quantity: 0 },
          on_hold: { count: 0, quantity: 0 },
          rejected: { count: 0, quantity: 0 },
          cancelled: { count: 0, quantity: 0 },
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
        const cat = getOrderTabCategory(o);
        bucket.ordersCount++;
        bucket.breakdown[cat].count++;
        const items = Array.isArray(o.order_items) ? o.order_items : [];
        let orderQty = 0;
        items.forEach((item: any) => {
          orderQty += Number(item.ordered_quantity ?? item.quantity ?? 0);
        });
        bucket.totalQty += orderQty;
        bucket.breakdown[cat].quantity += orderQty;
      }
    });

    return days;
  }, [orders]);

  const activeData = timeframe === "monthly" ? monthlyData : dailyData;

  const maxVal = useMemo(() => {
    const vals = activeData.map((d) => (showMetric === "orders" ? d.ordersCount : d.totalQty));
    const max = Math.max(...vals, 1);
    if (max <= 5) return 5;
    if (max <= 10) return 10;
    if (max <= 20) return 20;
    if (max <= 55) return 55;
    if (max <= 100) return 100;
    if (max <= 500) return Math.ceil(max / 50) * 50;
    return Math.ceil(max / 100) * 100;
  }, [activeData, showMetric]);

  const gridTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 relative z-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Order Volume Analytics
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Visualize sales volume and item quantities over time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Metric Toggle */}
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setShowMetric("orders")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                showMetric === "orders"
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
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
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Item Quantities
            </button>
          </div>

          {/* Timeframe Toggle */}
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setTimeframe("monthly")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                timeframe === "monthly"
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
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
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
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
        {(["draft", "open", "closed", "on_hold", "rejected", "cancelled"] as const).map((key) => {
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
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Loading analytics...</p>
          </div>
        ) : totalOrdersCount === 0 ? (
          <div className="text-center py-12">
            <Info className="h-8 w-8 text-slate-450 mx-auto mb-2 dark:text-slate-500" />
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">No order history available to graph.</p>
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
                    {Math.round(tick)}
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

              const statusKeys = ["draft", "open", "closed", "on_hold", "rejected", "cancelled"] as const;

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
                    const segmentVal = showMetric === "orders" ? stats.count : stats.quantity;

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
                const val = showMetric === "orders" ? item.ordersCount : item.totalQty;
                const barHeight = (val / maxVal) * 155;
                const barY = 15 + 155 - barHeight;
                const slotWidth = 440 / activeData.length;
                const x = 45 + hoveredBarIndex * slotWidth + slotWidth / 2;

                const activeBreakdowns = (["draft", "open", "closed", "on_hold", "rejected", "cancelled"] as const)
                  .map((key) => {
                    const stats = item.breakdown[key];
                    const segmentVal = showMetric === "orders" ? stats.count : stats.quantity;
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
                      x={x - 65}
                      y={tooltipY}
                      width={130}
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
                      return (
                        <g key={ab.key}>
                          <circle cx={x - 48} cy={lineY - 3} r={3} className={colorInfo.hover} />
                          <text
                            x={x - 38}
                            y={lineY}
                            textAnchor="start"
                            className="text-[8px] font-semibold fill-white font-sans"
                          >
                            {ab.label}
                          </text>
                          <text
                            x={x + 48}
                            y={lineY}
                            textAnchor="end"
                            className="text-[8px] font-bold fill-slate-300 font-mono"
                          >
                            {ab.val.toLocaleString()}
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
