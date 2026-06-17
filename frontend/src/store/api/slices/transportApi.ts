import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

type LooseRecord = Record<string, unknown>;
type TransportListParams = {
  order?: string;
  dispatch?: string;
  transport_agent?: string;
  shipment_status?: string;
  vehicle_number?: string;
  vehicle_no?: string;
  driver_mobile?: string;
  driver_phone?: string;
  driver_name?: string;
};

type TransportMutationBody = LooseRecord & {
  order?: string;
  dispatch?: string;
  transport_agent?: string;
  transporter?: string;
  transporter_type?: string;
  shipment_status?: string;
  status?: string;
  transporter_name?: string;
  transporter_phone?: string;
  source_location?: string;
  destination_location?: string;
  route_details?: string;
  vehicle_number?: string;
  vehicle_no?: string;
  driver_name?: string;
  driver_mobile?: string;
  driver_phone?: string;
  lr_number?: string;
  tracking_number?: string;
  eway_bill_no?: string;
  dispatch_date?: string;
  pickup_date?: string;
  expected_delivery_date?: string;
  actual_delivery_date?: string;
  delivery_proof_url?: string;
  proof_of_delivery?: string;
  remarks?: string;
  weight?: number;
  weight_unit?: string;
  packed_boxes?: number;
  open_boxes?: number;
  total_quantity?: number;
};

const LEGACY_STATUS_TO_SHIPMENT_STATUS: Record<string, string> = {
  pending: "created",
  assigned: "vehicle_assigned",
  failed: "delivery_failed",
  cancelled: "returned",
};

function normalizeShipmentStatus(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return LEGACY_STATUS_TO_SHIPMENT_STATUS[value] ?? value;
}

function normalizeTransportBody(body: TransportMutationBody): TransportMutationBody {
  return {
    ...body,
    shipment_status: normalizeShipmentStatus(body.shipment_status ?? body.status),
    vehicle_number: body.vehicle_number ?? body.vehicle_no,
    driver_mobile: body.driver_mobile ?? body.driver_phone,
    delivery_proof_url: body.delivery_proof_url ?? body.proof_of_delivery,
  };
}

/** `/api/transport` */
export const transportApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listTransports: build.query<
      unknown,
      TransportListParams | void
    >({
      query: (params) => ({
        url: "transport",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Transport", id: "LIST" }],
    }),
    listTransportsDeleted: build.query<
      unknown,
      TransportListParams | void
    >({
      query: (params) => ({
        url: "transport/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Transport", id: "DELETED" }],
    }),
    getTransport: build.query<unknown, string>({
      query: (id) => `transport/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "Transport", id }],
    }),
    createTransport: build.mutation<unknown, TransportMutationBody>({
      query: (body) => ({
        url: "transport",
        method: "POST",
        body: normalizeTransportBody(body),
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Transport", "Order", "Orders"],
    }),
    patchTransport: build.mutation<
      unknown,
      { id: string; patch: TransportMutationBody }
    >({
      query: ({ id, patch }) => ({
        url: `transport/${id}`,
        method: "PATCH",
        body: normalizeTransportBody(patch),
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "Transport",
        "Order",
        "Orders",
        { type: "Transport", id: arg.id },
      ],
    }),
    deleteTransport: build.mutation<unknown, string>({
      query: (id) => ({ url: `transport/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Transport",
        "Order",
        "Orders",
        { type: "Transport", id },
        { type: "Transport", id: "LIST" },
        { type: "Transport", id: "DELETED" },
      ],
    }),
    restoreTransport: build.mutation<unknown, string>({
      query: (id) => ({ url: `transport/${id}/restore`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Transport",
        "Order",
        "Orders",
        { type: "Transport", id },
        { type: "Transport", id: "LIST" },
        { type: "Transport", id: "DELETED" },
      ],
    }),
  }),
});

export const {
  useListTransportsQuery,
  useLazyListTransportsQuery,
  useListTransportsDeletedQuery,
  useLazyListTransportsDeletedQuery,
  useGetTransportQuery,
  useLazyGetTransportQuery,
  useCreateTransportMutation,
  usePatchTransportMutation,
  useDeleteTransportMutation,
  useRestoreTransportMutation,
} = transportApi;
