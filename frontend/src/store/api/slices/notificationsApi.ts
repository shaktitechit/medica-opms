import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** `/api/notifications` — list + mark read. */
export const notificationsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listNotifications: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "notifications",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Notifications", id: "LIST" }],
    }),
    markNotificationRead: build.mutation<unknown, string>({
      query: (id) => ({
        url: `notifications/${id}/read`,
        method: "PATCH",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: [
        { type: "Notifications", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListNotificationsQuery,
  useLazyListNotificationsQuery,
  useMarkNotificationReadMutation,
} = notificationsApi;
