import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

type LooseRecord = Record<string, unknown>;

const orderEntityTags = (id: string) => [
  { type: "Order" as const, id },
  { type: "Orders" as const, id: "LIST" },
  { type: "Orders" as const, id: "DELETED" },
  { type: "PartyProducts" as const, id },
  { type: "OrderApprovals" as const, id: "LIST" },
];

function normalizeOrderItem(item: unknown): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const row = item as LooseRecord;
  return {
    ...row,
    ordered_quantity: row.ordered_quantity ?? row.quantity,
    free_quantity: row.free_quantity ?? row.free_qty ?? 0,
    allocated_quantity: row.allocated_quantity ?? 0,
    dispatched_quantity: row.dispatched_quantity ?? 0,
    delivered_quantity: row.delivered_quantity ?? 0,
    cancelled_quantity: row.cancelled_quantity ?? 0,
  };
}

function normalizeOrderBody(body: LooseRecord): LooseRecord {
  if (!Array.isArray(body.order_items)) return body;
  return {
    ...body,
    order_items: body.order_items.map(normalizeOrderItem),
  };
}

/** `/api/orders` — RBAC + workflow on server. */
export const ordersApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listOrders: build.query<unknown, Record<string, string | undefined> | void>({
      query: (params) => ({
        url: "orders",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Orders", id: "LIST" }],
    }),
    listOrdersDeleted: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "orders/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Orders", id: "DELETED" }],
    }),
    getOrder: build.query<unknown, string>({
      query: (id) => `orders/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "Order", id }],
    }),
    getOrderHistory: build.query<unknown, string>({
      query: (id) => `orders/${id}/history`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "Order", id }],
    }),
    getOrderApprovals: build.query<unknown, string>({
      query: (id) => `orders/${id}/approvals`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [
        { type: "Order", id },
        { type: "Approvals", id: "LIST" },
        { type: "OrderApprovals", id: "LIST" },
      ],
    }),
    getOrderFulfillment: build.query<unknown, string>({
      query: (id) => `orders/${id}/fulfillment`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "Order", id }],
    }),
    getOrderAssignees: build.query<unknown, string>({
      query: (id) => `orders/${id}/assignees`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "Order", id }],
    }),
    createOrder: build.mutation<unknown, LooseRecord>({
      query: (body) => ({ url: "orders", method: "POST", body: normalizeOrderBody(body) }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Orders"],
    }),
    patchOrder: build.mutation<
      unknown,
      { id: string; patch: LooseRecord }
    >({
      query: ({ id, patch }) => ({
        url: `orders/${id}`,
        method: "PATCH",
        body: normalizeOrderBody(patch),
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => orderEntityTags(arg.id),
    }),
    deleteOrder: build.mutation<unknown, string>({
      query: (id) => ({ url: `orders/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => orderEntityTags(id),
    }),
    restoreOrder: build.mutation<unknown, string>({
      query: (id) => ({ url: `orders/${id}/restore`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => orderEntityTags(id),
    }),
    transitionOrder: build.mutation<
      unknown,
      { id: string; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({
        url: `orders/${id}/transition`,
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        ...orderEntityTags(arg.id),
        "Approvals",
        "OrderApprovals",
        "FinanceQueue",
        "FinanceSummary",
        { type: "Order", id: arg.id },
      ],
    }),
    closeOrderWithReturns: build.mutation<
      unknown,
      {
        id: string;
        body: {
          return_id?: string;
          extra_charges?: number;
          penalty_amount?: number;
          damage_charge?: number;
          remarks?: string;
        };
      }
    >({
      query: ({ id, body }) => ({
        url: `orders/${id}/close-with-returns`,
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        ...orderEntityTags(arg.id),
        { type: "Order", id: "RETURN_LIST" },
      ],
    }),
    settleAndCloseOrder: build.mutation<
      unknown,
      {
        id: string;
        body: {
          return_id?: string;
          extra_charges?: number;
          penalty_amount?: number;
          damage_charge?: number;
          remarks?: string;
          amendment_notes?: string;
        };
      }
    >({
      query: ({ id, body }) => ({
        url: `orders/${id}/settle-and-close`,
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        ...orderEntityTags(arg.id),
        "Approvals",
        "OrderApprovals",
        "Dispatch",
        { type: "Order", id: "RETURN_LIST" },
      ],
    }),
  }),
});

export const {
  useListOrdersQuery,
  useLazyListOrdersQuery,
  useListOrdersDeletedQuery,
  useLazyListOrdersDeletedQuery,
  useGetOrderQuery,
  useLazyGetOrderQuery,
  useGetOrderHistoryQuery,
  useLazyGetOrderHistoryQuery,
  useGetOrderApprovalsQuery,
  useLazyGetOrderApprovalsQuery,
  useGetOrderFulfillmentQuery,
  useLazyGetOrderFulfillmentQuery,
  useGetOrderAssigneesQuery,
  useLazyGetOrderAssigneesQuery,
  useCreateOrderMutation,
  usePatchOrderMutation,
  useDeleteOrderMutation,
  useRestoreOrderMutation,
  useTransitionOrderMutation,
  useCloseOrderWithReturnsMutation,
  useSettleAndCloseOrderMutation,
} = ordersApi;
