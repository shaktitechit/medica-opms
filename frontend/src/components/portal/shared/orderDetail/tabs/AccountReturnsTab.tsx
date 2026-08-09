"use client";

import { ReturnsTab } from "./ReturnsTab";

type Props = {
  orderId: string;
  detail: Record<string, any> | null;
};

/** @deprecated Use ReturnsTab with mode="account" */
export function AccountReturnsTab(props: Props) {
  return <ReturnsTab mode="account" {...props} />;
}
