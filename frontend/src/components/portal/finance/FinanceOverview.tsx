"use client";

import { useMemo, useState } from "react";
import { useFinanceTabAlertOverride } from "./FinanceTabAlert";
import FinanceOverviewWidgets from "./components/FinanceOverviewWidgets";
import FinanceMonthlyPerformanceChart from "./components/FinanceMonthlyPerformanceChart";
import FinancePartyLeaderboard from "./components/FinancePartyLeaderboard";
import FinanceProductLeaderboard from "./components/FinanceProductLeaderboard";
import FinanceSalesLeaderboard from "./components/FinanceSalesLeaderboard";
import FinanceFeaturedProductSalesUserTable from "./components/FinanceFeaturedProductSalesUserTable";
import FinanceFeaturedProductFeaturePartyTable from "./components/FinanceFeaturedProductFeaturePartyTable";
import FinanceFeaturedProductGroupSalesUserTable from "./components/FinanceFeaturedProductGroupSalesUserTable";
import FinanceFeaturedProductGroupFeaturedPartyTable from "./components/FinanceFeaturedProductGroupFeaturedPartyTable";
import {
  buildPendingReturnOrderIds,
  computeFinanceOrderStats,
} from "./financeOrderUtils";
import {
  useGetDashboardFinanceQuery,
  useListOrderReturnsQuery,
  useListOrdersQuery,
  useListPartiesQuery,
  useListUsersQuery,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { OverviewFlagsWidget } from "@/components/portal/shared/OverviewFlagsWidget";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import {
  buildPartyNameById,
  pickList,
} from "@/components/portal/sales/partyDisplay";
import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import {
  RefreshCw,
} from "lucide-react";

export default function FinanceOverview() {
  const user = useAppSelector((state) => state.auth.user);
  const userName =
    typeof user?.name === "string" ? user.name : "Finance Specialist";

  const {
    isFetching: isKpiFetching,
    refetch: refetchKpi,
  } = useGetDashboardFinanceQuery();

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useListOrdersQuery({});

  const { data: returnsData } = useListOrderReturnsQuery({});
  const { data: partiesData } = useListPartiesQuery({});
  const { data: usersData } = useListUsersQuery({ department: "sales" });

  const orders = useMemo(() => pickOrders(ordersData) as any[], [ordersData]);

  const pendingReturnOrderIds = useMemo(
    () => buildPendingReturnOrderIds(pickList(returnsData)),
    [returnsData],
  );

  const categoryOptions = useMemo(
    () => ({ pendingReturnOrderIds }),
    [pendingReturnOrderIds],
  );

  const orderStats = useMemo(
    () => computeFinanceOrderStats(orders, categoryOptions),
    [orders, categoryOptions],
  );

  useFinanceTabAlertOverride(orderStats.pending_finance_approval.count);

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesData),
    [partiesData],
  );

  const userNameById = useMemo(
    () => buildUserNameById(usersData),
    [usersData],
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
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
            Finance Overview
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 font-sans">
            Welcome,{" "}
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {userName}
            </span>{" "}
            (Finance). Review cashflow audits and department clearance flags.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <OverviewFlagsWidget currentDepartment="finance" variant="headerButton" />

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isAnyLoading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 text-slate-500 dark:text-slate-400 ${isAnyLoading ? "animate-spin" : ""}`}
            />
            Refresh Console
          </button>
        </div>
      </div>

      {/* KPI METRICS WIDGETS */}
      <FinanceOverviewWidgets
        orders={orders}
        isOrdersFetching={isOrdersFetching}
        categoryOptions={categoryOptions}
      />

      <FinanceMonthlyPerformanceChart
        orders={orders}
        isOrdersFetching={isOrdersFetching}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <FinanceProductLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <FinancePartyLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          partyNameById={partyNameById}
        />
        <FinanceSalesLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          userNameById={userNameById}
        />
      </div>

      <div className="space-y-6">
        {/* <FinanceFeaturedProductSalesUserTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <FinanceFeaturedProductFeaturePartyTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        /> */}
        <FinanceFeaturedProductGroupSalesUserTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <FinanceFeaturedProductGroupFeaturedPartyTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
      </div>
    </div>
  );
}
