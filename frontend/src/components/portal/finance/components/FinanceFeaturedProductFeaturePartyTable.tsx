"use client";

import { useMemo, useState } from "react";
import { Table2 } from "lucide-react";
import { useListPartiesQuery, useListProductsQuery } from "@/store/api";
import { partyRecordName } from "@/components/portal/sales/partyDisplay";
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
  resolveOrderPartyId,
  resolveProductId,
  type MatrixEntity,
  type MatrixMetric,
} from "@/components/portal/admin/components/featuredMatrixUtils";
import { formatPeriodLabel } from "@/components/portal/admin/components/periodFilterUtils";
import {
  buildMatrixCsvPayload,
  downloadCsvFile,
  reportFilename,
} from "@/components/portal/admin/components/reportDownloadUtils";

interface FinanceFeaturedProductFeaturePartyTableProps {
  orders: any[];
  isOrdersFetching: boolean;
}

export default function FinanceFeaturedProductFeaturePartyTable({
  orders,
  isOrdersFetching,
}: FinanceFeaturedProductFeaturePartyTableProps) {
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
  const { data: partiesData, isFetching: isPartiesFetching } = useListPartiesQuery({
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

  const featuredParties = useMemo<MatrixEntity[]>(() => {
    return pickEntities(partiesData)
      .map((p) => {
        const id = String(p._id ?? p.id ?? "");
        const name = partyRecordName(p) || String(p.party_name ?? "Untitled Party");
        return { id, name };
      })
      .filter((p) => p.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [partiesData]);

  const productIds = useMemo(() => featuredProducts.map((p) => p.id), [featuredProducts]);
  const partyIds = useMemo(() => featuredParties.map((p) => p.id), [featuredParties]);
  const productIdSet = useMemo(() => new Set(productIds), [productIds]);
  const partyIdSet = useMemo(() => new Set(partyIds), [partyIds]);

  const matrix = useMemo(() => {
    const map = emptyMatrix(productIds, partyIds);
    for (const order of filteredOrders) {
      const partyId = resolveOrderPartyId(order);
      if (!partyId || !partyIdSet.has(partyId)) continue;
      const items = Array.isArray(order.order_items) ? order.order_items : [];
      for (const item of items) {
        const productId = resolveProductId(item);
        if (!productId || !productIdSet.has(productId)) continue;
        const row = map.get(productId);
        if (!row) continue;
        row.set(partyId, (row.get(partyId) ?? 0) + itemMetricValue(item, metric));
      }
    }
    return map;
  }, [filteredOrders, productIds, partyIds, productIdSet, partyIdSet, metric]);

  const isLoading = isOrdersFetching || isProductsFetching || isPartiesFetching;

  const handleDownload = () => {
    if (featuredProducts.length === 0 || featuredParties.length === 0) return;
    const { headers, rows } = buildMatrixCsvPayload({
      rowLabel: "Featured Product",
      rows: featuredProducts,
      cols: featuredParties,
      matrix,
    });
    downloadCsvFile(
      reportFilename("finance_product_feature_party", selectedYears, selectedMonths),
      headers,
      rows,
      [
        `Report: Featured Products × Featured Parties`,
        `Period: ${formatPeriodLabel(selectedYears, selectedMonths)}`,
        `Metric: ${metric}`,
      ],
    );
  };


  return (
    <FeaturedMatrixTableFrame
      title="Featured Products × Featured Parties"
      subtitle="Net sales by featured product across each featured party"
      icon={<Table2 className="h-5 w-5" />}
      accentClass="text-emerald-600 dark:text-emerald-400"
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
      ) : featuredParties.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">
          No featured parties found. Mark parties as featured to populate this matrix.
        </p>
      ) : (
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/5">
              <th className="sticky left-0 z-10 bg-white py-2.5 pr-4 text-left font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400 min-w-[160px]">
                Featured Product
              </th>
              {featuredParties.map((party) => (
                <th
                  key={party.id}
                  className="px-2 py-2.5 text-right font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap min-w-[96px]"
                  title={party.name}
                >
                  {party.name}
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
                {featuredParties.map((party) => {
                  const value = matrix.get(product.id)?.get(party.id) ?? 0;
                  return (
                    <td
                      key={party.id}
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
              {featuredParties.map((party) => (
                <td
                  key={party.id}
                  className="px-2 py-3 text-right font-bold tabular-nums text-slate-900 dark:text-slate-50"
                >
                  {formatMatrixValue(matrixColTotal(matrix, party.id), metric)}
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
