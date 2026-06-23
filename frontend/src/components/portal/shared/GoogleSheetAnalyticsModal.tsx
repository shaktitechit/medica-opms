"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  X,
  Search,
  Download,
  Info,
  SlidersHorizontal,
  RefreshCw,
  TrendingUp,
  BarChart3,
  Users,
  Package,
  Calendar,
  DollarSign,
  ShoppingCart,
  Percent,
} from "lucide-react";
import { resolveOrderCounterparty } from "@/components/portal/sales/partyDisplay";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  orderMatchesAdminTab,
  type AdminOrderTabCategory,
} from "@/components/portal/admin/adminOrderUtils";
import {
  useListOrdersQuery,
  useListPartiesQuery,
  useListUsersQuery,
} from "@/store/api";
import { pickOrders } from "@/components/portal/shared/pickOrders";

export type GoogleSheetAnalyticsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  partyNameById: Map<string, string>;
  portal?: "admin" | "finance" | "account";
};

type AnalyticalRow = {
  date: string;
  ordersCount: number;
  totalQty: number;
  totalVolume: number;
  avgOrderValue: number;
  completedCount: number;
  rawDate: Date;
};

type FlattenedOrder = {
  _id: string;
  order_no: string;
  party_name: string;
  grand_total: number;
  priority: string;
  status: string;
  order_date: string;
  party_id: string;
  sales_person_id: string;
  sales_person_name: string;
  total_quantity: number;
  raw_order_date: Date | null;
  order_items: any[];
  raw: any;
};

const SHEET_COLUMNS = [
  { key: "date", label: "Date", headerLetter: "A", type: "text", width: 120 },
  { key: "ordersCount", label: "Orders Count", headerLetter: "B", type: "number", width: 110 },
  { key: "totalQty", label: "Total Qty Sold", headerLetter: "C", type: "number", width: 130 },
  { key: "totalVolume", label: "Revenue (₹)", headerLetter: "D", type: "currency", width: 150 },
  { key: "avgOrderValue", label: "Avg Order Value (₹)", headerLetter: "E", type: "currency", width: 160 },
  { key: "completedCount", label: "Completed Orders", headerLetter: "F", type: "number", width: 140 },
];

function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateShort(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

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

export function GoogleSheetAnalyticsModal({
  isOpen,
  onClose,
  partyNameById,
  portal = "admin",
}: GoogleSheetAnalyticsModalProps) {
  // Tabs: "visual" (Charts), "rankings" (Leaderboards), "sheet" (Raw Data Grid)
  const [activeTab, setActiveTab] = useState<"visual" | "rankings" | "sheet">("visual");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Filters State
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterParty, setFilterParty] = useState<string>("all");
  const [filterSalesPerson, setFilterSalesPerson] = useState<string>("all");
  const [filterDatePreset, setFilterDatePreset] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");

  // Chart state
  const [chartMetric, setChartMetric] = useState<"volume" | "qty">("volume");
  const [hoveredDailyIndex, setHoveredDailyIndex] = useState<number | null>(null);
  const [hoveredComparisonIndex, setHoveredComparisonIndex] = useState<number | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ date: string; colKey: string } | null>(null);

  // Fetch all orders (unpaginated) when modal is active
  const { data: ordersData, isFetching: isOrdersFetching, isLoading: isOrdersLoading, refetch } = useListOrdersQuery(
    {},
    { skip: !isOpen }
  );

  const partiesQ = useListPartiesQuery({ status: "all" }, { skip: !isOpen });
  const usersQ = useListUsersQuery({}, { skip: !isOpen });

  const orders = useMemo(() => pickOrders(ordersData) || [], [ordersData]);
  const partiesList = useMemo(() => pickOrders(partiesQ.data) || [], [partiesQ.data]);
  const usersList = useMemo(() => pickOrders(usersQ.data) || [], [usersQ.data]);

  const userMap = useMemo(() => {
    const map = new Map<string, any>();
    usersList.forEach((u: any) => {
      const id = u._id || u.id || "";
      if (id) map.set(id, u);
    });
    return map;
  }, [usersList]);

  // Flattened & formatted orders
  const flattenedOrders = useMemo<FlattenedOrder[]>(() => {
    return orders.map((o) => {
      const item = o as any;
      const id = item._id || item.id || "";
      const ref = item.order_no || item.order_number || id || "—";
      const total = Number(item.grand_total ?? item.total ?? 0);
      const pri = typeof item.priority === "string" ? item.priority : "normal";
      const partyName = resolveOrderCounterparty(item as Record<string, unknown>, partyNameById);
      const statusRaw = deriveOrderWorkflowStatus(item) || "draft";
      const orderDateStr = formatDateShort(item.order_date ?? item.created_at ?? item.createdAt);

      const partyId = typeof item.party === "string"
        ? item.party
        : item.party && typeof item.party === "object"
        ? String(item.party._id || item.party.id || "")
        : "";

      const salesUserId = typeof item.assigned_sales_user === "string"
        ? item.assigned_sales_user
        : item.assigned_sales_user && typeof item.assigned_sales_user === "object"
        ? String(item.assigned_sales_user._id || item.assigned_sales_user.id || "")
        : "";

      const salesUserObj = salesUserId ? userMap.get(salesUserId) : null;
      const salesPersonName = salesUserObj?.name || (item.assigned_sales_user && typeof item.assigned_sales_user === "object" ? item.assigned_sales_user.name : "") || "—";

      const itemsList = Array.isArray(item.order_items) ? item.order_items : [];
      const totalQty = itemsList.reduce((sum: number, line: any) => sum + Number(line.ordered_quantity ?? line.quantity ?? 0), 0);
      const rawDate = item.order_date ?? item.created_at ?? item.createdAt;
      const parsedOrderDate = parseDate(rawDate);

      return {
        _id: id,
        order_no: ref,
        party_name: partyName,
        grand_total: total,
        priority: pri,
        status: statusRaw,
        order_date: orderDateStr,
        party_id: partyId,
        sales_person_id: salesUserId,
        sales_person_name: salesPersonName,
        total_quantity: totalQty,
        raw_order_date: parsedOrderDate,
        order_items: itemsList,
        raw: o,
      };
    });
  }, [orders, partyNameById, userMap]);

  // Derived metadata options for filters

  const uniqueParties = useMemo(() => {
    const set = new Set<string>();
    flattenedOrders.forEach((o) => o.party_name && set.add(o.party_name));
    return Array.from(set).sort();
  }, [flattenedOrders]);

  const uniqueSalesPersons = useMemo(() => {
    const set = new Set<string>();
    flattenedOrders.forEach((o) => o.sales_person_name && o.sales_person_name !== "—" && set.add(o.sales_person_name));
    return Array.from(set).sort();
  }, [flattenedOrders]);

  // Apply filters
  const filteredOrders = useMemo(() => {
    return flattenedOrders.filter((o) => {
      // Status filter
      if (filterStatus !== "all") {
        const isMatch = orderMatchesAdminTab(o.raw, filterStatus as AdminOrderTabCategory);
        if (!isMatch) return false;
      }

      // Priority filter
      if (filterPriority !== "all" && o.priority.toLowerCase() !== filterPriority.toLowerCase()) return false;

      // Party filter
      if (filterParty !== "all" && o.party_name !== filterParty) return false;

      // Sales person filter
      if (filterSalesPerson !== "all" && o.sales_person_name !== filterSalesPerson) return false;

      // Date Range filter
      if (filterDatePreset !== "all") {
        if (!o.raw_order_date) return false;
        const d = o.raw_order_date;
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        if (filterDatePreset === "today") {
          if (d < startOfToday) return false;
        } else if (filterDatePreset === "yesterday") {
          const yesterday = new Date(startOfToday);
          yesterday.setDate(yesterday.getDate() - 1);
          if (d < yesterday || d >= startOfToday) return false;
        } else if (filterDatePreset === "last_7") {
          const sevenDaysAgo = new Date(startOfToday);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          if (d < sevenDaysAgo) return false;
        } else if (filterDatePreset === "last_30") {
          const thirtyDaysAgo = new Date(startOfToday);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          if (d < thirtyDaysAgo) return false;
        } else if (filterDatePreset === "custom") {
          if (filterStartDate) {
            const start = new Date(filterStartDate);
            if (!isNaN(start.getTime()) && d < start) return false;
          }
          if (filterEndDate) {
            const end = new Date(filterEndDate);
            if (!isNaN(end.getTime())) {
              const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
              if (d > endOfDay) return false;
            }
          }
        }
      }

      // Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          o.order_no.toLowerCase().includes(q) ||
          o.party_name.toLowerCase().includes(q) ||
          o.sales_person_name.toLowerCase().includes(q) ||
          o.status.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [
    flattenedOrders,
    filterStatus,
    filterPriority,
    filterParty,
    filterSalesPerson,
    filterDatePreset,
    filterStartDate,
    filterEndDate,
    searchQuery,
  ]);

  const hasActiveFilters = useMemo(() => {
    return (
      filterStatus !== "all" ||
      filterPriority !== "all" ||
      filterParty !== "all" ||
      filterSalesPerson !== "all" ||
      filterDatePreset !== "all" ||
      searchQuery.trim() !== ""
    );
  }, [filterStatus, filterPriority, filterParty, filterSalesPerson, filterDatePreset, searchQuery]);

  const handleClearFilters = () => {
    setFilterStatus("all");
    setFilterPriority("all");
    setFilterParty("all");
    setFilterSalesPerson("all");
    setFilterDatePreset("all");
    setFilterStartDate("");
    setFilterEndDate("");
    setSearchQuery("");
  };

  // KPI Calculations
  const kpis = useMemo(() => {
    const totalVolume = filteredOrders.reduce((sum, o) => sum + o.grand_total, 0);
    const totalQty = filteredOrders.reduce((sum, o) => sum + o.total_quantity, 0);
    const activeParties = new Set(filteredOrders.map((o) => o.party_id).filter(Boolean)).size;
    const aov = filteredOrders.length > 0 ? totalVolume / filteredOrders.length : 0;

    // Calculate Top Product
    const productQtyMap = new Map<string, number>();
    filteredOrders.forEach((o) => {
      o.order_items.forEach((item) => {
        const name = item.product_name || (item.product && item.product.product_name) || "Unknown Item";
        const qty = Number(item.ordered_quantity ?? item.quantity ?? 0);
        productQtyMap.set(name, (productQtyMap.get(name) || 0) + qty);
      });
    });

    let topProduct = "—";
    let topProductQty = 0;
    productQtyMap.forEach((qty, name) => {
      if (qty > topProductQty) {
        topProductQty = qty;
        topProduct = name;
      }
    });

    return {
      totalVolume,
      totalQty,
      activeParties,
      aov,
      topProduct,
      topProductQty,
      ordersCount: filteredOrders.length,
    };
  }, [filteredOrders]);

  // Aggregated data: bucketed by day for Sheet View
  const dailyAnalyticalRows = useMemo<AnalyticalRow[]>(() => {
    const dayMap = new Map<string, { count: number; qty: number; volume: number; completed: number; rawDate: Date }>();

    filteredOrders.forEach((o) => {
      if (!o.raw_order_date) return;
      const dateKey = `${o.raw_order_date.getFullYear()}-${String(o.raw_order_date.getMonth() + 1).padStart(2, "0")}-${String(o.raw_order_date.getDate()).padStart(2, "0")}`;
      const existing = dayMap.get(dateKey) || { count: 0, qty: 0, volume: 0, completed: 0, rawDate: o.raw_order_date };

      existing.count++;
      existing.qty += o.total_quantity;
      existing.volume += o.grand_total;
      if (o.status === "delivered" || o.status === "closed") {
        existing.completed++;
      }

      dayMap.set(dateKey, existing);
    });

    return Array.from(dayMap.entries())
      .map(([date, meta]) => ({
        date: formatDateShort(meta.rawDate),
        ordersCount: meta.count,
        totalQty: meta.qty,
        totalVolume: meta.volume,
        avgOrderValue: meta.count > 0 ? meta.volume / meta.count : 0,
        completedCount: meta.completed,
        rawDate: meta.rawDate,
      }))
      .sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime()); // Newer dates first
  }, [filteredOrders]);

  // Rankings Leaderboards: Products, Parties, Sales Persons
  const rankings = useMemo(() => {
    const prodMap = new Map<string, { qty: number; volume: number }>();
    const partyMap = new Map<string, { volume: number; qty: number; count: number }>();
    const repMap = new Map<string, { volume: number; qty: number; count: number }>();

    filteredOrders.forEach((o) => {
      // Parties
      const party = partyMap.get(o.party_name) || { volume: 0, qty: 0, count: 0 };
      party.volume += o.grand_total;
      party.qty += o.total_quantity;
      party.count++;
      partyMap.set(o.party_name, party);

      // Reps
      if (o.sales_person_name && o.sales_person_name !== "—") {
        const rep = repMap.get(o.sales_person_name) || { volume: 0, qty: 0, count: 0 };
        rep.volume += o.grand_total;
        rep.qty += o.total_quantity;
        rep.count++;
        repMap.set(o.sales_person_name, rep);
      }

      // Products
      o.order_items.forEach((item) => {
        const name = item.product_name || (item.product && item.product.product_name) || "Unknown Item";
        const qty = Number(item.ordered_quantity ?? item.quantity ?? 0);
        const rate = Number(item.unit_price ?? 0);
        const vol = qty * rate;

        const prod = prodMap.get(name) || { qty: 0, volume: 0 };
        prod.qty += qty;
        prod.volume += vol;
        prodMap.set(name, prod);
      });
    });

    const topProductsVolume = Array.from(prodMap.entries())
      .map(([name, data]) => ({ name, value: data.volume, qty: data.qty }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

    const topProductsQty = Array.from(prodMap.entries())
      .map(([name, data]) => ({ name, value: data.qty, volume: data.volume }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

    const topParties = Array.from(partyMap.entries())
      .map(([name, data]) => ({ name, value: data.volume, qty: data.qty, count: data.count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

    const topSalesPersons = Array.from(repMap.entries())
      .map(([name, data]) => ({ name, value: data.volume, qty: data.qty, count: data.count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

    return {
      topProductsVolume,
      topProductsQty,
      topParties,
      topSalesPersons,
    };
  }, [filteredOrders]);

  // Data for visual charts: Daily (last 10 days) and Monthly comparison (last 6 months)
  const chartData = useMemo(() => {
    // 1. Daily trend (chronological order)
    const dailyTrend = [...dailyAnalyticalRows]
      .reverse()
      .slice(-10); // Last 10 days with data

    // 2. Monthly buckets (last 6 months)
    const months: { label: string; key: string; volume: number; qty: number; count: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        volume: 0,
        qty: 0,
        count: 0,
      });
    }

    filteredOrders.forEach((o) => {
      if (!o.raw_order_date) return;
      const key = `${o.raw_order_date.getFullYear()}-${String(o.raw_order_date.getMonth() + 1).padStart(2, "0")}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) {
        bucket.volume += o.grand_total;
        bucket.qty += o.total_quantity;
        bucket.count++;
      }
    });

    return {
      dailyTrend,
      monthlyTrend: months,
    };
  }, [dailyAnalyticalRows, filteredOrders]);

  // Max values for chart scaling
  const maxDailyVal = useMemo(() => {
    const vals = chartData.dailyTrend.map((d) => (chartMetric === "volume" ? d.totalVolume : d.totalQty));
    return Math.max(...vals, 1);
  }, [chartData.dailyTrend, chartMetric]);

  const maxMonthlyVal = useMemo(() => {
    const vals = chartData.monthlyTrend.map((m) => (chartMetric === "volume" ? m.volume : m.qty));
    return Math.max(...vals, 1);
  }, [chartData.monthlyTrend, chartMetric]);

  // Daily Chart Path (Line/Area graph)
  const dailyChartSvgPaths = useMemo(() => {
    const data = chartData.dailyTrend;
    if (data.length === 0) return { line: "", area: "", points: [] };

    const width = 450;
    const height = 150;
    const paddingX = 40;
    const paddingY = 20;

    const points = data.map((d, i) => {
      const x = paddingX + (i / Math.max(1, data.length - 1)) * (width - 2 * paddingX);
      const val = chartMetric === "volume" ? d.totalVolume : d.totalQty;
      const y = height - paddingY - (val / maxDailyVal) * (height - 2 * paddingY);
      return { x, y, val, label: d.date };
    });

    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      linePath += ` L ${points[i].x} ${points[i].y}`;
    }

    const baseLineY = height - paddingY;
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${baseLineY} L ${points[0].x} ${baseLineY} Z`;

    return {
      line: linePath,
      area: areaPath,
      points,
    };
  }, [chartData.dailyTrend, chartMetric, maxDailyVal]);

  // Export spreadsheet rows to CSV
  const exportCSV = () => {
    const headers = SHEET_COLUMNS.map((c) => `"${c.label}"`).join(",");
    const rows = dailyAnalyticalRows.map((r) =>
      SHEET_COLUMNS.map((col) => {
        const val = (r as any)[col.key];
        return typeof val === "string" ? `"${val}"` : val;
      }).join(",")
    );

    // Summary calculation
    const summaryRow = SHEET_COLUMNS.map((col, idx) => {
      if (idx === 0) return `"SUMMARY (${dailyAnalyticalRows.length} Days)"`;
      if (col.key === "ordersCount") return kpis.ordersCount;
      if (col.key === "totalQty") return kpis.totalQty;
      if (col.key === "totalVolume") return kpis.totalVolume.toFixed(2);
      if (col.key === "avgOrderValue") return kpis.aov.toFixed(2);
      if (col.key === "completedCount") return filteredOrders.filter(o => o.status === "delivered" || o.status === "closed").length;
      return "";
    }).join(",");

    const csvContent = [headers, ...rows, "", summaryRow].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `order_analytics_export_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Order Analytics Dashboard</span>
              <span className="rounded-full bg-blue-150/60 dark:bg-blue-950 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/30">
                Sheets Visualizer
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Interactive reports and analytics parsed from {filteredOrders.length} filtered orders.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-200 hover:border-slate-350 p-2 text-slate-400 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Toolbar & Global Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-6 py-3 shrink-0">
        {/* Tab Selection */}
        <div className="flex rounded-lg bg-slate-150/80 p-1 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab("visual")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              activeTab === "visual"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Charts & Trends</span>
          </button>
          <button
            onClick={() => setActiveTab("rankings")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              activeTab === "rankings"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Top Rankings</span>
          </button>
          <button
            onClick={() => setActiveTab("sheet")}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              activeTab === "sheet"
                ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Daily Sheet Grid</span>
          </button>
        </div>

        {/* Global Toolbar actions */}
        <div className="flex items-center gap-3">
          {activeTab === "sheet" && (
            <button
              onClick={exportCSV}
              disabled={dailyAnalyticalRows.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          )}

          {/* Search bar */}
          <div className="relative w-52 sm:w-60">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400 pointer-events-none">
              <Search className="h-3.5 w-3.5" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search analytics data..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-500/30"
            />
          </div>

          {/* Filters Toggle */}
          <button
            onClick={() => setIsFilterPanelOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition relative cursor-pointer ${
              isFilterPanelOpen || hasActiveFilters
                ? "border-blue-500 bg-blue-50/10 text-blue-600 dark:text-blue-400"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 border-2 border-white dark:border-slate-900" />
            )}
          </button>

          {/* Reset Filters Quick link */}
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="text-xs font-semibold text-rose-500 hover:text-rose-600 px-1 py-1.5 transition cursor-pointer"
            >
              Clear
            </button>
          )}

          {/* Filter Popover Panel */}
          {isFilterPanelOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsFilterPanelOpen(false)} />
              <div className="absolute right-6 top-16 w-80 max-h-[70vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-4 z-50 space-y-4 text-xs scrollbar-thin animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100">Analytics Filters</span>
                  <button
                    onClick={handleClearFilters}
                    disabled={!hasActiveFilters}
                    className="text-[10px] text-slate-450 hover:text-blue-500 disabled:opacity-50 transition font-semibold"
                  >
                    Reset All
                  </button>
                </div>

                <div className="space-y-3 select-none">
                  {/* Status */}
                  <div>
                    <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Status</label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="all">All Statuses</option>
                      <option value="pending_approvals">Pending Approvals</option>
                      <option value="open">Open Orders</option>
                      <option value="closed">Closed Orders</option>
                      <option value="cancelled">Cancelled Orders</option>
                      <option value="on_hold">On Hold Orders</option>
                      <option value="rejected">Rejected Orders</option>
                    </select>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Priority</label>
                    <select
                      value={filterPriority}
                      onChange={(e) => setFilterPriority(e.target.value)}
                      className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="all">All Priorities</option>
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="normal">Normal</option>
                      <option value="low">Low</option>
                    </select>
                  </div>

                  {/* Party */}
                  <div>
                    <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Party</label>
                    <select
                      value={filterParty}
                      onChange={(e) => setFilterParty(e.target.value)}
                      className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="all">All Counterparties</option>
                      {uniqueParties.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Sales Person */}
                  <div>
                    <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Sales Person</label>
                    <select
                      value={filterSalesPerson}
                      onChange={(e) => setFilterSalesPerson(e.target.value)}
                      className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="all">All Sales Persons</option>
                      {uniqueSalesPersons.map((sp) => (
                        <option key={sp} value={sp}>
                          {sp}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date preset */}
                  <div>
                    <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Date Preset</label>
                    <select
                      value={filterDatePreset}
                      onChange={(e) => setFilterDatePreset(e.target.value)}
                      className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="all">All Dates</option>
                      <option value="today">Today</option>
                      <option value="yesterday">Yesterday</option>
                      <option value="last_7">Last 7 Days</option>
                      <option value="last_30">Last 30 Days</option>
                      <option value="custom">Custom Date Range</option>
                    </select>
                  </div>

                  {filterDatePreset === "custom" && (
                    <div className="grid grid-cols-2 gap-2 pt-1 animate-fadeIn">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">Start Date</label>
                        <input
                          type="date"
                          value={filterStartDate}
                          onChange={(e) => setFilterStartDate(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2 py-1 text-slate-800 dark:text-slate-100 outline-none text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">End Date</label>
                        <input
                          type="date"
                          value={filterEndDate}
                          onChange={(e) => setFilterEndDate(e.target.value)}
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2 py-1 text-slate-800 dark:text-slate-100 outline-none text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main KPI cards view (always visible) */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/10 border-b border-slate-200 dark:border-slate-800 shrink-0">
        {[
          {
            label: "Sales Volume",
            value: `₹${formatMoney(kpis.totalVolume)}`,
            sub: `${kpis.ordersCount} total orders`,
            color: "from-blue-500 to-indigo-600",
            textColor: "text-blue-600 dark:text-blue-400",
            icon: <DollarSign className="h-4.5 w-4.5" />,
          },
          {
            label: "Total Units Sold",
            value: kpis.totalQty.toLocaleString("en-IN"),
            sub: `${(kpis.totalQty / Math.max(kpis.ordersCount, 1)).toFixed(1)} avg items/order`,
            color: "from-emerald-500 to-teal-600",
            textColor: "text-emerald-600 dark:text-emerald-400",
            icon: <ShoppingCart className="h-4.5 w-4.5" />,
          },
          {
            label: "Avg Order Value (AOV)",
            value: `₹${formatMoney(kpis.aov)}`,
            sub: "Average order size",
            color: "from-purple-500 to-violet-600",
            textColor: "text-purple-600 dark:text-purple-400",
            icon: <Percent className="h-4.5 w-4.5" />,
          },
          {
            label: "Active Counterparties",
            value: kpis.activeParties.toLocaleString("en-IN"),
            sub: "Unique client profiles",
            color: "from-pink-500 to-rose-600",
            textColor: "text-pink-600 dark:text-pink-400",
            icon: <Users className="h-4.5 w-4.5" />,
          },
          {
            label: "Top Product by Qty",
            value: kpis.topProduct,
            sub: kpis.topProductQty > 0 ? `${kpis.topProductQty.toLocaleString("en-IN")} units sold` : "No products sold",
            color: "from-amber-500 to-orange-600",
            textColor: "text-amber-600 dark:text-amber-400",
            icon: <Package className="h-4.5 w-4.5" />,
            isTitleTruncated: true,
          },
        ].map((card, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm"
          >
            <div className={`absolute top-0 left-0 h-1 w-full bg-gradient-to-r ${card.color}`} />
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">{card.label}</span>
              <div className={`p-1.5 rounded-lg bg-slate-50 dark:bg-white/5 ${card.textColor}`}>
                {card.icon}
              </div>
            </div>
            <h3 className={`mt-2 font-bold text-slate-900 dark:text-slate-100 text-lg md:text-xl truncate ${card.isTitleTruncated ? "max-w-[200px] text-sm md:text-sm" : ""}`} title={card.value}>
              {card.value}
            </h3>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 truncate">{card.sub}</p>
          </div>
        ))}
      </section>

      {/* fx indicator bar */}
      <div className="flex items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-6 py-2 text-xs select-none shrink-0 font-mono">
        <span className="text-slate-400 dark:text-slate-500 font-bold select-none pr-3">fx</span>
        <span className="text-slate-300 dark:text-slate-700 px-1 border-r border-slate-200 dark:border-slate-750 mr-3">|</span>
        <span className="text-slate-400 dark:text-slate-500 italic select-none">
          {activeTab === "visual" && hoveredDailyIndex !== null
            ? `Daily trend hovered point -> Date: ${chartData.dailyTrend[hoveredDailyIndex]?.date}, Volume: ₹${formatMoney(chartData.dailyTrend[hoveredDailyIndex]?.totalVolume)}, Qty: ${chartData.dailyTrend[hoveredDailyIndex]?.totalQty}`
            : activeTab === "visual" && hoveredComparisonIndex !== null
            ? `Monthly trend hovered bucket -> Month: ${chartData.monthlyTrend[hoveredComparisonIndex]?.label}, Volume: ₹${formatMoney(chartData.monthlyTrend[hoveredComparisonIndex]?.volume)}, Count: ${chartData.monthlyTrend[hoveredComparisonIndex]?.count}`
            : activeTab === "sheet" && selectedCell
            ? `Selected Cell -> Date: ${selectedCell.date}, Column: ${SHEET_COLUMNS.find((c) => c.key === selectedCell.colKey)?.label}, Value: ${
                (dailyAnalyticalRows.find((r) => r.date === selectedCell.date) as any)?.[selectedCell.colKey] ?? ""
              }`
            : "Analytical reports visualizer. Hover or click cells to view detailed formulas."}
        </span>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 p-6 relative">
        {(isOrdersLoading || isOrdersFetching || partiesQ.isLoading || usersQ.isLoading) && (
          <div className="absolute inset-0 bg-white/60 dark:bg-slate-955/60 flex items-center justify-center z-40 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-2.5 bg-white dark:bg-slate-850 p-5 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 animate-fadeIn">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Processing Analytics...</span>
            </div>
          </div>
        )}

        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16">
            <Info className="h-10 w-10 text-slate-400 mb-2" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Analytics Available</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs text-center mt-1">
              No orders match the selected filters. Reset filters to compute analytics.
            </p>
          </div>
        ) : (
          <>
            {/* Tab 1: Charts & Trends */}
            {activeTab === "visual" && (
              <div className="space-y-6 max-w-6xl mx-auto animate-fadeIn">
                {/* Metric toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Metrics Selector</span>
                  <div className="flex rounded-lg bg-slate-200 p-0.5 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                    <button
                      onClick={() => setChartMetric("volume")}
                      className={`rounded px-3 py-1 text-[11px] font-bold transition cursor-pointer ${
                        chartMetric === "volume"
                          ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Revenue (₹)
                    </button>
                    <button
                      onClick={() => setChartMetric("qty")}
                      className={`rounded px-3 py-1 text-[11px] font-bold transition cursor-pointer ${
                        chartMetric === "qty"
                          ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Quantity Sold
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Daily Trend Area Chart */}
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      Daily Sales Trend (Last 10 Days)
                    </h4>
                    <div className="h-[240px] w-full flex items-center justify-center">
                      {chartData.dailyTrend.length === 0 ? (
                        <span className="text-xs text-slate-400">Insufficient daily data</span>
                      ) : (
                        <svg viewBox="0 0 450 150" className="w-full h-full overflow-visible select-none">
                          {/* Grid Ticks */}
                          {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
                            const y = 20 + (1 - p) * 110;
                            const tickVal = maxDailyVal * p;
                            return (
                              <g key={idx} className="opacity-30 dark:opacity-10">
                                <line x1={40} y1={y} x2={410} y2={y} className="stroke-slate-300 dark:stroke-slate-700" strokeDasharray="3 3" />
                                <text x={35} y={y + 3} textAnchor="end" className="text-[8px] font-mono font-semibold fill-slate-500">
                                  {chartMetric === "volume" ? `₹${formatMoneyAbbr(tickVal)}` : Math.round(tickVal)}
                                </text>
                              </g>
                            );
                          })}

                          {/* Base line */}
                          <line x1={40} y1={130} x2={410} y2={130} className="stroke-slate-250 dark:stroke-slate-800" />

                          {/* Area Path */}
                          {dailyChartSvgPaths.area && (
                            <path d={dailyChartSvgPaths.area} className="fill-blue-500/10 stroke-none" />
                          )}

                          {/* Line Path */}
                          {dailyChartSvgPaths.line && (
                            <path d={dailyChartSvgPaths.line} className="stroke-blue-500 fill-none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                          )}

                          {/* Interactive Points */}
                          {dailyChartSvgPaths.points.map((pt, idx) => {
                            const isHovered = hoveredDailyIndex === idx;
                            return (
                              <g key={idx}>
                                <circle
                                  cx={pt.x}
                                  cy={pt.y}
                                  r={isHovered ? 5 : 3.5}
                                  className={`fill-white stroke-blue-600 transition-all duration-200 cursor-pointer ${
                                    isHovered ? "stroke-[3px]" : "stroke-2"
                                  }`}
                                  onMouseEnter={() => setHoveredDailyIndex(idx)}
                                  onMouseLeave={() => setHoveredDailyIndex(null)}
                                />
                                {/* Bottom label */}
                                {idx % 2 === 0 && (
                                  <text x={pt.x} y={142} textAnchor="middle" className="text-[7.5px] font-semibold fill-slate-400 dark:fill-slate-500">
                                    {pt.label.slice(0, 6)}
                                  </text>
                                )}
                              </g>
                            );
                          })}

                          {/* Daily Tooltip */}
                          {hoveredDailyIndex !== null && (() => {
                            const pt = dailyChartSvgPaths.points[hoveredDailyIndex];
                            let tooltipX = pt.x;
                            if (tooltipX < 100) tooltipX = 100;
                            if (tooltipX > 350) tooltipX = 350;
                            return (
                              <g className="pointer-events-none transition-all duration-200">
                                <rect x={tooltipX - 55} y={pt.y - 32} width={110} height={24} rx={4} className="fill-slate-900/95 dark:fill-slate-800/95 shadow-md" />
                                <text x={tooltipX} y={pt.y - 22} textAnchor="middle" className="text-[7.5px] font-bold fill-white">
                                  {pt.label}
                                </text>
                                <text x={tooltipX} y={pt.y - 12} textAnchor="middle" className="text-[8.5px] font-bold fill-blue-400 font-mono">
                                  {chartMetric === "volume" ? `₹${formatMoney(pt.val)}` : `${pt.val.toLocaleString()} units`}
                                </text>
                              </g>
                            );
                          })()}
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Monthly sales comparison bar chart */}
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-indigo-500" />
                      Monthly Sales Comparison (Last 6 Months)
                    </h4>
                    <div className="h-[240px] w-full flex items-center justify-center">
                      <svg viewBox="0 0 450 150" className="w-full h-full overflow-visible select-none">
                        {/* Grid ticks */}
                        {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
                          const y = 20 + (1 - p) * 110;
                          const tickVal = maxMonthlyVal * p;
                          return (
                            <g key={idx} className="opacity-30 dark:opacity-10">
                              <line x1={45} y1={y} x2={420} y2={y} className="stroke-slate-300 dark:stroke-slate-700" strokeDasharray="3 3" />
                              <text x={40} y={y + 3} textAnchor="end" className="text-[8px] font-mono font-semibold fill-slate-500">
                                {chartMetric === "volume" ? `₹${formatMoneyAbbr(tickVal)}` : Math.round(tickVal)}
                              </text>
                            </g>
                          );
                        })}

                        {/* Base line */}
                        <line x1={45} y1={130} x2={420} y2={130} className="stroke-slate-250 dark:stroke-slate-800" />

                        {/* Bars */}
                        {chartData.monthlyTrend.map((m, idx) => {
                          const slotWidth = 375 / chartData.monthlyTrend.length;
                          const barWidth = slotWidth * 0.45;
                          const x = 45 + idx * slotWidth + slotWidth / 2;
                          const barX = x - barWidth / 2;
                          const val = chartMetric === "volume" ? m.volume : m.qty;
                          const barHeight = (val / maxMonthlyVal) * 110;
                          const barY = 130 - barHeight;
                          const isHovered = hoveredComparisonIndex === idx;

                          return (
                            <g
                              key={idx}
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredComparisonIndex(idx)}
                              onMouseLeave={() => setHoveredComparisonIndex(null)}
                            >
                              <rect
                                x={barX}
                                y={barY}
                                width={barWidth}
                                height={barHeight}
                                rx={2.5}
                                className={`transition-all duration-300 ${
                                  isHovered
                                    ? "fill-indigo-600 filter drop-shadow-md"
                                    : "fill-indigo-500/80 dark:fill-indigo-500/60"
                                }`}
                              />
                              <text x={x} y={142} textAnchor="middle" className="text-[7.5px] font-bold fill-slate-400 dark:fill-slate-500">
                                {m.label}
                              </text>
                            </g>
                          );
                        })}

                        {/* Bar chart tooltip */}
                        {hoveredComparisonIndex !== null && (() => {
                          const m = chartData.monthlyTrend[hoveredComparisonIndex];
                          const slotWidth = 375 / chartData.monthlyTrend.length;
                          const x = 45 + hoveredComparisonIndex * slotWidth + slotWidth / 2;
                          const val = chartMetric === "volume" ? m.volume : m.qty;
                          const barHeight = (val / maxMonthlyVal) * 110;
                          const barY = 130 - barHeight;

                          return (
                            <g className="pointer-events-none transition-all duration-200">
                              <rect x={x - 55} y={barY - 32} width={110} height={24} rx={4} className="fill-slate-900/95 dark:fill-slate-800/95 shadow-md" />
                              <text x={x} y={barY - 22} textAnchor="middle" className="text-[7.5px] font-bold fill-white">
                                Month: {m.label} ({m.count} orders)
                              </text>
                              <text x={x} y={barY - 12} textAnchor="middle" className="text-[8.5px] font-bold fill-indigo-400 font-mono">
                                {chartMetric === "volume" ? `₹${formatMoney(val)}` : `${val.toLocaleString()} units`}
                              </text>
                            </g>
                          );
                        })()}
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Top Rankings Leaderboards */}
            {activeTab === "rankings" && (
              <div className="space-y-6 max-w-6xl mx-auto animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Top Products by Volume */}
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                        <Package className="h-4 w-4 text-emerald-500" />
                        Top Products by Sales Volume
                      </h4>
                      {rankings.topProductsVolume.length === 0 ? (
                        <p className="text-xs text-slate-450 italic py-6">No data found</p>
                      ) : (
                        <div className="space-y-3.5">
                          {rankings.topProductsVolume.map((p, idx) => {
                            const maxVal = rankings.topProductsVolume[0]?.value || 1;
                            const pct = (p.value / maxVal) * 100;
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex items-center justify-between text-xs font-semibold">
                                  <span className="truncate max-w-[200px] text-slate-800 dark:text-slate-200">
                                    {idx + 1}. {p.name}
                                  </span>
                                  <span className="font-mono text-slate-900 dark:text-slate-100">
                                    ₹{formatMoney(p.value)} <span className="text-[10px] text-slate-400 font-normal">({p.qty} units)</span>
                                  </span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top Products by Sale Quantity */}
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                        <Package className="h-4 w-4 text-teal-500" />
                        Top Products by Sale Quantity
                      </h4>
                      {rankings.topProductsQty.length === 0 ? (
                        <p className="text-xs text-slate-455 italic py-6">No data found</p>
                      ) : (
                        <div className="space-y-3.5">
                          {rankings.topProductsQty.map((p, idx) => {
                            const maxVal = rankings.topProductsQty[0]?.value || 1;
                            const pct = (p.value / maxVal) * 100;
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex items-center justify-between text-xs font-semibold">
                                  <span className="truncate max-w-[200px] text-slate-800 dark:text-slate-200">
                                    {idx + 1}. {p.name}
                                  </span>
                                  <span className="font-mono text-slate-900 dark:text-slate-100">
                                    {p.value.toLocaleString()} units <span className="text-[10px] text-slate-400 font-normal">(₹{formatMoneyAbbr(p.volume)})</span>
                                  </span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top Parties */}
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-blue-500" />
                        Top Counterparties (by Sales Volume)
                      </h4>
                      {rankings.topParties.length === 0 ? (
                        <p className="text-xs text-slate-455 italic py-6">No counterparties found</p>
                      ) : (
                        <div className="space-y-3.5">
                          {rankings.topParties.map((p, idx) => {
                            const maxVal = rankings.topParties[0]?.value || 1;
                            const pct = (p.value / maxVal) * 100;
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex items-center justify-between text-xs font-semibold">
                                  <span className="truncate max-w-[200px] text-slate-800 dark:text-slate-200">
                                    {idx + 1}. {p.name}
                                  </span>
                                  <span className="font-mono text-slate-900 dark:text-slate-100">
                                    ₹{formatMoney(p.value)} <span className="text-[10px] text-slate-400 font-normal">({p.count} orders)</span>
                                  </span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top Sales Person */}
                  <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-purple-500" />
                        Top Sales Representatives
                      </h4>
                      {rankings.topSalesPersons.length === 0 ? (
                        <p className="text-xs text-slate-455 italic py-6">No sales rep assignments found</p>
                      ) : (
                        <div className="space-y-3.5">
                          {rankings.topSalesPersons.map((p, idx) => {
                            const maxVal = rankings.topSalesPersons[0]?.value || 1;
                            const pct = (p.value / maxVal) * 100;
                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex items-center justify-between text-xs font-semibold">
                                  <span className="truncate max-w-[200px] text-slate-800 dark:text-slate-200">
                                    {idx + 1}. {p.name}
                                  </span>
                                  <span className="font-mono text-slate-900 dark:text-slate-100">
                                    ₹{formatMoney(p.value)} <span className="text-[10px] text-slate-400 font-normal">({p.count} orders)</span>
                                  </span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Google Sheet Grid Table */}
            {activeTab === "sheet" && (
              <div className="rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden animate-fadeIn">
                <div className="overflow-auto max-h-[50vh]">
                  <table className="w-full border-collapse text-xs select-none">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-900 sticky top-0 z-20">
                        {/* Row Number Column */}
                        <th className="w-12 border-r border-b border-slate-250 dark:border-slate-800 bg-slate-150 dark:bg-slate-850 text-center text-[10px] text-slate-500 font-medium py-2">
                          &nbsp;
                        </th>
                        {SHEET_COLUMNS.map((col) => (
                          <th
                            key={col.key}
                            style={{ width: `${col.width}px` }}
                            className="border-r border-b border-slate-250 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-semibold text-center select-none"
                          >
                            <div className="flex flex-col items-center justify-center py-1">
                              <span className="text-[9px] text-slate-400">{col.headerLetter}</span>
                              <span className="text-[10px] truncate px-2">{col.label}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dailyAnalyticalRows.length === 0 ? (
                        <tr>
                          <td colSpan={SHEET_COLUMNS.length + 1} className="text-center py-8 text-slate-500">
                            No matching daily records found.
                          </td>
                        </tr>
                      ) : (
                        dailyAnalyticalRows.map((row, rowIdx) => (
                          <tr
                            key={row.date}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 bg-white dark:bg-slate-900"
                          >
                            {/* Index */}
                            <td className="sticky left-0 border-r border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center text-[10px] text-slate-400 font-mono py-1.5 shadow-[2px_0_0_0_rgba(0,0,0,0.02)]">
                              {rowIdx + 1}
                            </td>

                            {SHEET_COLUMNS.map((col) => {
                              const val = (row as any)[col.key];
                              const isSelected = selectedCell?.date === row.date && selectedCell?.colKey === col.key;
                              const isNumeric = col.type === "number" || col.type === "currency";

                              return (
                                <td
                                  key={col.key}
                                  onClick={() => setSelectedCell({ date: row.date, colKey: col.key })}
                                  className={`border-r border-b border-slate-150 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-mono px-3 py-1.5 cursor-pointer truncate ${
                                    isNumeric ? "text-right" : "text-left"
                                  } ${
                                    isSelected
                                      ? "ring-2 ring-blue-500 ring-inset bg-blue-500/5 dark:bg-blue-500/10 font-bold"
                                      : ""
                                  }`}
                                >
                                  {col.type === "currency" ? (
                                    <span>₹{formatMoney(val)}</span>
                                  ) : (
                                    <span>{val}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}

                      {/* Summary Row */}
                      {dailyAnalyticalRows.length > 0 && (
                        <tr className="bg-slate-50 dark:bg-slate-950 font-bold border-t border-slate-250 dark:border-slate-800">
                          <td className="border-r border-b border-slate-200 dark:border-slate-800 text-center text-[9px] text-slate-500 py-2">
                            ∑
                          </td>
                          <td className="border-r border-b border-slate-200 dark:border-slate-800 px-3 py-2 text-left">
                            Summary Total
                          </td>
                          <td className="border-r border-b border-slate-200 dark:border-slate-800 px-3 py-2 text-right font-mono">
                            {kpis.ordersCount.toLocaleString()}
                          </td>
                          <td className="border-r border-b border-slate-200 dark:border-slate-800 px-3 py-2 text-right font-mono">
                            {kpis.totalQty.toLocaleString()}
                          </td>
                          <td className="border-r border-b border-slate-200 dark:border-slate-800 px-3 py-2 text-right font-mono">
                            ₹{formatMoney(kpis.totalVolume)}
                          </td>
                          <td className="border-r border-b border-slate-200 dark:border-slate-800 px-3 py-2 text-right font-mono">
                            ₹{formatMoney(kpis.aov)}
                          </td>
                          <td className="border-r border-b border-slate-200 dark:border-slate-800 px-3 py-2 text-right font-mono">
                            {filteredOrders.filter(o => o.status === "delivered" || o.status === "closed").length.toLocaleString()}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default GoogleSheetAnalyticsModal;
