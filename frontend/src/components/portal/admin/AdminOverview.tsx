"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAdminTabAlertOverride } from "./AdminTabAlert";
import AdminOverviewWidgets from "./AdminOverviewWidgets";
import AdminMonthlyPerformanceChart from "./components/AdminMonthlyPerformanceChart";
import AdminPartyLeaderboard from "./components/AdminPartyLeaderboard";
import AdminProductLeaderboard from "./components/AdminProductLeaderboard";
import AdminSalesLeaderboard from "./components/AdminSalesLeaderboard";
import FeaturedProductSalesUserTable from "./components/FeaturedProductSalesUserTable";
import FeaturedProductFeaturePartyTable from "./components/FeaturedProductFeaturePartyTable";
import {
  buildPendingReturnOrderIds,
  computeAdminOrderStats,
} from "./adminOrderUtils";
import {
  useGetDashboardAdminQuery,
  useListOrderReturnsQuery,
  useListOrdersQuery,
  useListPartiesQuery,
  useListUsersQuery,
} from "@/store/api";
import { OverviewFlagsWidget } from "@/components/portal/shared/OverviewFlagsWidget";
import { useAppSelector } from "@/store/hooks";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import {
  buildPartyNameById,
  pickList,
} from "@/components/portal/sales/partyDisplay";
import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import {
  FilePlus,
  RefreshCw,
} from "lucide-react";

export default function AdminOverview() {
  const user = useAppSelector((state) => state.auth.user);
  const userName =
    typeof user?.name === "string" ? user.name : "System Administrator";

  const {
    isFetching: isKpiFetching,
    refetch: refetchKpi,
  } = useGetDashboardAdminQuery();

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useListOrdersQuery({});

  const { data: partiesData } = useListPartiesQuery({});
  const { data: usersData } = useListUsersQuery({ department: "sales" });
  const { data: returnsData } = useListOrderReturnsQuery({});

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
    () => computeAdminOrderStats(orders, categoryOptions),
    [orders, categoryOptions],
  );

  useAdminTabAlertOverride(orderStats.pending_admin_approval.count);

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
    <div className="space-y-8 pb-10">
      {/* HEADER SECTION */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            Admin Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Welcome,{" "}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {userName}
            </span>{" "}
            (Admin). Here is the system-wide status report for today.
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
              className={`h-4 w-4 text-slate-500 dark:text-slate-400 ${isAnyLoading ? "animate-spin" : ""
                }`}
            />
            Refresh Console
          </button>

          <Link
            href="/admin/create-order"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/10 transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <FilePlus className="h-4 w-4" />
            New Order Draft
          </Link>
        </div>
      </div>

      {/* KPI METRICS WIDGETS */}
      <AdminOverviewWidgets
        orders={orders}
        isOrdersFetching={isOrdersFetching}
        categoryOptions={categoryOptions}
      />

      <AdminMonthlyPerformanceChart
        orders={orders}
        isOrdersFetching={isOrdersFetching}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AdminProductLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <AdminPartyLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          partyNameById={partyNameById}
        />
        <AdminSalesLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          userNameById={userNameById}
        />
      </div>

      <div className="space-y-6">
        <FeaturedProductSalesUserTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <FeaturedProductFeaturePartyTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
      </div>
    </div>
  );
}
