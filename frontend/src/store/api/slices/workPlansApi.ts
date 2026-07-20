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

export type WorkPlanVisitRecord = {
  _id?: string;
  id?: string;
  work_plan?: string;
  sequence?: number;
  party?:
    | string
    | {
        _id: string;
        party_name?: string;
        mobile?: string;
        email?: string;
        contact_person?: string;
      };
  contact_person?: string;
  contact_number?: string;
  address?: string;
  planned_start_time?: string;
  planned_end_time?: string;
  purpose?: string;
  notes?: string;
  status?: WorkPlanVisitStatus;
  actual_check_in?: string;
  actual_check_out?: string;
  outcome?: string;
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
  submitted_at?: string;
  approved_by?: string | { _id: string; name?: string; email?: string };
  approved_at?: string;
  rejection_reason?: string;
  visit_count?: number;
  visits?: WorkPlanVisitRecord[];
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
        next_followup_date?: string;
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
  }),
});

export const {
  useListWorkPlansQuery,
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
} = workPlansApi;
