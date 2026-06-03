import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** `/api/approvals` — optional `order` query. */
export const approvalsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listApprovals: build.query<unknown, { order?: string } | void>({
      query: (arg) => ({
        url: "approvals",
        params:
          arg?.order !== undefined ? { order: arg.order } : {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Approvals", id: "LIST" }],
    }),
  }),
});

export const { useListApprovalsQuery, useLazyListApprovalsQuery } = approvalsApi;
