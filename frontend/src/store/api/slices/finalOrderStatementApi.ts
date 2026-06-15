import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export const finalOrderStatementApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    getFinalOrderStatement: build.query<unknown, string>({
      query: (orderId) => ({
        url: `final-order-statements/order/${orderId}`,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, orderId) => [
        { type: "Order", id: orderId },
        { type: "Order", id: `FOS_${orderId}` },
      ],
    }),
  }),
});

export const { useGetFinalOrderStatementQuery, useLazyGetFinalOrderStatementQuery } =
  finalOrderStatementApi;
