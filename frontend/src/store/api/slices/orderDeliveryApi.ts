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
    logShipmentDelivery: build.mutation<
      {
        delivery: Record<string, unknown>;
        queued: boolean;
        transport_status: string;
        delivery_type: "full";
      },
      Record<string, any>
    >({
      query: (body) => ({
        url: "order-deliveries/log-shipment",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: ["Order", "Orders", "Transport", "TransportPlans", "Dispatch"],
    }),
    patchOrderDelivery: build.mutation<
      unknown,
      { id: string; patch: Record<string, unknown> }
    >({
      query: ({ id, patch }) => ({
        url: `order-deliveries/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: [
        "Order",
        "Orders",
        "Transport",
        "TransportPlans",
        "Dispatch",
        { type: "Order", id: "DELIVERY_LIST" },
      ],
    }),
  }),
});

export const {
  useListOrderDeliveriesQuery,
  useLogShipmentDeliveryMutation,
  usePatchOrderDeliveryMutation,
} = orderDeliveryApi;
