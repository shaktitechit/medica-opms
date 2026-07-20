import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type TransportPlanStatus =
  | "draft"
  | "planned"
  | "submitted"
  | "in_transit"
  | "completed"
  | "cancelled";

export type TransportPlanOrderStatus =
  | "pending"
  | "packed"
  | "dispatched"
  | "delivered"
  | "cancelled";

export type TransportPlanOrderRecord = {
  _id?: string;
  id?: string;
  transport_plan?: string;
  order?:
    | string
    | {
        _id: string;
        order_no?: string;
        order_date?: string;
        status?: string;
        workflow_stage?: string;
        priority?: string;
        grand_total?: number;
        dispatch_status?: string;
        party?:
          | string
          | {
              _id: string;
              party_name?: string;
              billing_address?: { city?: string };
              shipping_address?: { city?: string };
            };
        assigned_sales_user?: string | { _id: string; name?: string; email?: string };
      };
  party?:
    | string
    | {
        _id: string;
        party_name?: string;
        billing_address?: { city?: string };
        shipping_address?: { city?: string };
      };
  customer?: string;
  dispatch?:
    | string
    | {
        _id: string;
        dispatch_no?: string;
        dispatch_status?: string;
        bill_number?: string;
        billing_date?: string;
      };
  dispatch_date?: string;
  lr_number?: string;
  invoice_number?: string;
  packages?: number;
  weight?: number;
  status?: TransportPlanOrderStatus;
  transport?: {
    _id?: string;
    id?: string;
    shipment_no?: string;
    shipment_status?: string;
    transport_agent?:
      | string
      | {
          _id?: string;
          agent_code?: string;
          agent_name?: string;
          agent_type?: string;
          mobile?: string;
        };
    vehicle_number?: string;
    vehicle_no?: string;
    driver_name?: string;
    driver_mobile?: string;
    driver_phone?: string;
    lr_number?: string;
    weight?: number;
    weight_unit?: string;
    packed_boxes?: number;
    open_boxes?: number;
    total_quantity?: number;
    dispatch_date?: string;
    expected_delivery_date?: string;
    actual_delivery_date?: string;
    remarks?: string;
  } | null;
  createdAt?: string;
  updatedAt?: string;
};

export type TransportPlanRecord = {
  _id?: string;
  id?: string;
  plan_date?: string;
  transport_agent?:
    | string
    | {
        _id: string;
        agent_code?: string;
        agent_name?: string;
        agent_type?: string;
        mobile?: string;
        email?: string;
        gst_no?: string;
        status?: string;
      };
  status?: TransportPlanStatus;
  remarks?: string;
  submitted_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  order_count?: number;
  total_packages?: number;
  total_weight?: number;
  orders?: TransportPlanOrderRecord[];
  summary?: {
    total_orders?: number;
    total_packages?: number;
    total_weight?: number;
    total_invoice_value?: number;
  };
  created_by?: string | { _id: string; name?: string; email?: string; department?: string };
  updated_by?: string | { _id: string; name?: string; email?: string; department?: string };
  createdAt?: string;
  updatedAt?: string;
};

export type TransportPlanListResult = {
  total: number;
  page: number;
  limit: number;
  pages: number;
  data: TransportPlanRecord[];
};

export type EligibleDispatchRecord = {
  _id?: string;
  id?: string;
  dispatch_no?: string;
  dispatch_status?: string;
  bill_number?: string;
  billing_date?: string;
  dispatched_quantity_total?: number;
  order?: string;
};

export type EligibleOrderRecord = {
  _id?: string;
  id?: string;
  order_no?: string;
  order_date?: string;
  priority?: string;
  status?: string;
  workflow_stage?: string;
  dispatch_status?: string;
  grand_total?: number;
  invoice_value?: number;
  city?: string | null;
  available_dispatches?: EligibleDispatchRecord[];
  available_dispatch_count?: number;
  party?:
    | string
    | {
        _id: string;
        party_name?: string;
        billing_address?: { city?: string };
        shipping_address?: { city?: string };
      };
  assigned_sales_user?: string | { _id: string; name?: string; email?: string };
};

export type EligibleOrdersResult = {
  total: number;
  page: number;
  limit: number;
  pages: number;
  data: EligibleOrderRecord[];
};

export type TransportPlanStats = {
  today_plans: number;
  pending_dispatch: number;
  in_transit: number;
  completed: number;
  cancelled: number;
  total_orders: number;
  total_packages: number;
  total_weight: number;
  total_invoice_value: number;
  by_status?: Record<string, number>;
  monthly_trend?: Array<{ year: number; month: number; count: number }>;
  agent_performance?: Array<{
    transport_agent?: string;
    agent_name?: string | null;
    agent_code?: string | null;
    plans: number;
    completed: number;
  }>;
};

const invalidatePlan = (id: string) =>
  [
    "TransportPlans" as const,
    { type: "TransportPlans" as const, id },
    { type: "TransportPlans" as const, id: "LIST" },
    { type: "TransportPlans" as const, id: "STATS" },
    { type: "TransportPlans" as const, id: "ELIGIBLE" },
  ];

/** `/api/transport-plans` */
export const transportPlansApi = medicaApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    listTransportPlans: build.query<
      TransportPlanListResult,
      Record<string, string | number | undefined> | void
    >({
      query: (params) => ({
        url: "transport-plans",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<TransportPlanListResult>) =>
        (unwrapEnvelope(raw) as TransportPlanListResult) ?? {
          total: 0,
          page: 1,
          limit: 50,
          pages: 0,
          data: [],
        },
      providesTags: [{ type: "TransportPlans", id: "LIST" }],
    }),
    getTransportPlanStats: build.query<
      TransportPlanStats,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "transport-plans/stats",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<TransportPlanStats>) =>
        unwrapEnvelope(raw) as TransportPlanStats,
      providesTags: [{ type: "TransportPlans", id: "STATS" }],
    }),
    listEligibleTransportOrders: build.query<
      EligibleOrdersResult,
      Record<string, string | number | undefined> | void
    >({
      query: (params) => ({
        url: "transport-plans/eligible-orders",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<EligibleOrdersResult>) =>
        (unwrapEnvelope(raw) as EligibleOrdersResult) ?? {
          total: 0,
          page: 1,
          limit: 50,
          pages: 0,
          data: [],
        },
      providesTags: [{ type: "TransportPlans", id: "ELIGIBLE" }],
    }),
    getTransportPlan: build.query<TransportPlanRecord, string>({
      query: (id) => `transport-plans/${id}`,
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      providesTags: (_r, _e, id) => [{ type: "TransportPlans", id }],
    }),
    createTransportPlan: build.mutation<TransportPlanRecord, Record<string, unknown>>({
      query: (body) => ({ url: "transport-plans", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: [
        { type: "TransportPlans", id: "LIST" },
        { type: "TransportPlans", id: "STATS" },
        { type: "TransportPlans", id: "ELIGIBLE" },
      ],
    }),
    patchTransportPlan: build.mutation<
      TransportPlanRecord,
      { id: string; patch: Record<string, unknown> }
    >({
      query: ({ id, patch }) => ({
        url: `transport-plans/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: (_r, _e, arg) => invalidatePlan(arg.id),
    }),
    deleteTransportPlan: build.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `transport-plans/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<{ id: string; deleted: boolean }>) =>
        unwrapEnvelope(raw) as { id: string; deleted: boolean },
      invalidatesTags: [
        "TransportPlans",
        { type: "TransportPlans", id: "LIST" },
        { type: "TransportPlans", id: "STATS" },
        { type: "TransportPlans", id: "ELIGIBLE" },
      ],
    }),
    submitTransportPlan: build.mutation<TransportPlanRecord, string>({
      query: (id) => ({ url: `transport-plans/${id}/submit`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: (_r, _e, id) => [...invalidatePlan(id), "Notifications"],
    }),
    completeTransportPlan: build.mutation<TransportPlanRecord, string>({
      query: (id) => ({ url: `transport-plans/${id}/complete`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: (_r, _e, id) => [...invalidatePlan(id), "Notifications"],
    }),
    cancelTransportPlan: build.mutation<
      TransportPlanRecord,
      { id: string; cancellation_reason?: string }
    >({
      query: ({ id, cancellation_reason }) => ({
        url: `transport-plans/${id}/cancel`,
        method: "POST",
        body: { cancellation_reason },
      }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: (_r, _e, arg) => [...invalidatePlan(arg.id), "Notifications"],
    }),
    addTransportPlanOrders: build.mutation<
      TransportPlanRecord,
      { id: string; items: Array<{ order_id: string; dispatch_id: string }> }
    >({
      query: ({ id, items }) => ({
        url: `transport-plans/${id}/orders`,
        method: "POST",
        body: { items },
      }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: (_r, _e, arg) => invalidatePlan(arg.id),
    }),
    removeTransportPlanOrder: build.mutation<
      TransportPlanRecord,
      { id: string; planOrderId: string }
    >({
      query: ({ id, planOrderId }) => ({
        url: `transport-plans/${id}/orders/${planOrderId}`,
        method: "DELETE",
      }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: (_r, _e, arg) => invalidatePlan(arg.id),
    }),
    cancelTransportPlanOrder: build.mutation<
      TransportPlanRecord,
      { id: string; planOrderId: string }
    >({
      query: ({ id, planOrderId }) => ({
        url: `transport-plans/${id}/orders/${planOrderId}/cancel`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: (_r, _e, arg) => invalidatePlan(arg.id),
    }),
    patchTransportPlanOrder: build.mutation<
      TransportPlanRecord,
      { id: string; planOrderId: string; patch: Record<string, unknown> }
    >({
      query: ({ id, planOrderId, patch }) => ({
        url: `transport-plans/${id}/orders/${planOrderId}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: (_r, _e, arg) => [{ type: "TransportPlans", id: arg.id }],
    }),
    generateTransportPlanLr: build.mutation<
      TransportPlanRecord,
      { id: string; planOrderId: string }
    >({
      query: ({ id, planOrderId }) => ({
        url: `transport-plans/${id}/orders/${planOrderId}/generate-lr`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: (_r, _e, arg) => [{ type: "TransportPlans", id: arg.id }],
    }),
    markTransportPlanOrderPacked: build.mutation<
      TransportPlanRecord,
      { id: string; planOrderId: string }
    >({
      query: ({ id, planOrderId }) => ({
        url: `transport-plans/${id}/orders/${planOrderId}/mark-packed`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: (_r, _e, arg) => invalidatePlan(arg.id),
    }),
    markTransportPlanOrderDispatched: build.mutation<
      TransportPlanRecord,
      { id: string; planOrderId: string }
    >({
      query: ({ id, planOrderId }) => ({
        url: `transport-plans/${id}/orders/${planOrderId}/mark-dispatched`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: (_r, _e, arg) => invalidatePlan(arg.id),
    }),
    markTransportPlanOrderDelivered: build.mutation<
      TransportPlanRecord,
      { id: string; planOrderId: string }
    >({
      query: ({ id, planOrderId }) => ({
        url: `transport-plans/${id}/orders/${planOrderId}/mark-delivered`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<TransportPlanRecord>) =>
        unwrapEnvelope(raw) as TransportPlanRecord,
      invalidatesTags: (_r, _e, arg) => [...invalidatePlan(arg.id), "Notifications"],
    }),
  }),
});

export const {
  useListTransportPlansQuery,
  useGetTransportPlanStatsQuery,
  useListEligibleTransportOrdersQuery,
  useGetTransportPlanQuery,
  useCreateTransportPlanMutation,
  usePatchTransportPlanMutation,
  useDeleteTransportPlanMutation,
  useSubmitTransportPlanMutation,
  useCompleteTransportPlanMutation,
  useCancelTransportPlanMutation,
  useAddTransportPlanOrdersMutation,
  useRemoveTransportPlanOrderMutation,
  useCancelTransportPlanOrderMutation,
  usePatchTransportPlanOrderMutation,
  useGenerateTransportPlanLrMutation,
  useMarkTransportPlanOrderPackedMutation,
  useMarkTransportPlanOrderDispatchedMutation,
  useMarkTransportPlanOrderDeliveredMutation,
} = transportPlansApi;
