import {
  Ban,
  CheckCircle2,
  FileEdit,
  FolderOpen,
  ListChecks,
  PackageCheck,
  PauseCircle,
  RotateCcw,
  ShieldCheck,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

const TAB_ICON_BY_ID: Record<string, LucideIcon> = {
  pending_admin_approval: ShieldCheck,
  pending_account_approval: ShieldCheck,
  pending_finance_approval: ShieldCheck,
  pending_approvals: ListChecks,
  pending_approval: ListChecks,
  pending_transport: Truck,
  pending_delivery: PackageCheck,
  returns_pending: RotateCcw,
  open: FolderOpen,
  closed: CheckCircle2,
  on_hold: PauseCircle,
  rejected: XCircle,
  cancelled: Ban,
  draft: FileEdit,
};

export function getOrderListTabIcon(tabId: string): LucideIcon {
  return TAB_ICON_BY_ID[tabId] ?? FolderOpen;
}
