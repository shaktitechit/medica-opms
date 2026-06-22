import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type FollowUpItem = {
  _id?: string;
  id?: string;
  followup_date: string;
  remarks: string;
  status: "pending" | "completed" | "cancelled";
  created_by?: string | { _id: string; name: string; email: string };
  createdAt?: string;
  updatedAt?: string;
};

export type ReminderRecord = {
  _id?: string;
  id?: string;
  user?: string | { _id: string; name: string; email: string };
  order: string | { _id: string; order_no: string; grand_total: number; status: string };
  party?: string | { _id: string; party_name: string; mobile?: string; email?: string };
  follow_ups: FollowUpItem[];
  next_followup_date?: string;
  status: "active" | "completed" | "dismissed";
  reminder_type: "payment" | "remarks" | "follow_up" | "other";
  createdAt?: string;
  updatedAt?: string;
};

/** `/api/reminders` — follow-up reminders suite. */
export const remindersApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listReminders: build.query<
      ReminderRecord[],
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "reminders",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<ReminderRecord[]>) =>
        (unwrapEnvelope(raw) as ReminderRecord[]) ?? [],
      providesTags: [{ type: "Reminders", id: "LIST" }],
    }),
    getReminder: build.query<ReminderRecord, string>({
      query: (id) => `reminders/${id}`,
      transformResponse: (raw: ApiEnvelope<ReminderRecord>) =>
        unwrapEnvelope(raw) as ReminderRecord,
      providesTags: (_r, _e, id) => [{ type: "Reminders", id }],
    }),
    createReminder: build.mutation<
      ReminderRecord,
      { order: string; followup_date: string; remarks: string; reminder_type?: string }
    >({
      query: (body) => ({ url: "reminders", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<ReminderRecord>) =>
        unwrapEnvelope(raw) as ReminderRecord,
      invalidatesTags: ["Reminders", "Orders"],
    }),
    addFollowUp: build.mutation<
      ReminderRecord,
      { id: string; followup_date: string; remarks: string; status?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `reminders/${id}/follow-ups`,
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<ReminderRecord>) =>
        unwrapEnvelope(raw) as ReminderRecord,
      invalidatesTags: (_r, _e, arg) => [
        "Reminders",
        { type: "Reminders", id: arg.id },
        "Orders",
      ],
    }),
    patchReminder: build.mutation<
      ReminderRecord,
      { id: string; patch: Partial<ReminderRecord> }
    >({
      query: ({ id, patch }) => ({
        url: `reminders/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<ReminderRecord>) =>
        unwrapEnvelope(raw) as ReminderRecord,
      invalidatesTags: (_r, _e, arg) => [
        "Reminders",
        { type: "Reminders", id: arg.id },
        "Orders",
      ],
    }),
    deleteReminder: build.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `reminders/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<{ success: boolean }>) =>
        unwrapEnvelope(raw) as { success: boolean },
      invalidatesTags: (_r, _e, id) => [
        "Reminders",
        { type: "Reminders", id },
        { type: "Reminders", id: "LIST" },
        "Orders",
      ],
    }),
  }),
});

export const {
  useListRemindersQuery,
  useLazyListRemindersQuery,
  useGetReminderQuery,
  useLazyGetReminderQuery,
  useCreateReminderMutation,
  useAddFollowUpMutation,
  usePatchReminderMutation,
  useDeleteReminderMutation,
} = remindersApi;
