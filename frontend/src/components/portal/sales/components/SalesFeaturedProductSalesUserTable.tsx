"use client";

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { useListProductsQuery } from "@/store/api";
import FeaturedMatrixTableFrame from "@/components/portal/admin/components/FeaturedMatrixTableFrame";
import { useAdminPeriodFilter } from "@/components/portal/admin/components/useAdminPeriodFilter";
import {
  emptyMatrix,
  formatMatrixValue,
  itemMetricValue,
  matrixColTotal,
  matrixGrandTotal,
  matrixRowTotal,
  pickEntities,
  resolveOrderSalesUserId,
  resolveProductId,
  type MatrixEntity,
} from "@/components/portal/admin/components/featuredMatrixUtils";

interface SalesFeaturedProductSalesUserTableProps {
  orders: any[];
  isOrdersFetching: boolean;
}

const METRIC = "quantity" as const;

function resolveUserId(user: unknown): string {
  if (!user || typeof user !== "object") return "";
  const o = user as Record<string, unknown>;
  return String(o._id ?? o.id ?? "");
}

function resolveUserName(user: unknown): string {
  if (!user || typeof user !== "object") return "You";
  const o = user as Record<string, unknown>;
  if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
  if (typeof o.username === "string" && o.username.trim()) return o.username.trim();
  return "You";
}

/**
 * Featured products × this sales user (quantity only).
 * Orders passed in should already be scoped to the logged-in sales user.
 */
export default function SalesFeaturedProductSalesUserTable({
  orders,
  isOrdersFetching,
}: SalesFeaturedProductSalesUserTableProps) {
  const user = useAppSelector((state) => state.auth.user);
  const {
    availableYears,
    selectedYears,
    setSelectedYears,
    selectedMonths,
    setSelectedMonths,
    filteredOrders,
  } = useAdminPeriodFilter(orders);

  const { data: productsData, isFetching: isProductsFetching } = useListProductsQuery({
    is_featured: "true",
    status: "active",
  });

  const featuredProducts = useMemo<MatrixEntity[]>(() => {
    return pickEntities(productsData)
      .map((p) => ({
        id: String(p._id ?? p.id ?? ""),
        name: String(p.product_name ?? p.name ?? "Untitled Product"),
      }))
      .filter((p) => p.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [productsData]);

  const salesUsers = useMemo<MatrixEntity[]>(() => {
    const selfId = resolveUserId(user);
    const selfName = resolveUserName(user);
    if (selfId) return [{ id: selfId, name: selfName }];

    // Fallback: any assignee ids present on filtered orders
    const seen = new Map<string, string>();
    for (const order of filteredOrders) {
      const id = resolveOrderSalesUserId(order);
      if (!id || seen.has(id)) continue;
      seen.set(id, id);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [user, filteredOrders]);

  const productIds = useMemo(() => featuredProducts.map((p) => p.id), [featuredProducts]);
  const salesIds = useMemo(() => salesUsers.map((u) => u.id), [salesUsers]);
  const productIdSet = useMemo(() => new Set(productIds), [productIds]);
  const salesIdSet = useMemo(() => new Set(salesIds), [salesIds]);

  const matrix = useMemo(() => {
    const map = emptyMatrix(productIds, salesIds);
    for (const order of filteredOrders) {
      const salesId = resolveOrderSalesUserId(order);
      if (!salesId || !salesIdSet.has(salesId)) continue;
      const items = Array.isArray(order.order_items) ? order.order_items : [];
      for (const item of items) {
        const productId = resolveProductId(item);
        if (!productId || !productIdSet.has(productId)) continue;
        const row = map.get(productId);
        if (!row) continue;
        row.set(salesId, (row.get(salesId) ?? 0) + itemMetricValue(item, METRIC));
      }
    }
    return map;
  }, [filteredOrders, productIds, salesIds, productIdSet, salesIdSet]);

  const isLoading = isOrdersFetching || isProductsFetching;

  return (
    <FeaturedMatrixTableFrame
      title="Featured Products × My Sales"
      subtitle="Net quantity by featured product for your portfolio"
      icon={<LayoutGrid className="h-5 w-5" />}
      accentClass="text-violet-600 dark:text-violet-400"
      showMetricToggle={false}
      availableYears={availableYears}
      selectedYears={selectedYears}
      selectedMonths={selectedMonths}
      onYearsChange={setSelectedYears}
      onMonthsChange={setSelectedMonths}
    >
      {isLoading ? (
        <div className="space-y-2 py-4">
          <div className="h-8 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-8 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-8 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : featuredProducts.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">
          No featured products found. Mark products as featured to populate this matrix.
        </p>
      ) : salesUsers.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">
          No sales user context available.
        </p>
      ) : (
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/5">
              <th className="sticky left-0 z-10 bg-white py-2.5 pr-4 text-left font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400 min-w-[160px]">
                Featured Product
              </th>
              {salesUsers.map((salesUser) => (
                <th
                  key={salesUser.id}
                  className="px-2 py-2.5 text-right font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap min-w-[96px]"
                  title={salesUser.name}
                >
                  {salesUser.name}
                </th>
              ))}
              <th className="px-2 py-2.5 text-right font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap min-w-[88px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {featuredProducts.map((product) => (
              <tr key={product.id} className="hover:bg-slate-50/40 dark:hover:bg-white/5">
                <td className="sticky left-0 z-10 bg-white py-2.5 pr-4 font-medium text-slate-800 dark:bg-slate-900 dark:text-slate-200">
                  {product.name}
                </td>
                {salesUsers.map((salesUser) => {
                  const value = matrix.get(product.id)?.get(salesUser.id) ?? 0;
                  return (
                    <td
                      key={salesUser.id}
                      className="px-2 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300"
                    >
                      {formatMatrixValue(value, METRIC)}
                    </td>
                  );
                })}
                <td className="px-2 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatMatrixValue(matrixRowTotal(matrix, product.id), METRIC)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-slate-800/50">
              <td className="sticky left-0 z-10 bg-slate-50/80 py-3 pr-4 font-bold text-slate-900 dark:bg-slate-800/50 dark:text-slate-100">
                Total
              </td>
              {salesUsers.map((salesUser) => (
                <td
                  key={salesUser.id}
                  className="px-2 py-3 text-right font-bold tabular-nums text-slate-900 dark:text-slate-50"
                >
                  {formatMatrixValue(matrixColTotal(matrix, salesUser.id), METRIC)}
                </td>
              ))}
              <td className="px-2 py-3 text-right font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {formatMatrixValue(matrixGrandTotal(matrix), METRIC)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </FeaturedMatrixTableFrame>
  );
}
