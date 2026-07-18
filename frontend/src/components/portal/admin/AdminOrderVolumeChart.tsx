"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import {
  ADMIN_ORDER_TABS,
  ADMIN_STATUS_COLORS,
  categorizeOrderForAdminChart,
  createEmptyAdminChartBreakdown,
  orderLineQuantity,
  type AdminChartBreakdown,
  type AdminOrderTabCategory,
} from "./adminOrderUtils";

interface AdminOrderVolumeChartProps {
  orders: unknown[];
  isOrdersFetching: boolean;
}

type ChartBucket = {
  key: string;
  label: string;
  ordersCount: number;
  totalQty: number;
  totalVolume: number;
  breakdown: AdminChartBreakdown;
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

function orderAmount(order: unknown): number {
  const row = order as { grand_total?: unknown; total?: unknown };
  return Number(row.grand_total ?? row.total ?? 0);
}

function orderDateKey(order: unknown, granularity: "monthly" | "daily"): string | null {
  const row = order as {
    order_date?: unknown;
    created_at?: unknown;
    createdAt?: unknown;
  };
  const dateStr = row.order_date ?? row.created_at ?? row.createdAt;
  if (!dateStr) return null;
  const d = new Date(String(dateStr));
  if (Number.isNaN(d.getTime())) return null;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (granularity === "monthly") {
    return `${d.getFullYear()}-${month}`;
  }
  return `${d.getFullYear()}-${month}-${day}`;
}

function accumulateOrderIntoBucket(bucket: ChartBucket, order: unknown, cat: AdminOrderTabCategory) {
  bucket.ordersCount++;
  bucket.breakdown[cat].count++;

  const orderQty = orderLineQuantity(order);
  bucket.totalQty += orderQty;
  bucket.breakdown[cat].quantity += orderQty;

  const amount = orderAmount(order);
  bucket.totalVolume += amount;
  bucket.breakdown[cat].amount += amount;
}

function buildMonthlyBuckets(orders: unknown[]): ChartBucket[] {
  const months: ChartBucket[] = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short" }),
      ordersCount: 0,
      totalQty: 0,
      totalVolume: 0,
      breakdown: createEmptyAdminChartBreakdown(),
    });
  }

  for (const order of orders) {
    const cat = categorizeOrderForAdminChart(order);
    if (!cat) continue;

    const key = orderDateKey(order, "monthly");
    if (!key) continue;

    const bucket = months.find((m) => m.key === key);
    if (bucket) {
      accumulateOrderIntoBucket(bucket, order, cat);
    }
  }

  return months;
}

function buildDailyBuckets(orders: unknown[]): ChartBucket[] {
  const days: ChartBucket[] = [];
  const now = new Date();

  for (let i = 9; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      label: `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`,
      ordersCount: 0,
      totalQty: 0,
      totalVolume: 0,
      breakdown: createEmptyAdminChartBreakdown(),
    });
  }

  for (const order of orders) {
    const cat = categorizeOrderForAdminChart(order);
    if (!cat) continue;

    const key = orderDateKey(order, "daily");
    if (!key) continue;

    const bucket = days.find((day) => day.key === key);
    if (bucket) {
      accumulateOrderIntoBucket(bucket, order, cat);
    }
  }

  return days;
}

export default function AdminOrderVolumeChart({
  orders,
  isOrdersFetching,
}: AdminOrderVolumeChartProps) {
  const [showMetric, setShowMetric] = useState<"orders" | "quantities" | "volume">("orders");
  const [timeframe, setTimeframe] = useState<"monthly" | "daily">("monthly");
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  const totalOrdersCount = orders.filter((o) => categorizeOrderForAdminChart(o) !== null).length;

  const monthlyData = useMemo(() => buildMonthlyBuckets(orders), [orders]);
  const dailyData = useMemo(() => buildDailyBuckets(orders), [orders]);

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
  const statusKeys = ADMIN_ORDER_TABS.map((tab) => tab.id);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 font-sans relative z-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Order Volume Analytics
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Visualize sales volume, item quantities, and order values over time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
              Quantities
            </button>
            <button
              type="button"
              onClick={() => setShowMetric("volume")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                showMetric === "volume"
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Order Value (₹)
            </button>
          </div>

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

      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-2xs font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100/50 pb-3 dark:border-white/5">
        {statusKeys.map((key) => {
          const colorInfo = ADMIN_STATUS_COLORS[key];
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${colorInfo.dot}`} />
              <span>{colorInfo.label}</span>
            </div>
          );
        })}
      </div>

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
            {gridTicks.map((tick, index) => {
              const y = 15 + 155 - (tick / maxVal) * 155;
              return (
                <g key={index} className="opacity-40 dark:opacity-20">
                  <line
                    x1={45}
                    y1={y}
                    x2={485}
                    y2={y}
                    className="stroke-slate-200 dark:stroke-slate-700"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={38}
                    y={y + 3}
                    textAnchor="end"
                    className="text-2xs font-semibold fill-slate-400 dark:fill-slate-500 font-mono"
                  >
                    {showMetric === "volume" ? `₹${formatMoneyAbbr(tick)}` : Math.round(tick)}
                  </text>
                </g>
              );
            })}

            <line
              x1={45}
              y1={170}
              x2={485}
              y2={170}
              className="stroke-slate-200 dark:stroke-slate-700 opacity-60"
            />

            {activeData.map((d, i) => {
              const slotWidth = 440 / activeData.length;
              const barWidth = slotWidth * 0.6;
              const x = 45 + i * slotWidth + slotWidth / 2;
              const barX = x - barWidth / 2;
              const isHovered = hoveredBarIndex === i;

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
                    const segmentVal =
                      showMetric === "orders"
                        ? stats.count
                        : showMetric === "quantities"
                          ? stats.quantity
                          : stats.amount;

                    if (segmentVal <= 0) return null;

                    const segmentHeight = (segmentVal / maxVal) * 155;
                    const segmentY = currentY - segmentHeight;
                    currentY = segmentY;

                    const colorInfo = ADMIN_STATUS_COLORS[statusKey];

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

                  <rect x={barX} y={15} width={barWidth} height={155} className="fill-transparent" />

                  <text
                    x={x}
                    y={185}
                    textAnchor="middle"
                    className="text-2xs font-semibold fill-slate-400 dark:fill-slate-500 font-sans"
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}

            {hoveredBarIndex !== null &&
              (() => {
                const item = activeData[hoveredBarIndex];
                const val =
                  showMetric === "orders"
                    ? item.ordersCount
                    : showMetric === "quantities"
                      ? item.totalQty
                      : item.totalVolume;
                const barHeight = (val / maxVal) * 155;
                const barY = 15 + 155 - barHeight;
                const slotWidth = 440 / activeData.length;
                const x = 45 + hoveredBarIndex * slotWidth + slotWidth / 2;

                const activeBreakdowns = statusKeys
                  .map((key) => {
                    const stats = item.breakdown[key];
                    const segmentVal =
                      showMetric === "orders"
                        ? stats.count
                        : showMetric === "quantities"
                          ? stats.quantity
                          : stats.amount;
                    return {
                      key,
                      label: ADMIN_STATUS_COLORS[key].label,
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
                      x={x - 70}
                      y={tooltipY}
                      width={140}
                      height={tooltipHeight}
                      rx={6}
                      className="fill-slate-900/95 dark:fill-slate-800/95 stroke-slate-200 dark:stroke-white/10 stroke-[0.5] shadow-lg"
                    />
                    <text
                      x={x}
                      y={tooltipY + 13}
                      textAnchor="middle"
                      className="text-2xs font-bold fill-white/80 font-sans tracking-wide uppercase"
                    >
                      {item.label}
                    </text>

                    {activeBreakdowns.map((ab, idx) => {
                      const lineY = tooltipY + 26 + idx * 12;
                      const colorInfo = ADMIN_STATUS_COLORS[ab.key];
                      const displayVal =
                        showMetric === "volume" ? `₹${formatMoney(ab.val)}` : ab.val.toLocaleString();
                      return (
                        <g key={ab.key}>
                          <circle cx={x - 52} cy={lineY - 3} r={3} className={colorInfo.hover} />
                          <text
                            x={x - 42}
                            y={lineY}
                            textAnchor="start"
                            className="text-2xs font-semibold fill-white font-sans"
                          >
                            {ab.label}
                          </text>
                          <text
                            x={x + 52}
                            y={lineY}
                            textAnchor="end"
                            className="text-2xs font-bold fill-slate-300 font-mono"
                          >
                            {displayVal}
                          </text>
                        </g>
                      );
                    })}

                    <path d={arrowD} className="fill-slate-900/95 dark:fill-slate-800/95" />
                  </g>
                );
              })()}
          </svg>
        )}
      </div>
    </div>
  );
}
