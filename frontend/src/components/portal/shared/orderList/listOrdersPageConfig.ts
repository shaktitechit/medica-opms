import type { OrderWorkflowTabCategory } from "./orderWorkflowTabs";

export type ListOrdersPortalHome =
  | "/admin"
  | "/super_admin"
  | "/account"
  | "/finance"
  | "/dispatch"
  | "/sales";

export type ListOrdersFlagDepartment =
  | "admin"
  | "account"
  | "finance"
  | "dispatch"
  | "sales";

export type ListOrdersSheetPortal = "admin" | "account" | "finance" | "super_admin";

export type ListOrdersHeaderAction =
  | "unbilled"
  | "refresh"
  | "sheet"
  | "analytics"
  | "dashboard"
  | "createDraft";

/** Tab ids used by list URL / bottom strip (sales adds `draft`). */
export type ListOrdersTabId = OrderWorkflowTabCategory | "draft";

export type ListOrdersPageConfig = {
  portalHome: ListOrdersPortalHome;
  title: string;
  subtitle?: string;
  defaultTab: ListOrdersTabId;
  flagDepartment: ListOrdersFlagDepartment;
  showDueSheetBadge: boolean;
  showFlagBadge: boolean;
  /** When false, Grand Total / money columns are hidden (sales). */
  showPricing: boolean;
  /** Client-filter to assigned/created-by current sales user. */
  scopeToSalesUser: boolean;
  /** Include Draft tab + fetch drafts (sales). */
  includeDraftTab: boolean;
  headerActions: ListOrdersHeaderAction[];
  createDraftLabel?: string;
  emptyNoOrdersHint?: string;
  accents: {
    strip: string;
    searchFocus: string;
    tabActive: string;
    searchResult: string;
    countBadge: string;
  };
  sheetPortal?: ListOrdersSheetPortal;
  allowDraftDelete: boolean;
  allowSuperAdminEdit: boolean;
  useSuperAdminSheet: boolean;
};

const ADMIN_ACCENTS = {
  strip:
    "border-purple-500/10 bg-gradient-to-r from-purple-600/5 to-indigo-600/10 dark:from-purple-500/5 dark:to-indigo-500/5",
  searchFocus:
    "focus:border-purple-600 focus:ring-purple-500/25 dark:focus:border-purple-500",
  tabActive:
    "border-purple-600 text-purple-600 dark:border-purple-500 dark:text-purple-400",
  searchResult: "text-purple-600 dark:text-purple-400",
  countBadge: "bg-purple-600",
} as const;

export const ADMIN_LIST_ORDERS_CONFIG: ListOrdersPageConfig = {
  portalHome: "/admin",
  title: "Admin Orders Control",
  defaultTab: "pending_admin_approval",
  flagDepartment: "admin",
  showDueSheetBadge: true,
  showFlagBadge: true,
  showPricing: true,
  scopeToSalesUser: false,
  includeDraftTab: false,
  headerActions: [
    "unbilled",
    "refresh",
    "sheet",
    "analytics",
    "dashboard",
    "createDraft",
  ],
  accents: ADMIN_ACCENTS,
  sheetPortal: "admin",
  allowDraftDelete: true,
  allowSuperAdminEdit: false,
  useSuperAdminSheet: false,
};

export const SUPER_ADMIN_LIST_ORDERS_CONFIG: ListOrdersPageConfig = {
  ...ADMIN_LIST_ORDERS_CONFIG,
  portalHome: "/super_admin",
  sheetPortal: "super_admin",
  allowSuperAdminEdit: true,
  useSuperAdminSheet: true,
};

export const ACCOUNT_LIST_ORDERS_CONFIG: ListOrdersPageConfig = {
  portalHome: "/account",
  title: "Account Clearance Queue",
  defaultTab: "pending_account_approval",
  flagDepartment: "account",
  showDueSheetBadge: true,
  showFlagBadge: true,
  showPricing: true,
  scopeToSalesUser: false,
  includeDraftTab: false,
  headerActions: ["unbilled", "sheet", "analytics", "refresh", "dashboard"],
  accents: {
    strip:
      "border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-teal-600/10 dark:from-blue-500/5 dark:to-teal-500/5",
    searchFocus:
      "focus:border-blue-600 focus:ring-blue-500/25 dark:focus:border-blue-500",
    tabActive:
      "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400",
    searchResult: "text-blue-600 dark:text-blue-400",
    countBadge: "bg-blue-600",
  },
  sheetPortal: "account",
  allowDraftDelete: false,
  allowSuperAdminEdit: false,
  useSuperAdminSheet: false,
};

export const FINANCE_LIST_ORDERS_CONFIG: ListOrdersPageConfig = {
  portalHome: "/finance",
  title: "Finance Orders Review",
  defaultTab: "pending_finance_approval",
  flagDepartment: "finance",
  showDueSheetBadge: true,
  showFlagBadge: true,
  showPricing: true,
  scopeToSalesUser: false,
  includeDraftTab: false,
  headerActions: ["unbilled", "sheet", "analytics", "refresh", "dashboard"],
  accents: {
    strip:
      "border-emerald-500/10 bg-gradient-to-r from-emerald-600/5 to-teal-600/10 dark:from-emerald-500/5 dark:to-teal-500/5",
    searchFocus:
      "focus:border-emerald-600 focus:ring-emerald-500/25 dark:focus:border-emerald-500",
    tabActive:
      "border-emerald-600 text-emerald-600 dark:border-emerald-500 dark:text-emerald-400",
    searchResult: "text-emerald-600 dark:text-emerald-400",
    countBadge: "bg-emerald-600",
  },
  sheetPortal: "finance",
  allowDraftDelete: false,
  allowSuperAdminEdit: false,
  useSuperAdminSheet: false,
};

export const DISPATCH_LIST_ORDERS_CONFIG: ListOrdersPageConfig = {
  portalHome: "/dispatch",
  title: "Dispatch Orders Operations",
  defaultTab: "transport_pending",
  flagDepartment: "dispatch",
  showDueSheetBadge: false,
  showFlagBadge: true,
  showPricing: true,
  scopeToSalesUser: false,
  includeDraftTab: false,
  headerActions: ["refresh", "dashboard"],
  accents: {
    strip:
      "border-amber-500/10 bg-gradient-to-r from-amber-600/5 to-orange-600/10 dark:from-amber-500/5 dark:to-orange-500/5",
    searchFocus:
      "focus:border-amber-600 focus:ring-amber-500/25 dark:focus:border-amber-500",
    tabActive:
      "border-amber-600 text-amber-600 dark:border-amber-500 dark:text-amber-400",
    searchResult: "text-amber-600 dark:text-amber-400",
    countBadge: "bg-amber-600",
  },
  allowDraftDelete: false,
  allowSuperAdminEdit: false,
  useSuperAdminSheet: false,
};

export const SALES_LIST_ORDERS_CONFIG: ListOrdersPageConfig = {
  portalHome: "/sales",
  title: "My Orders",
  subtitle:
    "Create drafts, review status progressions, and track your active sales orders pipeline.",
  defaultTab: "draft",
  flagDepartment: "sales",
  showDueSheetBadge: false,
  showFlagBadge: false,
  showPricing: false,
  scopeToSalesUser: true,
  includeDraftTab: true,
  headerActions: ["refresh", "dashboard", "createDraft"],
  createDraftLabel: "New Draft",
  emptyNoOrdersHint: "Get started by logging your first sales draft order.",
  accents: {
    strip:
      "border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 dark:from-blue-500/5 dark:to-indigo-500/5",
    searchFocus:
      "focus:border-blue-600 focus:ring-blue-500/25 dark:focus:border-blue-500",
    tabActive:
      "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400",
    searchResult: "text-blue-600 dark:text-blue-400",
    countBadge: "bg-blue-600",
  },
  allowDraftDelete: true,
  allowSuperAdminEdit: false,
  useSuperAdminSheet: false,
};
