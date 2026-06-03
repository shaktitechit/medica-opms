import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type TransportAgentRecord = {
  _id?: string;
  id?: string;
  agent_code?: string;
  agent_name?: string;
  agent_type?: "internal_fleet" | "third_party" | "courier";
  contact_person?: string;
  mobile?: string;
  alternate_mobile?: string;
  email?: string;
  gst_no?: string;
  pan_no?: string;
  payment_terms?: string;
  status?: "active" | "inactive" | "blacklisted";
  remarks?: string;
  is_active?: boolean;
};

/** `/api/transport-agents` */
export const transportAgentsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listTransportAgents: build.query<
      TransportAgentRecord[],
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "transport-agents",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<TransportAgentRecord[]>) =>
        (unwrapEnvelope(raw) as TransportAgentRecord[]) ?? [],
      providesTags: [{ type: "TransportAgents", id: "LIST" }],
    }),
    listTransportAgentsDeleted: build.query<
      TransportAgentRecord[],
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "transport-agents/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<TransportAgentRecord[]>) =>
        (unwrapEnvelope(raw) as TransportAgentRecord[]) ?? [],
      providesTags: [{ type: "TransportAgents", id: "DELETED" }],
    }),
    getTransportAgent: build.query<TransportAgentRecord, string>({
      query: (id) => `transport-agents/${id}`,
      transformResponse: (raw: ApiEnvelope<TransportAgentRecord>) =>
        unwrapEnvelope(raw) as TransportAgentRecord,
      providesTags: (_r, _e, id) => [{ type: "TransportAgents", id }],
    }),
    createTransportAgent: build.mutation<TransportAgentRecord, Record<string, unknown>>({
      query: (body) => ({ url: "transport-agents", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<TransportAgentRecord>) =>
        unwrapEnvelope(raw) as TransportAgentRecord,
      invalidatesTags: ["TransportAgents"],
    }),
    patchTransportAgent: build.mutation<
      TransportAgentRecord,
      { id: string; patch: Record<string, unknown> }
    >({
      query: ({ id, patch }) => ({
        url: `transport-agents/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<TransportAgentRecord>) =>
        unwrapEnvelope(raw) as TransportAgentRecord,
      invalidatesTags: (_r, _e, arg) => [
        "TransportAgents",
        { type: "TransportAgents", id: arg.id },
      ],
    }),
    deleteTransportAgent: build.mutation<TransportAgentRecord, string>({
      query: (id) => ({ url: `transport-agents/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<TransportAgentRecord>) =>
        unwrapEnvelope(raw) as TransportAgentRecord,
      invalidatesTags: (_r, _e, id) => [
        "TransportAgents",
        { type: "TransportAgents", id },
        { type: "TransportAgents", id: "LIST" },
        { type: "TransportAgents", id: "DELETED" },
      ],
    }),
    restoreTransportAgent: build.mutation<TransportAgentRecord, string>({
      query: (id) => ({ url: `transport-agents/${id}/restore`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<TransportAgentRecord>) =>
        unwrapEnvelope(raw) as TransportAgentRecord,
      invalidatesTags: (_r, _e, id) => [
        "TransportAgents",
        { type: "TransportAgents", id },
        { type: "TransportAgents", id: "LIST" },
        { type: "TransportAgents", id: "DELETED" },
      ],
    }),
  }),
});

export const {
  useListTransportAgentsQuery,
  useLazyListTransportAgentsQuery,
  useListTransportAgentsDeletedQuery,
  useGetTransportAgentQuery,
  useCreateTransportAgentMutation,
  usePatchTransportAgentMutation,
  useDeleteTransportAgentMutation,
  useRestoreTransportAgentMutation,
} = transportAgentsApi;
