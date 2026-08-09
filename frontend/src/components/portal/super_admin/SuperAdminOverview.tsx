"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import OverviewWidgets from "@/components/portal/shared/dashboard/OverviewWidgets";
import WorkPlannerStatsWidgets from "@/components/portal/admin/workPlanner/WorkPlannerStatsWidgets";
import TransportPlannerStatsWidgets from "@/components/portal/shared/transportPlanner/TransportPlannerStatsWidgets";
import MonthlyPerformanceChart from "@/components/portal/shared/dashboard/MonthlyPerformanceChart";
import PartyLeaderboard from "@/components/portal/shared/dashboard/PartyLeaderboard";
import ProductLeaderboard from "@/components/portal/shared/dashboard/ProductLeaderboard";
import SalesLeaderboard from "@/components/portal/shared/dashboard/SalesLeaderboard";
import FeaturedProductGroupSalesUserTable from "@/components/portal/shared/dashboard/FeaturedProductGroupSalesUserTable";
import FeaturedProductGroupZoneTable from "@/components/portal/shared/dashboard/FeaturedProductGroupZoneTable";
import FeaturedProductGroupFeaturedPartyTable from "@/components/portal/shared/dashboard/FeaturedProductGroupFeaturedPartyTable";
import { formatPeriodCaption } from "@/components/portal/shared/dashboard/PeriodHeadingCaption";
import { ORDER_WORKFLOW_LIST_QUERY } from "@/components/portal/shared/orderList/orderWorkflowTabs";
import { useOrderWorkflowCategoryOptions } from "@/components/portal/shared/orderList/useOrderWorkflowCategoryOptions";
import {
  useGetDashboardSuperQuery,
  useGetTransportPlanStatsQuery,
  useListOrdersQuery,
  useListPartiesQuery,
  useListUsersQuery,
} from "@/store/api";
import { OverviewFlagsWidget } from "@/components/portal/shared/OverviewFlagsWidget";
import { useAppSelector } from "@/store/hooks";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { buildPartyNameById } from "@/components/portal/sales/partyDisplay";
import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import { FilePlus, RefreshCw } from "lucide-react";
import PeriodFilter from "@/components/portal/shared/dashboard/PeriodFilter";
import { usePeriodFilter } from "@/components/portal/shared/dashboard/usePeriodFilter";

const PORTAL_HOME = "/super_admin" as const;

export default function SuperAdminOverview() {
  const user = useAppSelector((state) => state.auth.user);
  const userName =
    typeof user?.name === "string" ? user.name : "Super Administrator";

  const {
    isFetching: isKpiFetching,
    refetch: refetchKpi,
  } = useGetDashboardSuperQuery();

  const {
    isFetching: isTransportPlanStatsFetching,
    refetch: refetchTransportPlanStats,
  } = useGetTransportPlanStatsQuery({});

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useListOrdersQuery(ORDER_WORKFLOW_LIST_QUERY);

  const { data: partiesData } = useListPartiesQuery({});
  const { data: usersData } = useListUsersQuery({ department: "sales" });
  const categoryOptions = useOrderWorkflowCategoryOptions();

  const orders = useMemo(() => pickOrders(ordersData) as any[], [ordersData]);

  const {
    availableYears,
    selectedYears,
    setSelectedYears,
    selectedMonths,
    setSelectedMonths,
    dateFilter,
    setDateFilter,
    customDateFrom,
    setCustomDateFrom,
    customDateTo,
    setCustomDateTo,
    filteredOrders,
  } = usePeriodFilter(orders);

  const filterCaption = useMemo(() => {
    return formatPeriodCaption(
      dateFilter,
      customDateFrom,
      customDateTo,
      selectedYears,
      selectedMonths
    );
  }, [dateFilter, customDateFrom, customDateTo, selectedYears, selectedMonths]);

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
        refetchTransportPlanStats().unwrap(),
      ]);
    } catch {
      // Ignore errors
    } finally {
      setIsRefreshing(false);
    }
  };

  const isAnyLoading =
    isKpiFetching ||
    isOrdersFetching ||
    isTransportPlanStatsFetching ||
    isRefreshing;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            Super Admin Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Welcome,{" "}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {userName}
            </span>{" "}
            (Super Admin). Here is the system-wide status report for today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <OverviewFlagsWidget currentDepartment="admin" variant="headerButton" />

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isAnyLoading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 text-slate-500 dark:text-slate-400 ${
                isAnyLoading ? "animate-spin" : ""
              }`}
            />
            Refresh Console
          </button>

          <Link
            href={`${PORTAL_HOME}/create-order`}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/10 transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <FilePlus className="h-4 w-4" />
            New Order Draft
          </Link>
        </div>
      </div>

      <div className="sticky top-[-20px] md:top-[-32px] z-[20] flex justify-end bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-200/80 dark:border-white/10 shadow-sm transition-all">
        <PeriodFilter
          availableYears={availableYears}
          selectedYears={selectedYears}
          selectedMonths={selectedMonths}
          onYearsChange={setSelectedYears}
          onMonthsChange={setSelectedMonths}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          customDateFrom={customDateFrom}
          onCustomDateFromChange={setCustomDateFrom}
          customDateTo={customDateTo}
          onCustomDateToChange={setCustomDateTo}
        />
      </div>

      <OverviewWidgets
        orders={orders}
        filteredOrders={filteredOrders}
        isOrdersFetching={isOrdersFetching}
        categoryOptions={categoryOptions}
        role="super_admin"
        portalHome={PORTAL_HOME}
        selectedYears={selectedYears}
        selectedMonths={selectedMonths}
        dateFilter={dateFilter}
        customDateFrom={customDateFrom}
        customDateTo={customDateTo}
      />

      <WorkPlannerStatsWidgets portalHome={PORTAL_HOME} />

      <TransportPlannerStatsWidgets portalHome={PORTAL_HOME} />

      <MonthlyPerformanceChart
        orders={orders}
        isOrdersFetching={isOrdersFetching}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ProductLeaderboard
          orders={filteredOrders}
          isOrdersFetching={isOrdersFetching}
          externalFilterCaption={filterCaption}
        />
        <PartyLeaderboard
          orders={filteredOrders}
          isOrdersFetching={isOrdersFetching}
          partyNameById={partyNameById}
          externalFilterCaption={filterCaption}
        />
        <SalesLeaderboard
          orders={filteredOrders}
          isOrdersFetching={isOrdersFetching}
          userNameById={userNameById}
          externalFilterCaption={filterCaption}
        />
      </div>

      <div className="space-y-6">
        <FeaturedProductGroupSalesUserTable
          orders={filteredOrders}
          isOrdersFetching={isOrdersFetching}
          externalFilterCaption={filterCaption}
        />
        <FeaturedProductGroupZoneTable
          orders={filteredOrders}
          isOrdersFetching={isOrdersFetching}
          externalFilterCaption={filterCaption}
        />
        <FeaturedProductGroupFeaturedPartyTable
          orders={filteredOrders}
          isOrdersFetching={isOrdersFetching}
          externalFilterCaption={filterCaption}
        />
      </div>
    </div>
  );
}
