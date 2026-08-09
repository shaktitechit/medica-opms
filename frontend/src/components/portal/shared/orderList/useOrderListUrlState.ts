"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ListOrdersTabId } from "./listOrdersPageConfig";
import { normalizeWorkflowTabFromUrl } from "./orderWorkflowTabs";

export type OrderListViewBy = "workflow" | "priority";

type UseOrderListUrlStateOptions = {
  defaultTab: ListOrdersTabId;
  /** When true, `draft` is a valid URL tab (sales). */
  includeDraftTab?: boolean;
  normalizeTab?: (
    value: string | null,
    defaultTab: ListOrdersTabId,
  ) => ListOrdersTabId;
};

function buildOrdersQueryString(params: {
  tab: ListOrdersTabId;
  viewBy: OrderListViewBy;
  q: string;
}): string {
  const next = new URLSearchParams();
  if (params.viewBy === "priority") {
    next.set("by", "priority");
  }
  next.set("tab", params.tab);
  const q = params.q.trim();
  if (q) next.set("q", q);
  const s = next.toString();
  return s ? `?${s}` : "";
}

function defaultNormalizeTab(
  value: string | null,
  defaultTab: ListOrdersTabId,
  includeDraftTab: boolean,
): ListOrdersTabId {
  if (includeDraftTab && value === "draft") return "draft";
  if (includeDraftTab && !value) return defaultTab;
  return normalizeWorkflowTabFromUrl(
    value,
    defaultTab === "draft" ? "all" : defaultTab,
  );
}

export function useOrderListUrlState({
  defaultTab,
  includeDraftTab = false,
  normalizeTab,
}: UseOrderListUrlStateOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const viewBy: OrderListViewBy =
    searchParams.get("by") === "priority" ? "priority" : "workflow";
  const tabFromUrl = searchParams.get("tab");
  const qFromUrl = searchParams.get("q") ?? "";
  const byFromUrl = searchParams.get("by");

  const resolvedDefaultTab: ListOrdersTabId =
    viewBy === "priority" ? "all" : defaultTab;

  const normalizeTabRef = useRef(normalizeTab);
  normalizeTabRef.current = normalizeTab;

  const resolveTab = useCallback(
    (value: string | null, fallback: ListOrdersTabId): ListOrdersTabId => {
      const custom = normalizeTabRef.current;
      if (custom) return custom(value, fallback);
      return defaultNormalizeTab(value, fallback, includeDraftTab);
    },
    [includeDraftTab],
  );

  const [activeTab, setActiveTabState] = useState<ListOrdersTabId>(() =>
    resolveTab(tabFromUrl, resolvedDefaultTab),
  );
  const [searchQuery, setSearchQueryState] = useState(qFromUrl);
  const [priorityFilter, setPriorityFilterState] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const replaceUrl = useCallback(
    (next: {
      tab: ListOrdersTabId;
      viewBy: OrderListViewBy;
      q: string;
    }) => {
      const qs = buildOrdersQueryString(next);
      if (next.viewBy === "workflow" && byFromUrl === "workflow") {
        const params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
        params.set("by", "workflow");
        const withBy = params.toString();
        router.replace(withBy ? `${pathname}?${withBy}` : pathname, {
          scroll: false,
        });
        return;
      }
      router.replace(`${pathname}${qs}`, { scroll: false });
    },
    [byFromUrl, pathname, router],
  );

  // Sync tab from URL when the tab query (or default) changes — not on unrelated renders.
  useEffect(() => {
    const nextTab = resolveTab(tabFromUrl, resolvedDefaultTab);
    setActiveTabState((prev) => {
      if (prev === nextTab) return prev;
      return nextTab;
    });
  }, [tabFromUrl, resolvedDefaultTab, resolveTab]);

  // Reset page/priority only when the URL tab (or view default) actually changes.
  const tabResetKey = `${tabFromUrl ?? ""}|${resolvedDefaultTab}`;
  const prevTabResetKeyRef = useRef(tabResetKey);
  useEffect(() => {
    if (prevTabResetKeyRef.current === tabResetKey) return;
    prevTabResetKeyRef.current = tabResetKey;
    setPriorityFilterState("all");
    setCurrentPage(1);
  }, [tabResetKey]);

  const prevQFromUrlRef = useRef(qFromUrl);
  useEffect(() => {
    setSearchQueryState((prev) => (prev === qFromUrl ? prev : qFromUrl));
    if (prevQFromUrlRef.current === qFromUrl) return;
    prevQFromUrlRef.current = qFromUrl;
    if (qFromUrl) setCurrentPage(1);
  }, [qFromUrl]);

  const setActiveTab = useCallback(
    (tab: ListOrdersTabId) => {
      setActiveTabState(tab);
      setCurrentPage(1);
      replaceUrl({ tab, viewBy, q: searchQuery });
    },
    [replaceUrl, searchQuery, viewBy],
  );

  const setSearchQuery = useCallback((val: string) => {
    setSearchQueryState(val);
    setCurrentPage(1);
  }, []);

  const setPriorityFilter = useCallback((val: string) => {
    setPriorityFilterState(val);
    setCurrentPage(1);
  }, []);

  const handleDateFilterChange = useCallback((val: string) => {
    setDateFilter(val);
    setCurrentPage(1);
  }, []);

  const handleCustomDateFromChange = useCallback((val: string) => {
    setCustomDateFrom(val);
    setCurrentPage(1);
  }, []);

  const handleCustomDateToChange = useCallback((val: string) => {
    setCustomDateTo(val);
    setCurrentPage(1);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchQueryState("");
    setActiveTabState(resolvedDefaultTab);
    setPriorityFilterState("all");
    setDateFilter("all");
    setCustomDateFrom("");
    setCustomDateTo("");
    setCurrentPage(1);
    replaceUrl({ tab: resolvedDefaultTab, viewBy, q: "" });
  }, [replaceUrl, resolvedDefaultTab, viewBy]);

  const showReset = useMemo(
    () =>
      !!searchQuery ||
      activeTab !== resolvedDefaultTab ||
      priorityFilter !== "all" ||
      dateFilter !== "all",
    [activeTab, dateFilter, priorityFilter, resolvedDefaultTab, searchQuery],
  );

  return {
    viewBy,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    priorityFilter,
    setPriorityFilter,
    dateFilter,
    handleDateFilterChange,
    customDateFrom,
    handleCustomDateFromChange,
    customDateTo,
    handleCustomDateToChange,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    handleResetFilters,
    showReset,
    resolvedDefaultTab,
  };
}
