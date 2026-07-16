import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";
import type { TransportAgentRecord } from "./transportAgentsApi";

export type VehicleRecord = {
  _id?: string;
  id?: string;
  vehicle_no?: string;
  transport_agent?: string | TransportAgentRecord;
  vehicle_type?: string;
  ownership_type?: string;
  status?: string;
  make?: string;
  model?: string;
  capacity_kg?: number;
  capacity_cft?: number;
  /** @deprecated legacy string capacity from older records */
  capacity?: string;
  insurance_expiry?: string;
  fitness_expiry?: string;
  pollution_expiry?: string;
  registration_expiry?: string;
  remarks?: string;
  is_active?: boolean;
};

/** `/api/vehicles` */
export const vehiclesApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listVehicles: build.query<
      VehicleRecord[],
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "vehicles",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<VehicleRecord[]>) =>
        (unwrapEnvelope(raw) as VehicleRecord[]) ?? [],
      providesTags: [{ type: "Vehicles", id: "LIST" }],
    }),
    listVehiclesDeleted: build.query<
      VehicleRecord[],
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "vehicles/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<VehicleRecord[]>) =>
        (unwrapEnvelope(raw) as VehicleRecord[]) ?? [],
      providesTags: [{ type: "Vehicles", id: "DELETED" }],
    }),
    getVehicle: build.query<VehicleRecord, string>({
      query: (id) => `vehicles/${id}`,
      transformResponse: (raw: ApiEnvelope<VehicleRecord>) =>
        unwrapEnvelope(raw) as VehicleRecord,
      providesTags: (_r, _e, id) => [{ type: "Vehicles", id }],
    }),
    createVehicle: build.mutation<VehicleRecord, Record<string, unknown>>({
      query: (body) => ({ url: "vehicles", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<VehicleRecord>) =>
        unwrapEnvelope(raw) as VehicleRecord,
      invalidatesTags: [{ type: "Vehicles", id: "LIST" }, "Vehicles"],
    }),
    patchVehicle: build.mutation<
      VehicleRecord,
      { id: string; patch: Record<string, unknown> }
    >({
      query: ({ id, patch }) => ({
        url: `vehicles/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<VehicleRecord>) =>
        unwrapEnvelope(raw) as VehicleRecord,
      invalidatesTags: (_r, _e, arg) => [
        "Vehicles",
        { type: "Vehicles", id: arg.id },
      ],
    }),
    deleteVehicle: build.mutation<VehicleRecord, string>({
      query: (id) => ({ url: `vehicles/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<VehicleRecord>) =>
        unwrapEnvelope(raw) as VehicleRecord,
      invalidatesTags: (_r, _e, id) => [
        "Vehicles",
        { type: "Vehicles", id },
        { type: "Vehicles", id: "LIST" },
        { type: "Vehicles", id: "DELETED" },
      ],
    }),
    restoreVehicle: build.mutation<VehicleRecord, string>({
      query: (id) => ({ url: `vehicles/${id}/restore`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<VehicleRecord>) =>
        unwrapEnvelope(raw) as VehicleRecord,
      invalidatesTags: (_r, _e, id) => [
        "Vehicles",
        { type: "Vehicles", id },
        { type: "Vehicles", id: "LIST" },
        { type: "Vehicles", id: "DELETED" },
      ],
    }),
  }),
});

export const {
  useListVehiclesQuery,
  useLazyListVehiclesQuery,
  useListVehiclesDeletedQuery,
  useLazyListVehiclesDeletedQuery,
  useGetVehicleQuery,
  useLazyGetVehicleQuery,
  useCreateVehicleMutation,
  usePatchVehicleMutation,
  useDeleteVehicleMutation,
  useRestoreVehicleMutation,
} = vehiclesApi;
