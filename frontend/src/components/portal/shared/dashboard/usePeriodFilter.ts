"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collectAvailableYears,
} from "./periodFilterUtils";
import { orderMatchesDateFilter } from "../orderList/orderListDateFilter";

function getCurrentPeriodDefaults() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
  };
}

export function usePeriodFilter<T = unknown>(orders: T[]) {
  const availableYears = useMemo(
    () => collectAvailableYears(orders as unknown[]),
    [orders],
  );
  const defaults = useMemo(() => getCurrentPeriodDefaults(), []);
  const [selectedYears, setSelectedYears] = useState<number[]>([defaults.year]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([defaults.month]);

  const [dateFilter, setDateFilter] = useState<string>("today");
  const [customDateFrom, setCustomDateFrom] = useState<string>("");
  const [customDateTo, setCustomDateTo] = useState<string>("");

  useEffect(() => {
    if (availableYears.length === 0) return;
    setSelectedYears((prev) => {
      if (prev.length === 0) {
        return availableYears.includes(defaults.year)
          ? [defaults.year]
          : [availableYears[0]];
      }
      const next = prev.filter((y) => availableYears.includes(y));
      if (next.length > 0) return next;
      return availableYears.includes(defaults.year)
        ? [defaults.year]
        : [availableYears[0]];
    });
  }, [availableYears, defaults.year]);

  const filteredOrders = useMemo(() => {
    return (orders as any[]).filter((o) => {
      if (dateFilter !== "all") {
        return orderMatchesDateFilter(o, dateFilter, customDateFrom, customDateTo);
      }
      const yearSet = new Set(selectedYears);
      const monthSet = new Set(selectedMonths);
      const dateStr = o.order_date ?? o.created_at ?? o.createdAt;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return yearSet.has(d.getFullYear()) && monthSet.has(d.getMonth());
    });
  }, [orders, dateFilter, customDateFrom, customDateTo, selectedYears, selectedMonths]);

  return {
    availableYears,
    selectedYears,
    setSelectedYears,
    selectedMonths,
    setSelectedMonths,
    dateFilter,
    setDateFilter,
    customDateFrom,
    setCustomDateFrom,
    customDateTo,
    setCustomDateTo,
    filteredOrders,
  };
}
