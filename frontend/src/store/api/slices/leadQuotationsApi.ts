/**
 * @fileoverview RTK Query API slice for Lead Quotations.
 * @module store/api/slices/leadQuotationsApi
 */
import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export type LeadQuotationItem = {
  _id?: string;
  product?: string;
  product_name: string;
  description?: string;
  hsn_code?: string;
  quantity: number;
  unit?: string;
  rate: number;
  taxable_amount: number;
  gst_rate: number;
  cgst_rate?: number;
  cgst_amount?: number;
  sgst_rate?: number;
  sgst_amount?: number;
  igst_rate?: number;
  igst_amount?: number;
  total_gst_amount: number;
  line_total: number;
};

export type LeadQuotationRecord = {
  _id: string;
  quotation_no: string;
  ref_no?: string;
  lead: string | { _id: string; lead_no?: string; organization_name?: string };
  party_id?: string;
  quotation_date: string;
  valid_until?: string;
  validity_days?: number;
  subject?: string;
  customer_name?: string;
  kind_attn?: string;
  phone?: string;
  cell?: string;
  email?: string;
  gstin?: string;
  address?: {
    address_line_1?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
  items: LeadQuotationItem[];
  subtotal: number;
  total_gst: number;
  round_off?: number;
  grand_total: number;
  amount_in_words?: string;
  terms_and_conditions?: string[];
  company_name?: string;
  company_regd_address?: string;
  company_phone?: string;
  company_email?: string;
  company_gstin?: string;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  ifsc_code?: string;
  branch_name?: string;
  account_type?: string;
  signatory_name?: string;
  signatory_phone?: string;
  signatory_email?: string;
  signatory_designation?: string;
  status: QuotationStatus;
  created_by?: {
    _id: string;
    name?: string;
    email?: string;
    department?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type CreateQuotationPayload = {
  quotation_no?: string;
  ref_no?: string;
  quotation_date?: string;
  valid_until?: string;
  validity_days?: number;
  subject?: string;
  customer_name?: string;
  kind_attn?: string;
  phone?: string;
  cell?: string;
  email?: string;
  gstin?: string;
  address?: {
    address_line_1?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
  items: Array<{
    product?: string;
    product_name: string;
    description?: string;
    hsn_code?: string;
    quantity: number;
    unit?: string;
    rate: number;
    gst_rate: number;
    igst_rate?: number;
  }>;
  terms_and_conditions?: string[];
  company_name?: string;
  company_regd_address?: string;
  company_phone?: string;
  company_email?: string;
  company_gstin?: string;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  ifsc_code?: string;
  branch_name?: string;
  account_type?: string;
  signatory_name?: string;
  signatory_phone?: string;
  signatory_email?: string;
  signatory_designation?: string;
  status?: QuotationStatus;
};

export type UpdateQuotationPayload = Partial<CreateQuotationPayload>;

export const leadQuotationsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listLeadQuotations: build.query<LeadQuotationRecord[], string>({
      query: (leadId) => ({
        url: `/leads/${leadId}/quotations`,
        method: "GET",
      }),
      transformResponse: (raw: ApiEnvelope<LeadQuotationRecord[]>) =>
        unwrapEnvelope(raw) ?? [],
      providesTags: (_res, _err, leadId) => [
        { type: "LeadQuotation", id: `LEAD_${leadId}` },
      ],
    }),

    getLeadQuotation: build.query<LeadQuotationRecord, string>({
      query: (quotationId) => ({
        url: `/leads/quotations/${quotationId}`,
        method: "GET",
      }),
      transformResponse: (raw: ApiEnvelope<LeadQuotationRecord>) =>
        unwrapEnvelope(raw) as LeadQuotationRecord,
      providesTags: (_res, _err, id) => [{ type: "LeadQuotation", id }],
    }),

    createLeadQuotation: build.mutation<
      LeadQuotationRecord,
      { leadId: string; body: CreateQuotationPayload }
    >({
      query: ({ leadId, body }) => ({
        url: `/leads/${leadId}/quotations`,
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<LeadQuotationRecord>) =>
        unwrapEnvelope(raw) as LeadQuotationRecord,
      invalidatesTags: (_res, _err, { leadId }) => [
        { type: "LeadQuotation", id: `LEAD_${leadId}` },
        { type: "Lead", id: leadId },
        { type: "Lead", id: "LIST" },
        "Activity",
      ],
    }),

    updateLeadQuotation: build.mutation<
      LeadQuotationRecord,
      { quotationId: string; leadId?: string; body: UpdateQuotationPayload }
    >({
      query: ({ quotationId, body }) => ({
        url: `/leads/quotations/${quotationId}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<LeadQuotationRecord>) =>
        unwrapEnvelope(raw) as LeadQuotationRecord,
      invalidatesTags: (_res, _err, { quotationId, leadId }) => [
        { type: "LeadQuotation", id: quotationId },
        ...(leadId ? [{ type: "LeadQuotation" as const, id: `LEAD_${leadId}` }] : []),
        ...(leadId ? [{ type: "Lead" as const, id: leadId }] : []),
        ...(leadId ? [{ type: "Lead" as const, id: "LIST" }] : []),
        "Activity",
      ],
    }),

    getDefaultQuotationTerms: build.query<string[], void>({
      query: () => ({
        url: "/leads/quotations/default-terms",
        method: "GET",
      }),
      transformResponse: (raw: ApiEnvelope<string[]>) =>
        (unwrapEnvelope(raw) as string[]) || [],
      providesTags: ["CompanyInfo"],
    }),

    deleteLeadQuotation: build.mutation<
      { success: boolean },
      { quotationId: string; leadId: string }
    >({
      query: ({ quotationId }) => ({
        url: `/leads/quotations/${quotationId}`,
        method: "DELETE",
      }),
      transformResponse: (raw: ApiEnvelope<{ success: boolean }>) =>
        unwrapEnvelope(raw) as { success: boolean },
      invalidatesTags: (_res, _err, { quotationId, leadId }) => [
        { type: "LeadQuotation", id: quotationId },
        { type: "LeadQuotation", id: `LEAD_${leadId}` },
        { type: "Lead", id: leadId },
        "Activity",
      ],
    }),
  }),
});

export const {
  useListLeadQuotationsQuery,
  useGetLeadQuotationQuery,
  useGetDefaultQuotationTermsQuery,
  useCreateLeadQuotationMutation,
  useUpdateLeadQuotationMutation,
  useDeleteLeadQuotationMutation,
} = leadQuotationsApi;
