import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** Common write fields for create/patch/bulk product payloads. */
export type ProductWriteBody = {
  product_name?: string;
  generic_name?: string | null;
  aliases?: string[];
  sku?: string | null;
  product_group?: string | null;
  product_subgroup?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  unit?: string;
  base_price?: number;
  minimum_sale_rate?: number;
  mrp?: number | null;
  gst_percent?: number;
  warranty_months?: number;
  description?: string;
  tags?: string[];
  is_active?: boolean;
  is_featured?: boolean;
  [key: string]: unknown;
};

export type ProductListParams = {
  search?: string;
  group?: string;
  status?: string;
  /** Filter featured products: `"true"` | `"false"` | `"all"` */
  is_featured?: string;
  paginate?: string;
  page?: string;
  limit?: string;
  [key: string]: string | undefined;
};

/** `/api/products` — manage catalog + trash. */
export const productsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listProducts: build.query<unknown, ProductListParams | void>({
      query: (params) => ({
        url: "products",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Products", id: "LIST" }],
    }),
    listProductsDeleted: build.query<
      unknown,
      ProductListParams | void
    >({
      query: (params) => ({
        url: "products/deleted",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Products", id: "DELETED" }],
    }),
    getProduct: build.query<unknown, string>({
      query: (id) => `products/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "Products", id }],
    }),
    createProduct: build.mutation<unknown, ProductWriteBody>({
      query: (body) => ({ url: "products", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Products"],
    }),
    patchProduct: build.mutation<
      unknown,
      { id: string; patch: ProductWriteBody }
    >({
      query: ({ id, patch }) => ({
        url: `products/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "Products",
        { type: "Products", id: arg.id },
      ],
    }),
    deleteProduct: build.mutation<unknown, string>({
      query: (id) => ({ url: `products/${id}`, method: "DELETE" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Products",
        { type: "Products", id },
        { type: "Products", id: "LIST" },
        { type: "Products", id: "DELETED" },
      ],
    }),
    restoreProduct: build.mutation<unknown, string>({
      query: (id) => ({ url: `products/${id}/restore`, method: "POST" }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "Products",
        { type: "Products", id },
        { type: "Products", id: "LIST" },
        { type: "Products", id: "DELETED" },
      ],
    }),
    bulkCreateProduct: build.mutation<unknown, ProductWriteBody[]>({
      query: (body) => ({
        url: "products/bulk",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Products"],
    }),
    bulkDeleteProducts: build.mutation<unknown, string[]>({
      query: (ids) => ({
        url: "products/bulk-delete",
        method: "POST",
        body: { ids },
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Products"],
    }),
  }),
});

export const {
  useListProductsQuery,
  useLazyListProductsQuery,
  useListProductsDeletedQuery,
  useLazyListProductsDeletedQuery,
  useGetProductQuery,
  useLazyGetProductQuery,
  useCreateProductMutation,
  usePatchProductMutation,
  useDeleteProductMutation,
  useRestoreProductMutation,
  useBulkCreateProductMutation,
  useBulkDeleteProductsMutation,
} = productsApi;
