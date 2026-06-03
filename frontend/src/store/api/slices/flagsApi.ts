import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** `/api/flags` — order/issue flags suite. */
export const flagsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listFlags: build.query<unknown, Record<string, string | undefined> | void>({
      query: (params) => ({
        url: "flags",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Flags", id: "LIST" }],
    }),
    getFlag: build.query<unknown, string>({
      query: (id) => `flags/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "Flags", id }],
    }),
    createFlag: build.mutation<unknown, Record<string, unknown>>({
      query: (body) => ({ url: "flags", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Flags", "Orders"],
    }),
    patchFlag: build.mutation<
      unknown,
      { id: string; patch: Record<string, unknown> }
    >({
      query: ({ id, patch }) => ({
        url: `flags/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "Flags",
        { type: "Flags", id: arg.id },
        "Orders",
      ],
    }),
  }),
});

export const {
  useListFlagsQuery,
  useLazyListFlagsQuery,
  useGetFlagQuery,
  useLazyGetFlagQuery,
  useCreateFlagMutation,
  usePatchFlagMutation,
} = flagsApi;
