export type OrderDetailPortalHome =
  | "/account"
  | "/admin"
  | "/finance"
  | "/dispatch"
  | "/super_admin";

export type OrderDetailFlagDepartment =
  | "account"
  | "admin"
  | "finance"
  | "dispatch";

export type OrderDetailTabId =
  | "approvals"
  | "dispatches"
  | "transports"
  | "deliveries"
  | "returns"
  | "due_sheet"
  | "flags"
  | "attachments"
  | "reminders"
  | "communication";

export type OrderDetailHeaderAction =
  | "hold"
  | "resume"
  | "reject"
  | "cancel"
  | "resolve_order"
  | "final_statement";

export type OrderDetailsPageConfig = {
  portalHome: OrderDetailPortalHome;
  portalLabel: string;
  ordersListPath: string;
  flagDepartment: OrderDetailFlagDepartment;
  defaultTab: OrderDetailTabId;
  tabs: OrderDetailTabId[];
  headerActions: OrderDetailHeaderAction[];
  /** Target status when Resume is pressed. */
  resumeTargetStatus?: string;
  lifecycleCapsMode: "shared" | "dispatch";
  approvalsMode?: "admin" | "finance" | "account";
  dispatchesMode: "account_create" | "dispatch_ops" | "readonly";
  transportsMode: "dispatch_ops" | "readonly";
  /**
   * Returns tab behavior:
   * - readonly: view only (admin / finance)
   * - account_receive: create + warehouse receive (account / super_admin)
   * - dispatch_create: create + warehouse receive (dispatch)
   */
  returnsMode?: "readonly" | "account_receive" | "dispatch_create";
  attachmentVisibility: "all" | "dispatch_filtered";
  /** Show finance workflow category badge in header. */
  showFinanceWorkflowBadge?: boolean;
};

export const ACCOUNT_ORDER_DETAILS_CONFIG: OrderDetailsPageConfig = {
  portalHome: "/account",
  portalLabel: "Account",
  ordersListPath: "/account/orders",
  flagDepartment: "account",
  defaultTab: "approvals",
  tabs: [
    "approvals",
    "dispatches",
    "transports",
    "deliveries",
    "returns",
    "due_sheet",
    "flags",
    "attachments",
    "reminders",
  ],
  headerActions: ["hold", "reject", "cancel", "final_statement"],
  lifecycleCapsMode: "shared",
  approvalsMode: "account",
  dispatchesMode: "account_create",
  transportsMode: "readonly",
  returnsMode: "account_receive",
  attachmentVisibility: "all",
};

export const ADMIN_ORDER_DETAILS_CONFIG: OrderDetailsPageConfig = {
  portalHome: "/admin",
  portalLabel: "Admin",
  ordersListPath: "/admin/orders",
  flagDepartment: "admin",
  defaultTab: "approvals",
  tabs: [
    "approvals",
    "dispatches",
    "transports",
    "deliveries",
    "returns",
    "flags",
    "attachments",
    "reminders",
    "due_sheet",
    "communication",
  ],
  headerActions: ["hold", "resume", "reject", "cancel", "final_statement"],
  resumeTargetStatus: "submitted",
  lifecycleCapsMode: "shared",
  approvalsMode: "admin",
  dispatchesMode: "readonly",
  transportsMode: "readonly",
  returnsMode: "readonly",
  attachmentVisibility: "all",
};

export const SUPER_ADMIN_ORDER_DETAILS_CONFIG: OrderDetailsPageConfig = {
  ...ADMIN_ORDER_DETAILS_CONFIG,
  portalHome: "/super_admin",
  portalLabel: "Super Admin",
  ordersListPath: "/super_admin/orders",
  tabs: [
    "approvals",
    "dispatches",
    "transports",
    "deliveries",
    "returns",
    "due_sheet",
    "flags",
    "attachments",
    "reminders",
    "communication",
  ],
  dispatchesMode: "account_create",
  transportsMode: "dispatch_ops",
  returnsMode: "account_receive",
};

export const FINANCE_ORDER_DETAILS_CONFIG: OrderDetailsPageConfig = {
  portalHome: "/finance",
  portalLabel: "Finance",
  ordersListPath: "/finance/orders",
  flagDepartment: "finance",
  defaultTab: "approvals",
  tabs: [
    "approvals",
    "dispatches",
    "transports",
    "deliveries",
    "returns",
    "due_sheet",
    "flags",
    "attachments",
    "reminders",
  ],
  headerActions: [
    "resolve_order",
    "reject",
    "hold",
    "resume",
    "cancel",
    "final_statement",
  ],
  resumeTargetStatus: "finance_review",
  lifecycleCapsMode: "shared",
  approvalsMode: "finance",
  dispatchesMode: "readonly",
  transportsMode: "readonly",
  returnsMode: "readonly",
  attachmentVisibility: "all",
  showFinanceWorkflowBadge: true,
};

export const DISPATCH_ORDER_DETAILS_CONFIG: OrderDetailsPageConfig = {
  portalHome: "/dispatch",
  portalLabel: "Dispatch",
  ordersListPath: "/dispatch/orders",
  flagDepartment: "dispatch",
  defaultTab: "dispatches",
  tabs: [
    "dispatches",
    "transports",
    "deliveries",
    "returns",
    "flags",
    "attachments",
  ],
  headerActions: ["resume"],
  resumeTargetStatus: "dispatch_pending",
  lifecycleCapsMode: "dispatch",
  dispatchesMode: "dispatch_ops",
  transportsMode: "dispatch_ops",
  returnsMode: "dispatch_create",
  attachmentVisibility: "dispatch_filtered",
};

export function hasHeaderAction(
  config: OrderDetailsPageConfig,
  action: OrderDetailHeaderAction,
): boolean {
  return config.headerActions.includes(action);
}
