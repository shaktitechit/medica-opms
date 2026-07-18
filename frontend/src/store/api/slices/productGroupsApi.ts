import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type ProductGroupRecord = {
  _id: string;
  name: string;
  description?: string;
  is_active: boolean;
  is_featured?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const productGroupsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listProductGroups: build.query<
      { data: ProductGroupRecord[]; total: number; page: number; limit: number; pages: number },
      Record<string, string | number | undefined> | void
    >({
      query: (params) => ({
        url: "product-groups",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      providesTags: [{ type: "ProductGroups", id: "LIST" }],
    }),
    getProductGroup: build.query<ProductGroupRecord, string>({
      query: (id) => `product-groups/${id}`,
      transformResponse: (raw: ApiEnvelope<ProductGroupRecord>) =>
        unwrapEnvelope(raw) as ProductGroupRecord,
      providesTags: (_r, _e, id) => [{ type: "ProductGroups", id }],
    }),
    createProductGroup: build.mutation<ProductGroupRecord, Partial<ProductGroupRecord>>({
      query: (body) => ({ url: "product-groups", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<ProductGroupRecord>) =>
        unwrapEnvelope(raw) as ProductGroupRecord,
      invalidatesTags: [{ type: "ProductGroups", id: "LIST" }, "Products"],
    }),
    patchProductGroup: build.mutation<
      ProductGroupRecord,
      { id: string; patch: Partial<ProductGroupRecord> }
    >({
      query: ({ id, patch }) => ({
        url: `product-groups/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<ProductGroupRecord>) =>
        unwrapEnvelope(raw) as ProductGroupRecord,
      invalidatesTags: (_r, _e, arg) => [
        "ProductGroups",
        { type: "ProductGroups", id: arg.id },
        { type: "ProductGroups", id: "LIST" },
        "Products",
      ],
    }),
    deleteProductGroup: build.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `product-groups/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "ProductGroups",
        { type: "ProductGroups", id },
        { type: "ProductGroups", id: "LIST" },
        "Products",
      ],
    }),
    bulkCreateProductGroups: build.mutation<any[], any[]>({
      query: (bodies) => ({ url: "product-groups/bulk", method: "POST", body: bodies }),
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw),
      invalidatesTags: [{ type: "ProductGroups", id: "LIST" }, "Products"],
    }),
    bulkDeleteProductGroups: build.mutation<any[], string[]>({
      query: (ids) => ({ url: "product-groups/bulk-delete", method: "POST", body: { ids } }),
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw),
      invalidatesTags: [{ type: "ProductGroups", id: "LIST" }, "Products"],
    }),
    getProductGroupProducts: build.query<any[], string>({
      query: (id) => `product-groups/${id}/products`,
      transformResponse: (raw: ApiEnvelope<any[]>) => unwrapEnvelope(raw) ?? [],
      providesTags: (_r, _e, id) => [{ type: "ProductGroups", id: `${id}-products` }, "Products"],
    }),
    associateProductGroupProducts: build.mutation<
      { success: boolean; count: number },
      { id: string; productIds: string[] }
    >({
      query: ({ id, productIds }) => ({
        url: `product-groups/${id}/products`,
        method: "POST",
        body: { productIds },
      }),
      transformResponse: (raw: ApiEnvelope<any>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "Products",
        { type: "ProductGroups", id: `${arg.id}-products` },
      ],
    }),
  }),
});

export const {
  useListProductGroupsQuery,
  useLazyListProductGroupsQuery,
  useGetProductGroupQuery,
  useLazyGetProductGroupQuery,
  useCreateProductGroupMutation,
  usePatchProductGroupMutation,
  useDeleteProductGroupMutation,
  useBulkCreateProductGroupsMutation,
  useBulkDeleteProductGroupsMutation,
  useGetProductGroupProductsQuery,
  useLazyGetProductGroupProductsQuery,
  useAssociateProductGroupProductsMutation,
} = productGroupsApi;
