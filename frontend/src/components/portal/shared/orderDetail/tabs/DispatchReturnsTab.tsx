"use client";

import { ReturnsTab } from "./ReturnsTab";

type Props = {
  returns: any[];
  isFetching: boolean;
  formatDate: (v: unknown) => string;
  orderItems?: any[];
  userNameById?: Record<string, string>;
  onRefetch?: () => void;
  orderId?: string;
};

/** @deprecated Use ReturnsTab with mode="dispatch" */
export function DispatchReturnsTab(props: Props) {
  return <ReturnsTab mode="dispatch" orderId={props.orderId ?? ""} {...props} />;
}
