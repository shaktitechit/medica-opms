import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

type ApprovalQuery = {
  order?: string;
  approval_status?: string;
  assigned_finance_user?: string;
  assigned_account_user?: string;
  is_admin_approved?: boolean | string;
};

type ApprovalMutationArg = {
  id: string;
  patch?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

export type CreateOrderApprovalPayload = {
  order: string;
  approve_immediately?: boolean;
  replace_snapshot?: boolean;
  order_items?: any[];
  approval_notes?: string;
  approved_total_amount?: number;
  approval_items?: any[];
  contact_number?: string | string[];
  whatsapp_number?: string | string[];
  template_name?: string;
  template_components?: unknown[];
  [key: string]: any;
};


const orderApprovalTags = (id?: string) => [
  { type: "OrderApprovals" as const, id: "LIST" },
  ...(id ? [{ type: "OrderApprovals" as const, id }] : []),
  "Order" as const,
  "Orders" as const,
  "Approvals" as const,
  "FinanceQueue" as const,
  "FinanceSummary" as const,
];

/** `/api/order-approvals` */
export const orderApprovalApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listOrderApprovals: build.query<unknown, ApprovalQuery | void>({
      query: (params) => ({
        url: "order-approvals",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "OrderApprovals", id: "LIST" }],
    }),
    listOrderApprovalsDeleted: build.query<unknown, Pick<ApprovalQuery, "order"> | void>({
      query: (params) => ({
        url: "order-approvals/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "OrderApprovals", id: "DELETED" }],
    }),
    getOrderApproval: build.query<unknown, string>({
      query: (id) => `order-approvals/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "OrderApprovals", id }],
    }),
    createOrderApproval: build.mutation<unknown, CreateOrderApprovalPayload>({
      query: (body) => ({
        url: "order-approvals",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: orderApprovalTags(),
    }),
    patchOrderApproval: build.mutation<unknown, Required<Pick<ApprovalMutationArg, "id" | "patch">>>({
      query: ({ id, patch }) => ({
        url: `order-approvals/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => orderApprovalTags(arg.id),
    }),
    approveOrderApproval: build.mutation<unknown, ApprovalMutationArg>({
      query: ({ id, body }) => ({
        url: `order-approvals/${id}/approve`,
        method: "POST",
        body: body ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => orderApprovalTags(arg.id),
    }),
    rejectOrderApproval: build.mutation<unknown, ApprovalMutationArg>({
      query: ({ id, body }) => ({
        url: `order-approvals/${id}/reject`,
        method: "POST",
        body: body ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => orderApprovalTags(arg.id),
    }),
    sendOrderApprovalToFinance: build.mutation<unknown, ApprovalMutationArg>({
      query: ({ id, body }) => ({
        url: `order-approvals/${id}/send-to-finance`,
        method: "POST",
        body: body ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        ...orderApprovalTags(arg.id),
        "FinanceQueue",
        "FinanceSummary",
      ],
    }),
    sendOrderApprovalToAccount: build.mutation<unknown, ApprovalMutationArg>({
      query: ({ id, body }) => ({
        url: `order-approvals/${id}/send-to-account`,
        method: "POST",
        body: body ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        ...orderApprovalTags(arg.id),
        "FinanceQueue",
        "FinanceSummary",
      ],
    }),
    financeAmendOrderApproval: build.mutation<unknown, ApprovalMutationArg>({
      query: ({ id, body }) => ({
        url: `order-approvals/${id}/finance-amend`,
        method: "POST",
        body: body ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        ...orderApprovalTags(arg.id),
        "PartyProducts",
      ],
    }),
    amendOrderApproval: build.mutation<unknown, ApprovalMutationArg>({
      query: ({ id, body }) => ({
        url: `order-approvals/${id}/amend`,
        method: "POST",
        body: body ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        ...orderApprovalTags(arg.id),
      ],
    }),
    resolvePartialDispatchRelease: build.mutation<unknown, ApprovalMutationArg>({
      query: ({ id, body }) => ({
        url: `order-approvals/${id}/resolve-dispatch`,
        method: "POST",
        body: body ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        ...orderApprovalTags(arg.id),
        "Dispatch",
      ],
    }),
    deleteOrderApproval: build.mutation<unknown, string>({
      query: (id) => ({
        url: `order-approvals/${id}`,
        method: "DELETE",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        ...orderApprovalTags(id),
        { type: "OrderApprovals", id: "DELETED" },
      ],
    }),
    restoreOrderApproval: build.mutation<unknown, string>({
      query: (id) => ({
        url: `order-approvals/${id}/restore`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        ...orderApprovalTags(id),
        { type: "OrderApprovals", id: "DELETED" },
      ],
    }),
  }),
});

export const {
  useListOrderApprovalsQuery,
  useLazyListOrderApprovalsQuery,
  useListOrderApprovalsDeletedQuery,
  useLazyListOrderApprovalsDeletedQuery,
  useGetOrderApprovalQuery,
  useLazyGetOrderApprovalQuery,
  useCreateOrderApprovalMutation,
  usePatchOrderApprovalMutation,
  useApproveOrderApprovalMutation,
  useRejectOrderApprovalMutation,
  useSendOrderApprovalToFinanceMutation,
  useSendOrderApprovalToAccountMutation,
  useFinanceAmendOrderApprovalMutation,
  useAmendOrderApprovalMutation,
  useResolvePartialDispatchReleaseMutation,
  useDeleteOrderApprovalMutation,
  useRestoreOrderApprovalMutation,
} = orderApprovalApi;

/** @deprecated Renamed — use the OrderApproval hooks above */
export const useListOrderFinanceApprovalsQuery = useListOrderApprovalsQuery;
export const useLazyListOrderFinanceApprovalsQuery = useLazyListOrderApprovalsQuery;
export const useGetOrderFinanceApprovalQuery = useGetOrderApprovalQuery;
export const useCreateOrderFinanceApprovalMutation = useCreateOrderApprovalMutation;
export const usePatchOrderFinanceApprovalMutation = usePatchOrderApprovalMutation;
export const useApproveOrderFinanceApprovalMutation = useApproveOrderApprovalMutation;
export const useRejectOrderFinanceApprovalMutation = useRejectOrderApprovalMutation;
export const useSendOrderFinanceApprovalToFinanceMutation = useSendOrderApprovalToFinanceMutation;
export const useFinanceAmendOrderFinanceApprovalMutation = useFinanceAmendOrderApprovalMutation;
export const useDeleteOrderFinanceApprovalMutation = useDeleteOrderApprovalMutation;
export const useRestoreOrderFinanceApprovalMutation = useRestoreOrderApprovalMutation;
