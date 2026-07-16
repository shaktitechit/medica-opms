import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";
import type { TransportAgentRecord } from "./transportAgentsApi";
import type { VehicleRecord } from "./vehiclesApi";

export type DriverRecord = {
  _id?: string;
  id?: string;
  driver_code?: string;
  name?: string;
  phone?: string;
  alternate_phone?: string;
  transport_agent?: string | TransportAgentRecord;
  assigned_vehicle?: string | VehicleRecord;
  license_no?: string;
  license_type?: string;
  license_expiry?: string;
  status?: string;
  remarks?: string;
  is_active?: boolean;
};

/** `/api/drivers` */
export const driversApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listDrivers: build.query<
      DriverRecord[],
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "drivers",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<DriverRecord[]>) =>
        (unwrapEnvelope(raw) as DriverRecord[]) ?? [],
      providesTags: [{ type: "Drivers", id: "LIST" }],
    }),
    listDriversDeleted: build.query<
      DriverRecord[],
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "drivers/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<DriverRecord[]>) =>
        (unwrapEnvelope(raw) as DriverRecord[]) ?? [],
      providesTags: [{ type: "Drivers", id: "DELETED" }],
    }),
    getDriver: build.query<DriverRecord, string>({
      query: (id) => `drivers/${id}`,
      transformResponse: (raw: ApiEnvelope<DriverRecord>) =>
        unwrapEnvelope(raw) as DriverRecord,
      providesTags: (_r, _e, id) => [{ type: "Drivers", id }],
    }),
    createDriver: build.mutation<DriverRecord, Record<string, unknown>>({
      query: (body) => ({ url: "drivers", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<DriverRecord>) =>
        unwrapEnvelope(raw) as DriverRecord,
      invalidatesTags: [{ type: "Drivers", id: "LIST" }, "Drivers"],
    }),
    patchDriver: build.mutation<
      DriverRecord,
      { id: string; patch: Record<string, unknown> }
    >({
      query: ({ id, patch }) => ({
        url: `drivers/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<DriverRecord>) =>
        unwrapEnvelope(raw) as DriverRecord,
      invalidatesTags: (_r, _e, arg) => [
        "Drivers",
        { type: "Drivers", id: arg.id },
      ],
    }),
    deleteDriver: build.mutation<DriverRecord, string>({
      query: (id) => ({ url: `drivers/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<DriverRecord>) =>
        unwrapEnvelope(raw) as DriverRecord,
      invalidatesTags: (_r, _e, id) => [
        "Drivers",
        { type: "Drivers", id },
        { type: "Drivers", id: "LIST" },
        { type: "Drivers", id: "DELETED" },
      ],
    }),
    restoreDriver: build.mutation<DriverRecord, string>({
      query: (id) => ({ url: `drivers/${id}/restore`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<DriverRecord>) =>
        unwrapEnvelope(raw) as DriverRecord,
      invalidatesTags: (_r, _e, id) => [
        "Drivers",
        { type: "Drivers", id },
        { type: "Drivers", id: "LIST" },
        { type: "Drivers", id: "DELETED" },
      ],
    }),
  }),
});

export const {
  useListDriversQuery,
  useLazyListDriversQuery,
  useListDriversDeletedQuery,
  useLazyListDriversDeletedQuery,
  useGetDriverQuery,
  useLazyGetDriverQuery,
  useCreateDriverMutation,
  usePatchDriverMutation,
  useDeleteDriverMutation,
  useRestoreDriverMutation,
} = driversApi;
