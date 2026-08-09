"use client";

import { DispatchOpsTransportsTab } from "./DispatchOpsTransportsTab";
import { ReadonlyTransportsTab } from "./ReadonlyTransportsTab";

export type TransportsTabMode = "dispatch_ops" | "readonly";

type TransportsTabProps = {
  mode: TransportsTabMode;
  orderId: string;
  detail?: Record<string, unknown> | null;
  refetchOrder?: () => void;
  // dispatch_ops
  transports?: Record<string, unknown>[];
  isFetching?: boolean;
  isPatchingTransport?: boolean;
  onUpdateStatus?: (
    transportId: string,
    nextStatus: string,
    remarks?: string,
    suppressToast?: boolean,
  ) => void | Promise<void>;
  formatDate?: (v: unknown) => string;
  onRefetch?: () => void;
  dispatches?: Record<string, unknown>[];
  orderItems?: Record<string, unknown>[];
};

/**
 * Single transports tab entry — role actions differ by `mode`.
 * Dispatch ops: status pipeline + delivery · Readonly: view.
 */
export function TransportsTab({ mode, ...props }: TransportsTabProps) {
  if (mode === "dispatch_ops") {
    return (
      <DispatchOpsTransportsTab
        transports={props.transports ?? []}
        isFetching={Boolean(props.isFetching)}
        isPatchingTransport={Boolean(props.isPatchingTransport)}
        onUpdateStatus={props.onUpdateStatus ?? (async () => undefined)}
        formatDate={props.formatDate ?? (() => "—")}
        orderId={props.orderId}
        onRefetch={props.onRefetch ?? props.refetchOrder}
        dispatches={props.dispatches}
        orderItems={props.orderItems}
      />
    );
  }
  return (
    <ReadonlyTransportsTab
      orderId={props.orderId}
      detail={props.detail ?? null}
      refetchOrder={props.refetchOrder}
    />
  );
}

export default TransportsTab;
