import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type ProductManufacturerRecord = {
  _id: string;
  name: string;
  description?: string;
  is_active: boolean;
  is_featured?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const productManufacturersApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listProductManufacturers: build.query<
      { data: ProductManufacturerRecord[]; total: number; page: number; limit: number; pages: number },
      Record<string, string | number | undefined> | void
    >({
      query: (params) => ({
        url: "product-manufacturers",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      providesTags: [{ type: "ProductManufacturers", id: "LIST" }],
    }),
    getProductManufacturer: build.query<ProductManufacturerRecord, string>({
      query: (id) => `product-manufacturers/${id}`,
      transformResponse: (raw: ApiEnvelope<ProductManufacturerRecord>) =>
        unwrapEnvelope(raw) as ProductManufacturerRecord,
      providesTags: (_r, _e, id) => [{ type: "ProductManufacturers", id }],
    }),
    createProductManufacturer: build.mutation<ProductManufacturerRecord, Partial<ProductManufacturerRecord>>({
      query: (body) => ({ url: "product-manufacturers", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<ProductManufacturerRecord>) =>
        unwrapEnvelope(raw) as ProductManufacturerRecord,
      invalidatesTags: [{ type: "ProductManufacturers", id: "LIST" }, "Products"],
    }),
    patchProductManufacturer: build.mutation<
      ProductManufacturerRecord,
      { id: string; patch: Partial<ProductManufacturerRecord> }
    >({
      query: ({ id, patch }) => ({
        url: `product-manufacturers/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<ProductManufacturerRecord>) =>
        unwrapEnvelope(raw) as ProductManufacturerRecord,
      invalidatesTags: (_r, _e, arg) => [
        "ProductManufacturers",
        { type: "ProductManufacturers", id: arg.id },
        { type: "ProductManufacturers", id: "LIST" },
        "Products",
      ],
    }),
    deleteProductManufacturer: build.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `product-manufacturers/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "ProductManufacturers",
        { type: "ProductManufacturers", id },
        { type: "ProductManufacturers", id: "LIST" },
        "Products",
      ],
    }),
    bulkCreateProductManufacturers: build.mutation<any[], any[]>({
      query: (bodies) => ({ url: "product-manufacturers/bulk", method: "POST", body: bodies }),
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw),
      invalidatesTags: [{ type: "ProductManufacturers", id: "LIST" }, "Products"],
    }),
    bulkDeleteProductManufacturers: build.mutation<any[], string[]>({
      query: (ids) => ({ url: "product-manufacturers/bulk-delete", method: "POST", body: { ids } }),
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw),
      invalidatesTags: [{ type: "ProductManufacturers", id: "LIST" }, "Products"],
    }),
    getProductManufacturerProducts: build.query<any[], string>({
      query: (id) => `product-manufacturers/${id}/products`,
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw) ?? [],
      providesTags: (_r, _e, id) => [{ type: "ProductManufacturers", id: `${id}-products` }, "Products"],
    }),
    associateProductManufacturerProducts: build.mutation<
      { success: boolean; count: number },
      { id: string; productIds: string[] }
    >({
      query: ({ id, productIds }) => ({
        url: `product-manufacturers/${id}/products`,
        method: "POST",
        body: { productIds },
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "Products",
        { type: "ProductManufacturers", id: `${arg.id}-products` },
      ],
    }),
  }),
});

export const {
  useListProductManufacturersQuery,
  useLazyListProductManufacturersQuery,
  useGetProductManufacturerQuery,
  useLazyGetProductManufacturerQuery,
  useCreateProductManufacturerMutation,
  usePatchProductManufacturerMutation,
  useDeleteProductManufacturerMutation,
  useBulkCreateProductManufacturersMutation,
  useBulkDeleteProductManufacturersMutation,
  useGetProductManufacturerProductsQuery,
  useLazyGetProductManufacturerProductsQuery,
  useAssociateProductManufacturerProductsMutation,
} = productManufacturersApi;
