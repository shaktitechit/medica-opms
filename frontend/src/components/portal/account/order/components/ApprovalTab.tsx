"use client";

import { ApprovalsTab } from "@/components/portal/shared/orderDetail/tabs/ApprovalsTab";

type Props = {
  orderId: string;
  detail: Record<string, unknown> | null;
  readOnlyItems?: Record<string, unknown>[];
  refetchOrder?: () => void;
  partyLabel?: string;
};

export function ApprovalTab(props: Props) {
  return <ApprovalsTab portal="account" {...props} />;
}

export default ApprovalTab;
