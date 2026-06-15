import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** `/api/dashboard/*` — each mount is dept-only (`requireDepartmentOnly`); no admin pass-through on other slices. */
export const dashboardApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    getDashboardAdmin: build.query<unknown, void>({
      query: () => ({ url: "dashboard/admin", method: "GET" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Dashboard", id: "admin" }],
    }),
    getDashboardSales: build.query<unknown, void>({
      query: () => ({ url: "dashboard/sales", method: "GET" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Dashboard", id: "sales" }],
    }),
    getDashboardFinance: build.query<unknown, void>({
      query: () => ({ url: "dashboard/finance", method: "GET" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Dashboard", id: "finance" }],
    }),
    getDashboardDispatch: build.query<unknown, void>({
      query: () => ({ url: "dashboard/dispatch", method: "GET" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Dashboard", id: "dispatch" }],
    }),
    getDashboardAccount: build.query<unknown, void>({
      query: () => ({ url: "dashboard/account", method: "GET" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Dashboard", id: "account" }],
    }),
    getDashboardSuper: build.query<unknown, void>({
      query: () => ({ url: "dashboard/super", method: "GET" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Dashboard", id: "super" }],
    }),
  }),
});

export const {
  useGetDashboardAdminQuery,
  useGetDashboardSalesQuery,
  useGetDashboardFinanceQuery,
  useGetDashboardDispatchQuery,
  useGetDashboardAccountQuery,
  useGetDashboardSuperQuery,
} = dashboardApi;
