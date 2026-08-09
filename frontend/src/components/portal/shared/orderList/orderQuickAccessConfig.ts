import { computeSalesOrderStats, SALES_ORDER_TABS } from "@/components/portal/sales/orderUtils";

import {
  ACCOUNT_LIST_ORDERS_CONFIG,
  ADMIN_LIST_ORDERS_CONFIG,
  DISPATCH_LIST_ORDERS_CONFIG,
  FINANCE_LIST_ORDERS_CONFIG,
  SALES_LIST_ORDERS_CONFIG,
  SUPER_ADMIN_LIST_ORDERS_CONFIG,
} from "./listOrdersPageConfig";
import {
  computeOrderWorkflowTabStats,
  ORDER_WORKFLOW_TABS,
  type OrderWorkflowCategoryOptions,
} from "./orderWorkflowTabs";

export type OrderQuickAccessRole =
  | "sales"
  | "admin"
  | "super_admin"
  | "finance"
  | "dispatch"
  | "account";

export type OrderQuickAccessRoleConfig = {
  tabs: ReadonlyArray<{ id: string; label: string }>;
  compute: (
    orders: unknown[],
    options?: OrderWorkflowCategoryOptions,
  ) => Record<string, { count: number }>;
  path: string;
};

/**
 * Quick Access tiles → `/{path}/orders?tab={id}`.
 * Non-sales portals share ORDER_WORKFLOW_TABS + computeOrderWorkflowTabStats
 * with ListOrdersPage bottom tabs.
 */
export const ORDER_QUICK_ACCESS_ROLE_CONFIG: Record<
  OrderQuickAccessRole,
  OrderQuickAccessRoleConfig
> = {
  sales: {
    tabs: SALES_ORDER_TABS,
    compute: computeSalesOrderStats,
    path: SALES_LIST_ORDERS_CONFIG.portalHome,
  },
  admin: {
    tabs: ORDER_WORKFLOW_TABS,
    compute: computeOrderWorkflowTabStats,
    path: ADMIN_LIST_ORDERS_CONFIG.portalHome,
  },
  super_admin: {
    tabs: ORDER_WORKFLOW_TABS,
    compute: computeOrderWorkflowTabStats,
    path: SUPER_ADMIN_LIST_ORDERS_CONFIG.portalHome,
  },
  finance: {
    tabs: ORDER_WORKFLOW_TABS,
    compute: computeOrderWorkflowTabStats,
    path: FINANCE_LIST_ORDERS_CONFIG.portalHome,
  },
  dispatch: {
    tabs: ORDER_WORKFLOW_TABS,
    compute: computeOrderWorkflowTabStats,
    path: DISPATCH_LIST_ORDERS_CONFIG.portalHome,
  },
  account: {
    tabs: ORDER_WORKFLOW_TABS,
    compute: computeOrderWorkflowTabStats,
    path: ACCOUNT_LIST_ORDERS_CONFIG.portalHome,
  },
};
