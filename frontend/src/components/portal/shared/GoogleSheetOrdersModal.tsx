"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  X,
  Search,
  Download,
  Info,
  SlidersHorizontal,
  RefreshCw
} from "lucide-react";
import { resolveOrderCounterparty } from "@/components/portal/sales/partyDisplay";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  orderMatchesAdminTab,
  adminTabQueryParams,
  ADMIN_ORDER_TABS,
  type AdminOrderTabCategory,
} from "@/components/portal/admin/adminOrderUtils";
import {
  useListOrdersQuery,
  useListPartiesQuery,
  useListUsersQuery,
  useListTransportsQuery,
  useListOrderDeliveriesQuery
} from "@/store/api";
import { pickOrders } from "@/components/portal/shared/pickOrders";

// Extended tab type that covers all three portals
type PortalTabId =
  | AdminOrderTabCategory
  | "pending_finance_approval"
  | "pending_account_approval";

export type GoogleSheetOrdersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  partyNameById: Map<string, string>;
  /** Pre-select a tab when the modal opens */
  initialTab?: PortalTabId;
  /** Controls which portal-specific "pending" tab is shown */
  portal?: "admin" | "finance" | "account";
};

type FlattenedOrder = {
  _id: string;
  order_no: string;
  party_name: string;
  grand_total: number;
  priority: string;
  status: string;
  order_date: string;
  expected_delivery_date: string;
  party_type: string;
  party_city: string;
  sales_person: string;
  items_list: string;
  party_sra: string;
  actual_delivery_date: string;
  total_quantity: number;
  raw_order_date: Date | null;
  raw: any;
};

type SelectedCell = {
  orderId: string;
  colKey: keyof FlattenedOrder;
} | null;

const COLUMNS: { key: keyof FlattenedOrder; label: string; headerLetter: string; type: "text" | "number" }[] = [
  { key: "order_no", label: "Order Number", headerLetter: "A", type: "text" },
  { key: "party_name", label: "Party Name", headerLetter: "B", type: "text" },
  { key: "grand_total", label: "Grand Total (₹)", headerLetter: "C", type: "number" },
  { key: "priority", label: "Priority", headerLetter: "D", type: "text" },
  { key: "status", label: "Status", headerLetter: "E", type: "text" },
  { key: "order_date", label: "Order Date", headerLetter: "F", type: "text" },
  { key: "expected_delivery_date", label: "Expected Delivery Date", headerLetter: "G", type: "text" },
  { key: "party_type", label: "Party Type", headerLetter: "H", type: "text" },
  { key: "party_city", label: "City", headerLetter: "I", type: "text" },
  { key: "sales_person", label: "Sales Person", headerLetter: "J", type: "text" },
  { key: "items_list", label: "Items List", headerLetter: "K", type: "text" },
  { key: "party_sra", label: "SRA", headerLetter: "L", type: "text" },
  { key: "actual_delivery_date", label: "Actual Delivery Date", headerLetter: "M", type: "text" },
];

function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d;
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

export function GoogleSheetOrdersModal({
  isOpen,
  onClose,
  partyNameById,
  initialTab,
  portal = "admin"
}: GoogleSheetOrdersModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);

  // Column Resizing State
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    order_no: 130,
    party_name: 200,
    grand_total: 120,
    priority: 90,
    status: 130,
    order_date: 120,
    expected_delivery_date: 150,
    party_type: 110,
    party_city: 110,
    sales_person: 140,
    items_list: 250,
    party_sra: 80,
    actual_delivery_date: 150,
  });

  // Filter States
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterCounterparty, setFilterCounterparty] = useState<string>("all");
  const [filterPartyNameQuery, setFilterPartyNameQuery] = useState("");
  const [filterSra, setFilterSra] = useState<string>("all");
  const [filterDatePreset, setFilterDatePreset] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [filterMinQty, setFilterMinQty] = useState<string>("");
  const [filterMaxQty, setFilterMaxQty] = useState<string>("");
  const [filterMinAmount, setFilterMinAmount] = useState<string>("");
  const [filterMaxAmount, setFilterMaxAmount] = useState<string>("");
  const [filterCity, setFilterCity] = useState<string>("all");
  const [filterSalesPerson, setFilterSalesPerson] = useState<string>("all");
  const [activeSheetTab, setActiveSheetTab] = useState<PortalTabId | "all">("all");

  useEffect(() => {
    if (isOpen) {
      setActiveSheetTab(initialTab || "all");
    }
  }, [isOpen, initialTab]);

  // Dynamic backend fetch matching selected activeSheetTab
  const queryParams = useMemo(() => {
    const base: Record<string, string | undefined> = {};

    if (activeSheetTab !== "all") {
      Object.assign(
        base,
        adminTabQueryParams(activeSheetTab as AdminOrderTabCategory),
      );
    }
    return base;
  }, [activeSheetTab]);

  const { data: ordersData, isFetching: isOrdersFetching, isLoading: isOrdersLoading } = useListOrdersQuery(queryParams, {
    skip: !isOpen
  });

  const partiesQ = useListPartiesQuery({}, { skip: !isOpen });
  const usersQ = useListUsersQuery({}, { skip: !isOpen });

  const orders = useMemo(() => {
    return pickOrders(ordersData) || [];
  }, [ordersData]);

  const partiesList = useMemo(() => {
    return pickOrders(partiesQ.data) || [];
  }, [partiesQ.data]);

  const usersList = useMemo(() => {
    return pickOrders(usersQ.data) || [];
  }, [usersQ.data]);

  const partyMap = useMemo(() => {
    const map = new Map<string, any>();
    partiesList.forEach((p: any) => {
      const id = p._id || p.id || "";
      if (id) map.set(id, p);
    });
    return map;
  }, [partiesList]);

  const userMap = useMemo(() => {
    const map = new Map<string, any>();
    usersList.forEach((u: any) => {
      const id = u._id || u.id || "";
      if (id) map.set(id, u);
    });
    return map;
  }, [usersList]);

  const transportsQ = useListTransportsQuery({}, { skip: !isOpen });
  const deliveriesQ = useListOrderDeliveriesQuery({}, { skip: !isOpen });

  const transportsList = useMemo(() => {
    return pickOrders(transportsQ.data) || [];
  }, [transportsQ.data]);

  const deliveriesList = useMemo(() => {
    return pickOrders(deliveriesQ.data) || [];
  }, [deliveriesQ.data]);

  const orderDeliveryDateMap = useMemo(() => {
    const map = new Map<string, string>();
    transportsList.forEach((tr: any) => {
      const orderId = typeof tr.order === "string" 
        ? tr.order 
        : (tr.order && typeof tr.order === "object") 
          ? String(tr.order._id || tr.order.id || "") 
          : "";
      if (!orderId) return;
      const dateVal = tr.actual_delivery_date || tr.delivered_at;
      if (dateVal) {
        const existing = map.get(orderId);
        if (!existing || new Date(dateVal) > new Date(existing)) {
          map.set(orderId, String(dateVal));
        }
      }
    });
    deliveriesList.forEach((del: any) => {
      const orderId = typeof del.order === "string" 
        ? del.order 
        : (del.order && typeof del.order === "object") 
          ? String(del.order._id || del.order.id || "") 
          : "";
      if (!orderId) return;
      const dateVal = del.actual_delivery_date || del.delivered_at;
      if (dateVal) {
        const existing = map.get(orderId);
        if (!existing || new Date(dateVal) > new Date(existing)) {
          map.set(orderId, String(dateVal));
        }
      }
    });
    return map;
  }, [transportsList, deliveriesList]);

  const dragStartRef = useRef<{ colKey: string; startWidth: number; startX: number } | null>(null);

  const localRows = useMemo<FlattenedOrder[]>(() => {
    return orders.map(o => {
      const item = o as any;
      const id = item._id || item.id || "";
      const ref = item.order_no || item.order_number || id || "—";
      const total = Number(item.grand_total ?? item.total ?? 0);
      const pri = typeof item.priority === "string" ? item.priority : "normal";
      const partyName = resolveOrderCounterparty(item as Record<string, unknown>, partyNameById);
      const statusRaw = deriveOrderWorkflowStatus(item) || "draft";
      const orderDateStr = formatDateShort(item.order_date ?? item.created_at ?? item.createdAt);
      const expectedDeliveryStr = formatDateShort(item.expected_delivery_date);

      const partyId = typeof item.party === "string" 
        ? item.party 
        : (item.party && typeof item.party === "object") 
          ? String(item.party._id || item.party.id || "") 
          : "";

      const partyObj = partyId ? partyMap.get(partyId) : null;
      const partyType = partyObj?.party_type || (item.party && typeof item.party === "object" ? item.party.party_type : "") || "—";
      const partyCity = partyObj?.billing_address?.city || partyObj?.shipping_address?.city || (item.party && typeof item.party === "object" ? (item.party.billing_address?.city || item.party.shipping_address?.city) : "") || "—";

      const hasSra = partyObj?.sra === true || (item.party && typeof item.party === "object" && (item.party as any).sra === true);
      const partySra = hasSra ? "Yes" : "No";

      const resolvedDeliveryDate = orderDeliveryDateMap.get(id) || item.actual_delivery_date || item.delivered_at || (item.delivery && typeof item.delivery === "object" ? ((item.delivery as any).actual_delivery_date || (item.delivery as any).delivered_at) : "");
      const actualDeliveryDateStr = formatDateShort(resolvedDeliveryDate);

      const salesUserId = typeof item.assigned_sales_user === "string"
        ? item.assigned_sales_user
        : (item.assigned_sales_user && typeof item.assigned_sales_user === "object")
          ? String(item.assigned_sales_user._id || item.assigned_sales_user.id || "")
          : "";

      const salesUserObj = salesUserId ? userMap.get(salesUserId) : null;
      const salesPersonName = salesUserObj?.name || (item.assigned_sales_user && typeof item.assigned_sales_user === "object" ? item.assigned_sales_user.name : "") || "—";

      const itemsList = Array.isArray(item.order_items) ? item.order_items : [];
      const itemsText = itemsList.map((line: any) => {
        const name = line.product_name || line.name || (line.product && typeof line.product === "object" ? line.product.product_name || line.product.name : "") || "Item";
        const qty = line.ordered_quantity ?? line.quantity ?? 0;
        return `${name} (${qty})`;
      }).join(", ") || "—";

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
        expected_delivery_date: expectedDeliveryStr,
        party_type: partyType,
        party_city: partyCity,
        sales_person: salesPersonName,
        items_list: itemsText,
        party_sra: partySra,
        actual_delivery_date: actualDeliveryDateStr,
        total_quantity: totalQty,
        raw_order_date: parsedOrderDate,
        raw: o
      };
    });
  }, [orders, partyNameById, partyMap, userMap, orderDeliveryDateMap]);

  // Compute filters metadata
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set<string>();
    localRows.forEach(r => {
      if (r.status) statuses.add(r.status);
    });
    return Array.from(statuses).sort();
  }, [localRows]);

  const uniquePriorities = useMemo(() => {
    const priorities = new Set<string>();
    localRows.forEach(r => {
      if (r.priority) priorities.add(r.priority.toLowerCase());
    });
    return Array.from(priorities).sort();
  }, [localRows]);

  const uniqueCounterparties = useMemo(() => {
    const parties = new Set<string>();
    localRows.forEach(r => {
      if (r.party_name) {
        const p = r.party_name.trim();
        if (p) parties.add(p);
      }
    });
    return Array.from(parties).sort();
  }, [localRows]);

  const uniqueCities = useMemo(() => {
    const cities = new Set<string>();
    localRows.forEach(r => {
      if (r.party_city && r.party_city !== "—" && r.party_city.trim() !== "") {
        cities.add(r.party_city.trim());
      }
    });
    return Array.from(cities).sort();
  }, [localRows]);

  const uniqueSalesPersons = useMemo(() => {
    const names = new Set<string>();
    localRows.forEach(r => {
      if (r.sales_person && r.sales_person !== "—" && r.sales_person.trim() !== "") {
        names.add(r.sales_person.trim());
      }
    });
    return Array.from(names).sort();
  }, [localRows]);

  const hasActiveFilters = useMemo(() => {
    return (
      filterStatus !== "all" ||
      filterPriority !== "all" ||
      filterCounterparty !== "all" ||
      filterPartyNameQuery.trim() !== "" ||
      filterSra !== "all" ||
      filterDatePreset !== "all" ||
      filterMinQty !== "" ||
      filterMaxQty !== "" ||
      filterMinAmount !== "" ||
      filterMaxAmount !== "" ||
      filterCity !== "all" ||
      filterSalesPerson !== "all"
    );
  }, [
    filterStatus,
    filterPriority,
    filterCounterparty,
    filterPartyNameQuery,
    filterSra,
    filterDatePreset,
    filterMinQty,
    filterMaxQty,
    filterMinAmount,
    filterMaxAmount,
    filterCity,
    filterSalesPerson
  ]);

  const handleClearFilters = () => {
    setFilterStatus("all");
    setFilterPriority("all");
    setFilterCounterparty("all");
    setFilterPartyNameQuery("");
    setFilterSra("all");
    setFilterDatePreset("all");
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterMinQty("");
    setFilterMaxQty("");
    setFilterMinAmount("");
    setFilterMaxAmount("");
    setFilterCity("all");
    setFilterSalesPerson("all");
  };

  // Filtered Rows Memo
  const filteredRows = useMemo(() => {
    let rows = localRows;

    // 0. Bottom Sheet Tab Category Filter
    if (activeSheetTab !== "all") {
      rows = rows.filter((r) =>
        orderMatchesAdminTab(r.raw, activeSheetTab as AdminOrderTabCategory),
      );
    }

    // 1. Text Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        r =>
          r.order_no.toLowerCase().includes(q) ||
          r.party_name.toLowerCase().includes(q) ||
          r.priority.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q) ||
          r.order_date.toLowerCase().includes(q) ||
          r.expected_delivery_date.toLowerCase().includes(q) ||
          r.party_type.toLowerCase().includes(q) ||
          r.party_city.toLowerCase().includes(q) ||
          r.sales_person.toLowerCase().includes(q) ||
          r.items_list.toLowerCase().includes(q) ||
          r.party_sra.toLowerCase().includes(q) ||
          r.actual_delivery_date.toLowerCase().includes(q)
      );
    }

    // 2. Status Filter
    if (filterStatus !== "all") {
      rows = rows.filter(r => r.status === filterStatus);
    }

    // 3. Priority Filter
    if (filterPriority !== "all") {
      rows = rows.filter(r => r.priority.toLowerCase() === filterPriority);
    }

    // 4. Counterparty Dropdown Filter
    if (filterCounterparty !== "all") {
      rows = rows.filter(r => r.party_name.trim() === filterCounterparty);
    }

    // 5. Party Name Search Filter
    if (filterPartyNameQuery.trim()) {
      const pQuery = filterPartyNameQuery.toLowerCase().trim();
      rows = rows.filter(r => r.party_name.toLowerCase().includes(pQuery));
    }

    // 6. SRA Filter
    if (filterSra !== "all") {
      rows = rows.filter(r => {
        if (filterSra === "sra") return r.party_sra === "Yes";
        if (filterSra === "non_sra") return r.party_sra === "No";
        return true;
      });
    }

    // 7. Date Preset / Range Filter
    if (filterDatePreset !== "all") {
      rows = rows.filter(r => {
        if (!r.raw_order_date) return false;
        const d = r.raw_order_date;
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        if (filterDatePreset === "today") {
          return d >= startOfToday;
        }
        
        if (filterDatePreset === "yesterday") {
          const startOfYesterday = new Date(startOfToday);
          startOfYesterday.setDate(startOfYesterday.getDate() - 1);
          return d >= startOfYesterday && d < startOfToday;
        }
        
        if (filterDatePreset === "last_7") {
          const sevenDaysAgo = new Date(startOfToday);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          return d >= sevenDaysAgo;
        }
        
        if (filterDatePreset === "last_30") {
          const thirtyDaysAgo = new Date(startOfToday);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          return d >= thirtyDaysAgo;
        }
        
        if (filterDatePreset === "custom") {
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
        return true;
      });
    }

    // 8. Quantity Range Filter
    if (filterMinQty !== "") {
      const min = Number(filterMinQty);
      if (!isNaN(min)) {
        rows = rows.filter(r => r.total_quantity >= min);
      }
    }
    if (filterMaxQty !== "") {
      const max = Number(filterMaxQty);
      if (!isNaN(max)) {
        rows = rows.filter(r => r.total_quantity <= max);
      }
    }

    // 9. Order Volume Range Filter
    if (filterMinAmount !== "") {
      const min = Number(filterMinAmount);
      if (!isNaN(min)) {
        rows = rows.filter(r => r.grand_total >= min);
      }
    }
    if (filterMaxAmount !== "") {
      const max = Number(filterMaxAmount);
      if (!isNaN(max)) {
        rows = rows.filter(r => r.grand_total <= max);
      }
    }

    // 10. City Filter
    if (filterCity !== "all") {
      rows = rows.filter(r => r.party_city.trim() === filterCity);
    }

    // 11. Sales Person Filter
    if (filterSalesPerson !== "all") {
      rows = rows.filter(r => r.sales_person.trim() === filterSalesPerson);
    }

    return rows;
  }, [
    localRows,
    searchQuery,
    filterStatus,
    filterPriority,
    filterCounterparty,
    filterPartyNameQuery,
    filterSra,
    filterDatePreset,
    filterStartDate,
    filterEndDate,
    filterMinQty,
    filterMaxQty,
    filterMinAmount,
    filterMaxAmount,
    filterCity,
    filterSalesPerson,
    activeSheetTab
  ]);

  // Export CSV
  const exportToCSV = () => {
    const sumGrandTotal = filteredRows.reduce((acc, r) => acc + r.grand_total, 0);
    const sumQty = filteredRows.reduce((acc, r) => acc + r.total_quantity, 0);
    const orderCount = filteredRows.length;

    // Build a blank row and a summary row aligned to the column positions
    const blankRow = COLUMNS.map(() => "").join(",");

    // Summary row: label in col A, grand total in col C (index 2), qty in col K (index 10)
    const summaryRow = COLUMNS.map((col, idx) => {
      if (idx === 0) return `"SUMMARY (${orderCount} orders)"`;
      if (col.key === "grand_total") return sumGrandTotal.toFixed(2);
      if (col.key === "total_quantity") return sumQty;
      if (col.key === "items_list") return `"Total Items Qty: ${sumQty}"`;
      return "";
    }).join(",");

    const exportedAt = `"Exported: ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}"`;
    const metaRow = [exportedAt, ...COLUMNS.slice(1).map(() => "")].join(",");

    const headers = COLUMNS.map(c => `"${c.label}"`).join(",");
    const csvContent = [
      headers,
      ...filteredRows.map(row => {
        return COLUMNS.map(col => {
          const val = row[col.key];
          if (typeof val === "string" && (val.includes(",") || val.includes('"') || val.includes("\n"))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(",");
      }),
      blankRow,
      summaryRow,
      metaRow,
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `orders_export_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Resizing mouse/drag listeners
  const handleResizeStart = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = {
      colKey,
      startWidth: colWidths[colKey] || 120,
      startX: e.clientX,
    };
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current) return;
    const { colKey, startWidth, startX } = dragStartRef.current;
    const delta = e.clientX - startX;
    const newWidth = Math.max(70, startWidth + delta);
    setColWidths(prev => ({ ...prev, [colKey]: newWidth }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    dragStartRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  }, [handleResizeMove]);

  // Dynamic table layout total width
  const totalWidth = useMemo(() => {
    const columnsSum = COLUMNS.reduce((sum, col) => sum + (colWidths[col.key] || 120), 0);
    return 48 + columnsSum; // 48px row numbers
  }, [colWidths]);

  // Clean mouse listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [handleResizeMove, handleResizeEnd]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans">
        
        {/* Top Header Section */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
              📋
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Order Spreadsheet Registry</span>
                <span className="rounded-full bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                  Read Only
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Interactive spreadsheet viewer for orders, filtered to {filteredRows.length} matching rows.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 hover:border-slate-350 p-2 text-slate-400 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 hover:text-slate-700 dark:hover:text-slate-255 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar Container */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-2 shrink-0">
          
          {/* Export action */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={exportToCSV}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          {/* Search and Filters panel toggle */}
          <div className="flex items-center gap-2 relative">
            <div className="relative w-60">
              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400 dark:text-slate-555 pointer-events-none">
                <Search className="h-3.5 w-3.5" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search values in sheet..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>

            {/* Filters Toggle Button */}
            <button
              onClick={() => setIsFilterPanelOpen(prev => !prev)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition relative ${
                isFilterPanelOpen || hasActiveFilters
                  ? "border-emerald-500 bg-emerald-50/10 text-emerald-600 dark:text-emerald-400"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
              )}
            </button>

            {/* Clear Filters helper */}
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="text-xs font-semibold text-rose-500 hover:text-rose-600 px-1 py-1.5 transition"
                title="Clear all active filters"
              >
                Clear
              </button>
            )}

            {/* Filter Panel Dropdown Popover */}
            {isFilterPanelOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsFilterPanelOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-96 max-h-[75vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-4 z-50 space-y-4 text-xs scrollbar-thin">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100">Sheet Filters</span>
                    <button
                      onClick={handleClearFilters}
                      disabled={!hasActiveFilters}
                      className="text-[10px] text-slate-400 hover:text-emerald-500 disabled:opacity-50 transition font-semibold"
                    >
                      Reset All
                    </button>
                  </div>

                  {/* Filter Fields */}
                  <div className="space-y-3.5 select-none">
                    {/* Status select */}
                    <div>
                      <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">Order Status</label>
                      <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                      >
                        <option value="all">All statuses</option>
                        {uniqueStatuses.map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </div>

                    {/* Priority select */}
                    <div>
                      <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">Priority</label>
                      <select
                        value={filterPriority}
                        onChange={e => setFilterPriority(e.target.value)}
                        className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                      >
                        <option value="all">All priorities</option>
                        {uniquePriorities.map(pr => (
                          <option key={pr} value={pr} className="capitalize">{pr}</option>
                        ))}
                      </select>
                    </div>

                    {/* Counterparty select */}
                    <div>
                      <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">Select Party Name (Dropdown)</label>
                      <select
                        value={filterCounterparty}
                        onChange={e => setFilterCounterparty(e.target.value)}
                        className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                      >
                        <option value="all">All parties</option>
                        {uniqueCounterparties.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    {/* Specific Party Search Input */}
                    <div>
                      <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">Search Party Name (Text)</label>
                      <input
                        type="text"
                        value={filterPartyNameQuery}
                        onChange={e => setFilterPartyNameQuery(e.target.value)}
                        placeholder="Type to filter party name..."
                        className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                      />
                    </div>

                    {/* City Select */}
                    <div>
                      <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">City</label>
                      <select
                        value={filterCity}
                        onChange={e => setFilterCity(e.target.value)}
                        className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                      >
                        <option value="all">All cities</option>
                        {uniqueCities.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Sales Person Select */}
                    <div>
                      <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">Sales Person</label>
                      <select
                        value={filterSalesPerson}
                        onChange={e => setFilterSalesPerson(e.target.value)}
                        className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                      >
                        <option value="all">All sales persons</option>
                        {uniqueSalesPersons.map(sp => (
                          <option key={sp} value={sp}>{sp}</option>
                        ))}
                      </select>
                    </div>

                    {/* SRA Filter */}
                    <div>
                      <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">SRA Status</label>
                      <select
                        value={filterSra}
                        onChange={e => setFilterSra(e.target.value)}
                        className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                      >
                        <option value="all">All parties</option>
                        <option value="sra">SRA Parties Only</option>
                        <option value="non_sra">Non-SRA Parties Only</option>
                      </select>
                    </div>

                    {/* Date Preset Filter */}
                    <div>
                      <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">Order Date Range</label>
                      <select
                        value={filterDatePreset}
                        onChange={e => setFilterDatePreset(e.target.value)}
                        className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 mb-1.5"
                      >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="last_7">Last 7 Days</option>
                        <option value="last_30">Last 30 Days</option>
                        <option value="custom">Custom Range</option>
                      </select>

                      {filterDatePreset === "custom" && (
                        <div className="grid grid-cols-2 gap-2 mt-1.5 animate-fadeIn">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 mb-1">Start Date</label>
                            <input
                              type="date"
                              value={filterStartDate}
                              onChange={e => setFilterStartDate(e.target.value)}
                              className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2 py-1 text-[11px] text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 mb-1">End Date</label>
                            <input
                              type="date"
                              value={filterEndDate}
                              onChange={e => setFilterEndDate(e.target.value)}
                              className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2 py-1 text-[11px] text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quantity Range */}
                    <div>
                      <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">Total Quantity Range</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={filterMinQty}
                          onChange={e => setFilterMinQty(e.target.value)}
                          placeholder="Min Qty"
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        />
                        <input
                          type="number"
                          value={filterMaxQty}
                          onChange={e => setFilterMaxQty(e.target.value)}
                          placeholder="Max Qty"
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Amount Range */}
                    <div>
                      <label className="block font-semibold text-slate-550 dark:text-slate-400 mb-1">Order Volume Range (₹)</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={filterMinAmount}
                          onChange={e => setFilterMinAmount(e.target.value)}
                          placeholder="Min (₹)"
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        />
                        <input
                          type="number"
                          value={filterMaxAmount}
                          onChange={e => setFilterMaxAmount(e.target.value)}
                          placeholder="Max (₹)"
                          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Read-Only Formula Indicator */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-4 py-1.5 text-xs select-none shrink-0 font-mono">
          <span className="text-slate-450 dark:text-slate-555 font-semibold select-none pr-3">fx</span>
          <span className="text-slate-300 dark:text-slate-700 px-1 border-r border-slate-200 dark:border-slate-700 mr-3">|</span>
          <span className="text-slate-400 dark:text-slate-600 italic select-none">
            {selectedCell
              ? `${COLUMNS.find(c => c.key === selectedCell.colKey)?.label}: ${
                  filteredRows.find(r => r._id === selectedCell.orderId)?.[selectedCell.colKey] ?? ""
                }`
              : "Select a cell to view its value (Double-click/Editing is disabled)"}
          </span>
        </div>

        {/* Summary Bar */}
        {filteredRows.length > 0 && (() => {
          const sumGrandTotal = filteredRows.reduce((acc, r) => acc + r.grand_total, 0);
          const sumQty = filteredRows.reduce((acc, r) => acc + r.total_quantity, 0);
          const orderCount = filteredRows.length;
          return (
            <div className="flex items-center gap-0 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-emerald-50/80 via-white to-purple-50/60 dark:from-emerald-950/30 dark:via-slate-900 dark:to-purple-950/20 px-4 py-2 shrink-0 select-none text-xs">
              <span className="text-slate-400 dark:text-slate-600 font-semibold mr-4 text-[10px] uppercase tracking-wide">∑ Summary</span>
              {/* Orders count */}
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1 mr-3">
                <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0" />
                <span className="text-slate-500 dark:text-slate-400 font-medium">Orders</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 ml-1 font-mono">{orderCount.toLocaleString("en-IN")}</span>
              </div>
              {/* Grand total sum */}
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1 mr-3">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">Grand Total</span>
                <span className="font-bold text-emerald-800 dark:text-emerald-200 ml-1 font-mono">₹{formatMoney(sumGrandTotal)}</span>
              </div>
              {/* Items quantity sum */}
              <div className="flex items-center gap-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 px-3 py-1 mr-3">
                <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" />
                <span className="text-purple-700 dark:text-purple-400 font-medium">Total Items Qty</span>
                <span className="font-bold text-purple-800 dark:text-purple-200 ml-1 font-mono">{sumQty.toLocaleString("en-IN")}</span>
              </div>
              <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-600 italic">Showing totals for filtered rows</span>
            </div>
          );
        })()}

        {/* Spreadsheet Area */}
        <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 relative">
          {/* Busy Loading Overlay */}
          {(isOrdersLoading || isOrdersFetching || partiesQ.isLoading || usersQ.isLoading) && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 flex items-center justify-center z-40 backdrop-blur-[1px]">
              <div className="flex flex-col items-center gap-2.5 bg-white dark:bg-slate-850 p-4 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800">
                <RefreshCw className="h-5 w-5 animate-spin text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Loading sheet data...</span>
              </div>
            </div>
          )}
          <div
            className="relative"
            style={{ width: `${totalWidth}px` }}
          >
            <table className="table-fixed border-collapse text-xs select-none">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-900">
                  {/* Row index top corner cell */}
                  <th className="sticky top-0 left-0 z-30 w-12 border-r border-b border-slate-250 dark:border-slate-800 bg-slate-150 dark:bg-slate-850 text-center text-[10px] text-slate-500 font-medium py-1.5 shadow-[2px_2px_0_0_rgba(0,0,0,0.02)]">
                    &nbsp;
                  </th>
                  
                  {/* Column headers (A, B, C...) */}
                  {COLUMNS.map(col => {
                    const width = colWidths[col.key] || 120;
                    return (
                      <th
                        key={col.key}
                        style={{ width: `${width}px` }}
                        className="sticky top-0 z-20 border-r border-b border-slate-250 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-semibold text-center select-none relative group"
                      >
                        <div className="flex flex-col items-center justify-center py-1">
                          <span className="text-[10px] text-slate-400">{col.headerLetter}</span>
                          <span className="text-[11px] truncate px-2 max-w-full" title={col.label}>
                            {col.label}
                          </span>
                        </div>
                        {/* Resizer Handle */}
                        <div
                          onMouseDown={e => handleResizeStart(col.key, e)}
                          className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-emerald-500/50 active:bg-emerald-600 transition z-10"
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, rowIdx) => {
                  return (
                    <tr
                      key={row._id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors bg-white dark:bg-slate-900"
                    >
                      {/* Row index cell */}
                      <td className="sticky left-0 z-10 border-r border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center text-[10px] text-slate-400 font-mono py-1.5 shadow-[2px_0_0_0_rgba(0,0,0,0.02)] select-none">
                        {rowIdx + 1}
                      </td>

                      {/* Spreadsheet Columns */}
                      {COLUMNS.map(col => {
                        const isSelected =
                          selectedCell?.orderId === row._id &&
                          selectedCell?.colKey === col.key;
                        const val = row[col.key];

                        let cellClass = "border-r border-b border-slate-150 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-mono font-normal outline-none relative truncate px-3 py-2 cursor-pointer select-none";
                        if (isSelected) {
                          cellClass += " ring-2 ring-emerald-500 ring-inset bg-emerald-500/5 dark:bg-emerald-500/10";
                        }

                        // Styles based on cell data type
                        const isNumber = col.type === "number";
                        const textAlignment = isNumber ? "text-right" : "text-left";

                        return (
                          <td
                            key={col.key}
                            onClick={() => setSelectedCell({ orderId: row._id, colKey: col.key })}
                            className={`${cellClass} ${textAlignment}`}
                          >
                            {isNumber && typeof val === "number" ? (
                              <span>₹{formatMoney(val)}</span>
                            ) : col.key === "priority" ? (
                              <span className="capitalize">{String(val)}</span>
                            ) : col.key === "status" ? (
                              <span className="capitalize">{String(val).replace(/_/g, " ")}</span>
                            ) : (
                              <span>{String(val ?? "")}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Google Sheets Sheet Tabs Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0 select-none text-xs">
          {/* Sheet Tabs */}
          <div className="flex items-center overflow-x-auto border-b sm:border-b-0 border-slate-200 dark:border-slate-800 scrollbar-none">
            {/* Sheet navigator mock buttons */}
            <div className="flex items-center px-3 py-1.5 border-r border-slate-200 dark:border-slate-800 text-slate-400 gap-1.5">
              <span className="cursor-pointer hover:text-slate-655 dark:hover:text-slate-300">◀</span>
              <span className="cursor-pointer hover:text-slate-655 dark:hover:text-slate-300">▶</span>
            </div>
            
              {/* Tab list */}
              <div className="flex items-center h-full relative top-[1px]">
                {ADMIN_ORDER_TABS.filter(
                  (tab) => portal === "admin" || tab.id !== "pending_admin_approval",
                ).flatMap((tab) => {
                  const tabBtn = (
                    <button
                      key={tab.id}
                      onClick={() => setActiveSheetTab(tab.id)}
                      className={`px-4 py-2 border-r border-slate-200 dark:border-slate-800 font-semibold whitespace-nowrap cursor-pointer transition ${
                        activeSheetTab === tab.id
                          ? "bg-white dark:bg-slate-950 text-emerald-650 dark:text-emerald-400 border-t-2 border-t-emerald-600 dark:border-t-emerald-450 border-b-transparent"
                          : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );

                  // Insert portal-specific pending tab right after All Orders
                  if (tab.id === "all" && portal === "finance") {
                    return [
                      tabBtn,
                      <button
                        key="pending_finance_approval"
                        onClick={() => setActiveSheetTab("pending_finance_approval")}
                        className={`px-4 py-2 border-r border-slate-200 dark:border-slate-800 font-semibold whitespace-nowrap cursor-pointer transition ${
                          activeSheetTab === "pending_finance_approval"
                            ? "bg-white dark:bg-slate-950 text-emerald-650 dark:text-emerald-400 border-t-2 border-t-emerald-600 dark:border-t-emerald-450 border-b-transparent"
                            : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                        }`}
                      >
                        Pending Finance Approval
                      </button>,
                    ];
                  }
                  if (tab.id === "all" && portal === "account") {
                    return [
                      tabBtn,
                      <button
                        key="pending_account_approval"
                        onClick={() => setActiveSheetTab("pending_account_approval")}
                        className={`px-4 py-2 border-r border-slate-200 dark:border-slate-800 font-semibold whitespace-nowrap cursor-pointer transition ${
                          activeSheetTab === "pending_account_approval"
                            ? "bg-white dark:bg-slate-950 text-emerald-650 dark:text-emerald-400 border-t-2 border-t-emerald-600 dark:border-t-emerald-450 border-b-transparent"
                            : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
                        }`}
                      >
                        Pending Account Approval
                      </button>,
                    ];
                  }

                  return [tabBtn];
                })}
              </div>
            </div>

          {/* Stats & Status */}
          <div className="flex items-center justify-between sm:justify-end gap-4 px-6 py-2.5 sm:py-0 text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
              <span className="font-semibold text-[11px] text-slate-655 dark:text-slate-355">Read-Only Grid Mode</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span>Rows: <strong className="text-slate-800 dark:text-slate-200">{filteredRows.length}</strong> / {localRows.length}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">∑ ₹{formatMoney(filteredRows.reduce((a, r) => a + r.grand_total, 0))}</span>
              <span className="text-purple-600 dark:text-purple-400 font-semibold">Qty: {filteredRows.reduce((a, r) => a + r.total_quantity, 0).toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

    </div>
  );
}
