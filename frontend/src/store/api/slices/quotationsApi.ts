/**
 * @fileoverview RTK Query API slice for Quotations module (/api/quotations).
 * @module store/api/slices/quotationsApi
 */
import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";
import type {
  QuotationStatus,
  LeadQuotationItem,
  LeadQuotationRecord,
  CreateQuotationPayload,
  UpdateQuotationPayload,
} from "./leadQuotationsApi";

export type QuotationItem = LeadQuotationItem;
export type QuotationRecord = LeadQuotationRecord;

export type ListQuotationsQueryParams = {
  lead?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type ListQuotationsResponse = {
  quotations: QuotationRecord[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export const quotationsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listQuotations: build.query<QuotationRecord[], ListQuotationsQueryParams | void>({
      query: (params) => ({
        url: "/quotations",
        method: "GET",
        params: params || undefined,
      }),
      transformResponse: (raw: ApiEnvelope<QuotationRecord[]>) =>
        unwrapEnvelope(raw) ?? [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ _id }) => ({ type: "Quotation" as const, id: _id })),
              { type: "Quotation", id: "LIST" },
            ]
          : [{ type: "Quotation", id: "LIST" }],
    }),

    getQuotation: build.query<QuotationRecord, string>({
      query: (quotationId) => ({
        url: `/quotations/${quotationId}`,
        method: "GET",
      }),
      transformResponse: (raw: ApiEnvelope<QuotationRecord>) =>
        unwrapEnvelope(raw) as QuotationRecord,
      providesTags: (_res, _err, id) => [{ type: "Quotation", id }],
    }),

    createQuotation: build.mutation<QuotationRecord, CreateQuotationPayload & { lead?: string }>({
      query: (body) => ({
        url: "/quotations",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<QuotationRecord>) =>
        unwrapEnvelope(raw) as QuotationRecord,
      invalidatesTags: (_res, _err, payload) => [
        { type: "Quotation", id: "LIST" },
        { type: "LeadQuotation", id: `LEAD_${payload.lead}` },
        ...(payload.lead ? [{ type: "Lead" as const, id: payload.lead }] : []),
        { type: "Lead", id: "LIST" },
        "Activity",
      ],
    }),

    updateQuotation: build.mutation<
      QuotationRecord,
      { quotationId: string; body: UpdateQuotationPayload & { lead?: string } }
    >({
      query: ({ quotationId, body }) => ({
        url: `/quotations/${quotationId}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<QuotationRecord>) =>
        unwrapEnvelope(raw) as QuotationRecord,
      invalidatesTags: (_res, _err, { quotationId, body }) => [
        { type: "Quotation", id: quotationId },
        { type: "Quotation", id: "LIST" },
        { type: "LeadQuotation", id: quotationId },
        ...(body.lead ? [{ type: "Lead" as const, id: body.lead }] : []),
        "Activity",
      ],
    }),

    submitQuotationForApproval: build.mutation<QuotationRecord, { quotationId: string }>({
      query: ({ quotationId }) => ({
        url: `/quotations/${quotationId}/submit-for-approval`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<QuotationRecord>) =>
        unwrapEnvelope(raw) as QuotationRecord,
      invalidatesTags: (_res, _err, { quotationId }) => [
        { type: "Quotation", id: quotationId },
        { type: "Quotation", id: "LIST" },
        { type: "LeadQuotation", id: quotationId },
        "Activity",
      ],
    }),

    approveQuotation: build.mutation<QuotationRecord, { quotationId: string }>({
      query: ({ quotationId }) => ({
        url: `/quotations/${quotationId}/approve`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<QuotationRecord>) =>
        unwrapEnvelope(raw) as QuotationRecord,
      invalidatesTags: (_res, _err, { quotationId }) => [
        { type: "Quotation", id: quotationId },
        { type: "Quotation", id: "LIST" },
        { type: "LeadQuotation", id: quotationId },
        "Activity",
      ],
    }),

    rejectQuotation: build.mutation<
      QuotationRecord,
      { quotationId: string; reason?: string; rejection_reason?: string }
    >({
      query: ({ quotationId, reason, rejection_reason }) => ({
        url: `/quotations/${quotationId}/reject`,
        method: "POST",
        body: { reason: reason || rejection_reason },
      }),
      transformResponse: (raw: ApiEnvelope<QuotationRecord>) =>
        unwrapEnvelope(raw) as QuotationRecord,
      invalidatesTags: (_res, _err, { quotationId }) => [
        { type: "Quotation", id: quotationId },
        { type: "Quotation", id: "LIST" },
        { type: "LeadQuotation", id: quotationId },
        "Activity",
      ],
    }),

    getDefaultQuotationTerms: build.query<string[], void>({
      query: () => ({
        url: "/quotations/default-terms",
        method: "GET",
      }),
      transformResponse: (raw: ApiEnvelope<string[]>) =>
        (unwrapEnvelope(raw) as string[]) || [],
      providesTags: ["CompanyInfo"],
    }),

    deleteQuotation: build.mutation<
      { success: boolean },
      { quotationId: string; leadId?: string }
    >({
      query: ({ quotationId }) => ({
        url: `/quotations/${quotationId}`,
        method: "DELETE",
      }),
      transformResponse: (raw: ApiEnvelope<{ success: boolean }>) =>
        unwrapEnvelope(raw) as { success: boolean },
      invalidatesTags: (_res, _err, { quotationId, leadId }) => [
        { type: "Quotation", id: quotationId },
        { type: "Quotation", id: "LIST" },
        { type: "LeadQuotation", id: quotationId },
        ...(leadId ? [{ type: "Lead" as const, id: leadId }] : []),
        "Activity",
      ],
    }),
  }),
});

export const {
  useListQuotationsQuery,
  useGetQuotationQuery,
  useCreateQuotationMutation,
  useUpdateQuotationMutation,
  useSubmitQuotationForApprovalMutation,
  useApproveQuotationMutation,
  useRejectQuotationMutation,
  useDeleteQuotationMutation,
  useGetDefaultQuotationTermsQuery: useGetDefaultQuotationTermsNewQuery,
} = quotationsApi;
