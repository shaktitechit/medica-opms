"use client";

import { Fragment, useMemo, useState } from "react";
import { LayoutGrid, ChevronRight, ChevronDown } from "lucide-react";
import { useListProductsQuery, useListUsersQuery, useListProductGroupsQuery } from "@/store/api";
import { buildUserNameById, pickUsersList } from "@/components/portal/shared/userDisplay";
import FeaturedMatrixTableFrame from "@/components/portal/admin/components/FeaturedMatrixTableFrame";
import { useAdminPeriodFilter } from "@/components/portal/admin/components/useAdminPeriodFilter";
import {
  buildFeaturedGroupProductMaps,
  formatMatrixValue,
  itemMetricValue,
  pickEntities,
  resolveOrderSalesUserId,
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

interface AccountFeaturedProductGroupSalesUserTableProps {
  orders: any[];
  isOrdersFetching: boolean;
}

export default function AccountFeaturedProductGroupSalesUserTable({
  orders,
  isOrdersFetching,
}: AccountFeaturedProductGroupSalesUserTableProps) {
  const [metric, setMetric] = useState<MatrixMetric>("quantity");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const {
    availableYears,
    selectedYears,
    setSelectedYears,
    selectedMonths,
    setSelectedMonths,
    filteredOrders,
  } = useAdminPeriodFilter(orders);

  const { data: groupsData, isFetching: isGroupsFetching } = useListProductGroupsQuery({
    is_featured: "true",
    status: "active",
    limit: 1000,
  });

  // Non-paginated list returns all matching products (limit is ignored server-side).
  const { data: productsData, isFetching: isProductsFetching } = useListProductsQuery({
    status: "active",
  });

  const { data: usersData, isFetching: isUsersFetching } = useListUsersQuery({
    department: "sales",
  });

  const featuredGroups = useMemo<MatrixEntity[]>(() => {
    return pickEntities(groupsData)
      .filter((g) => g.is_featured === true || g.is_featured === "true")
      .map((g) => ({
        id: String(g._id ?? g.id ?? ""),
        name: String(g.name ?? "Untitled Group"),
      }))
      .filter((g) => g.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groupsData]);

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

    const seen = new Set(fromList.map((u) => u.id));
    for (const order of filteredOrders) {
      const id = resolveOrderSalesUserId(order);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      fromList.push({ id, name: nameById[id] || id });
    }

    return fromList.sort((a, b) => a.name.localeCompare(b.name));
  }, [usersData, filteredOrders]);

  const { productToGroupMap, productsByGroup } = useMemo(
    () => buildFeaturedGroupProductMaps(productsData, featuredGroups),
    [productsData, featuredGroups],
  );

  const groupIds = useMemo(() => featuredGroups.map((g) => g.id), [featuredGroups]);
  const salesIds = useMemo(() => salesUsers.map((u) => u.id), [salesUsers]);
  const groupIdSet = useMemo(() => new Set(groupIds), [groupIds]);
  const salesIdSet = useMemo(() => new Set(salesIds), [salesIds]);

  const matrix = useMemo(() => {
    const map = new Map<string, Map<string, number>>();

    for (const gId of groupIds) {
      const gMap = new Map<string, number>();
      for (const sId of salesIds) gMap.set(sId, 0);
      map.set(gId, gMap);

      for (const p of productsByGroup.get(gId) ?? []) {
        const pMap = new Map<string, number>();
        for (const sId of salesIds) pMap.set(sId, 0);
        map.set(p.id, pMap);
      }
    }

    for (const order of filteredOrders) {
      const salesId = resolveOrderSalesUserId(order);
      if (!salesId || !salesIdSet.has(salesId)) continue;

      const items = Array.isArray(order.order_items) ? order.order_items : [];
      for (const item of items) {
        const productId = resolveProductId(item);
        if (!productId) continue;
        const val = itemMetricValue(item, metric);

        const gId = productToGroupMap.get(productId);
        if (!gId || !groupIdSet.has(gId)) continue;

        const pMap = map.get(productId);
        if (pMap) {
          pMap.set(salesId, (pMap.get(salesId) ?? 0) + val);
        }
        const gMap = map.get(gId);
        if (gMap) {
          gMap.set(salesId, (gMap.get(salesId) ?? 0) + val);
        }
      }
    }
    return map;
  }, [
    filteredOrders,
    groupIds,
    salesIds,
    groupIdSet,
    salesIdSet,
    productToGroupMap,
    productsByGroup,
    metric,
  ]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const getRowTotal = (id: string) => {
    const row = matrix.get(id);
    if (!row) return 0;
    let sum = 0;
    for (const v of row.values()) sum += v;
    return sum;
  };

  const getColTotal = (colId: string) => {
    let sum = 0;
    for (const gId of groupIds) {
      sum += matrix.get(gId)?.get(colId) ?? 0;
    }
    return sum;
  };

  const getGrandTotal = () => {
    let sum = 0;
    for (const gId of groupIds) {
      sum += getRowTotal(gId);
    }
    return sum;
  };

  const isLoading = isOrdersFetching || isGroupsFetching || isProductsFetching || isUsersFetching;

  const handleDownload = () => {
    if (featuredGroups.length === 0 || salesUsers.length === 0) return;
    const { headers, rows } = buildMatrixCsvPayload({
      rowLabel: "Product Group / Product",
      rows: featuredGroups,
      cols: salesUsers,
      matrix,
      childrenByRow: productsByGroup,
    });
    downloadCsvFile(
      reportFilename("account_product_group_sales_user", selectedYears, selectedMonths),
      headers,
      rows,
      [
        `Report: Featured Groups × Sales Persons`,
        `Period: ${formatPeriodLabel(selectedYears, selectedMonths)}`,
        `Metric: ${metric}`,
      ],
    );
  };


  return (
    <FeaturedMatrixTableFrame
      title="Featured Groups × Sales Persons"
      subtitle="Net sales by product group (expandable to products) across sales persons"
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
      ) : featuredGroups.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">
          No featured product groups found. Mark groups as featured to populate this matrix.
        </p>
      ) : salesUsers.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">No sales persons found.</p>
      ) : (
        <div className="overflow-x-auto min-w-0">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/5">
                <th className="sticky left-0 z-10 bg-white py-2.5 pr-4 text-left font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400 min-w-[200px]">
                  Product Group / Product
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
              {featuredGroups.map((group) => {
                const isExpanded = expandedGroups.has(group.id);
                const subProducts = productsByGroup.get(group.id) ?? [];

                return (
                  <Fragment key={group.id}>
                    <tr className="bg-slate-50/20 dark:bg-slate-900/10 hover:bg-slate-50/50 dark:hover:bg-white/5">
                      <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 py-2.5 pr-4 font-semibold text-slate-900 dark:text-white min-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup(group.id)}
                            className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 focus:outline-none cursor-pointer"
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Collapse products" : "Expand products"}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <span>{group.name}</span>
                          <span className="text-2xs text-slate-400 font-normal">
                            ({subProducts.length} items)
                          </span>
                        </div>
                      </td>
                      {salesUsers.map((user) => {
                        const val = matrix.get(group.id)?.get(user.id) ?? 0;
                        return (
                          <td
                            key={user.id}
                            className="px-2 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100 font-semibold"
                          >
                            {formatMatrixValue(val, metric)}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-slate-50">
                        {formatMatrixValue(getRowTotal(group.id), metric)}
                      </td>
                    </tr>

                    {isExpanded &&
                      (subProducts.length === 0 ? (
                        <tr>
                          <td
                            colSpan={salesUsers.length + 2}
                            className="py-2 pl-10 pr-4 text-xs italic text-slate-400"
                          >
                            No active products mapped to this group.
                          </td>
                        </tr>
                      ) : (
                        subProducts.map((prod) => (
                          <tr
                            key={`${group.id}:${prod.id}`}
                            className="hover:bg-slate-50/30 dark:hover:bg-white/[0.02]"
                          >
                            <td
                              className="sticky left-0 z-10 bg-white dark:bg-slate-900 py-2 pl-8 pr-4 text-slate-600 dark:text-slate-300 font-normal min-w-[200px] truncate max-w-[220px]"
                              title={prod.name}
                            >
                              {prod.name}
                            </td>
                            {salesUsers.map((user) => {
                              const val = matrix.get(prod.id)?.get(user.id) ?? 0;
                              return (
                                <td
                                  key={user.id}
                                  className="px-2 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400"
                                >
                                  {formatMatrixValue(val, metric)}
                                </td>
                              );
                            })}
                            <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                              {formatMatrixValue(getRowTotal(prod.id), metric)}
                            </td>
                          </tr>
                        ))
                      ))}
                  </Fragment>
                );
              })}
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
                    {formatMatrixValue(getColTotal(user.id), metric)}
                  </td>
                ))}
                <td className="px-2 py-3 text-right font-bold tabular-nums text-slate-900 dark:text-slate-50">
                  {formatMatrixValue(getGrandTotal(), metric)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </FeaturedMatrixTableFrame>
  );
}
