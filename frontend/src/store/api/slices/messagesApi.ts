import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type MessageChannel = "email" | "whatsapp";
export type MessageStatus = "pending" | "queued" | "sending" | "sent" | "failed";

export type MessageRecord = {
  _id?: string;
  id?: string;
  order?: string;
  recipient: string;
  channel: MessageChannel;
  status: MessageStatus;
  subject?: string;
  body?: string;
  templateName?: string;
  templateParams?: Record<string, unknown>;
  error?: string;
  attempts?: number;
  sentAt?: string;
  failedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type MessageListResult = {
  items: MessageRecord[];
  total: number;
  page: number;
  pages: number;
  limit: number;
};

/** `/api/messages` — message log list / detail. */
export const messagesApi = medicaApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    listMessages: build.query<
      MessageListResult,
      {
        order?: string;
        recipient?: string;
        channel?: string;
        status?: string;
        page?: string;
        limit?: string;
      } | void
    >({
      query: (params) => ({
        url: "messages",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<MessageRecord[]> & {
        total?: number;
        page?: number;
        pages?: number;
        limit?: number;
      }) => ({
        items: (unwrapEnvelope(raw) as MessageRecord[]) ?? [],
        total: Number(raw.total ?? 0),
        page: Number(raw.page ?? 1),
        pages: Number(raw.pages ?? 1),
        limit: Number(raw.limit ?? 20),
      }),
      providesTags: [{ type: "Messages", id: "LIST" }],
    }),
    getMessage: build.query<MessageRecord, string>({
      query: (id) => `messages/${id}`,
      transformResponse: (raw: ApiEnvelope<MessageRecord>) =>
        unwrapEnvelope(raw) as MessageRecord,
      providesTags: (_r, _e, id) => [{ type: "Messages", id }],
    }),
  }),
});

export const {
  useListMessagesQuery,
  useLazyListMessagesQuery,
  useGetMessageQuery,
} = messagesApi;
