/**
 * @fileoverview RTK Query API slice for Lead Management.
 * @module store/api/slices/leadsApi
 */
import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type LeadStatus =
  | "new"
  | "follow_up"
  | "quotation"
  | "won"
  | "lost"
  | "converted";

export type LeadPriority = "low" | "medium" | "high" | "urgent";

export type LeadFollowUpType =
  | "call"
  | "meeting"
  | "email"
  | "whatsapp"
  | "visit"
  | "demo"
  | "other";

export type LeadFollowUpStatus = "pending" | "completed" | "cancelled" | "rescheduled";

export type LeadProductItem = {
  _id?: string;
  product?: {
    _id: string;
    product_name: string;
    sku?: string;
    base_price?: number;
    unit?: string;
  } | string;
  product_name: string;
  quantity: number;
  target_price: number;
  unit?: string;
  remarks?: string;
};

export type LeadContactItem = {
  _id?: string;
  id?: string;
  name: string;
  department?: string;
  designation?: string;
  phone?: string;
  email?: string;
  alternate_phone?: string;
  is_primary?: boolean;
};

export type LeadAddress = {
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
};

export type LeadQualification = {
  requirement_confirmed?: boolean;
  budget_available?: boolean;
  decision_maker_known?: boolean;
  purchase_timeline?: string;
  competition?: string;
  qualification_notes?: string;
  qualified_at?: string;
  qualified_by?: { _id: string; name: string; email: string };
};

export type LeadLostInfo = {
  lost_reason?: string;
  lost_reason_id?: { _id: string; name: string; code?: string };
  lost_remarks?: string;
  lost_at?: string;
  lost_by?: { _id: string; name: string };
};

export type LeadConversion = {
  converted_at?: string;
  converted_by?: { _id: string; name: string };
  conversion_type?: "existing_customer" | "new_customer" | "quotation" | "order";
  party_id?: { _id: string; party_name: string; mobile?: string; email?: string } | string;
  order_id?: { _id: string; order_no: string; grand_total?: number; status?: string } | string;
  quotation_id?: string;
  notes?: string;
};

export type LeadRecord = {
  _id: string;
  id?: string;
  company_id?: string;
  lead_no: string;
  name: string;
  company_name?: string;
  email?: string;
  phone?: string;
  alternate_phone?: string;
  contacts?: LeadContactItem[];
  industry?: string;
  designation?: string;
  billing_address?: LeadAddress;
  requirement?: string;
  estimated_value?: number;
  expected_closing_date?: string;
  source: string;
  source_id?: { _id: string; name: string };
  status: LeadStatus;
  priority: LeadPriority;
  assigned_to?: { _id: string; name: string; email: string; phone?: string; department?: string };
  assigned_by?: { _id: string; name: string; email: string };
  assigned_at?: string;
  party_id?: {
    _id: string;
    party_name: string;
    mobile?: string;
    email?: string;
    district?: string;
    state?: string;
    billing_address?: LeadAddress;
  };
  contact_person_id?: string;
  products?: LeadProductItem[];
  notes?: string;
  tags?: string[];
  qualification?: LeadQualification;
  lost_info?: LeadLostInfo;
  conversion?: LeadConversion;
  last_contacted_at?: string;
  next_follow_up_at?: string;
  last_activity_at?: string;
  created_by?: { _id: string; name: string; email: string };
  createdAt?: string;
  updatedAt?: string;
};

export type LeadInputPayload = Omit<
  Partial<LeadRecord>,
  "assigned_to" | "source_id" | "party_id" | "contact_person_id"
> & {
  assigned_to?: string | { _id: string; name?: string; email?: string; phone?: string; department?: string };
  source_id?: string | { _id: string; name?: string };
  party_id?: string | { _id: string; party_name?: string };
  contact_person_id?: string;
  contacts?: LeadContactItem[];
};

export type LeadFollowUpRecord = {
  _id: string;
  id?: string;
  lead: {
    _id: string;
    lead_no: string;
    name: string;
    company_name?: string;
    phone?: string;
    email?: string;
    status: LeadStatus;
    priority: LeadPriority;
    assigned_to?: { _id: string; name: string };
  } | string;
  follow_up_date: string;
  follow_up_time?: string;
  type: LeadFollowUpType;
  notes?: string;
  outcome?: string;
  status: LeadFollowUpStatus;
  next_follow_up_date?: string;
  completed_at?: string;
  completed_by?: { _id: string; name: string; email: string };
  created_by: { _id: string; name: string; email: string };
  createdAt?: string;
  updatedAt?: string;
};

export type LeadTimelineEntry = {
  _id: string;
  kind: "activity" | "attachment" | "follow_up";
  action: string;
  message: string;
  actor?: { _id: string; name: string; email?: string; department?: string } | null;
  timestamp: string;
  details?: unknown;
  attachment?: unknown;
  followUp?: LeadFollowUpRecord;
};

export type DuplicateCheckResult = {
  has_duplicates: boolean;
  matching_leads: Array<{
    _id: string;
    lead_no: string;
    name: string;
    company_name?: string;
    phone?: string;
    email?: string;
    status: string;
    priority: string;
    assigned_to?: { _id: string; name: string };
  }>;
  matching_parties: Array<{
    _id: string;
    party_name: string;
    party_type: string;
    mobile?: string;
    email?: string;
    district?: string;
    state?: string;
    gst_no?: string;
  }>;
};

export type LeadDashboardStats = {
  totalLeads: number;
  newLeads: number;
  followUpLeads?: number;
  assignedLeads?: number;
  contactedLeads?: number;
  qualifiedLeads?: number;
  quotationLeads?: number;
  negotiationLeads?: number;
  wonLeads: number;
  lostLeads: number;
  convertedLeads: number;
  followUpsToday: number;
  overdueFollowUps: number;
  totalPipelineValue: number;
  totalWonValue: number;
  totalPipelineQuantity?: number;
  totalWonQuantity?: number;
};

export type LeadFunnelStage = {
  key: string;
  label: string;
  count: number;
  quantity?: number;
  estimated_value: number;
  percentage: number;
};

export type LeadSalesPerformance = {
  user_id: string;
  name: string;
  email: string;
  total_leads: number;
  qualified_leads: number;
  quotations: number;
  won_leads: number;
  lost_leads: number;
  conversion_rate: number;
  pipeline_qty?: number;
  pipeline_quantity?: number;
  won_qty?: number;
  won_quantity?: number;
  lost_qty?: number;
  lost_quantity?: number;
  pipeline_value: number;
  won_value: number;
  avg_lead_value: number;
  completed_followups: number;
  overdue_followups: number;
};

export type LeadSourcePerformance = {
  source: string;
  total_leads: number;
  qualified_leads: number;
  won_leads: number;
  lost_leads: number;
  conversion_rate: number;
  pipeline_qty?: number;
  pipeline_quantity?: number;
  won_qty?: number;
  won_quantity?: number;
  lost_qty?: number;
  lost_quantity?: number;
  pipeline_value: number;
  won_value: number;
};

export type ListLeadsQueryArgs = {
  page?: number;
  limit?: number;
  paginate?: string;
  search?: string;
  status?: string;
  priority?: string;
  source?: string;
  assigned_to?: string;
  scope?: string;
  city?: string;
  state?: string;
  from_date?: string;
  to_date?: string;
  follow_up_filter?: "today" | "overdue" | "upcoming";
  min_value?: number;
  max_value?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

export type ListLeadsResponse = {
  items: LeadRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export const leadsApi = medicaApi.injectEndpoints({
  overrideExisting: false,
  endpoints: (build) => ({
    listLeads: build.query<ListLeadsResponse, ListLeadsQueryArgs | void>({
      query: (params) => ({
        url: "/leads",
        params: params || undefined,
      }),
      transformResponse: (res: ApiEnvelope<ListLeadsResponse>) => unwrapEnvelope(res),
      providesTags: (result) =>
        result?.items
          ? [
              ...result.items.map((i) => ({ type: "Lead" as const, id: i._id })),
              { type: "Lead" as const, id: "LIST" },
            ]
          : [{ type: "Lead" as const, id: "LIST" }],
    }),

    getLead: build.query<LeadRecord, string>({
      query: (id) => `/leads/${id}`,
      transformResponse: (res: ApiEnvelope<LeadRecord>) => unwrapEnvelope(res),
      providesTags: (_res, _err, id) => [{ type: "Lead" as const, id }],
    }),

    createLead: build.mutation<LeadRecord, LeadInputPayload>({
      query: (body) => ({
        url: "/leads",
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiEnvelope<LeadRecord>) => unwrapEnvelope(res),
      invalidatesTags: [{ type: "Lead", id: "LIST" }],
    }),

    updateLead: build.mutation<LeadRecord, { id: string; body: LeadInputPayload }>({
      query: ({ id, body }) => ({
        url: `/leads/${id}`,
        method: "PUT",
        body,
      }),
      transformResponse: (res: ApiEnvelope<LeadRecord>) => unwrapEnvelope(res),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Lead", id },
        { type: "Lead", id: "LIST" },
      ],
    }),

    deleteLead: build.mutation<{ _id: string }, string>({
      query: (id) => ({
        url: `/leads/${id}`,
        method: "DELETE",
      }),
      transformResponse: (res: ApiEnvelope<{ _id: string }>) => unwrapEnvelope(res),
      invalidatesTags: [{ type: "Lead", id: "LIST" }],
    }),

    bulkDeleteLeads: build.mutation<{ count: number; deletedIds: string[] }, string[]>({
      query: (ids) => ({
        url: "/leads/bulk",
        method: "DELETE",
        body: { ids },
      }),
      transformResponse: (res: ApiEnvelope<{ count: number; deletedIds: string[] }>) =>
        unwrapEnvelope(res),
      invalidatesTags: [{ type: "Lead", id: "LIST" }],
    }),

    restoreLead: build.mutation<{ _id: string }, string>({
      query: (id) => ({
        url: `/leads/${id}/restore`,
        method: "POST",
      }),
      transformResponse: (res: ApiEnvelope<{ _id: string }>) => unwrapEnvelope(res),
      invalidatesTags: [{ type: "Lead", id: "LIST" }],
    }),

    checkLeadDuplicates: build.mutation<
      DuplicateCheckResult,
      { phone?: string; email?: string; company_name?: string }
    >({
      query: (body) => ({
        url: "/leads/check-duplicates",
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiEnvelope<DuplicateCheckResult>) => unwrapEnvelope(res),
    }),

    assignLead: build.mutation<
      LeadRecord,
      { id: string; assigned_to: string; notes?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/leads/${id}/assign`,
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiEnvelope<LeadRecord>) => unwrapEnvelope(res),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Lead", id },
        { type: "Lead", id: "LIST" },
      ],
    }),

    changeLeadStatus: build.mutation<
      LeadRecord,
      { id: string; status: LeadStatus; remarks?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/leads/${id}/status`,
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiEnvelope<LeadRecord>) => unwrapEnvelope(res),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Lead", id },
        { type: "Lead", id: "LIST" },
      ],
    }),

    qualifyLead: build.mutation<LeadRecord, { id: string; qualification: LeadQualification }>({
      query: ({ id, qualification }) => ({
        url: `/leads/${id}/qualify`,
        method: "POST",
        body: qualification,
      }),
      transformResponse: (res: ApiEnvelope<LeadRecord>) => unwrapEnvelope(res),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Lead", id },
        { type: "Lead", id: "LIST" },
      ],
    }),

    markLeadLost: build.mutation<
      LeadRecord,
      { id: string; lost_reason: string; lost_remarks?: string; lost_reason_id?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/leads/${id}/mark-lost`,
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiEnvelope<LeadRecord>) => unwrapEnvelope(res),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Lead", id },
        { type: "Lead", id: "LIST" },
      ],
    }),

    convertLead: build.mutation<
      LeadRecord,
      {
        id: string;
        conversion_type?: "existing_customer" | "new_customer" | "quotation" | "order";
        party_id?: string;
        party_name?: string;
        gst_no?: string;
        drug_license_no?: string;
        payment_terms?: string;
        create_order?: boolean;
        notes?: string;
        quotation_id?: string;
        party_data?: Record<string, unknown>;
        order_items?: Array<{
          product?: string;
          productId?: string;
          product_name: string;
          quantity: number;
          unit?: string;
          applied_rate_type?: string;
          unit_price?: number;
          discount_percent?: number;
          gst_percent?: number;
          remarks?: string;
        }>;
        order_data?: {
          order_date?: string;
          delivery_date?: string;
          remarks?: string;
        };
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/leads/${id}/convert`,
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiEnvelope<LeadRecord>) => unwrapEnvelope(res),
      invalidatesTags: (_res, _err, { id }) => [
        { type: "Lead", id },
        { type: "Lead", id: "LIST" },
        { type: "LeadQuotation", id: `LEAD_${id}` },
        { type: "Parties", id: "LIST" },
        { type: "Orders", id: "LIST" },
      ],
    }),

    getLeadTimeline: build.query<LeadTimelineEntry[], string>({
      query: (id) => `/leads/${id}/timeline`,
      transformResponse: (res: ApiEnvelope<LeadTimelineEntry[]>) => unwrapEnvelope(res),
      providesTags: (_res, _err, id) => [{ type: "Lead" as const, id: `TIMELINE_${id}` }],
    }),

    listLeadFollowUps: build.query<LeadFollowUpRecord[], string>({
      query: (leadId) => `/leads/${leadId}/follow-ups`,
      transformResponse: (res: ApiEnvelope<LeadFollowUpRecord[]>) => unwrapEnvelope(res),
      providesTags: (_res, _err, leadId) => [
        { type: "LeadFollowUp" as const, id: `LEAD_${leadId}` },
      ],
    }),

    createLeadFollowUp: build.mutation<
      LeadFollowUpRecord,
      {
        leadId: string;
        follow_up_date: string;
        follow_up_time?: string;
        type: LeadFollowUpType;
        notes?: string;
      }
    >({
      query: ({ leadId, ...body }) => ({
        url: `/leads/${leadId}/follow-ups`,
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiEnvelope<LeadFollowUpRecord>) => unwrapEnvelope(res),
      invalidatesTags: (_res, _err, { leadId }) => [
        { type: "LeadFollowUp", id: `LEAD_${leadId}` },
        { type: "Lead", id: leadId },
        { type: "Lead", id: "LIST" },
      ],
    }),

    completeLeadFollowUp: build.mutation<
      { completed: LeadFollowUpRecord; next?: LeadFollowUpRecord | null },
      {
        followUpId: string;
        leadId?: string;
        outcome: string;
        next_follow_up_date?: string;
        next_follow_up_time?: string;
        next_type?: LeadFollowUpType;
        next_notes?: string;
      }
    >({
      query: ({ followUpId, ...body }) => ({
        url: `/leads/follow-ups/${followUpId}/complete`,
        method: "PUT",
        body,
      }),
      transformResponse: (
        res: ApiEnvelope<{ completed: LeadFollowUpRecord; next?: LeadFollowUpRecord | null }>
      ) => unwrapEnvelope(res),
      invalidatesTags: (_res, _err, { leadId }) => [
        { type: "LeadFollowUp", id: leadId ? `LEAD_${leadId}` : "LIST" },
        { type: "Lead", id: leadId || "LIST" },
        { type: "Lead", id: "LIST" },
      ],
    }),

    getLeadFollowUpCalendar: build.query<
      LeadFollowUpRecord[],
      { from_date?: string; to_date?: string; status?: string } | void
    >({
      query: (params) => ({
        url: "/leads/follow-ups/calendar",
        params: params || undefined,
      }),
      transformResponse: (res: ApiEnvelope<LeadFollowUpRecord[]>) => unwrapEnvelope(res),
      providesTags: [{ type: "LeadFollowUp" as const, id: "CALENDAR" }],
    }),

    getLeadDashboardStats: build.query<
      LeadDashboardStats,
      {
        assigned_to?: string;
        from?: string;
        to?: string;
        years?: string;
        months?: string;
        startDate?: string;
        endDate?: string;
        start_date?: string;
        end_date?: string;
      } | void
    >({
      query: (params) => ({
        url: "/leads/reports/dashboard",
        params: params || undefined,
      }),
      transformResponse: (res: ApiEnvelope<LeadDashboardStats>) => unwrapEnvelope(res),
      providesTags: [{ type: "Lead" as const, id: "DASHBOARD_STATS" }],
    }),

    getLeadSalesFunnel: build.query<
      { total_leads: number; stages: LeadFunnelStage[] },
      { assigned_to?: string } | void
    >({
      query: (params) => ({
        url: "/leads/reports/funnel",
        params: params || undefined,
      }),
      transformResponse: (res: ApiEnvelope<{ total_leads: number; stages: LeadFunnelStage[] }>) =>
        unwrapEnvelope(res),
      providesTags: [{ type: "Lead" as const, id: "FUNNEL" }],
    }),

    getLeadSalesPerformance: build.query<
      LeadSalesPerformance[],
      { assigned_to?: string } | void
    >({
      query: (params) => ({
        url: "/leads/reports/sales-performance",
        params: params || undefined,
      }),
      transformResponse: (res: ApiEnvelope<LeadSalesPerformance[]>) => unwrapEnvelope(res),
      providesTags: [{ type: "Lead" as const, id: "SALES_PERFORMANCE" }],
    }),

    getLeadSourcePerformance: build.query<LeadSourcePerformance[], void>({
      query: () => "/leads/reports/source-performance",
      transformResponse: (res: ApiEnvelope<LeadSourcePerformance[]>) => unwrapEnvelope(res),
      providesTags: [{ type: "Lead" as const, id: "SOURCE_PERFORMANCE" }],
    }),
  }),
});

export const {
  useListLeadsQuery,
  useGetLeadQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
  useBulkDeleteLeadsMutation,
  useRestoreLeadMutation,
  useCheckLeadDuplicatesMutation,
  useAssignLeadMutation,
  useChangeLeadStatusMutation,
  useQualifyLeadMutation,
  useMarkLeadLostMutation,
  useConvertLeadMutation,
  useGetLeadTimelineQuery,
  useListLeadFollowUpsQuery,
  useCreateLeadFollowUpMutation,
  useCompleteLeadFollowUpMutation,
  useGetLeadFollowUpCalendarQuery,
  useGetLeadDashboardStatsQuery,
  useGetLeadSalesFunnelQuery,
  useGetLeadSalesPerformanceQuery,
  useGetLeadSourcePerformanceQuery,
} = leadsApi;
