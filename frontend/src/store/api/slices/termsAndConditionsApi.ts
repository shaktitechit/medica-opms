/**
 * @fileoverview RTK Query API slice for Terms and Conditions & Terms Text management.
 * @module store/api/slices/termsAndConditionsApi
 */
import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type TermsTextRecord = {
  _id: string;
  id?: string;
  terms_and_conditions_id: string;
  text: string;
  sequence: number;
  is_active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type TermsAndConditionsRecord = {
  _id: string;
  id?: string;
  title: string;
  code?: string;
  type: "quotation" | "order" | "invoice" | "general";
  description?: string;
  is_active: boolean;
  is_default: boolean;
  terms_text: TermsTextRecord[];
  created_by?: string | { _id: string; name?: string; email?: string };
  createdAt?: string;
  updatedAt?: string;
};

export type CreateTermsAndConditionsPayload = {
  title: string;
  code?: string;
  type?: "quotation" | "order" | "invoice" | "general";
  description?: string;
  is_active?: boolean;
  is_default?: boolean;
  terms_text?: Array<string | { text: string; sequence?: number; is_active?: boolean }>;
};

export type ListTermsAndConditionsResponse = {
  terms_and_conditions: TermsAndConditionsRecord[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export const termsAndConditionsApi = medicaApi.injectEndpoints({
  overrideExisting: false,
  endpoints: (build) => ({
    listTermsAndConditions: build.query<
      ListTermsAndConditionsResponse,
      { type?: string; search?: string; page?: number; limit?: number; is_active?: boolean } | void
    >({
      query: (params) => ({
        url: "/terms-and-conditions",
        params: params || undefined,
      }),
      providesTags: ["TermsAndConditions"],
    }),

    getTermsAndConditionsById: build.query<TermsAndConditionsRecord, string>({
      query: (id) => `/terms-and-conditions/${id}`,
      transformResponse: (res: ApiEnvelope<TermsAndConditionsRecord>) => unwrapEnvelope(res),
      providesTags: (_result, _err, id) => [{ type: "TermsAndConditions", id }],
    }),

    getDefaultTermsAndConditions: build.query<TermsAndConditionsRecord | null, string | void>({
      query: (type) => ({
        url: "/terms-and-conditions/default",
        params: { type: type || "quotation" },
      }),
      transformResponse: (res: ApiEnvelope<TermsAndConditionsRecord | null>) => unwrapEnvelope(res),
      providesTags: ["TermsAndConditions"],
    }),

    createTermsAndConditions: build.mutation<TermsAndConditionsRecord, CreateTermsAndConditionsPayload>({
      query: (body) => ({
        url: "/terms-and-conditions",
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiEnvelope<TermsAndConditionsRecord>) => unwrapEnvelope(res),
      invalidatesTags: ["TermsAndConditions"],
    }),

    updateTermsAndConditions: build.mutation<
      TermsAndConditionsRecord,
      { id: string; body: Partial<CreateTermsAndConditionsPayload> }
    >({
      query: ({ id, body }) => ({
        url: `/terms-and-conditions/${id}`,
        method: "PUT",
        body,
      }),
      transformResponse: (res: ApiEnvelope<TermsAndConditionsRecord>) => unwrapEnvelope(res),
      invalidatesTags: ["TermsAndConditions"],
    }),

    deleteTermsAndConditions: build.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/terms-and-conditions/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["TermsAndConditions"],
    }),

    addTermsText: build.mutation<
      TermsTextRecord,
      { termsAndConditionsId: string; body: { text: string; sequence?: number; is_active?: boolean } }
    >({
      query: ({ termsAndConditionsId, body }) => ({
        url: `/terms-and-conditions/${termsAndConditionsId}/text`,
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiEnvelope<TermsTextRecord>) => unwrapEnvelope(res),
      invalidatesTags: ["TermsAndConditions"],
    }),

    updateTermsText: build.mutation<
      TermsTextRecord,
      { textId: string; body: { text?: string; sequence?: number; is_active?: boolean } }
    >({
      query: ({ textId, body }) => ({
        url: `/terms-and-conditions/text/${textId}`,
        method: "PUT",
        body,
      }),
      transformResponse: (res: ApiEnvelope<TermsTextRecord>) => unwrapEnvelope(res),
      invalidatesTags: ["TermsAndConditions"],
    }),

    deleteTermsText: build.mutation<{ message: string }, string>({
      query: (textId) => ({
        url: `/terms-and-conditions/text/${textId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["TermsAndConditions"],
    }),
  }),
});

export const {
  useListTermsAndConditionsQuery,
  useGetTermsAndConditionsByIdQuery,
  useGetDefaultTermsAndConditionsQuery,
  useCreateTermsAndConditionsMutation,
  useUpdateTermsAndConditionsMutation,
  useDeleteTermsAndConditionsMutation,
  useAddTermsTextMutation,
  useUpdateTermsTextMutation,
  useDeleteTermsTextMutation,
} = termsAndConditionsApi;
