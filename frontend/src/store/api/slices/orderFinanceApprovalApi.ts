import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

type ApprovalQuery = {
  order?: string;
  approval_status?: string;
};

type ApprovalMutationArg = {
  id: string;
  patch?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

const orderFinanceApprovalTags = (id?: string) => [
  { type: "OrderFinanceApprovals" as const, id: "LIST" },
  ...(id ? [{ type: "OrderFinanceApprovals" as const, id }] : []),
  "FinanceQueue" as const,
  "FinanceSummary" as const,
  "Order" as const,
  "Orders" as const,
];

/** `/api/order-finance-approvals` */
export const orderFinanceApprovalApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listOrderFinanceApprovals: build.query<unknown, ApprovalQuery | void>({
      query: (params) => ({
        url: "order-finance-approvals",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "OrderFinanceApprovals", id: "LIST" }],
    }),
    listOrderFinanceApprovalsDeleted: build.query<unknown, Pick<ApprovalQuery, "order"> | void>({
      query: (params) => ({
        url: "order-finance-approvals/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "OrderFinanceApprovals", id: "DELETED" }],
    }),
    getOrderFinanceApproval: build.query<unknown, string>({
      query: (id) => `order-finance-approvals/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "OrderFinanceApprovals", id }],
    }),
    createOrderFinanceApproval: build.mutation<unknown, Record<string, unknown>>({
      query: (body) => ({
        url: "order-finance-approvals",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: orderFinanceApprovalTags(),
    }),
    patchOrderFinanceApproval: build.mutation<unknown, Required<Pick<ApprovalMutationArg, "id" | "patch">>>({
      query: ({ id, patch }) => ({
        url: `order-finance-approvals/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => orderFinanceApprovalTags(arg.id),
    }),
    approveOrderFinanceApproval: build.mutation<unknown, ApprovalMutationArg>({
      query: ({ id, body }) => ({
        url: `order-finance-approvals/${id}/approve`,
        method: "POST",
        body: body ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => orderFinanceApprovalTags(arg.id),
    }),
    rejectOrderFinanceApproval: build.mutation<unknown, ApprovalMutationArg>({
      query: ({ id, body }) => ({
        url: `order-finance-approvals/${id}/reject`,
        method: "POST",
        body: body ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => orderFinanceApprovalTags(arg.id),
    }),
    deleteOrderFinanceApproval: build.mutation<unknown, string>({
      query: (id) => ({
        url: `order-finance-approvals/${id}`,
        method: "DELETE",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        ...orderFinanceApprovalTags(id),
        { type: "OrderFinanceApprovals", id: "DELETED" },
      ],
    }),
    restoreOrderFinanceApproval: build.mutation<unknown, string>({
      query: (id) => ({
        url: `order-finance-approvals/${id}/restore`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        ...orderFinanceApprovalTags(id),
        { type: "OrderFinanceApprovals", id: "DELETED" },
      ],
    }),
  }),
});

export const {
  useListOrderFinanceApprovalsQuery,
  useLazyListOrderFinanceApprovalsQuery,
  useListOrderFinanceApprovalsDeletedQuery,
  useLazyListOrderFinanceApprovalsDeletedQuery,
  useGetOrderFinanceApprovalQuery,
  useLazyGetOrderFinanceApprovalQuery,
  useCreateOrderFinanceApprovalMutation,
  usePatchOrderFinanceApprovalMutation,
  useApproveOrderFinanceApprovalMutation,
  useRejectOrderFinanceApprovalMutation,
  useDeleteOrderFinanceApprovalMutation,
  useRestoreOrderFinanceApprovalMutation,
} = orderFinanceApprovalApi;
