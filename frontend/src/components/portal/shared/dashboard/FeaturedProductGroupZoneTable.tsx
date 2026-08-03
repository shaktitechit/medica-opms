"use client";

import { Fragment, useMemo, useState } from "react";
import { MapPin, ChevronRight, ChevronDown } from "lucide-react";
import { useListProductsQuery, useListZonesQuery, useListProductGroupsQuery } from "@/store/api";
import FeaturedMatrixTableFrame from "./FeaturedMatrixTableFrame";
import { usePeriodFilter } from "./usePeriodFilter";
import {
  buildFeaturedGroupProductMaps,
  formatMatrixValue,
  itemMetricValue,
  pickEntities,
  resolveOrderPartyId,
  resolveProductId,
  shouldIncludeOrder,
  type MatrixEntity,
  type MatrixMetric,
  type MatrixQtyBasis,
} from "./featuredMatrixUtils";
import { formatPeriodLabel } from "./periodFilterUtils";
import {
  buildMatrixCsvPayload,
  downloadCsvFile,
  reportFilename,
} from "./reportDownloadUtils";

interface FeaturedProductGroupZoneTableProps {
  orders: any[];
  isOrdersFetching: boolean;
  /** Use parent-filtered orders as-is (skip internal year/month filter). */
  syncWithExternalFilter?: boolean;
  /** Caption shown when syncWithExternalFilter is on. */
  externalFilterCaption?: string;
  /** Initial Net/Approved basis (default: net). */
  initialQtyBasis?: MatrixQtyBasis;
  forceMetric?: MatrixMetric;
}

export default function FeaturedProductGroupZoneTable({
  orders,
  isOrdersFetching,
  syncWithExternalFilter = false,
  externalFilterCaption,
  initialQtyBasis = "approved",
  forceMetric,
}: FeaturedProductGroupZoneTableProps) {
  const [metricState, setMetric] = useState<MatrixMetric>("quantity");
  const metric = forceMetric ?? metricState;
  const [qtyBasis, setQtyBasis] = useState<MatrixQtyBasis>(initialQtyBasis);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const {
    availableYears,
    selectedYears,
    setSelectedYears,
    selectedMonths,
    setSelectedMonths,
    filteredOrders: periodFilteredOrders,
  } = usePeriodFilter(orders);

  const filteredOrders = syncWithExternalFilter ? orders : periodFilteredOrders;

  const { data: groupsData, isFetching: isGroupsFetching } = useListProductGroupsQuery({
    is_featured: "true",
    status: "active",
    limit: 1000,
  });

  const { data: productsData, isFetching: isProductsFetching } = useListProductsQuery({
    status: "active",
  });

  const { data: zonesData, isFetching: isZonesFetching } = useListZonesQuery({
    limit: 1000,
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

  // Build mapping of partyId -> zoneId
  const { partyToZoneMap, zonesList } = useMemo(() => {
    const map = new Map<string, string>();
    const zonesRaw = zonesData && typeof zonesData === "object" && "data" in zonesData
      ? (zonesData.data as any[])
      : Array.isArray(zonesData)
      ? zonesData
      : [];

    const list: MatrixEntity[] = zonesRaw.map((z) => {
      const zId = String(z._id ?? z.id ?? "");
      const parties = Array.isArray(z.parties) ? z.parties : [];
      for (const p of parties) {
        const pId = typeof p === "string" ? p : String(p._id ?? p.id ?? "");
        if (pId) map.set(pId, zId);
      }
      return {
        id: zId,
        name: String(z.name ?? "Unknown Zone"),
      };
    }).filter((z) => z.id);

    // Sort zones alphabetically
    list.sort((a, b) => a.name.localeCompare(b.name));

    // Append virtual unzoned category
    list.push({ id: "unzoned", name: "Unzoned" });

    return { partyToZoneMap: map, zonesList: list };
  }, [zonesData]);

  const { productToGroupMap, productsByGroup } = useMemo(
    () => buildFeaturedGroupProductMaps(productsData, featuredGroups),
    [productsData, featuredGroups],
  );

  const groupIds = useMemo(() => featuredGroups.map((g) => g.id), [featuredGroups]);
  const zoneIds = useMemo(() => zonesList.map((z) => z.id), [zonesList]);
  const groupIdSet = useMemo(() => new Set(groupIds), [groupIds]);
  const zoneIdSet = useMemo(() => new Set(zoneIds), [zoneIds]);

  const matrix = useMemo(() => {
    const map = new Map<string, Map<string, number>>();

    for (const gId of groupIds) {
      const gMap = new Map<string, number>();
      for (const zId of zoneIds) gMap.set(zId, 0);
      map.set(gId, gMap);

      for (const p of productsByGroup.get(gId) ?? []) {
        const pMap = new Map<string, number>();
        for (const zId of zoneIds) pMap.set(zId, 0);
        map.set(p.id, pMap);
      }
    }

    for (const order of filteredOrders) {
      if (!shouldIncludeOrder(order, qtyBasis)) continue;
      const partyId = resolveOrderPartyId(order);
      const zoneId = (partyId && partyToZoneMap.get(partyId)) || "unzoned";
      if (!zoneIdSet.has(zoneId)) continue;

      const items = Array.isArray(order.order_items) ? order.order_items : [];
      for (const item of items) {
        const productId = resolveProductId(item);
        if (!productId) continue;
        const val = itemMetricValue(item, metric, qtyBasis);

        const gId = productToGroupMap.get(productId);
        if (!gId || !groupIdSet.has(gId)) continue;

        const pMap = map.get(productId);
        if (pMap) {
          pMap.set(zoneId, (pMap.get(zoneId) ?? 0) + val);
        }
        const gMap = map.get(gId);
        if (gMap) {
          gMap.set(zoneId, (gMap.get(zoneId) ?? 0) + val);
        }
      }
    }
    return map;
  }, [
    filteredOrders,
    groupIds,
    zoneIds,
    groupIdSet,
    zoneIdSet,
    productToGroupMap,
    productsByGroup,
    metric,
    qtyBasis,
    partyToZoneMap,
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

  const isLoading = isOrdersFetching || isGroupsFetching || isProductsFetching || isZonesFetching;

  // Filter out columns that are completely empty to keep view cleaner, but always keep actual zones
  const activeZones = useMemo(() => {
    return zonesList.filter((z) => {
      if (z.id !== "unzoned") return true;
      // Only show unzoned column if it actually has sales data
      return getColTotal("unzoned") > 0;
    });
  }, [zonesList, matrix, groupIds]);

  const handleDownload = () => {
    if (featuredGroups.length === 0 || activeZones.length === 0) return;
    const { headers, rows } = buildMatrixPayload({
      rowLabel: "Product Group / Product",
      rows: featuredGroups,
      cols: activeZones,
      matrix,
      childrenByRow: productsByGroup,
    });
    downloadCsvFile(
      reportFilename("product_group_zone", selectedYears, selectedMonths),
      headers,
      rows,
      [
        `Report: Featured Groups × Zones`,
        `Period: ${formatPeriodLabel(selectedYears, selectedMonths)}`,
        `Metric: ${metric}`,
        `Basis: ${qtyBasis}`,
      ],
    );
  };

  // Symmetrical build CSV logic
  const buildMatrixPayload = ({
    rowLabel,
    rows,
    cols,
    matrix,
    childrenByRow,
  }: {
    rowLabel: string;
    rows: MatrixEntity[];
    cols: MatrixEntity[];
    matrix: Map<string, Map<string, number>>;
    childrenByRow: Map<string, { id: string; name: string }[]>;
  }) => {
    const headers = [rowLabel, ...cols.map((c) => c.name), "Total"];
    const fileRows: string[][] = [];

    for (const r of rows) {
      const mainRow = [r.name];
      for (const c of cols) {
        mainRow.push(String(matrix.get(r.id)?.get(c.id) ?? 0));
      }
      mainRow.push(String(getRowTotal(r.id)));
      fileRows.push(mainRow);

      for (const child of childrenByRow.get(r.id) ?? []) {
        const subRow = [`  ${child.name}`];
        for (const c of cols) {
          subRow.push(String(matrix.get(child.id)?.get(c.id) ?? 0));
        }
        subRow.push(String(getRowTotal(child.id)));
        fileRows.push(subRow);
      }
    }

    const totalRow = ["Total"];
    for (const c of cols) {
      totalRow.push(String(getColTotal(c.id)));
    }
    totalRow.push(String(getGrandTotal()));
    fileRows.push(totalRow);

    return { headers, rows: fileRows };
  };

  return (
    <FeaturedMatrixTableFrame
      title="Featured Groups × Zones"
      subtitle={
        qtyBasis === "net"
          ? "Net sales by product group (expandable to products) across operational zones"
          : "Approved sales by product group (expandable to products) across operational zones"
      }
      icon={<MapPin className="h-5 w-5" />}
      accentClass="text-emerald-600 dark:text-emerald-455"
      metric={metric}
      onMetricChange={setMetric}
      showMetricToggle={!forceMetric}
      qtyBasis={qtyBasis}
      availableYears={availableYears}
      selectedYears={selectedYears}
      selectedMonths={selectedMonths}
      onYearsChange={setSelectedYears}
      onMonthsChange={setSelectedMonths}
      onDownload={handleDownload}
      downloadDisabled={isLoading}
      hidePeriodFilter={syncWithExternalFilter}
      externalFilterCaption={externalFilterCaption}
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
      ) : activeZones.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">No operational zones found.</p>
      ) : (
        <div className="overflow-x-auto min-w-0">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/5">
                <th className="sticky left-0 z-10 bg-white py-2.5 pr-4 text-left font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400 min-w-[200px]">
                  Product Group / Product
                </th>
                {activeZones.map((zone) => (
                  <th
                    key={zone.id}
                    className="px-2 py-2.5 text-right font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap min-w-[96px]"
                    title={zone.name}
                  >
                    {zone.name}
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
                      {activeZones.map((zone) => {
                        const val = matrix.get(group.id)?.get(zone.id) ?? 0;
                        return (
                          <td
                            key={zone.id}
                            className="px-2 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100 font-semibold"
                          >
                            {formatMatrixValue(val, metric)}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2.5 text-right font-bold tabular-nums text-slate-900 dark:text-slate-55">
                        {formatMatrixValue(getRowTotal(group.id), metric)}
                      </td>
                    </tr>

                    {isExpanded &&
                      (subProducts.length === 0 ? (
                        <tr>
                          <td
                            colSpan={activeZones.length + 2}
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
                            {activeZones.map((zone) => {
                              const val = matrix.get(prod.id)?.get(zone.id) ?? 0;
                              return (
                                <td
                                  key={zone.id}
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
                {activeZones.map((zone) => (
                  <td
                    key={zone.id}
                    className="px-2 py-3 text-right font-bold tabular-nums text-slate-900 dark:text-slate-50"
                  >
                    {formatMatrixValue(getColTotal(zone.id), metric)}
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
