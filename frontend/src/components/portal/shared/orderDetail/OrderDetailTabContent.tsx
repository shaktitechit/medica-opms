"use client";

import { OrderDepartmentFlagsTab } from "@/components/portal/shared/OrderDepartmentFlagsTab";
import { RemindersTab } from "@/components/portal/shared/RemindersTab";
import { DueSheetTab } from "@/components/portal/shared/DueSheetTab";
import { ApprovalsTab } from "./tabs/ApprovalsTab";
import { DispatchesTab } from "./tabs/DispatchesTab";
import { TransportsTab } from "./tabs/TransportsTab";
import { ReturnsTab } from "./tabs/ReturnsTab";
import CommunicationTab from "./tabs/CommunicationTab";
import AttachmentsTab from "./tabs/AttachmentsTab";
import { DeliveriesTab } from "./tabs/DeliveriesTab";
import type { OrderDetailTabId, OrderDetailsPageConfig } from "./orderDetailsPageConfig";
import { formatDate } from "./orderDetailUtils";

export type OrderDetailTabContentProps = {
  config: OrderDetailsPageConfig;
  activeTab: OrderDetailTabId;
  orderId: string;
  detail: Record<string, unknown>;
  orderItems: Record<string, unknown>[];
  status: string;
  partyLabel: string;
  isAssignedToMe: boolean;
  adminReadOnlyItems?: Record<string, unknown>[];
  flagsQ: {
    refetch: () => unknown;
    isFetching: boolean;
    isUninitialized?: boolean;
  };
  rawFlags: Record<string, unknown>[];
  userNameById: Record<string, string>;
  attachments: Record<string, unknown>[];
  attachmentsLoading: boolean;
  refetchOrder: () => void;
  dispatches: Record<string, unknown>[];
  transports: Record<string, unknown>[];
  returns: Record<string, unknown>[];
  dispatchesFetching?: boolean;
  transportsFetching?: boolean;
  returnsFetching?: boolean;
  isPatchingDispatch?: boolean;
  isPatchingTransport?: boolean;
  onUpdateDispatchStatus?: (dispatchId: string, nextStatus: string) => Promise<void>;
  onUpdateTransportStatus?: (
    transportId: string,
    nextStatus: string,
    remarks?: string,
    suppressToast?: boolean,
  ) => Promise<void>;
  expectedDeliveryDate?: string;
  shippingAddress?: unknown;
  partyMobile?: string;
  partyEmail?: string;
  orderNo?: string;
};

export function OrderDetailTabContent(props: OrderDetailTabContentProps) {
  const {
    config,
    activeTab,
    orderId,
    detail,
    orderItems,
    status,
    partyLabel,
    isAssignedToMe,
    adminReadOnlyItems,
    flagsQ,
    rawFlags,
    userNameById,
    attachments,
    attachmentsLoading,
    refetchOrder,
    dispatches,
    transports,
    returns,
    dispatchesFetching,
    transportsFetching,
    returnsFetching,
    isPatchingDispatch,
    isPatchingTransport,
    onUpdateDispatchStatus,
    onUpdateTransportStatus,
    expectedDeliveryDate,
    shippingAddress,
    partyMobile,
    partyEmail,
    orderNo,
  } = props;

  switch (activeTab) {
    case "approvals":
      if (!config.approvalsMode) return null;
      return (
        <ApprovalsTab
          portal={config.approvalsMode}
          orderId={orderId}
          detail={detail}
          status={status}
          readOnlyItems={adminReadOnlyItems ?? orderItems}
          refetchOrder={refetchOrder}
          partyLabel={partyLabel}
        />
      );

    case "dispatches":
      return (
        <DispatchesTab
          mode={
            config.dispatchesMode === "account_create"
              ? "account"
              : config.dispatchesMode
          }
          orderId={orderId}
          detail={detail}
          refetchOrder={refetchOrder}
          partyLabel={partyLabel}
          isAssignedToMe={isAssignedToMe}
          dispatches={dispatches}
          transports={transports}
          isFetching={dispatchesFetching}
          isPatchingDispatch={isPatchingDispatch}
          onUpdateStatus={onUpdateDispatchStatus}
          formatDate={formatDate}
          userNameById={userNameById}
          orderItems={orderItems}
          orderStatus={status}
          expectedDeliveryDate={expectedDeliveryDate}
          shippingAddress={shippingAddress}
          onRefetch={refetchOrder}
        />
      );

    case "transports":
      return (
        <TransportsTab
          mode={config.transportsMode}
          orderId={orderId}
          detail={detail}
          refetchOrder={refetchOrder}
          transports={transports}
          isFetching={transportsFetching}
          isPatchingTransport={isPatchingTransport}
          onUpdateStatus={onUpdateTransportStatus}
          formatDate={formatDate}
          onRefetch={refetchOrder}
          dispatches={dispatches}
          orderItems={orderItems}
        />
      );

    case "deliveries":
      return (
        <DeliveriesTab
          orderId={orderId}
          detail={detail}
          refetchOrder={refetchOrder}
        />
      );

    case "returns":
      if (!config.returnsMode) return null;
      if (config.returnsMode === "dispatch_create") {
        return (
          <ReturnsTab
            mode="dispatch"
            orderId={orderId}
            returns={returns}
            isFetching={returnsFetching}
            formatDate={formatDate}
            orderItems={orderItems}
            userNameById={userNameById}
            onRefetch={refetchOrder}
          />
        );
      }
      if (config.returnsMode === "readonly") {
        return (
          <ReturnsTab mode="readonly" orderId={orderId} detail={detail} />
        );
      }
      return (
        <ReturnsTab mode="account" orderId={orderId} detail={detail} />
      );

    case "flags":
      return (
        <OrderDepartmentFlagsTab
          orderId={orderId}
          flagsQ={flagsQ}
          rawFlags={rawFlags}
          formatDate={formatDate}
          userNameById={userNameById}
          currentDepartment={config.flagDepartment}
          refetchOrder={refetchOrder}
        />
      );

    case "attachments":
      return (
        <AttachmentsTab
          orderId={orderId}
          attachments={attachments}
          isLoading={attachmentsLoading}
          onUploadSuccess={refetchOrder}
          visibility={config.attachmentVisibility}
        />
      );

    case "reminders":
      return <RemindersTab orderId={orderId} />;

    case "due_sheet":
      return <DueSheetTab orderId={orderId} onUploadSuccess={refetchOrder} />;

    case "communication":
      return (
        <CommunicationTab
          orderId={orderId}
          orderNo={orderNo ?? ""}
          partyLabel={partyLabel}
          partyMobile={partyMobile}
          partyEmail={partyEmail}
        />
      );

    default:
      return null;
  }
}
