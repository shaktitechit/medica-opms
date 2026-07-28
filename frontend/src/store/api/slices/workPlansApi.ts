import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type WorkPlanStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "completed";

export type WorkPlanVisitStatus =
  | "pending"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "skipped"
  | "rescheduled";

export type WorkPlanVisitPartyType = "existing" | "new_party" | "new_lead";

export type WorkPlanExpenseStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected";

export type WorkPlanExpenseCategory =
  | "Travel"
  | "Accommodation"
  | "Food"
  | "Communication"
  | "Client Entertainment"
  | "Marketing"
  | "Office"
  | "Miscellaneous";

export type WorkPlanExpenseTravelSubCategory =
  | "Fuel"
  | "Cab"
  | "Train"
  | "Flight"
  | "Toll"
  | "Parking";

export type WorkPlanExpensePaymentMode =
  | "Cash"
  | "UPI"
  | "Card"
  | "Bank Transfer"
  | "Company Card";

export const WORK_PLAN_EXPENSE_CATEGORIES: WorkPlanExpenseCategory[] = [
  "Travel",
  "Accommodation",
  "Food",
  "Communication",
  "Client Entertainment",
  "Marketing",
  "Office",
  "Miscellaneous",
];

export const WORK_PLAN_TRAVEL_SUB_CATEGORIES: WorkPlanExpenseTravelSubCategory[] =
  ["Fuel", "Cab", "Train", "Flight", "Toll", "Parking"];

export const WORK_PLAN_EXPENSE_PAYMENT_MODES: WorkPlanExpensePaymentMode[] = [
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Company Card",
];

export type WorkPlanExpenseRecord = {
  _id?: string;
  id?: string;
  work_plan?:
    | string
    | {
        _id?: string;
        id?: string;
        plan_date?: string;
        location?: string;
        status?: WorkPlanStatus;
        sales_user?:
          | string
          | { _id: string; name?: string; email?: string; department?: string };
      };
  work_plan_visit?:
    | string
    | null
    | {
        _id?: string;
        id?: string;
        sequence?: number;
        party_type?: string;
        party_name?: string;
        contact_person?: string;
        party?: string | { _id?: string; party_name?: string };
      };
  expense_date?: string;
  category?: WorkPlanExpenseCategory | string;
  sub_category?: string;
  amount?: number;
  payment_mode?: WorkPlanExpensePaymentMode | string;
  vendor_name?: string;
  bill_number?: string;
  bill_date?: string;
  description?: string;
  receipt_attachment?:
    | string
    | {
        _id: string;
        original_name?: string;
        file_name?: string;
        mime_type?: string;
        url?: string;
        key?: string;
      }
    | null;
  status?: WorkPlanExpenseStatus;
  approved_by?: string | { _id: string; name?: string; email?: string };
  approved_at?: string;
  rejection_reason?: string;
  created_by?: string | { _id: string; name?: string; email?: string };
  createdAt?: string;
  updatedAt?: string;
};

export type WorkPlanVisitRecord = {
  _id?: string;
  id?: string;
  work_plan?: string;
  sequence?: number;
  party_type?: WorkPlanVisitPartyType;
  party?:
    | string
    | {
        _id: string;
        party_name?: string;
        mobile?: string;
        email?: string;
        contact_person?: string;
      };
  party_name?: string;
  contact_person?: string;
  contact_number?: string;
  contact_email?: string;
  address?: string;
  planned_start_time?: string;
  planned_end_time?: string;
  purpose?: string;
  notes?: string;
  status?: WorkPlanVisitStatus;
  actual_check_in?: string;
  actual_check_out?: string;
  outcome?: string;
  meeting_with_doctor?: boolean;
  meeting_with_purchase?: boolean;
  meeting_with_finance?: boolean;
  meeting_with_engineer?: boolean;
  new_product_introduced?: boolean;
  order_received?: boolean;
  next_followup_date?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkPlanRecord = {
  _id?: string;
  id?: string;
  plan_date?: string;
  sales_user?:
    | string
    | { _id: string; name?: string; email?: string; department?: string };
  status?: WorkPlanStatus;
  remarks?: string;
  /** Location / city for the plan day. */
  location?: string;
  submitted_at?: string;
  approved_by?: string | { _id: string; name?: string; email?: string };
  approved_at?: string;
  rejection_reason?: string;
  visit_count?: number;
  visits?: WorkPlanVisitRecord[];
  expenses?: WorkPlanExpenseRecord[];
  expense_total?: number;
  expense_approved_total?: number;
  visit_expense_totals?: Record<string, number>;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkPlanListResult = {
  total: number;
  page: number;
  limit: number;
  pages: number;
  data: WorkPlanRecord[];
};

export type WorkPlanStats = {
  today_plans: number;
  pending_approval: number;
  approved: number;
  completed: number;
  rejected: number;
  average_visits: number;
  by_status?: Record<string, number>;
  monthly_trend?: Array<{ year: number; month: number; count: number }>;
  expense_total?: number;
  expense_pending_approval?: number;
  expense_approved_count?: number;
  expense_monthly_trend?: Array<{
    year: number;
    month: number;
    amount: number;
    count: number;
  }>;
};

export type WorkPlanExpenseListResult = {
  total: number;
  page: number;
  limit: number;
  pages: number;
  data: WorkPlanExpenseRecord[];
};

/** `/api/work-plans` */
export const workPlansApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listWorkPlans: build.query<
      WorkPlanListResult,
      Record<string, string | number | undefined> | void
    >({
      query: (params) => ({
        url: "work-plans",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanListResult>) =>
        (unwrapEnvelope(raw) as WorkPlanListResult) ?? {
          total: 0,
          page: 1,
          limit: 50,
          pages: 0,
          data: [],
        },
      providesTags: [{ type: "WorkPlans", id: "LIST" }],
    }),
    listWorkPlanExpenses: build.query<
      WorkPlanExpenseListResult,
      Record<string, string | number | undefined> | void
    >({
      query: (params) => ({
        url: "work-plans/expenses",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanExpenseListResult>) =>
        (unwrapEnvelope(raw) as WorkPlanExpenseListResult) ?? {
          total: 0,
          page: 1,
          limit: 50,
          pages: 0,
          data: [],
        },
      providesTags: [{ type: "WorkPlans", id: "EXPENSE_LIST" }],
    }),
    getWorkPlanStats: build.query<
      WorkPlanStats,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "work-plans/stats",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanStats>) =>
        unwrapEnvelope(raw) as WorkPlanStats,
      providesTags: [{ type: "WorkPlans", id: "STATS" }],
    }),
    getWorkPlan: build.query<WorkPlanRecord, string>({
      query: (id) => `work-plans/${id}`,
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      providesTags: (_r, _e, id) => [{ type: "WorkPlans", id }],
    }),
    createWorkPlan: build.mutation<WorkPlanRecord, Record<string, unknown>>({
      query: (body) => ({ url: "work-plans", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: [
        { type: "WorkPlans", id: "LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    patchWorkPlan: build.mutation<
      WorkPlanRecord,
      { id: string; patch: Record<string, unknown> }
    >({
      query: ({ id, patch }) => ({
        url: `work-plans/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    deleteWorkPlan: build.mutation<WorkPlanRecord, string>({
      query: (id) => ({ url: `work-plans/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: [
        "WorkPlans",
        { type: "WorkPlans", id: "LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    submitWorkPlan: build.mutation<WorkPlanRecord, string>({
      query: (id) => ({ url: `work-plans/${id}/submit`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, id) => [
        "WorkPlans",
        { type: "WorkPlans", id },
        { type: "WorkPlans", id: "LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    approveWorkPlan: build.mutation<WorkPlanRecord, string>({
      query: (id) => ({ url: `work-plans/${id}/approve`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, id) => [
        "WorkPlans",
        { type: "WorkPlans", id },
        { type: "WorkPlans", id: "LIST" },
        { type: "WorkPlans", id: "STATS" },
        "Notifications",
      ],
    }),
    rejectWorkPlan: build.mutation<
      WorkPlanRecord,
      { id: string; rejection_reason: string }
    >({
      query: ({ id, rejection_reason }) => ({
        url: `work-plans/${id}/reject`,
        method: "POST",
        body: { rejection_reason },
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "LIST" },
        { type: "WorkPlans", id: "STATS" },
        "Notifications",
      ],
    }),
    addWorkPlanVisit: build.mutation<
      WorkPlanRecord,
      { id: string; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({
        url: `work-plans/${id}/visits`,
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    patchWorkPlanVisit: build.mutation<
      WorkPlanRecord,
      { id: string; visitId: string; patch: Record<string, unknown> }
    >({
      query: ({ id, visitId, patch }) => ({
        url: `work-plans/${id}/visits/${visitId}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
      ],
    }),
    deleteWorkPlanVisit: build.mutation<
      WorkPlanRecord,
      { id: string; visitId: string }
    >({
      query: ({ id, visitId }) => ({
        url: `work-plans/${id}/visits/${visitId}`,
        method: "DELETE",
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    checkInWorkPlanVisit: build.mutation<
      WorkPlanRecord,
      { id: string; visitId: string }
    >({
      query: ({ id, visitId }) => ({
        url: `work-plans/${id}/visits/${visitId}/check-in`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
      ],
    }),
    checkOutWorkPlanVisit: build.mutation<
      WorkPlanRecord,
      { id: string; visitId: string }
    >({
      query: ({ id, visitId }) => ({
        url: `work-plans/${id}/visits/${visitId}/check-out`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
      ],
    }),
    completeWorkPlanVisit: build.mutation<
      WorkPlanRecord,
      {
        id: string;
        visitId: string;
        outcome: string;
        meeting_with_doctor: boolean;
        meeting_with_purchase: boolean;
        meeting_with_finance: boolean;
        meeting_with_engineer: boolean;
        new_product_introduced: boolean;
        order_received: boolean;
      }
    >({
      query: ({ id, visitId, ...body }) => ({
        url: `work-plans/${id}/visits/${visitId}/complete`,
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    scheduleNextWorkPlanVisit: build.mutation<
      WorkPlanRecord & { _meta?: { created?: boolean; reused?: boolean } },
      { id: string; visitId: string; plan_date: string }
    >({
      query: ({ id, visitId, plan_date }) => ({
        url: `work-plans/${id}/visits/${visitId}/schedule-next`,
        method: "POST",
        body: { plan_date },
      }),
      transformResponse: (
        raw: ApiEnvelope<
          WorkPlanRecord & { _meta?: { created?: boolean; reused?: boolean } }
        >,
      ) =>
        unwrapEnvelope(raw) as WorkPlanRecord & {
          _meta?: { created?: boolean; reused?: boolean };
        },
      invalidatesTags: (result, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        ...(result?._id || result?.id
          ? [{ type: "WorkPlans" as const, id: String(result._id || result.id) }]
          : []),
        { type: "WorkPlans", id: "LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    addWorkPlanExpense: build.mutation<
      WorkPlanRecord,
      { id: string; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({
        url: `work-plans/${id}/expenses`,
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "LIST" },
        { type: "WorkPlans", id: "EXPENSE_LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    patchWorkPlanExpense: build.mutation<
      WorkPlanRecord,
      { id: string; expenseId: string; patch: Record<string, unknown> }
    >({
      query: ({ id, expenseId, patch }) => ({
        url: `work-plans/${id}/expenses/${expenseId}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "EXPENSE_LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    deleteWorkPlanExpense: build.mutation<
      WorkPlanRecord,
      { id: string; expenseId: string }
    >({
      query: ({ id, expenseId }) => ({
        url: `work-plans/${id}/expenses/${expenseId}`,
        method: "DELETE",
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "LIST" },
        { type: "WorkPlans", id: "EXPENSE_LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    submitWorkPlanExpense: build.mutation<
      WorkPlanRecord,
      { id: string; expenseId: string }
    >({
      query: ({ id, expenseId }) => ({
        url: `work-plans/${id}/expenses/${expenseId}/submit`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "EXPENSE_LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    approveWorkPlanExpense: build.mutation<
      WorkPlanRecord,
      { id: string; expenseId: string }
    >({
      query: ({ id, expenseId }) => ({
        url: `work-plans/${id}/expenses/${expenseId}/approve`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "EXPENSE_LIST" },
        { type: "WorkPlans", id: "STATS" },
        "Notifications",
      ],
    }),
    rejectWorkPlanExpense: build.mutation<
      WorkPlanRecord,
      { id: string; expenseId: string; rejection_reason: string }
    >({
      query: ({ id, expenseId, rejection_reason }) => ({
        url: `work-plans/${id}/expenses/${expenseId}/reject`,
        method: "POST",
        body: { rejection_reason },
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "EXPENSE_LIST" },
        { type: "WorkPlans", id: "STATS" },
        "Notifications",
      ],
    }),
    submitAllWorkPlanExpenses: build.mutation<WorkPlanRecord, { id: string }>({
      query: ({ id }) => ({
        url: `work-plans/${id}/expenses/submit-all`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "EXPENSE_LIST" },
        { type: "WorkPlans", id: "STATS" },
      ],
    }),
    approveAllWorkPlanExpenses: build.mutation<WorkPlanRecord, { id: string }>({
      query: ({ id }) => ({
        url: `work-plans/${id}/expenses/approve-all`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "EXPENSE_LIST" },
        { type: "WorkPlans", id: "STATS" },
        "Notifications",
      ],
    }),
    rejectAllWorkPlanExpenses: build.mutation<
      WorkPlanRecord,
      { id: string; rejection_reason: string }
    >({
      query: ({ id, rejection_reason }) => ({
        url: `work-plans/${id}/expenses/reject-all`,
        method: "POST",
        body: { rejection_reason },
      }),
      transformResponse: (raw: ApiEnvelope<WorkPlanRecord>) =>
        unwrapEnvelope(raw) as WorkPlanRecord,
      invalidatesTags: (_r, _e, arg) => [
        "WorkPlans",
        { type: "WorkPlans", id: arg.id },
        { type: "WorkPlans", id: "EXPENSE_LIST" },
        { type: "WorkPlans", id: "STATS" },
        "Notifications",
      ],
    }),
  }),
});

export const {
  useListWorkPlansQuery,
  useLazyListWorkPlansQuery,
  useListWorkPlanExpensesQuery,
  useLazyListWorkPlanExpensesQuery,
  useGetWorkPlanStatsQuery,
  useGetWorkPlanQuery,
  useCreateWorkPlanMutation,
  usePatchWorkPlanMutation,
  useDeleteWorkPlanMutation,
  useSubmitWorkPlanMutation,
  useApproveWorkPlanMutation,
  useRejectWorkPlanMutation,
  useAddWorkPlanVisitMutation,
  usePatchWorkPlanVisitMutation,
  useDeleteWorkPlanVisitMutation,
  useCheckInWorkPlanVisitMutation,
  useCheckOutWorkPlanVisitMutation,
  useCompleteWorkPlanVisitMutation,
  useScheduleNextWorkPlanVisitMutation,
  useAddWorkPlanExpenseMutation,
  usePatchWorkPlanExpenseMutation,
  useDeleteWorkPlanExpenseMutation,
  useSubmitWorkPlanExpenseMutation,
  useApproveWorkPlanExpenseMutation,
  useRejectWorkPlanExpenseMutation,
  useSubmitAllWorkPlanExpensesMutation,
  useApproveAllWorkPlanExpensesMutation,
  useRejectAllWorkPlanExpensesMutation,
} = workPlansApi;
