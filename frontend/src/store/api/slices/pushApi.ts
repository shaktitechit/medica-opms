import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";
import type { BrowserPushSubscriptionJSON } from "@/lib/push";

export type PushSubscriptionRecord = {
  _id: string;
  user: string;
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  createdAt?: string;
  updatedAt?: string;
};

/** `/api/subscribe` + `/api/push/*` — browser Web Push subscriptions. */
export const pushApi = medicaApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    getVapidPublicKey: build.query<{ publicKey: string }, void>({
      query: () => ({ url: "push/vapid-public-key" }),
      transformResponse: (raw: ApiEnvelope<{ publicKey: string }>) =>
        unwrapEnvelope(raw) as { publicKey: string },
    }),
    subscribePush: build.mutation<PushSubscriptionRecord, BrowserPushSubscriptionJSON>({
      query: (body) => ({
        url: "subscribe",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<PushSubscriptionRecord>) =>
        unwrapEnvelope(raw) as PushSubscriptionRecord,
    }),
    unsubscribePush: build.mutation<{ deleted: boolean }, { endpoint: string }>({
      query: (body) => ({
        url: "subscribe",
        method: "DELETE",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<{ deleted: boolean }>) =>
        unwrapEnvelope(raw) as { deleted: boolean },
    }),
    notifyPush: build.mutation<
      { sent: number; failed?: number; skipped?: boolean },
      { title: string; body?: string; url?: string; data?: Record<string, unknown> }
    >({
      query: (body) => ({
        url: "push/notify",
        method: "POST",
        body,
      }),
      transformResponse: (
        raw: ApiEnvelope<{ sent: number; failed?: number; skipped?: boolean }>
      ) =>
        unwrapEnvelope(raw) as {
          sent: number;
          failed?: number;
          skipped?: boolean;
        },
    }),
  }),
});

export const {
  useGetVapidPublicKeyQuery,
  useLazyGetVapidPublicKeyQuery,
  useSubscribePushMutation,
  useUnsubscribePushMutation,
  useNotifyPushMutation,
} = pushApi;
