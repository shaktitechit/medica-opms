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
    "border-primary/10 bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/5 dark:to-primary/5",
  searchFocus:
    "focus:border-primary focus:ring-primary/25 dark:focus:border-primary",
  tabActive:
    "border-primary text-primary dark:border-primary dark:text-primary",
  searchResult: "text-primary dark:text-primary",
  countBadge: "bg-primary",
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
      "border-primary/10 bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/5 dark:to-primary/5",
    searchFocus:
      "focus:border-primary focus:ring-primary/25 dark:focus:border-primary",
    tabActive:
      "border-primary text-primary dark:border-primary dark:text-primary",
    searchResult: "text-primary dark:text-primary",
    countBadge: "bg-primary",
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
      "border-primary/10 bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/5 dark:to-primary/5",
    searchFocus:
      "focus:border-primary focus:ring-primary/25 dark:focus:border-primary",
    tabActive:
      "border-primary text-primary dark:border-primary dark:text-primary",
    searchResult: "text-primary dark:text-primary",
    countBadge: "bg-primary",
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
      "border-primary/10 bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/5 dark:to-primary/5",
    searchFocus:
      "focus:border-primary focus:ring-primary/25 dark:focus:border-primary",
    tabActive:
      "border-primary text-primary dark:border-primary dark:text-primary",
    searchResult: "text-primary dark:text-primary",
    countBadge: "bg-primary",
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
      "border-primary/10 bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/5 dark:to-primary/5",
    searchFocus:
      "focus:border-primary focus:ring-primary/25 dark:focus:border-primary",
    tabActive:
      "border-primary text-primary dark:border-primary dark:text-primary",
    searchResult: "text-primary dark:text-primary",
    countBadge: "bg-primary",
  },
  allowDraftDelete: true,
  allowSuperAdminEdit: false,
  useSuperAdminSheet: false,
};
