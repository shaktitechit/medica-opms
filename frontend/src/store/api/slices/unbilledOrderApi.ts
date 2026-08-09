import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type UnbilledOrderStatus = "open" | "resolved" | "cancelled";

export type UnbilledOrderBillingStatus =
  | "unbilled"
  | "partially_billed"
  | "fully_billed";

export type UnbilledOrderItem = {
  _id?: string;
  order_item_id: string;
  product?: string | { _id?: string; product_name?: string; sku?: string };
  product_name?: string;
  sku?: string;
  approved_quantity: number;
  billed_dispatched_quantity: number;
  remaining_quantity: number;
};

export type UnbilledOrderRecord = {
  _id?: string;
  id?: string;
  order: string | { _id?: string; order_no?: string; status?: string };
  order_no?: string;
  party?: string | { _id?: string; party_name?: string };
  customer?: string | { _id?: string; name?: string };
  billing_status?: UnbilledOrderBillingStatus;
  status: UnbilledOrderStatus;
  /** Unbilled / partially_billed (or resolved / cancelled). */
  pipeline_stage?: string;
  approved_quantity: number;
  billed_dispatched_quantity: number;
  remaining_quantity: number;
  unbilled_items?: UnbilledOrderItem[];
  manual_remaining?: boolean;
  manual_resolved?: boolean;
  replacement_order?: string | { _id?: string };
  last_synced_at?: string;
  remarks?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type UnbilledOrderListParams = {
  order?: string;
  party?: string;
  status?: UnbilledOrderStatus | string;
  billing_status?: string;
  search?: string;
  /** When `"true"`, include resolved/cancelled rows (default API returns open only). */
  include_resolved?: string;
};

/** `/api/unbilled-orders` — approved qty not yet covered by dispatched qty. */
export const unbilledOrderApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listUnbilledOrders: build.query<
      UnbilledOrderRecord[],
      UnbilledOrderListParams | void
    >({
      query: (params) => ({
        url: "unbilled-orders",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<UnbilledOrderRecord[]>) =>
        (unwrapEnvelope(raw) as UnbilledOrderRecord[]) ?? [],
      providesTags: (result) => {
        const rows = Array.isArray(result) ? result : [];
        return [
          { type: "UnbilledOrders" as const, id: "LIST" },
          ...rows.map((row) => ({
            type: "UnbilledOrders" as const,
            id: String(row._id ?? row.id ?? ""),
          })),
        ];
      },
    }),

    listUnbilledOrdersDeleted: build.query<
      UnbilledOrderRecord[],
      { order?: string } | void
    >({
      query: (params) => ({
        url: "unbilled-orders/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<UnbilledOrderRecord[]>) =>
        (unwrapEnvelope(raw) as UnbilledOrderRecord[]) ?? [],
      providesTags: [{ type: "UnbilledOrders", id: "DELETED" }],
    }),

    getUnbilledOrder: build.query<UnbilledOrderRecord, string>({
      query: (id) => `unbilled-orders/${id}`,
      transformResponse: (raw: ApiEnvelope<UnbilledOrderRecord>) =>
        unwrapEnvelope(raw) as UnbilledOrderRecord,
      providesTags: (_r, _e, id) => [{ type: "UnbilledOrders", id }],
    }),

    getUnbilledOrderByOrder: build.query<UnbilledOrderRecord | null, string>({
      query: (orderId) => `unbilled-orders/order/${orderId}`,
      transformResponse: (raw: ApiEnvelope<UnbilledOrderRecord | null>) =>
        (unwrapEnvelope(raw) as UnbilledOrderRecord | null) ?? null,
      providesTags: (_r, _e, orderId) => [
        { type: "UnbilledOrders", id: `ORDER_${orderId}` },
        { type: "UnbilledOrders", id: "LIST" },
      ],
    }),

    createUnbilledOrder: build.mutation<
      UnbilledOrderRecord | null,
      { order: string; remarks?: string }
    >({
      query: (body) => ({
        url: "unbilled-orders",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<UnbilledOrderRecord | null>) =>
        (unwrapEnvelope(raw) as UnbilledOrderRecord | null) ?? null,
      invalidatesTags: ["UnbilledOrders", "Orders"],
    }),

    patchUnbilledOrder: build.mutation<
      UnbilledOrderRecord,
      {
        id: string;
        patch: Partial<{
          status: UnbilledOrderStatus;
          remarks: string;
          replacement_order: string;
          manual_resolved: boolean;
        }>;
      }
    >({
      query: ({ id, patch }) => ({
        url: `unbilled-orders/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<UnbilledOrderRecord>) =>
        unwrapEnvelope(raw) as UnbilledOrderRecord,
      invalidatesTags: (_r, _e, { id }) => [
        "UnbilledOrders",
        { type: "UnbilledOrders", id },
        { type: "UnbilledOrders", id: "LIST" },
      ],
    }),

    deleteUnbilledOrder: build.mutation<UnbilledOrderRecord, string>({
      query: (id) => ({
        url: `unbilled-orders/${id}`,
        method: "DELETE",
      }),
      transformResponse: (raw: ApiEnvelope<UnbilledOrderRecord>) =>
        unwrapEnvelope(raw) as UnbilledOrderRecord,
      invalidatesTags: (_r, _e, id) => [
        "UnbilledOrders",
        { type: "UnbilledOrders", id },
        { type: "UnbilledOrders", id: "LIST" },
        { type: "UnbilledOrders", id: "DELETED" },
      ],
    }),

    restoreUnbilledOrder: build.mutation<UnbilledOrderRecord, string>({
      query: (id) => ({
        url: `unbilled-orders/${id}/restore`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<UnbilledOrderRecord>) =>
        unwrapEnvelope(raw) as UnbilledOrderRecord,
      invalidatesTags: (_r, _e, id) => [
        "UnbilledOrders",
        { type: "UnbilledOrders", id },
        { type: "UnbilledOrders", id: "LIST" },
        { type: "UnbilledOrders", id: "DELETED" },
      ],
    }),
  }),
});

export const {
  useListUnbilledOrdersQuery,
  useLazyListUnbilledOrdersQuery,
  useListUnbilledOrdersDeletedQuery,
  useLazyListUnbilledOrdersDeletedQuery,
  useGetUnbilledOrderQuery,
  useLazyGetUnbilledOrderQuery,
  useGetUnbilledOrderByOrderQuery,
  useLazyGetUnbilledOrderByOrderQuery,
  useCreateUnbilledOrderMutation,
  usePatchUnbilledOrderMutation,
  useDeleteUnbilledOrderMutation,
  useRestoreUnbilledOrderMutation,
} = unbilledOrderApi;
