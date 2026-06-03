import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** `/api/attachments` */
export const attachmentsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listAttachments: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "attachments",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Attachments", id: "LIST" }],
    }),
    listAttachmentsDeleted: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "attachments/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Attachments", id: "DELETED" }],
    }),
    getAttachment: build.query<unknown, string>({
      query: (id) => `attachments/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "Attachments", id }],
    }),
    createAttachment: build.mutation<
      unknown,
      Record<string, unknown> | FormData
    >({
      query: (body) => ({ url: "attachments", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Attachments"],
    }),
    deleteAttachment: build.mutation<unknown, string>({
      query: (id) => ({ url: `attachments/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Attachments",
        { type: "Attachments", id },
        { type: "Attachments", id: "LIST" },
        { type: "Attachments", id: "DELETED" },
      ],
    }),
    restoreAttachment: build.mutation<unknown, string>({
      query: (id) => ({
        url: `attachments/${id}/restore`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Attachments",
        { type: "Attachments", id },
        { type: "Attachments", id: "LIST" },
        { type: "Attachments", id: "DELETED" },
      ],
    }),
  }),
});

export const {
  useListAttachmentsQuery,
  useLazyListAttachmentsQuery,
  useListAttachmentsDeletedQuery,
  useLazyListAttachmentsDeletedQuery,
  useGetAttachmentQuery,
  useLazyGetAttachmentQuery,
  useCreateAttachmentMutation,
  useDeleteAttachmentMutation,
  useRestoreAttachmentMutation,
} = attachmentsApi;
