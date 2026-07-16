"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Check, ChevronDown, Info } from "lucide-react";

interface AdminMonthlyPerformanceChartProps {
  orders: any[];
  isOrdersFetching: boolean;
}

type Metric = "quantity" | "volume";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const YEAR_COLORS = [
  { fill: "fill-blue-500", hover: "fill-blue-400", swatch: "bg-blue-500" },
  { fill: "fill-emerald-500", hover: "fill-emerald-400", swatch: "bg-emerald-500" },
  { fill: "fill-amber-500", hover: "fill-amber-400", swatch: "bg-amber-500" },
  { fill: "fill-violet-500", hover: "fill-violet-400", swatch: "bg-violet-500" },
  { fill: "fill-rose-500", hover: "fill-rose-400", swatch: "bg-rose-500" },
  { fill: "fill-cyan-500", hover: "fill-cyan-400", swatch: "bg-cyan-500" },
] as const;

function itemNetQty(item: any): number {
  const del = Number(item.delivered_quantity) || 0;
  const ret = Number(item.returned_quantity) || 0;
  return del - ret;
}

function itemUnitPrice(item: any): number {
  return Number(item.unit_price ?? item.approved_unit_price ?? 0) || 0;
}

function orderMetricValue(order: any, metric: Metric): number {
  const items = Array.isArray(order?.order_items) ? order.order_items : [];
  let total = 0;
  for (const item of items) {
    const qty = itemNetQty(item);
    total += metric === "quantity" ? qty : qty * itemUnitPrice(item);
  }
  return total;
}

function orderYearMonth(order: any): { year: number; month: number } | null {
  const dateStr = order?.order_date ?? order?.created_at ?? order?.createdAt;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() };
}

function formatAxisValue(v: number, metric: Metric): string {
  if (metric === "volume") {
    if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
    if (v >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
    if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}K`;
    return `₹${Math.round(v)}`;
  }
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

function formatTooltipValue(v: number, metric: Metric): string {
  if (metric === "volume") {
    return `₹${v.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }
  return v.toLocaleString();
}

export default function AdminMonthlyPerformanceChart({
  orders,
  isOrdersFetching,
}: AdminMonthlyPerformanceChartProps) {
  const [metric, setMetric] = useState<Metric>("quantity");
  const [selectedYears, setSelectedYears] = useState<number[]>([
    new Date().getFullYear(),
  ]);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ month: number; year: number } | null>(null);
  const yearMenuRef = useRef<HTMLDivElement>(null);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const o of orders) {
      const ym = orderYearMonth(o);
      if (ym) years.add(ym.year);
    }
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [orders]);

  useEffect(() => {
    if (availableYears.length === 0) return;
    const currentYear = new Date().getFullYear();
    const fallback = availableYears.includes(currentYear)
      ? [currentYear]
      : [availableYears[0]];
    setSelectedYears((prev) => {
      if (prev.length === 0) return fallback;
      const next = prev.filter((y) => availableYears.includes(y));
      return next.length > 0 ? next : fallback;
    });
  }, [availableYears]);

  useEffect(() => {
    if (!yearMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!yearMenuRef.current?.contains(e.target as Node)) {
        setYearMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [yearMenuOpen]);

  const activeYears = useMemo(
    () => [...selectedYears].sort((a, b) => a - b),
    [selectedYears],
  );

  const monthlyByYear = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const year of activeYears) {
      map.set(year, Array.from({ length: 12 }, () => 0));
    }
    for (const o of orders) {
      const ym = orderYearMonth(o);
      if (!ym || !map.has(ym.year)) continue;
      const row = map.get(ym.year)!;
      row[ym.month] += orderMetricValue(o, metric);
    }
    return map;
  }, [orders, activeYears, metric]);

  const maxVal = useMemo(() => {
    let max = 0;
    for (const year of activeYears) {
      const row = monthlyByYear.get(year) ?? [];
      for (const v of row) max = Math.max(max, v);
    }
    if (max <= 0) return 10;
    if (max <= 5) return 5;
    if (max <= 10) return 10;
    if (max <= 20) return 20;
    if (max <= 50) return 50;
    if (max <= 100) return 100;
    if (max <= 500) return Math.ceil(max / 50) * 50;
    if (max <= 1000) return Math.ceil(max / 100) * 100;
    if (max <= 5000) return Math.ceil(max / 500) * 500;
    if (max <= 10000) return Math.ceil(max / 1000) * 1000;
    return Math.ceil(max / 5000) * 5000;
  }, [monthlyByYear, activeYears]);

  const gridTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

  const toggleYear = (year: number) => {
    setSelectedYears((prev) => {
      if (prev.includes(year)) {
        if (prev.length === 1) return prev;
        return prev.filter((y) => y !== year);
      }
      return [...prev, year].sort((a, b) => b - a);
    });
  };

  const yearFilterLabel =
    selectedYears.length === 0
      ? "Select year"
      : selectedYears.length === 1
        ? String(selectedYears[0])
        : `${selectedYears.length} years`;

  const chartEmpty = !isOrdersFetching && orders.length === 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 relative z-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
        <div className="flex items-start gap-2.5">
          <BarChart3 className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Monthly Performance
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {metric === "quantity"
                ? "System-wide net sales quantity by month across selected years"
                : "System-wide net sales volume (₹) by month across selected years"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-end sm:self-auto">
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMetric("quantity")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                metric === "quantity"
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Quantity
            </button>
            <button
              type="button"
              onClick={() => setMetric("volume")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                metric === "volume"
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Volume
            </button>
          </div>

          <div className="relative" ref={yearMenuRef}>
            <button
              type="button"
              onClick={() => setYearMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              <span className="text-slate-500 dark:text-slate-400 font-medium">Year</span>
              <span>{yearFilterLabel}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition ${yearMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {yearMenuOpen && (
              <div className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:border-white/5">
                  Select years
                </div>
                <ul className="max-h-56 overflow-y-auto py-1">
                  {availableYears.map((year) => {
                    const checked = selectedYears.includes(year);
                    return (
                      <li key={year}>
                        <button
                          type="button"
                          onClick={() => toggleYear(year)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5 cursor-pointer"
                        >
                          <span>{year}</span>
                          {checked ? (
                            <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <span className="h-3.5 w-3.5 rounded border border-slate-300 dark:border-slate-600" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeYears.length > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100/50 pb-3 dark:border-white/5">
          {activeYears.map((year, idx) => {
            const color = YEAR_COLORS[idx % YEAR_COLORS.length];
            return (
              <div key={year} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${color.swatch}`} />
                <span>{year}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 relative z-20 h-[280px] w-full flex items-center justify-center">
        {isOrdersFetching ? (
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Loading performance…
            </p>
          </div>
        ) : chartEmpty ? (
          <div className="text-center py-12">
            <Info className="h-8 w-8 text-slate-450 mx-auto mb-2 dark:text-slate-500" />
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              No order history available to graph.
            </p>
          </div>
        ) : (
          <svg viewBox="0 0 640 230" className="w-full h-full select-none overflow-visible">
            {gridTicks.map((tick, index) => {
              const y = 20 + 170 - (tick / maxVal) * 170;
              return (
                <g key={index} className="opacity-40 dark:opacity-20">
                  <line
                    x1={52}
                    y1={y}
                    x2={620}
                    y2={y}
                    className="stroke-slate-200 dark:stroke-slate-700"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={45}
                    y={y + 3}
                    textAnchor="end"
                    className="text-[9px] font-semibold fill-slate-400 dark:fill-slate-500 font-mono"
                  >
                    {formatAxisValue(tick, metric)}
                  </text>
                </g>
              );
            })}

            <line
              x1={52}
              y1={190}
              x2={620}
              y2={190}
              className="stroke-slate-200 dark:stroke-slate-700 opacity-60"
            />

            {MONTH_LABELS.map((label, monthIdx) => {
              const slotWidth = 568 / 12;
              const groupX = 52 + monthIdx * slotWidth;
              const yearCount = Math.max(activeYears.length, 1);
              const barGap = 2;
              const usable = slotWidth * 0.72;
              const barWidth = Math.max(4, (usable - barGap * (yearCount - 1)) / yearCount);
              const groupStart = groupX + (slotWidth - usable) / 2;
              const centerX = groupX + slotWidth / 2;

              return (
                <g key={label}>
                  {activeYears.map((year, yearIdx) => {
                    const value = monthlyByYear.get(year)?.[monthIdx] ?? 0;
                    const barHeight = (value / maxVal) * 170;
                    const barX = groupStart + yearIdx * (barWidth + barGap);
                    const barY = 190 - barHeight;
                    const color = YEAR_COLORS[yearIdx % YEAR_COLORS.length];
                    const isHovered =
                      hoveredCell?.month === monthIdx && hoveredCell?.year === year;

                    return (
                      <g
                        key={`${year}-${monthIdx}`}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredCell({ month: monthIdx, year })}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <rect
                          x={barX}
                          y={barHeight > 0 ? barY : 188}
                          width={barWidth}
                          height={barHeight > 0 ? barHeight : 2}
                          rx={2}
                          className={`transition-all duration-200 ${
                            isHovered ? `${color.hover} filter drop-shadow-md` : color.fill
                          } ${barHeight <= 0 ? "opacity-25" : ""}`}
                        />
                        <rect
                          x={barX}
                          y={20}
                          width={barWidth}
                          height={170}
                          className="fill-transparent"
                        />
                      </g>
                    );
                  })}

                  <text
                    x={centerX}
                    y={208}
                    textAnchor="middle"
                    className="text-[9px] font-semibold fill-slate-400 dark:fill-slate-500 font-sans"
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {hoveredCell &&
              (() => {
                const value = monthlyByYear.get(hoveredCell.year)?.[hoveredCell.month] ?? 0;
                const slotWidth = 568 / 12;
                const groupX = 52 + hoveredCell.month * slotWidth;
                const centerX = groupX + slotWidth / 2;
                const barHeight = (value / maxVal) * 170;
                const tipY = Math.max(8, 190 - barHeight - 36);

                return (
                  <g className="pointer-events-none">
                    <rect
                      x={centerX - 56}
                      y={tipY}
                      width={112}
                      height={30}
                      rx={6}
                      className="fill-slate-900/95 dark:fill-slate-800/95 stroke-slate-200 dark:stroke-white/10 stroke-[0.5]"
                    />
                    <text
                      x={centerX}
                      y={tipY + 12}
                      textAnchor="middle"
                      className="text-[8px] font-bold fill-white/80 font-sans uppercase"
                    >
                      {MONTH_LABELS[hoveredCell.month]} {hoveredCell.year}
                    </text>
                    <text
                      x={centerX}
                      y={tipY + 23}
                      textAnchor="middle"
                      className="text-[9px] font-bold fill-white font-mono"
                    >
                      {formatTooltipValue(value, metric)}
                    </text>
                  </g>
                );
              })()}
          </svg>
        )}
      </div>
    </div>
  );
}
