"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import SalesOverviewWidgets from "./SalesOverviewWidgets";
import WorkPlannerStatsWidgets from "@/components/portal/shared/workPlanner/WorkPlannerStatsWidgets";
import SalesProductLeaderboard from "./components/SalesProductLeaderboard";
import SalesPartyLeaderboard from "./components/SalesPartyLeaderboard";
import SalesMonthlyPerformanceChart from "./components/SalesMonthlyPerformanceChart";
import SalesFeaturedProductSalesUserTable from "./components/SalesFeaturedProductSalesUserTable";
import SalesFeaturedProductFeaturePartyTable from "./components/SalesFeaturedProductFeaturePartyTable";
import SalesFeaturedProductGroupSalesUserTable from "./components/SalesFeaturedProductGroupSalesUserTable";
import SalesFeaturedProductGroupFeaturedPartyTable from "./components/SalesFeaturedProductGroupFeaturedPartyTable";
import {
  useGetDashboardSalesQuery,
  useListOrdersQuery,
  useListOrderReturnsQuery,
  useListPartiesQuery,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { OverviewFlagsWidget } from "@/components/portal/shared/OverviewFlagsWidget";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import {
  buildPendingReturnOrderIds,
  filterOrdersForSalesUser,
} from "@/components/portal/sales/orderUtils";
import {
  buildPartyNameById,
  pickList,
} from "@/components/portal/sales/partyDisplay";
import {
  FilePlus,
  RefreshCw,
} from "lucide-react";

export default function SalesOverview() {
  const user = useAppSelector((state) => state.auth.user);
  const userName =
    typeof user?.name === "string" ? user.name : "Sales Representative";

  const {
    isFetching: isKpiFetching,
    refetch: refetchKpi,
  } = useGetDashboardSalesQuery();

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useListOrdersQuery({});

  const { data: returnsData } = useListOrderReturnsQuery({});
  const { data: partiesData } = useListPartiesQuery({});

  const [isRefreshing, setIsRefreshing] = useState(false);

  // KPI / charts / leaderboards: only this sales user's portfolio
  const orders = useMemo(
    () => filterOrdersForSalesUser(pickOrders(ordersData), user) as any[],
    [ordersData, user],
  );

  const pendingReturnOrderIds = useMemo(
    () => buildPendingReturnOrderIds(pickList(returnsData)),
    [returnsData],
  );

  const categoryOptions = useMemo(
    () => ({ pendingReturnOrderIds }),
    [pendingReturnOrderIds],
  );

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesData),
    [partiesData],
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchKpi().unwrap(),
        refetchOrders().unwrap(),
      ]);
    } catch (e) {
      // Ignore errors
    } finally {
      setIsRefreshing(false);
    }
  };

  const isAnyLoading =
    isKpiFetching || isOrdersFetching || isRefreshing;

  return (
    <div className="space-y-8 pb-10 font-sans">
      {/* HEADER SECTION */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 font-sans">
            Sales Hub
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 font-sans">
            Welcome back, <span className="font-semibold text-blue-600 dark:text-blue-400">{userName}</span>. Here is your portfolio status for today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <OverviewFlagsWidget currentDepartment="sales" variant="headerButton" />

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isAnyLoading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 text-slate-500 dark:text-slate-400 ${isAnyLoading ? "animate-spin" : ""
                }`}
            />
            Refresh Hub
          </button>

          <Link
            href="/sales/create-order"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/10 transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <FilePlus className="h-4 w-4" />
            New Order Draft
          </Link>
        </div>
      </div>

      {/* KPI METRICS CARDS & QUICK ACCESS */}
      <SalesOverviewWidgets
        orders={orders}
        isOrdersFetching={isOrdersFetching}
        categoryOptions={categoryOptions}
      />

      <WorkPlannerStatsWidgets portalHome="/sales" />

      <SalesMonthlyPerformanceChart
        orders={orders}
        isOrdersFetching={isOrdersFetching}
      />

      {/* TWO COLUMN GRID: TOP PRODUCTS & TOP PARTIES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SalesProductLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <SalesPartyLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          partyNameById={partyNameById}
        />
      </div>

      <div className="space-y-6">
        {/* <SalesFeaturedProductSalesUserTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <SalesFeaturedProductFeaturePartyTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        /> */}
        <SalesFeaturedProductGroupSalesUserTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <SalesFeaturedProductGroupFeaturedPartyTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
      </div>
    </div>
  );
}
