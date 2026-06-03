import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

/** `/api/products` — manage catalog + trash. */
export const productsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listProducts: build.query<
      unknown,
      Record<string, string | undefined> | void
    >({
      query: (params) => ({
        url: "products",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "Products", id: "LIST" }],
    }),
    listProductsDeleted: build.query<
      unknown,
      Record<string, string | undefined> | void
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
    createProduct: build.mutation<unknown, Record<string, unknown>>({
      query: (body) => ({ url: "products", method: "POST", body }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["Products"],
    }),
    patchProduct: build.mutation<
      unknown,
      { id: string; patch: Record<string, unknown> }
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
    bulkCreateProduct: build.mutation<unknown, Array<Record<string, unknown>>>({
      query: (body) => ({
        url: "products/bulk",
        method: "POST",
        body,
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
} = productsApi;
