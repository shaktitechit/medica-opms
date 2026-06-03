import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** `/api/activity` — `GET /` list. */
export const activityApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listActivity: build.query<unknown, Record<string, string | undefined> | void>(
      {
        query: (params) => ({
          url: "activity",
          params: params ?? {},
        }),
        transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
        providesTags: [{ type: "Activity", id: "LIST" }],
      },
    ),
  }),
});

export const { useListActivityQuery, useLazyListActivityQuery } = activityApi;
