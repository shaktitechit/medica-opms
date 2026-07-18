import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type ProductBrandRecord = {
  _id: string;
  name: string;
  description?: string;
  is_active: boolean;
  is_featured?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const productBrandsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listProductBrands: build.query<
      { data: ProductBrandRecord[]; total: number; page: number; limit: number; pages: number },
      Record<string, string | number | undefined> | void
    >({
      query: (params) => ({
        url: "product-brands",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      providesTags: [{ type: "ProductBrands", id: "LIST" }],
    }),
    getProductBrand: build.query<ProductBrandRecord, string>({
      query: (id) => `product-brands/${id}`,
      transformResponse: (raw: ApiEnvelope<ProductBrandRecord>) =>
        unwrapEnvelope(raw) as ProductBrandRecord,
      providesTags: (_r, _e, id) => [{ type: "ProductBrands", id }],
    }),
    createProductBrand: build.mutation<ProductBrandRecord, Partial<ProductBrandRecord>>({
      query: (body) => ({ url: "product-brands", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<ProductBrandRecord>) =>
        unwrapEnvelope(raw) as ProductBrandRecord,
      invalidatesTags: [{ type: "ProductBrands", id: "LIST" }, "Products"],
    }),
    patchProductBrand: build.mutation<
      ProductBrandRecord,
      { id: string; patch: Partial<ProductBrandRecord> }
    >({
      query: ({ id, patch }) => ({
        url: `product-brands/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<ProductBrandRecord>) =>
        unwrapEnvelope(raw) as ProductBrandRecord,
      invalidatesTags: (_r, _e, arg) => [
        "ProductBrands",
        { type: "ProductBrands", id: arg.id },
        { type: "ProductBrands", id: "LIST" },
        "Products",
      ],
    }),
    deleteProductBrand: build.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `product-brands/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "ProductBrands",
        { type: "ProductBrands", id },
        { type: "ProductBrands", id: "LIST" },
        "Products",
      ],
    }),
    bulkCreateProductBrands: build.mutation<any[], any[]>({
      query: (bodies) => ({ url: "product-brands/bulk", method: "POST", body: bodies }),
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw),
      invalidatesTags: [{ type: "ProductBrands", id: "LIST" }, "Products"],
    }),
    bulkDeleteProductBrands: build.mutation<any[], string[]>({
      query: (ids) => ({ url: "product-brands/bulk-delete", method: "POST", body: { ids } }),
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw),
      invalidatesTags: [{ type: "ProductBrands", id: "LIST" }, "Products"],
    }),
    getProductBrandProducts: build.query<any[], string>({
      query: (id) => `product-brands/${id}/products`,
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw) ?? [],
      providesTags: (_r, _e, id) => [{ type: "ProductBrands", id: `${id}-products` }, "Products"],
    }),
    associateProductBrandProducts: build.mutation<
      { success: boolean; count: number },
      { id: string; productIds: string[] }
    >({
      query: ({ id, productIds }) => ({
        url: `product-brands/${id}/products`,
        method: "POST",
        body: { productIds },
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "Products",
        { type: "ProductBrands", id: `${arg.id}-products` },
      ],
    }),
  }),
});

export const {
  useListProductBrandsQuery,
  useLazyListProductBrandsQuery,
  useGetProductBrandQuery,
  useLazyGetProductBrandQuery,
  useCreateProductBrandMutation,
  usePatchProductBrandMutation,
  useDeleteProductBrandMutation,
  useBulkCreateProductBrandsMutation,
  useBulkDeleteProductBrandsMutation,
  useGetProductBrandProductsQuery,
  useLazyGetProductBrandProductsQuery,
  useAssociateProductBrandProductsMutation,
} = productBrandsApi;
