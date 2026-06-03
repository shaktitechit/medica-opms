import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** `/api/users` — RBAC catalogue + roster. */
export const usersApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listRoles: build.query<unknown, void>({
      query: () => ({ url: "users/roles", method: "GET" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Users", id: "roles" }],
    }),
    listPermissions: build.query<unknown, void>({
      query: () => ({ url: "users/permissions", method: "GET" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Users", id: "permissions" }],
    }),
    listUsers: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "users",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Users", id: "LIST" }],
    }),
    getUser: build.query<unknown, string>({
      query: (id) => `users/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "Users", id }],
    }),
    createUser: build.mutation<unknown, Record<string, unknown>>({
      query: (body) => ({ url: "users", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Users"],
    }),
    patchUser: build.mutation<
      unknown,
      { id: string; patch: Record<string, unknown> }
    >({
      query: ({ id, patch }) => ({
        url: `users/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "Users",
        { type: "Users", id: arg.id },
      ],
    }),
  }),
});

export const {
  useListRolesQuery,
  useListPermissionsQuery,
  useListUsersQuery,
  useLazyListUsersQuery,
  useGetUserQuery,
  useLazyGetUserQuery,
  useCreateUserMutation,
  usePatchUserMutation,
} = usersApi;
