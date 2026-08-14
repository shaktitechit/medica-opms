"use client";

import type { CreateTransportFormDefaults } from "../modals/CreateTransportModal";
import { AccountDispatchesTab } from "./AccountDispatchesTab";
import { DispatchOpsDispatchesTab } from "./DispatchOpsDispatchesTab";
import { ReadonlyDispatchesTab } from "./ReadonlyDispatchesTab";

export type DispatchesTabMode = "account" | "dispatch_ops" | "readonly";

type DispatchesTabProps = {
  mode: DispatchesTabMode;
  orderId: string;
  detail: Record<string, unknown> | null;
  refetchOrder?: () => void;
  partyLabel?: string;
  isAssignedToMe?: boolean;
  // dispatch_ops
  dispatches?: Record<string, unknown>[];
  transports?: Record<string, unknown>[];
  isFetching?: boolean;
  isPatchingDispatch?: boolean;
  onUpdateStatus?: (dispatchId: string, nextStatus: string) => void | Promise<void>;
  formatDate?: (v: unknown) => string;
  userNameById?: Record<string, string>;
  orderItems?: Record<string, unknown>[];
  orderStatus?: string;
  expectedDeliveryDate?: string;
  shippingAddress?: unknown;
  onRefetch?: () => void;
  /** Prefill Create Transport (e.g. from transport plan). */
  transportFormDefaults?: CreateTransportFormDefaults;
  /** When true, transport agent selection is locked in CreateTransportModal. */
  disableTransportAgent?: boolean;
};

/**
 * Single dispatches tab entry — role actions differ by `mode`.
 * Account: create/settle · Dispatch ops: status/transport · Readonly: view.
 */
export function DispatchesTab({ mode, ...props }: DispatchesTabProps) {
  if (mode === "account") {
    return (
      <AccountDispatchesTab
        orderId={props.orderId}
        detail={props.detail}
        refetchOrder={props.refetchOrder}
        partyLabel={props.partyLabel}
        isAssignedToMe={props.isAssignedToMe}
        transportFormDefaults={props.transportFormDefaults}
        disableTransportAgent={props.disableTransportAgent}
      />
    );
  }
  if (mode === "dispatch_ops") {
    return (
      <DispatchOpsDispatchesTab
        dispatches={props.dispatches ?? []}
        transports={props.transports ?? []}
        isFetching={Boolean(props.isFetching)}
        isPatchingDispatch={Boolean(props.isPatchingDispatch)}
        onUpdateStatus={props.onUpdateStatus ?? (() => undefined)}
        formatDate={props.formatDate ?? (() => "—")}
        userNameById={props.userNameById}
        orderItems={props.orderItems}
        orderId={props.orderId}
        orderStatus={props.orderStatus ?? ""}
        expectedDeliveryDate={props.expectedDeliveryDate}
        shippingAddress={props.shippingAddress}
        onRefetch={props.onRefetch ?? props.refetchOrder}
        transportFormDefaults={props.transportFormDefaults}
        disableTransportAgent={props.disableTransportAgent}
        detail={props.detail}
        partyLabel={props.partyLabel}
      />
    );
  }
  return (
    <ReadonlyDispatchesTab
      orderId={props.orderId}
      detail={props.detail}
      refetchOrder={props.refetchOrder}
    />
  );
}

export default DispatchesTab;
