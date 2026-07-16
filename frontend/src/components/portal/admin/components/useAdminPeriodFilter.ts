"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collectAvailableYears,
  filterOrdersByPeriod,
} from "./periodFilterUtils";

function getCurrentPeriodDefaults() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
  };
}

export function useAdminPeriodFilter<T = unknown>(orders: T[]) {
  const availableYears = useMemo(
    () => collectAvailableYears(orders as unknown[]),
    [orders],
  );
  const defaults = useMemo(() => getCurrentPeriodDefaults(), []);
  const [selectedYears, setSelectedYears] = useState<number[]>([defaults.year]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([defaults.month]);

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

  const filteredOrders = useMemo(
    () => filterOrdersByPeriod(orders, selectedYears, selectedMonths),
    [orders, selectedYears, selectedMonths],
  );

  return {
    availableYears,
    selectedYears,
    setSelectedYears,
    selectedMonths,
    setSelectedMonths,
    filteredOrders,
  };
}
