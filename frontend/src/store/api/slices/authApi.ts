import { medicaApi } from "../baseApi";
import { persistSessionMarksFromAuth } from "@/lib/sessionCookie";
import { setCredentials, setUser } from "../../slices/authSlice";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResult = {
  token: string;
  user: Record<string, unknown>;
};

type AuthSnap = {
  auth: { token: string | null; user: unknown };
};

/** `/api/auth` */
export const authApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<LoginResult, LoginPayload>({
      query: (body) => ({
        url: "auth/login",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<LoginResult>) => unwrapEnvelope(raw),
      invalidatesTags: ["AuthSession"],
      async onQueryStarted(_body, api) {
        try {
          const { data } = await api.queryFulfilled;
          api.dispatch(setCredentials({ token: data.token, user: data.user }));
          const root = api.getState() as unknown as AuthSnap;
          persistSessionMarksFromAuth({
            token: root.auth.token,
            user: root.auth.user,
          });
        } catch {
          /* unchanged on failure */
        }
      },
    }),
    /** `GET /api/auth/me`. */
    getAuthMe: build.query<Record<string, unknown>, void>({
      query: () => ({ url: "auth/me", method: "GET" }),
      transformResponse: (raw: ApiEnvelope<Record<string, unknown>>) =>
        unwrapEnvelope(raw),
      providesTags: ["AuthSession"],
      async onQueryStarted(_body, api) {
        try {
          const { data } = await api.queryFulfilled;
          api.dispatch(setUser(data));
          const root = api.getState() as unknown as AuthSnap;
          persistSessionMarksFromAuth({
            token: root.auth.token,
            user: root.auth.user,
          });
        } catch {
          /* callers may redirect on 401 */
        }
      },
    }),
  }),
});

export const { useLoginMutation, useGetAuthMeQuery, useLazyGetAuthMeQuery } =
  authApi;
