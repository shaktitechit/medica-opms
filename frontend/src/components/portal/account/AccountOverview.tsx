"use client";

import { useMemo, useState } from "react";
import { useAccountTabAlertOverride } from "./AccountTabAlert";
import AccountOverviewWidgets from "./components/AccountOverviewWidgets";
import AccountMonthlyPerformanceChart from "./components/AccountMonthlyPerformanceChart";
import AccountPartyLeaderboard from "./components/AccountPartyLeaderboard";
import AccountProductLeaderboard from "./components/AccountProductLeaderboard";
import AccountSalesLeaderboard from "./components/AccountSalesLeaderboard";
import AccountFeaturedProductSalesUserTable from "./components/AccountFeaturedProductSalesUserTable";
import AccountFeaturedProductFeaturePartyTable from "./components/AccountFeaturedProductFeaturePartyTable";
import {
  buildPendingReturnOrderIds,
  computeAccountOrderStats,
} from "./accountOrderUtils";
import {
  useGetDashboardAccountQuery,
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
  RefreshCw,
} from "lucide-react";

export default function AccountOverview() {
  const user = useAppSelector((state) => state.auth.user);
  const userName =
    typeof user?.name === "string" ? user.name : "Account Specialist";

  const {
    isFetching: isKpiFetching,
    refetch: refetchKpi,
  } = useGetDashboardAccountQuery();

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useListOrdersQuery({});

  const { data: returnsData } = useListOrderReturnsQuery({});
  const { data: partiesData } = useListPartiesQuery({});
  const { data: usersData } = useListUsersQuery({ department: "sales" });

  const orders = useMemo(
    () => pickOrders(ordersData) as Record<string, unknown>[],
    [ordersData],
  );

  const pendingReturnOrderIds = useMemo(
    () => buildPendingReturnOrderIds(pickList(returnsData)),
    [returnsData],
  );

  const categoryOptions = useMemo(
    () => ({ pendingReturnOrderIds }),
    [pendingReturnOrderIds],
  );

  const orderStats = useMemo(
    () => computeAccountOrderStats(orders, categoryOptions),
    [orders, categoryOptions],
  );

  useAccountTabAlertOverride(orderStats.pending_account_approval.count);

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
    } catch {
      // Ignore errors
    } finally {
      setIsRefreshing(false);
    }
  };

  const isAnyLoading =
    isKpiFetching || isOrdersFetching || isRefreshing;

  return (
    <div className="space-y-8 pb-10 font-sans">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 font-sans">
            Account Overview
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 font-sans">
            Welcome,{" "}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {userName}
            </span>{" "}
            (Account). Review billing clearances and dispatch handoffs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <OverviewFlagsWidget currentDepartment="account" variant="headerButton" />

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

      <AccountOverviewWidgets
        orders={orders}
        isOrdersFetching={isOrdersFetching}
        categoryOptions={categoryOptions}
      />

      <AccountMonthlyPerformanceChart
        orders={orders}
        isOrdersFetching={isOrdersFetching}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AccountProductLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <AccountPartyLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          partyNameById={partyNameById}
        />
        <AccountSalesLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          userNameById={userNameById}
        />
      </div>

      <div className="space-y-6">
        <AccountFeaturedProductSalesUserTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <AccountFeaturedProductFeaturePartyTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
      </div>
    </div>
  );
}
