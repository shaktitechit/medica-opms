import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** `/api/finance` — queue & summary KPIs (not payment records). */
export const financeApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    getFinanceQueue: build.query<unknown, Record<string, string | undefined> | void>(
      {
        query: (params) => ({
          url: "finance/queue",
          params: params ?? {},
        }),
        transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
        providesTags: [{ type: "FinanceQueue", id: "LIST" }],
      },
    ),
    getFinanceSummary: build.query<unknown, Record<string, string | undefined> | void>(
      {
        query: (params) => ({
          url: "finance/summary",
          params: params ?? {},
        }),
        transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
        providesTags: [{ type: "FinanceSummary", id: "LIST" }],
      },
    ),
  }),
});

export const {
  useGetFinanceQueueQuery,
  useLazyGetFinanceQueueQuery,
  useGetFinanceSummaryQuery,
  useLazyGetFinanceSummaryQuery,
} = financeApi;
