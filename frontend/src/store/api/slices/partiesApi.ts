import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** Common write fields for create/patch/bulk party payloads. */
export type PartyWriteBody = {
  party_type?: string;
  party_name?: string;
  contact_person?: string;
  mobile?: string;
  email?: string;
  contacts?: unknown[];
  gst_no?: string;
  drug_license_no?: string;
  billing_address?: Record<string, unknown>;
  shipping_address?: Record<string, unknown>;
  district?: string;
  state?: string;
  payment_terms?: string;
  is_active?: boolean;
  is_featured?: boolean;
  sra?: boolean;
  sra_from_date?: string | null;
  sra_to_date?: string | null;
  [key: string]: unknown;
};

export type PartyListParams = {
  search?: string;
  type?: string;
  status?: string;
  /** Filter featured parties: `"true"` | `"false"` | `"all"` */
  is_featured?: string;
  paginate?: string;
  page?: string;
  limit?: string;
  [key: string]: string | undefined;
};

/** `/api/parties` — soft-delete + restore via RBAC. */
export const partiesApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listParties: build.query<unknown, PartyListParams | void>({
      query: (params) => ({
        url: "parties",
        params: { status: "all", ...params },
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Parties", id: "LIST" }],
    }),
    listPartiesDeleted: build.query<unknown, PartyListParams | void>({
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
    createParty: build.mutation<unknown, PartyWriteBody>({
      query: (body) => ({ url: "parties", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Parties"],
    }),
    patchParty: build.mutation<
      unknown,
      { id: string; patch: PartyWriteBody }
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
    bulkCreateParty: build.mutation<unknown, PartyWriteBody[]>({
      query: (body) => ({ url: "parties/bulk", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Parties"],
    }),
    bulkDeleteParties: build.mutation<unknown, string[]>({
      query: (ids) => ({
        url: "parties/bulk-delete",
        method: "POST",
        body: { ids },
      }),
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
  useBulkDeletePartiesMutation,
} = partiesApi;
