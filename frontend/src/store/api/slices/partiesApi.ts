import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** `/api/parties` — soft-delete + restore via RBAC. */
export const partiesApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listParties: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "parties",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Parties", id: "LIST" }],
    }),
    listPartiesDeleted: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "parties/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Parties", id: "DELETED" }],
    }),
    getParty: build.query<unknown, string>({
      query: (id) => `parties/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "Parties", id }],
    }),
    createParty: build.mutation<unknown, Record<string, unknown>>({
      query: (body) => ({ url: "parties", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Parties"],
    }),
    patchParty: build.mutation<
      unknown,
      { id: string; patch: Record<string, unknown> }
    >({
      query: ({ id, patch }) => ({
        url: `parties/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "Parties",
        { type: "Parties", id: arg.id },
      ],
    }),
    deleteParty: build.mutation<unknown, string>({
      query: (id) => ({ url: `parties/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Parties",
        { type: "Parties", id },
        { type: "Parties", id: "LIST" },
        { type: "Parties", id: "DELETED" },
      ],
    }),
    restoreParty: build.mutation<unknown, string>({
      query: (id) => ({ url: `parties/${id}/restore`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Parties",
        { type: "Parties", id },
        { type: "Parties", id: "LIST" },
        { type: "Parties", id: "DELETED" },
      ],
    }),
    bulkCreateParty: build.mutation<unknown, Record<string, unknown>[]>({
      query: (body) => ({ url: "parties/bulk", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Parties"],
    }),
  }),
});

export const {
  useListPartiesQuery,
  useLazyListPartiesQuery,
  useListPartiesDeletedQuery,
  useLazyListPartiesDeletedQuery,
  useGetPartyQuery,
  useLazyGetPartyQuery,
  useCreatePartyMutation,
  usePatchPartyMutation,
  useDeletePartyMutation,
  useRestorePartyMutation,
  useBulkCreatePartyMutation,
} = partiesApi;

