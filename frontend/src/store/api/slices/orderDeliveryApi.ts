import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export const orderDeliveryApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listOrderDeliveries: build.query<unknown, Record<string, any> | void>({
      query: (params) => ({
        url: "order-deliveries",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Order", id: "DELIVERY_LIST" }],
    }),
    createOrderDelivery: build.mutation<any, Record<string, any>>({
      query: (body) => ({
        url: "order-deliveries",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: ["Order", "Orders", "Transport"],
    }),
    logShipmentDelivery: build.mutation<
      {
        delivery: Record<string, unknown> | null;
        order_return: Record<string, unknown> | null;
        queued: boolean;
        transport_status: string;
        delivery_type: string;
      },
      Record<string, any>
    >({
      query: (body) => ({
        url: "order-deliveries/log-shipment",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: ["Order", "Orders", "Transport"],
    }),
  }),
});

export const {
  useListOrderDeliveriesQuery,
  useCreateOrderDeliveryMutation,
  useLogShipmentDeliveryMutation,
} = orderDeliveryApi;
