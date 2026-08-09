"use client";

import { useMemo } from "react";
import {
  useListAttachmentsQuery,
} from "@/store/api";
import SharedAttachmentsTab from "@/components/portal/shared/orderDetail/tabs/AttachmentsTab";
import {
  countDispatchVisibleAttachments,
  pickOrderAttachments,
} from "@/components/portal/shared/orderDetail/orderDetailUtils";

export {
  countDispatchVisibleAttachments,
  pickOrderAttachments,
} from "@/components/portal/shared/orderDetail/orderDetailUtils";

type AttachmentsTabProps = {
  orderId: string;
  onUploadSuccess?: () => void;
};

/** Dispatch portal attachments: self-fetches and applies dispatch visibility filter. */
export default function AttachmentsTab({
  orderId,
  onUploadSuccess,
}: AttachmentsTabProps) {
  const attachmentsQ = useListAttachmentsQuery({
    entity_type: "order",
    entity_id: orderId,
  });
  const attachments = useMemo(
    () => pickOrderAttachments(attachmentsQ.data, orderId),
    [attachmentsQ.data, orderId],
  );

  return (
    <SharedAttachmentsTab
      orderId={orderId}
      attachments={attachments}
      isLoading={attachmentsQ.isFetching}
      onUploadSuccess={onUploadSuccess}
      visibility="dispatch_filtered"
    />
  );
}
