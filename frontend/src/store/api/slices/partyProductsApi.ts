import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** `/api/party-products` — manage party product mappings and rates. */
export const partyProductsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listPartyProducts: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "party-products",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "PartyProducts", id: "LIST" }],
    }),
    listPartyProductsDeleted: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "party-products/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "PartyProducts", id: "DELETED" }],
    }),
    getPartyProduct: build.query<unknown, string>({
      query: (id) => `party-products/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "PartyProducts", id }],
    }),
    createPartyProduct: build.mutation<unknown, Record<string, unknown>>({
      query: (body) => ({ url: "party-products", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["PartyProducts"],
    }),
    patchPartyProduct: build.mutation<
      unknown,
      { id: string; patch: Record<string, unknown> }
    >({
      query: ({ id, patch }) => ({
        url: `party-products/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "PartyProducts",
        { type: "PartyProducts", id: arg.id },
      ],
    }),
    deletePartyProduct: build.mutation<unknown, string>({
      query: (id) => ({ url: `party-products/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "PartyProducts",
        { type: "PartyProducts", id },
        { type: "PartyProducts", id: "LIST" },
        { type: "PartyProducts", id: "DELETED" },
      ],
    }),
    restorePartyProduct: build.mutation<unknown, string>({
      query: (id) => ({ url: `party-products/${id}/restore`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "PartyProducts",
        { type: "PartyProducts", id },
        { type: "PartyProducts", id: "LIST" },
        { type: "PartyProducts", id: "DELETED" },
      ],
    }),
    addPartyProductRate: build.mutation<
      unknown,
      { id: string; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({
        url: `party-products/${id}/rates`,
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: () => ["PartyProducts"],
    }),
    updatePartyProductRate: build.mutation<
      unknown,
      { rateId: string; patch: Record<string, unknown> }
    >({
      query: ({ rateId, patch }) => ({
        url: `party-products/rates/${rateId}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["PartyProducts"],
    }),
    deletePartyProductRate: build.mutation<unknown, string>({
      query: (rateId) => ({
        url: `party-products/rates/${rateId}`,
        method: "DELETE",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["PartyProducts"],
    }),
    approvePartyProductRate: build.mutation<unknown, string>({
      query: (rateId) => ({
        url: `party-products/rates/${rateId}/approve`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["PartyProducts"],
    }),
  }),
});

export const {
  useListPartyProductsQuery,
  useLazyListPartyProductsQuery,
  useListPartyProductsDeletedQuery,
  useLazyListPartyProductsDeletedQuery,
  useGetPartyProductQuery,
  useLazyGetPartyProductQuery,
  useCreatePartyProductMutation,
  usePatchPartyProductMutation,
  useDeletePartyProductMutation,
  useRestorePartyProductMutation,
  useAddPartyProductRateMutation,
  useUpdatePartyProductRateMutation,
  useDeletePartyProductRateMutation,
  useApprovePartyProductRateMutation,
} = partyProductsApi;
