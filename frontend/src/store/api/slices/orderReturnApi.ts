import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export const orderReturnApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listOrderReturns: build.query<unknown, Record<string, any> | void>({
      query: (params) => ({
        url: "order-returns",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Order", id: "RETURN_LIST" }],
    }),
    createOrderReturn: build.mutation<any, Record<string, any>>({
      query: (body) => ({
        url: "order-returns",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: ["Order", "Orders", "Transport"],
    }),
    patchOrderReturn: build.mutation<any, { id: string; patch: Record<string, any> }>({
      query: ({ id, patch }) => ({
        url: `order-returns/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: ["Order", "Orders", "Transport"],
    }),
  }),
});

export const {
  useListOrderReturnsQuery,
  useCreateOrderReturnMutation,
  usePatchOrderReturnMutation,
} = orderReturnApi;
