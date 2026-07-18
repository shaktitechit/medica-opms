"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import {
  useGetProductSubgroupProductsQuery,
  useAssociateProductSubgroupProductsMutation,
  useListProductsQuery,
} from "@/store/api";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { ArrowLeft, Search, Plus, Trash2, Check, Package } from "lucide-react";

export type SubgroupProductsPageProps = {
  portalHome?: string;
};

export default function SubgroupProductsPage({
  portalHome = "/admin",
}: SubgroupProductsPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subgroupId = searchParams.get("subgroupId") || "";
  const subgroupName = searchParams.get("subgroupName") || "Subgroup";

  // Fetch currently associated products
  const { data: currentProducts = [], isLoading: isLoadingCurrent } = useGetProductSubgroupProductsQuery(subgroupId, {
    skip: !subgroupId,
  });

  const currentIds = useMemo(() => {
    return new Set(currentProducts.map((p: any) => p._id));
  }, [currentProducts]);

  // Catalog search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: catalogData, isLoading: isLoadingCatalog } = useListProductsQuery({
    search: debouncedSearch,
    limit: "15",
  });

  const catalogProducts = useMemo(() => {
    if (!catalogData) return [];
    if (Array.isArray(catalogData)) return catalogData;
    if (catalogData && typeof catalogData === "object") {
      const o = catalogData as any;
      if (Array.isArray(o.items)) return o.items;
      if (Array.isArray(o.data)) return o.data;
    }
    return [];
  }, [catalogData]);

  const [associateProducts, { isLoading: isSaving }] = useAssociateProductSubgroupProductsMutation();

  const handleAddProduct = async (productId: string) => {
    const existingIds = currentProducts.map((p: any) => p._id);
    if (existingIds.includes(productId)) return;

    try {
      await associateProducts({
        id: subgroupId,
        productIds: [...existingIds, productId],
      }).unwrap();
      toast.success("Product added to subgroup");
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to add product");
    }
  };

  const handleRemoveProduct = async (productId: string) => {
    const existingIds = currentProducts.map((p: any) => p._id);
    try {
      await associateProducts({
        id: subgroupId,
        productIds: existingIds.filter((id: string) => id !== productId),
      }).unwrap();
      toast.success("Product removed from subgroup");
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to remove product");
    }
  };

  const handleGoBack = () => {
    router.push(`${portalHome}/products?view=subgroups`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleGoBack}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Products under: <span className="text-blue-600 dark:text-blue-400">{subgroupName}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            View associated products or search the catalog to add items to this subgroup
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Side: Current Associations */}
        <div className="lg:col-span-7 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 overflow-hidden">
            <div className="border-b border-slate-100 p-4 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Package className="size-4 text-slate-400" />
                Associated Products ({currentProducts.length})
              </h2>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[60vh] overflow-y-auto min-h-[300px]">
              {isLoadingCurrent ? (
                <div className="p-8 text-center text-xs text-slate-500">Loading associated products...</div>
              ) : currentProducts.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">No products are currently associated with this subgroup.</div>
              ) : (
                currentProducts.map((p: any) => (
                  <div key={p._id} className="flex items-center justify-between p-3.5 hover:bg-slate-55/50 dark:hover:bg-white/[0.01]">
                    <div className="min-w-0 pr-4">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{p.product_name}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {p.sku ? `SKU: ${p.sku} | ` : ""}
                        Base Price: ₹{p.base_price || "0.00"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveProduct(p._id)}
                      className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 cursor-pointer"
                    >
                      <Trash2 className="size-3" />
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Catalog Search and Add */}
        <div className="lg:col-span-5 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 overflow-hidden">
            <div className="border-b border-slate-100 p-4 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Add Products to Subgroup</h2>
            </div>

            <div className="p-4 border-b border-slate-100 dark:border-white/5">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search catalog products to add..."
                  className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-955 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[50vh] overflow-y-auto">
              {isLoadingCatalog ? (
                <div className="p-8 text-center text-xs text-slate-500">Searching catalog...</div>
              ) : catalogProducts.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">No matching products found.</div>
              ) : (
                catalogProducts.map((p: any) => {
                  const isAssociated = currentIds.has(p._id);
                  return (
                    <div key={p._id} className="flex items-center justify-between p-3 hover:bg-slate-55/50 dark:hover:bg-white/[0.01]">
                      <div className="min-w-0 pr-4">
                        <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{p.product_name}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {p.sku ? `SKU: ${p.sku} | ` : ""}
                          Subgroup: {p.product_subgroup?.name || p.product_subgroup || "None"}
                        </p>
                      </div>
                      {isAssociated ? (
                        <span className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400">
                          <Check className="size-2.5" />
                          Added
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddProduct(p._id)}
                          className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-[11px] text-blue-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-white/5 cursor-pointer"
                        >
                          <Plus className="size-3" />
                          Add
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <PortalBusyOverlay active={isSaving} />
    </div>
  );
}
