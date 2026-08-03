import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type ZoneRecord = {
  _id: string;
  name: string;
  description?: string;
  is_active: boolean;
  parties?: any[];
  sales_persons?: any[];
  createdAt?: string;
  updatedAt?: string;
};

export const zonesApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listZones: build.query<
      { data: ZoneRecord[]; total: number; page: number; limit: number; pages: number },
      Record<string, string | number | undefined> | void
    >({
      query: (params) => ({
        url: "zones",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Zones", id: "LIST" }],
    }),
    getZone: build.query<ZoneRecord, string>({
      query: (id) => `zones/${id}`,
      transformResponse: (raw: ApiEnvelope<ZoneRecord>) =>
        unwrapEnvelope(raw) as ZoneRecord,
      providesTags: (_r, _e, id) => [{ type: "Zones", id }],
    }),
    createZone: build.mutation<ZoneRecord, Partial<ZoneRecord>>({
      query: (body) => ({ url: "zones", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<ZoneRecord>) =>
        unwrapEnvelope(raw) as ZoneRecord,
      invalidatesTags: [{ type: "Zones", id: "LIST" }],
    }),
    patchZone: build.mutation<
      ZoneRecord,
      { id: string; patch: Partial<ZoneRecord> }
    >({
      query: ({ id, patch }) => ({
        url: `zones/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<ZoneRecord>) =>
        unwrapEnvelope(raw) as ZoneRecord,
      invalidatesTags: (_r, _e, arg) => [
        "Zones",
        { type: "Zones", id: arg.id },
        { type: "Zones", id: "LIST" },
      ],
    }),
    deleteZone: build.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `zones/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Zones",
        { type: "Zones", id },
        { type: "Zones", id: "LIST" },
      ],
    }),
    getZoneParties: build.query<any[], string>({
      query: (id) => `zones/${id}/parties`,
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw) ?? [],
      providesTags: (_r, _e, id) => [{ type: "Zones", id: `${id}-parties` }, "Parties"],
    }),
    associateZoneParties: build.mutation<
      { success: boolean; count: number },
      { id: string; partyIds: string[] }
    >({
      query: ({ id, partyIds }) => ({
        url: `zones/${id}/parties`,
        method: "POST",
        body: { partyIds },
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "Parties",
        { type: "Zones", id: `${arg.id}-parties` },
        { type: "Zones", id: arg.id },
      ],
    }),
    getZoneSalesPersons: build.query<any[], string>({
      query: (id) => `zones/${id}/sales-persons`,
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw) ?? [],
      providesTags: (_r, _e, id) => [{ type: "Zones", id: `${id}-sales-persons` }, "Users"],
    }),
    associateZoneSalesPersons: build.mutation<
      { success: boolean; count: number },
      { id: string; salesPersonIds: string[] }
    >({
      query: ({ id, salesPersonIds }) => ({
        url: `zones/${id}/sales-persons`,
        method: "POST",
        body: { salesPersonIds },
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "Users",
        { type: "Zones", id: `${arg.id}-sales-persons` },
        { type: "Zones", id: arg.id },
      ],
    }),
  }),
});

export const {
  useListZonesQuery,
  useLazyListZonesQuery,
  useGetZoneQuery,
  useLazyGetZoneQuery,
  useCreateZoneMutation,
  usePatchZoneMutation,
  useDeleteZoneMutation,
  useGetZonePartiesQuery,
  useLazyGetZonePartiesQuery,
  useAssociateZonePartiesMutation,
  useGetZoneSalesPersonsQuery,
  useLazyGetZoneSalesPersonsQuery,
  useAssociateZoneSalesPersonsMutation,
} = zonesApi;
