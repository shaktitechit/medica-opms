import { resolveOrderCounterparty } from "@/components/portal/sales/partyDisplay";
import {
  computeSalesOrderStats,
  orderMatchesSalesTab,
  type SalesOrderTabCategory,
} from "@/components/portal/sales/orderUtils";

import type { ListOrdersTabId } from "./listOrdersPageConfig";
import { orderMatchesDateFilter } from "./orderListDateFilter";
import { orderKey } from "./orderListDisplay";
import {
  computeOrderWorkflowTabStats,
  orderMatchesWorkflowTab,
  type OrderWorkflowCategoryOptions,
  type OrderWorkflowTabCategory,
} from "./orderWorkflowTabs";

export type FilterListOrdersParams = {
  orders: unknown[];
  activeTab: ListOrdersTabId;
  searchQuery: string;
  priorityFilter: string;
  dateFilter: string;
  customDateFrom: string;
  customDateTo: string;
  categoryOptions: OrderWorkflowCategoryOptions;
  partyNameById: Map<string, string>;
  /** Sales list includes draft tab membership. */
  includeDraftTab?: boolean;
};

/**
 * Shared ListOrdersPage / GoogleSheetOrdersModal / SuperAdminOrdersSheetModal
 * filter pipeline: tab (or search bypass) → priority → date.
 */
export function filterListOrders<T = unknown>(
  params: FilterListOrdersParams,
): T[] {
  const {
    orders,
    activeTab,
    searchQuery,
    priorityFilter,
    dateFilter,
    customDateFrom,
    customDateTo,
    categoryOptions,
    partyNameById,
    includeDraftTab = false,
  } = params;

  return orders.filter((o) => {
    if (!searchQuery.trim()) {
      const matches = includeDraftTab
        ? orderMatchesSalesTab(
            o,
            activeTab as SalesOrderTabCategory,
            categoryOptions,
          )
        : orderMatchesWorkflowTab(
            o,
            activeTab as OrderWorkflowTabCategory,
            categoryOptions,
          );
      if (!matches) return false;
    } else {
      const query = searchQuery.toLowerCase();
      const id = orderKey(o);
      const row = o as { order_no?: unknown; order_number?: unknown };
      const ref = (
        typeof row.order_no === "string"
          ? row.order_no
          : typeof row.order_number === "string"
            ? row.order_number
            : id || ""
      ).toLowerCase();

      const partyLabel = resolveOrderCounterparty(
        o as Record<string, unknown>,
        partyNameById,
      ).toLowerCase();

      if (!ref.includes(query) && !partyLabel.includes(query)) {
        return false;
      }
    }

    if (priorityFilter !== "all") {
      const priority = String(
        (o as { priority?: unknown }).priority || "",
      ).toLowerCase();
      if (priority !== priorityFilter.toLowerCase()) return false;
    }

    if (
      !orderMatchesDateFilter(
        o as Record<string, unknown>,
        dateFilter,
        customDateFrom,
        customDateTo,
      )
    ) {
      return false;
    }

    return true;
  }) as T[];
}

/** Same per-tab badge counts as ListOrdersPage / Quick Access. */
export function buildOrderListTabCounts(
  orders: unknown[],
  categoryOptions: OrderWorkflowCategoryOptions,
  includeDraftTab = false,
): Record<string, number> {
  const stats = includeDraftTab
    ? computeSalesOrderStats(orders, categoryOptions)
    : computeOrderWorkflowTabStats(orders, categoryOptions);
  const counts: Record<string, number> = {};
  for (const [id, stat] of Object.entries(stats)) {
    counts[id] = stat.count;
  }
  return counts;
}
