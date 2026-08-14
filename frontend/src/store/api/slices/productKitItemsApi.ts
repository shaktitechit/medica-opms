import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type ProductKitComponentRef =
  | string
  | {
      _id: string;
      product_name?: string;
      product_type?: string;
      sku?: string;
      generic_name?: string;
      unit?: string;
      base_price?: number;
      is_active?: boolean;
    };

export type ProductKitComponentWrite = {
  individual: string;
  /** Share of the kit; 0–1000 */
  percentage: number;
  /** Optional unit count within the kit */
  quantity?: number | null;
  sort_order?: number;
  is_active?: boolean;
  remarks?: string;
};

export type ProductKitComponent = ProductKitComponentWrite & {
  _id?: string;
  individual: ProductKitComponentRef;
};

export type ProductKitItemRecord = {
  _id: string;
  kit: ProductKitComponentRef;
  items: ProductKitComponent[];
  is_active?: boolean;
  remarks?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
};

export type ProductKitItemWriteBody = {
  kit: string;
  items?: ProductKitComponentWrite[];
  is_active?: boolean;
  remarks?: string;
};

export type ProductKitItemPatchBody = {
  items?: ProductKitComponentWrite[];
  is_active?: boolean;
  remarks?: string;
};

export type ProductKitItemListParams = {
  kit?: string;
  individual?: string;
  is_active?: string;
  paginate?: string;
  page?: string;
  limit?: string;
  [key: string]: string | undefined;
};

/** `/api/product-kit-items` — kit bill-of-materials compositions. */
export const productKitItemsApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    listProductKitItems: build.query<
      unknown,
      ProductKitItemListParams | void
    >({
      query: (params) => ({
        url: "product-kit-items",
        params: params ?? {},
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "ProductKitItems", id: "LIST" }],
    }),
    listProductKitItemsDeleted: build.query<unknown, void>({
      query: () => "product-kit-items/deleted",
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: [{ type: "ProductKitItems", id: "DELETED" }],
    }),
    getProductKitItem: build.query<unknown, string>({
      query: (id) => `product-kit-items/${id}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, id) => [{ type: "ProductKitItems", id }],
    }),
    getProductKitItemByKit: build.query<unknown, string>({
      query: (kitId) => `product-kit-items/by-kit/${kitId}`,
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      providesTags: (_r, _e, kitId) => [
        { type: "ProductKitItems", id: `KIT-${kitId}` },
        { type: "ProductKitItems", id: "LIST" },
      ],
    }),
    createProductKitItem: build.mutation<unknown, ProductKitItemWriteBody>({
      query: (body) => ({
        url: "product-kit-items",
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: ["ProductKitItems"],
    }),
    upsertProductKitItemByKit: build.mutation<
      unknown,
      { kitId: string; body: ProductKitItemPatchBody }
    >({
      query: ({ kitId, body }) => ({
        url: `product-kit-items/by-kit/${kitId}`,
        method: "PUT",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "ProductKitItems",
        { type: "ProductKitItems", id: `KIT-${arg.kitId}` },
      ],
    }),
    patchProductKitItem: build.mutation<
      unknown,
      { id: string; patch: ProductKitItemPatchBody }
    >({
      query: ({ id, patch }) => ({
        url: `product-kit-items/${id}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "ProductKitItems",
        { type: "ProductKitItems", id: arg.id },
      ],
    }),
    addProductKitItemLine: build.mutation<
      unknown,
      { id: string; body: ProductKitComponentWrite }
    >({
      query: ({ id, body }) => ({
        url: `product-kit-items/${id}/items`,
        method: "POST",
        body,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "ProductKitItems",
        { type: "ProductKitItems", id: arg.id },
      ],
    }),
    patchProductKitItemLine: build.mutation<
      unknown,
      {
        id: string;
        itemId: string;
        patch: Partial<ProductKitComponentWrite>;
      }
    >({
      query: ({ id, itemId, patch }) => ({
        url: `product-kit-items/${id}/items/${itemId}`,
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "ProductKitItems",
        { type: "ProductKitItems", id: arg.id },
      ],
    }),
    deleteProductKitItemLine: build.mutation<
      unknown,
      { id: string; itemId: string }
    >({
      query: ({ id, itemId }) => ({
        url: `product-kit-items/${id}/items/${itemId}`,
        method: "DELETE",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, arg) => [
        "ProductKitItems",
        { type: "ProductKitItems", id: arg.id },
      ],
    }),
    deleteProductKitItem: build.mutation<unknown, string>({
      query: (id) => ({
        url: `product-kit-items/${id}`,
        method: "DELETE",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "ProductKitItems",
        { type: "ProductKitItems", id },
        { type: "ProductKitItems", id: "LIST" },
        { type: "ProductKitItems", id: "DELETED" },
      ],
    }),
    restoreProductKitItem: build.mutation<unknown, string>({
      query: (id) => ({
        url: `product-kit-items/${id}/restore`,
        method: "POST",
      }),
      transformResponse: (raw: ApiEnvelope<unknown>) => unwrapEnvelope(raw),
      invalidatesTags: (_r, _e, id) => [
        "ProductKitItems",
        { type: "ProductKitItems", id },
        { type: "ProductKitItems", id: "LIST" },
        { type: "ProductKitItems", id: "DELETED" },
      ],
    }),
  }),
});

export const {
  useListProductKitItemsQuery,
  useLazyListProductKitItemsQuery,
  useListProductKitItemsDeletedQuery,
  useLazyListProductKitItemsDeletedQuery,
  useGetProductKitItemQuery,
  useLazyGetProductKitItemQuery,
  useGetProductKitItemByKitQuery,
  useLazyGetProductKitItemByKitQuery,
  useCreateProductKitItemMutation,
  useUpsertProductKitItemByKitMutation,
  usePatchProductKitItemMutation,
  useAddProductKitItemLineMutation,
  usePatchProductKitItemLineMutation,
  useDeleteProductKitItemLineMutation,
  useDeleteProductKitItemMutation,
  useRestoreProductKitItemMutation,
} = productKitItemsApi;
