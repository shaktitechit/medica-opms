import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type ProductSubgroupRecord = {
  _id: string;
  name: string;
  group: string | { _id: string; name: string };
  description?: string;
  is_active: boolean;
  is_featured?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const productSubgroupsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listProductSubgroups: build.query<
      { data: ProductSubgroupRecord[]; total: number; page: number; limit: number; pages: number },
      Record<string, string | number | undefined> | void
    >({
      query: (params) => ({
        url: "product-subgroups",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      providesTags: [{ type: "ProductSubgroups", id: "LIST" }],
    }),
    getProductSubgroup: build.query<ProductSubgroupRecord, string>({
      query: (id) => `product-subgroups/${id}`,
      transformResponse: (raw: ApiEnvelope<ProductSubgroupRecord>) =>
        unwrapEnvelope(raw) as ProductSubgroupRecord,
      providesTags: (_r, _e, id) => [{ type: "ProductSubgroups", id }],
    }),
    createProductSubgroup: build.mutation<ProductSubgroupRecord, Partial<ProductSubgroupRecord>>({
      query: (body) => ({ url: "product-subgroups", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<ProductSubgroupRecord>) =>
        unwrapEnvelope(raw) as ProductSubgroupRecord,
      invalidatesTags: [{ type: "ProductSubgroups", id: "LIST" }, "Products"],
    }),
    patchProductSubgroup: build.mutation<
      ProductSubgroupRecord,
      { id: string; patch: Partial<ProductSubgroupRecord> }
    >({
      query: ({ id, patch }) => ({
        url: `product-subgroups/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<ProductSubgroupRecord>) =>
        unwrapEnvelope(raw) as ProductSubgroupRecord,
      invalidatesTags: (_r, _e, arg) => [
        "ProductSubgroups",
        { type: "ProductSubgroups", id: arg.id },
        { type: "ProductSubgroups", id: "LIST" },
        "Products",
      ],
    }),
    deleteProductSubgroup: build.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `product-subgroups/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "ProductSubgroups",
        { type: "ProductSubgroups", id },
        { type: "ProductSubgroups", id: "LIST" },
        "Products",
      ],
    }),
    bulkCreateProductSubgroups: build.mutation<any[], any[]>({
      query: (bodies) => ({ url: "product-subgroups/bulk", method: "POST", body: bodies }),
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw),
      invalidatesTags: [{ type: "ProductSubgroups", id: "LIST" }, "Products"],
    }),
    bulkDeleteProductSubgroups: build.mutation<any[], string[]>({
      query: (ids) => ({ url: "product-subgroups/bulk-delete", method: "POST", body: { ids } }),
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw),
      invalidatesTags: [{ type: "ProductSubgroups", id: "LIST" }, "Products"],
    }),
    getProductSubgroupProducts: build.query<any[], string>({
      query: (id) => `product-subgroups/${id}/products`,
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw) ?? [],
      providesTags: (_r, _e, id) => [{ type: "ProductSubgroups", id: `${id}-products` }, "Products"],
    }),
    associateProductSubgroupProducts: build.mutation<
      { success: boolean; count: number },
      { id: string; productIds: string[] }
    >({
      query: ({ id, productIds }) => ({
        url: `product-subgroups/${id}/products`,
        method: "POST",
        body: { productIds },
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "Products",
        { type: "ProductSubgroups", id: `${arg.id}-products` },
      ],
    }),
  }),
});

export const {
  useListProductSubgroupsQuery,
  useLazyListProductSubgroupsQuery,
  useGetProductSubgroupQuery,
  useLazyGetProductSubgroupQuery,
  useCreateProductSubgroupMutation,
  usePatchProductSubgroupMutation,
  useDeleteProductSubgroupMutation,
  useBulkCreateProductSubgroupsMutation,
  useBulkDeleteProductSubgroupsMutation,
  useGetProductSubgroupProductsQuery,
  useLazyGetProductSubgroupProductsQuery,
  useAssociateProductSubgroupProductsMutation,
} = productSubgroupsApi;
