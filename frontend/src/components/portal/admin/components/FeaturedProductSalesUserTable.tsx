"use client";

import { useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { useListProductsQuery, useListUsersQuery } from "@/store/api";
import { buildUserNameById, pickUsersList } from "@/components/portal/shared/userDisplay";
import FeaturedMatrixTableFrame from "./FeaturedMatrixTableFrame";
import { useAdminPeriodFilter } from "./useAdminPeriodFilter";
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
  type MatrixMetric,
} from "./featuredMatrixUtils";
import { formatPeriodLabel } from "./periodFilterUtils";
import {
  buildMatrixCsvPayload,
  downloadCsvFile,
  reportFilename,
} from "./reportDownloadUtils";

interface FeaturedProductSalesUserTableProps {
  orders: any[];
  isOrdersFetching: boolean;
}

export default function FeaturedProductSalesUserTable({
  orders,
  isOrdersFetching,
}: FeaturedProductSalesUserTableProps) {
  const [metric, setMetric] = useState<MatrixMetric>("quantity");
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
  const { data: usersData, isFetching: isUsersFetching } = useListUsersQuery({
    department: "sales",
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
    const nameById = buildUserNameById(usersData);
    const fromList = pickUsersList(usersData)
      .map((u) => {
        if (!u || typeof u !== "object") return null;
        const o = u as Record<string, unknown>;
        const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
        if (!id) return null;
        return {
          id,
          name: nameById[id] || String(o.name ?? o.username ?? id),
        };
      })
      .filter((u): u is MatrixEntity => Boolean(u));

    // Keep any sales users present on filtered orders even if not in the sales list.
    const seen = new Set(fromList.map((u) => u.id));
    for (const order of filteredOrders) {
      const id = resolveOrderSalesUserId(order);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      fromList.push({ id, name: nameById[id] || id });
    }

    return fromList.sort((a, b) => a.name.localeCompare(b.name));
  }, [usersData, filteredOrders]);

  const productIds = useMemo(() => featuredProducts.map((p) => p.id), [featuredProducts]);
  const salesIds = useMemo(() => salesUsers.map((u) => u.id), [salesUsers]);
  const productIdSet = useMemo(() => new Set(productIds), [productIds]);

  const matrix = useMemo(() => {
    const map = emptyMatrix(productIds, salesIds);
    for (const order of filteredOrders) {
      const salesId = resolveOrderSalesUserId(order);
      if (!salesId || !map.size) continue;
      if (!salesIds.includes(salesId)) continue;
      const items = Array.isArray(order.order_items) ? order.order_items : [];
      for (const item of items) {
        const productId = resolveProductId(item);
        if (!productId || !productIdSet.has(productId)) continue;
        const row = map.get(productId);
        if (!row) continue;
        row.set(salesId, (row.get(salesId) ?? 0) + itemMetricValue(item, metric));
      }
    }
    return map;
  }, [filteredOrders, productIds, salesIds, productIdSet, metric]);

  const isLoading = isOrdersFetching || isProductsFetching || isUsersFetching;

  const handleDownload = () => {
    if (featuredProducts.length === 0 || salesUsers.length === 0) return;
    const { headers, rows } = buildMatrixCsvPayload({
      rowLabel: "Featured Product",
      rows: featuredProducts,
      cols: salesUsers,
      matrix,
    });
    downloadCsvFile(
      reportFilename("product_sales_user", selectedYears, selectedMonths),
      headers,
      rows,
      [
        `Report: Featured Products × Sales Persons`,
        `Period: ${formatPeriodLabel(selectedYears, selectedMonths)}`,
        `Metric: ${metric}`,
      ],
    );
  };


  return (
    <FeaturedMatrixTableFrame
      title="Featured Products × Sales Persons"
      subtitle="Net sales by featured product across each sales person"
      icon={<LayoutGrid className="h-5 w-5" />}
      accentClass="text-violet-600 dark:text-violet-400"
      metric={metric}
      onMetricChange={setMetric}
      availableYears={availableYears}
      selectedYears={selectedYears}
      selectedMonths={selectedMonths}
      onYearsChange={setSelectedYears}
      onMonthsChange={setSelectedMonths}
      onDownload={handleDownload}
      downloadDisabled={isLoading}
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
          No sales persons found.
        </p>
      ) : (
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/5">
              <th className="sticky left-0 z-10 bg-white py-2.5 pr-4 text-left font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400 min-w-[160px]">
                Featured Product
              </th>
              {salesUsers.map((user) => (
                <th
                  key={user.id}
                  className="px-2 py-2.5 text-right font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap min-w-[96px]"
                  title={user.name}
                >
                  {user.name}
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
                {salesUsers.map((user) => {
                  const value = matrix.get(product.id)?.get(user.id) ?? 0;
                  return (
                    <td
                      key={user.id}
                      className="px-2 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300"
                    >
                      {formatMatrixValue(value, metric)}
                    </td>
                  );
                })}
                <td className="px-2 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatMatrixValue(matrixRowTotal(matrix, product.id), metric)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-slate-800/50">
              <td className="sticky left-0 z-10 bg-slate-50/80 py-3 pr-4 font-bold text-slate-900 dark:bg-slate-800/50 dark:text-slate-100">
                Total
              </td>
              {salesUsers.map((user) => (
                <td
                  key={user.id}
                  className="px-2 py-3 text-right font-bold tabular-nums text-slate-900 dark:text-slate-50"
                >
                  {formatMatrixValue(matrixColTotal(matrix, user.id), metric)}
                </td>
              ))}
              <td className="px-2 py-3 text-right font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {formatMatrixValue(matrixGrandTotal(matrix), metric)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </FeaturedMatrixTableFrame>
  );
}
