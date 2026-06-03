import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

type LooseRecord = Record<string, unknown>;

function normalizeDispatchBody(body: LooseRecord): LooseRecord {
  const dispatchItems = Array.isArray(body.dispatch_items)
    ? body.dispatch_items
    : Array.isArray(body.items)
      ? body.items
      : undefined;

  return {
    ...body,
    dispatch_status: body.dispatch_status ?? body.status,
    dispatch_items: dispatchItems,
  };
}

/** `/api/dispatch` */
export const dispatchApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listDispatches: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "dispatch",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Dispatch", id: "LIST" }],
    }),
    listDispatchesDeleted: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "dispatch/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Dispatch", id: "DELETED" }],
    }),
    getDispatch: build.query<unknown, string>({
      query: (id) => `dispatch/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "Dispatch", id }],
    }),
    createDispatch: build.mutation<unknown, LooseRecord>({
      query: (body) => ({
        url: "dispatch",
        method: "POST",
        body: normalizeDispatchBody(body),
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Dispatch", "Order", "Orders"],
    }),
    patchDispatch: build.mutation<
      unknown,
      { id: string; patch: Record<string, unknown> }
    >({
      query: ({ id, patch }) => ({
        url: `dispatch/${id}`,
        method: "PATCH",
        body: normalizeDispatchBody(patch),
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "Dispatch",
        "Order",
        "Orders",
        { type: "Dispatch", id: arg.id },
      ],
    }),
    deleteDispatch: build.mutation<unknown, string>({
      query: (id) => ({ url: `dispatch/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Dispatch",
        "Order",
        "Orders",
        { type: "Dispatch", id },
        { type: "Dispatch", id: "LIST" },
        { type: "Dispatch", id: "DELETED" },
      ],
    }),
    restoreDispatch: build.mutation<unknown, string>({
      query: (id) => ({ url: `dispatch/${id}/restore`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Dispatch",
        "Order",
        "Orders",
        { type: "Dispatch", id },
        { type: "Dispatch", id: "LIST" },
        { type: "Dispatch", id: "DELETED" },
      ],
    }),
  }),
});

export const {
  useListDispatchesQuery,
  useLazyListDispatchesQuery,
  useListDispatchesDeletedQuery,
  useLazyListDispatchesDeletedQuery,
  useGetDispatchQuery,
  useLazyGetDispatchQuery,
  useCreateDispatchMutation,
  usePatchDispatchMutation,
  useDeleteDispatchMutation,
  useRestoreDispatchMutation,
} = dispatchApi;
