/**
 * Shared accent colors for Quick Access tiles and list workflow tabs.
 * Icons come from `getOrderListTabIcon` so both surfaces stay aligned.
 */
export const ORDER_WORKFLOW_TAB_ACCENT: Record<
  string,
  {
    accent: string;
    labelTone: string;
    iconWrap: string;
    iconTone: string;
  }
> = {
  draft: {
    accent: "bg-slate-400",
    labelTone: "text-slate-400 dark:text-slate-500",
    iconWrap: "bg-slate-50 dark:bg-slate-800",
    iconTone: "text-slate-500 dark:text-slate-400",
  },
  all: {
    accent: "bg-slate-500",
    labelTone: "text-slate-500 dark:text-slate-400",
    iconWrap: "bg-slate-50 dark:bg-slate-950/30",
    iconTone: "text-slate-600 dark:text-slate-400",
  },
  pending_admin_approval: {
    accent: "bg-indigo-500",
    labelTone: "text-indigo-500 dark:text-indigo-400",
    iconWrap: "bg-indigo-50 dark:bg-indigo-950/30",
    iconTone: "text-indigo-600 dark:text-indigo-400",
  },
  due_sheet_pending: {
    accent: "bg-orange-500",
    labelTone: "text-orange-500 dark:text-orange-400",
    iconWrap: "bg-orange-50 dark:bg-orange-950/30",
    iconTone: "text-orange-600 dark:text-orange-400",
  },
  pending_finance_approval: {
    accent: "bg-purple-500",
    labelTone: "text-purple-500 dark:text-purple-400",
    iconWrap: "bg-purple-50 dark:bg-purple-950/30",
    iconTone: "text-purple-600 dark:text-purple-400",
  },
  pending_account_approval: {
    accent: "bg-violet-500",
    labelTone: "text-violet-500 dark:text-violet-400",
    iconWrap: "bg-violet-50 dark:bg-violet-950/30",
    iconTone: "text-violet-600 dark:text-violet-400",
  },
  open_dispatched: {
    accent: "bg-teal-500",
    labelTone: "text-teal-500 dark:text-teal-400",
    iconWrap: "bg-teal-50 dark:bg-teal-950/30",
    iconTone: "text-teal-600 dark:text-teal-400",
  },
  transport_pending: {
    accent: "bg-amber-500",
    labelTone: "text-amber-500 dark:text-amber-400",
    iconWrap: "bg-amber-50 dark:bg-amber-950/30",
    iconTone: "text-amber-600 dark:text-amber-400",
  },
  in_transit: {
    accent: "bg-sky-500",
    labelTone: "text-sky-500 dark:text-sky-400",
    iconWrap: "bg-sky-50 dark:bg-sky-950/30",
    iconTone: "text-sky-600 dark:text-sky-400",
  },
  closed_delivered: {
    accent: "bg-emerald-500",
    labelTone: "text-emerald-500 dark:text-emerald-400",
    iconWrap: "bg-emerald-50 dark:bg-emerald-950/30",
    iconTone: "text-emerald-600 dark:text-emerald-400",
  },
  on_hold: {
    accent: "bg-orange-500",
    labelTone: "text-orange-500 dark:text-orange-400",
    iconWrap: "bg-orange-50 dark:bg-orange-950/30",
    iconTone: "text-orange-600 dark:text-orange-400",
  },
  cancelled: {
    accent: "bg-rose-500",
    labelTone: "text-rose-500 dark:text-rose-400",
    iconWrap: "bg-rose-50 dark:bg-rose-950/30",
    iconTone: "text-rose-600 dark:text-rose-400",
  },
  rejected: {
    accent: "bg-red-500",
    labelTone: "text-red-500 dark:text-red-400",
    iconWrap: "bg-red-50 dark:bg-red-950/30",
    iconTone: "text-red-600 dark:text-red-400",
  },
};

export function getOrderWorkflowTabAccent(tabId: string) {
  return ORDER_WORKFLOW_TAB_ACCENT[tabId] ?? ORDER_WORKFLOW_TAB_ACCENT.all;
}
