import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export interface CheckOrderRatesItem {
  product: string;
  product_name: string;
  sku?: string;
  applied_rate_type: string;
  unit_price: number;
  isMapped: boolean;
  mappingId: string | null;
  hasRate: boolean;
  rateId: string | null;
  currentMappedRate: number | null;
  isRateExpired?: boolean;
  validityStart?: string | null;
  validityEnd?: string | null;
}

export interface CheckOrderRatesResponse {
  orderId?: string;
  party: string;
  party_name: string;
  items: CheckOrderRatesItem[];
}

export interface CheckPartyLineRatesRequest {
  party: string;
  items: Array<{
    product: string;
    applied_rate_type: string;
    product_name?: string;
    sku?: string;
    unit_price?: number;
  }>;
}

export interface MapPartyOrderProductRateRequest {
  orderId: string;
  productId: string;
  applied_rate_type: string;
  rate: number;
}

export interface MapPartyOrderProductRateResponse {
  mappingId: string;
  rateId: string;
  rate: number;
}

export const partyOrderProductsRateApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    checkOrderRates: build.query<CheckOrderRatesResponse, string>({
      query: (orderId) => `party-order-products-rate/check/${orderId}`,
      transformResponse: (raw: ApiEnvelope<CheckOrderRatesResponse>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [
        { type: "PartyProducts", id },
        { type: "PartyProducts", id: `order-rates-${id}` },
      ],
    }),
    checkPartyLineRates: build.query<
      CheckOrderRatesResponse,
      CheckPartyLineRatesRequest
    >({
      query: (body) => ({
        url: "party-order-products-rate/check-lines",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<CheckOrderRatesResponse>) =>
        unwrapEnvelope(raw),
      providesTags: (_r, _e, arg) => [
        { type: "PartyProducts", id: `check-lines-${arg.party}` },
      ],
      serializeQueryArgs: ({ queryArgs }) => {
        const itemsKey = (queryArgs.items ?? [])
          .map((i) => `${i.product}:${i.applied_rate_type}`)
          .sort()
          .join("|");
        return `${queryArgs.party}::${itemsKey}`;
      },
    }),
    mapPartyOrderProductRate: build.mutation<
      MapPartyOrderProductRateResponse,
      MapPartyOrderProductRateRequest
    >({
      query: (body) => ({
        url: "party-order-products-rate/map",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<MapPartyOrderProductRateResponse>) => unwrapEnvelope(raw),
      invalidatesTags: ["PartyProducts"],
    }),
  }),
});

export const {
  useCheckOrderRatesQuery,
  useCheckPartyLineRatesQuery,
  useMapPartyOrderProductRateMutation,
} = partyOrderProductsRateApi;

