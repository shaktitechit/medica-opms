import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";
import type { MessageChannel, MessageRecord } from "./messagesApi";

export type SendMessageBody = {
  order?: string;
  recipient: string;
  channel: MessageChannel;
  subject?: string;
  body?: string;
  templateName?: string;
  templateParams?: Record<string, unknown>;
};

export type SendOrderReceivedBody = {
  order: string;
  recipient?: string | string[];
  contact_number?: string | string[];
  whatsapp_number?: string | string[];
  contact_name?: string | string[];
  /** Optional client-loaded order details used for template body params */
  order_no?: string;
  /** Template {{3}} — newline-separated "Product × qty" lines */
  items_summary?: string;
  language_code?: string;
  template_name?: string;
};

export type OrderReceivedQueueResult = {
  order: {
    id: string;
    order_no: string;
    items_summary: string;
    template_vars?: { "1": string; "2": string; "3": string };
  };
  queued: MessageRecord[];
  failed: Array<{ recipient: string; error: string }>;
};

/** `/api/communication` — typed outbound message queues. */
export const communicationApi = medicaApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    sendMessage: build.mutation<MessageRecord, SendMessageBody>({
      query: (body) => ({ url: "communication/send", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<MessageRecord>) =>
        unwrapEnvelope(raw) as MessageRecord,
      invalidatesTags: [{ type: "Messages", id: "LIST" }],
    }),
    sendOrderReceivedMessage: build.mutation<
      OrderReceivedQueueResult,
      SendOrderReceivedBody
    >({
      query: (body) => ({
        url: "communication/order-received",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<OrderReceivedQueueResult>) =>
        unwrapEnvelope(raw) as OrderReceivedQueueResult,
      invalidatesTags: [{ type: "Messages", id: "LIST" }],
    }),
  }),
});

export const {
  useSendMessageMutation,
  useSendOrderReceivedMessageMutation,
} = communicationApi;
