import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

type LooseRecord = Record<string, unknown>;

export type OrderDueSheetListParams = {
  order?: string;
  status?: "active" | "superseded" | "archived";
  is_current?: boolean | string;
};

/** `/api/order-due-sheets` */
export const orderDueSheetApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listOrderDueSheets: build.query<unknown, OrderDueSheetListParams | void>({
      query: (params) => ({
        url: "order-due-sheets",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (result) => {
        const rows = Array.isArray(result) ? result : [];
        return [
          { type: "Order", id: "DUE_SHEET_LIST" },
          ...rows.map((row) => {
            const id = String((row as LooseRecord)?._id ?? "");
            const orderId = String((row as LooseRecord)?.order ?? "");
            return [
              { type: "Order" as const, id: `DUE_SHEET_${id}` },
              orderId ? { type: "Order" as const, id: `DUE_SHEET_ORDER_${orderId}` } : null,
            ].filter(Boolean);
          }).flat(),
        ];
      },
    }),

    listOrderDueSheetsDeleted: build.query<unknown, { order?: string } | void>({
      query: (params) => ({
        url: "order-due-sheets/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Order", id: "DUE_SHEET_DELETED" }],
    }),

    getOrderDueSheet: build.query<unknown, string>({
      query: (id) => `order-due-sheets/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "Order", id: `DUE_SHEET_${id}` }],
    }),

    getCurrentOrderDueSheet: build.query<unknown, string>({
      query: (orderId) => `order-due-sheets/order/${orderId}/current`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, orderId) => [
        { type: "Order", id: orderId },
        { type: "Order", id: `DUE_SHEET_ORDER_${orderId}` },
        { type: "Order", id: `DUE_SHEET_CURRENT_${orderId}` },
      ],
    }),

    createOrderDueSheet: build.mutation<unknown, LooseRecord | FormData>({
      query: (body) => ({
        url: "order-due-sheets",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Order", "Orders", "Attachments"],
    }),

    patchOrderDueSheet: build.mutation<
      unknown,
      { id: string; patch: LooseRecord }
    >({
      query: ({ id, patch }) => ({
        url: `order-due-sheets/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, { id }) => [
        "Order",
        "Orders",
        { type: "Order", id: `DUE_SHEET_${id}` },
        { type: "Order", id: "DUE_SHEET_LIST" },
      ],
    }),

    replaceOrderDueSheetDocument: build.mutation<
      unknown,
      { id: string; body: FormData }
    >({
      query: ({ id, body }) => ({
        url: `order-due-sheets/${id}/document`,
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, { id }) => [
        "Order",
        "Orders",
        "Attachments",
        { type: "Order", id: `DUE_SHEET_${id}` },
        { type: "Order", id: "DUE_SHEET_LIST" },
      ],
    }),

    deleteOrderDueSheet: build.mutation<unknown, string>({
      query: (id) => ({
        url: `order-due-sheets/${id}`,
        method: "DELETE",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Order",
        "Orders",
        { type: "Order", id: `DUE_SHEET_${id}` },
        { type: "Order", id: "DUE_SHEET_LIST" },
        { type: "Order", id: "DUE_SHEET_DELETED" },
      ],
    }),

    restoreOrderDueSheet: build.mutation<unknown, string>({
      query: (id) => ({
        url: `order-due-sheets/${id}/restore`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Order",
        "Orders",
        { type: "Order", id: `DUE_SHEET_${id}` },
        { type: "Order", id: "DUE_SHEET_LIST" },
        { type: "Order", id: "DUE_SHEET_DELETED" },
      ],
    }),
  }),
});

export const {
  useListOrderDueSheetsQuery,
  useLazyListOrderDueSheetsQuery,
  useListOrderDueSheetsDeletedQuery,
  useLazyListOrderDueSheetsDeletedQuery,
  useGetOrderDueSheetQuery,
  useLazyGetOrderDueSheetQuery,
  useGetCurrentOrderDueSheetQuery,
  useLazyGetCurrentOrderDueSheetQuery,
  useCreateOrderDueSheetMutation,
  usePatchOrderDueSheetMutation,
  useReplaceOrderDueSheetDocumentMutation,
  useDeleteOrderDueSheetMutation,
  useRestoreOrderDueSheetMutation,
} = orderDueSheetApi;
