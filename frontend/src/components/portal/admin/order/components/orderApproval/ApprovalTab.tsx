"use client";

import { ApprovalsTab } from "@/components/portal/shared/orderDetail/tabs/ApprovalsTab";

type Props = {
  orderId: string;
  detail: Record<string, unknown> | null;
  status?: string;
  readOnlyItems?: Record<string, unknown>[];
  refetchOrder?: () => void;
  partyLabel?: string;
};

export function ApprovalTab(props: Props) {
  return <ApprovalsTab portal="admin" {...props} />;
}

export default ApprovalTab;
