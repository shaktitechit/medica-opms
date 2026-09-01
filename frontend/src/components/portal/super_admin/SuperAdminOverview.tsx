"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import OverviewWidgets from "@/components/portal/shared/dashboard/OverviewWidgets";
import WorkPlannerStatsWidgets from "@/components/portal/admin/workPlanner/WorkPlannerStatsWidgets";
import TransportPlannerStatsWidgets from "@/components/portal/shared/transportPlanner/TransportPlannerStatsWidgets";
import LeadManagerStatsWidgets from "@/components/portal/shared/leads/LeadManagerStatsWidgets";
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
  useGetCompanyDataQuery,
  useListOrdersQuery,
  useListPartiesQuery,
  useListUsersQuery,
} from "@/store/api";
import { OverviewFlagsWidget } from "@/components/portal/shared/OverviewFlagsWidget";
import { useAppSelector } from "@/store/hooks";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { buildPartyNameById } from "@/components/portal/sales/partyDisplay";
import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import {
  Building2,
  FilePlus,
  RefreshCw,
  Users,
  Package,
  ShoppingCart,
  Truck,
  ClipboardList,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import PeriodFilter from "@/components/portal/shared/dashboard/PeriodFilter";
import { usePeriodFilter } from "@/components/portal/shared/dashboard/usePeriodFilter";
import { dashboardPeriodToStatsQuery } from "@/components/portal/shared/dashboard/periodFilterUtils";

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
    data: parentCompanyData,
    isFetching: isParentDataFetching,
    refetch: refetchParentData,
  } = useGetCompanyDataQuery();

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useListOrdersQuery(ORDER_WORKFLOW_LIST_QUERY);

  const { data: partiesData, isFetching: isPartiesFetching } = useListPartiesQuery({});
  const { data: usersData, isFetching: isUsersFetching } = useListUsersQuery({ department: "sales" });
  const categoryOptions = useOrderWorkflowCategoryOptions();

  const orders = useMemo(() => pickOrders(ordersData) as any[], [ordersData]);

  const {
    dataType,
    setDataType,
    qtyBasis,
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

  const periodStatsQuery = useMemo(
    () =>
      dashboardPeriodToStatsQuery({
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedYears,
        selectedMonths,
      }),
    [dateFilter, customDateFrom, customDateTo, selectedYears, selectedMonths],
  );

  const {
    isFetching: isTransportPlanStatsFetching,
    refetch: refetchTransportPlanStats,
  } = useGetTransportPlanStatsQuery(periodStatsQuery);

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
        refetchParentData().unwrap(),
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
    isPartiesFetching ||
    isUsersFetching ||
    isTransportPlanStatsFetching ||
    isParentDataFetching;

  const company = parentCompanyData?.company_info;
  const metrics = parentCompanyData?.metrics;

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

          <Link
            href={`${PORTAL_HOME}/profile?tab=company`}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Company Info & Data
          </Link>

          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing || isAnyLoading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 text-slate-500 dark:text-slate-400 ${
                isRefreshing || isAnyLoading ? "animate-spin" : ""
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

      {/* ── PARENT COMPANY DATA SUMMARY BANNER ── */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 p-5 shadow-sm dark:border-blue-900/30 dark:from-blue-950/20 dark:via-indigo-950/10 dark:to-slate-900/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md">
              <Building2 className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                  {company?.legal_name || company?.trade_name || "Parent Company Organization Root"}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
                  <ShieldCheck className="size-3" /> Parent Entity
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Central parent of all data across Users, Products, Parties, Orders, Logistics & Operations.
              </p>
            </div>
          </div>

          <Link
            href={`${PORTAL_HOME}/profile?tab=company`}
            className="flex items-center gap-1.5 self-start md:self-auto rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 dark:border-blue-800/40 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-slate-700"
          >
            Manage Company Profile & Full Data
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {/* Quick KPI Row */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 pt-4 border-t border-blue-100/80 dark:border-white/5">
          <div className="rounded-lg bg-white/80 p-2.5 shadow-2xs dark:bg-slate-900/60">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Users</span>
              <Users className="size-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
              {metrics?.users?.total ?? 0}
            </div>
          </div>

          <div className="rounded-lg bg-white/80 p-2.5 shadow-2xs dark:bg-slate-900/60">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Parties</span>
              <Building2 className="size-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
              {metrics?.parties?.total ?? 0}
            </div>
          </div>

          <div className="rounded-lg bg-white/80 p-2.5 shadow-2xs dark:bg-slate-900/60">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Products</span>
              <Package className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
              {metrics?.catalog?.total_products ?? 0}
            </div>
          </div>

          <div className="rounded-lg bg-white/80 p-2.5 shadow-2xs dark:bg-slate-900/60">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Orders</span>
              <ShoppingCart className="size-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
              {metrics?.orders?.total ?? 0}
            </div>
          </div>

          <div className="rounded-lg bg-white/80 p-2.5 shadow-2xs dark:bg-slate-900/60">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Fleet</span>
              <Truck className="size-3.5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
              {metrics?.fleet?.vehicles ?? 0}
            </div>
          </div>

          <div className="rounded-lg bg-white/80 p-2.5 shadow-2xs dark:bg-slate-900/60">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Work Plans</span>
              <ClipboardList className="size-3.5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
              {metrics?.field_operations?.work_plans ?? 0}
            </div>
          </div>
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
          dataType={dataType}
          onDataTypeChange={setDataType}
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
        qtyBasis={qtyBasis}
      />

      <WorkPlannerStatsWidgets
        portalHome={PORTAL_HOME}
        dateFilter={dateFilter}
        customDateFrom={customDateFrom}
        customDateTo={customDateTo}
        selectedYears={selectedYears}
        selectedMonths={selectedMonths}
      />

      <TransportPlannerStatsWidgets
        portalHome={PORTAL_HOME}
        dateFilter={dateFilter}
        customDateFrom={customDateFrom}
        customDateTo={customDateTo}
        selectedYears={selectedYears}
        selectedMonths={selectedMonths}
      />

      <LeadManagerStatsWidgets
        portalHome={PORTAL_HOME}
        dateFilter={dateFilter}
        customDateFrom={customDateFrom}
        customDateTo={customDateTo}
        selectedYears={selectedYears}
        selectedMonths={selectedMonths}
      />

      <MonthlyPerformanceChart
        orders={orders}
        isOrdersFetching={isOrdersFetching}
        qtyBasis={qtyBasis}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ProductLeaderboard
          orders={filteredOrders}
          isOrdersFetching={isOrdersFetching}
          externalFilterCaption={filterCaption}
          qtyBasis={qtyBasis}
        />
        <PartyLeaderboard
          orders={filteredOrders}
          isOrdersFetching={isOrdersFetching}
          partyNameById={partyNameById}
          externalFilterCaption={filterCaption}
          qtyBasis={qtyBasis}
        />
        <SalesLeaderboard
          orders={filteredOrders}
          isOrdersFetching={isOrdersFetching}
          userNameById={userNameById}
          externalFilterCaption={filterCaption}
          qtyBasis={qtyBasis}
        />
      </div>

      <div className="space-y-6">
        <FeaturedProductGroupSalesUserTable
          orders={filteredOrders}
          isOrdersFetching={isOrdersFetching}
          externalFilterCaption={filterCaption}
          qtyBasis={qtyBasis}
        />
        <FeaturedProductGroupZoneTable
          orders={filteredOrders}
          isOrdersFetching={isOrdersFetching}
          externalFilterCaption={filterCaption}
          qtyBasis={qtyBasis}
        />
        <FeaturedProductGroupFeaturedPartyTable
          orders={filteredOrders}
          isOrdersFetching={isOrdersFetching}
          externalFilterCaption={filterCaption}
          qtyBasis={qtyBasis}
        />
      </div>
    </div>
  );
}
