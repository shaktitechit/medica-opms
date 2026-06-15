"use client";

import { useEffect, useRef } from "react";

import {
  DashboardCard,
  FlagList,
  OrderTable,
  RecentActivity,
} from "@/components/widgets";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useListOrdersQuery } from "@/store/api";

import type { PortalKey } from "@/constants/portalNav";
import { pickOrders } from "./pickOrders";
import { PortalBusyOverlay } from "./PortalBusyOverlay";
import { usePortalDashboardKpi } from "./usePortalDashboardKpi";

type PortalOverviewShellProps = { portal: PortalKey };

export default function PortalOverviewShell({
  portal,
}: PortalOverviewShellProps) {
  const { snapshot: activeSnapshot, endpoint, toneClass, skipKpi } =
    usePortalDashboardKpi(portal);
  const { data, isFetching, isError, error } = activeSnapshot;

  const dashErrToastShown = useRef(false);
  useEffect(() => {
    dashErrToastShown.current = false;
  }, [portal]);
  useEffect(() => {
    if (!isError || skipKpi) {
      dashErrToastShown.current = false;
      return;
    }
    if (dashErrToastShown.current) return;
    dashErrToastShown.current = true;
    toast.error(
      `Could not load KPI: ${mutationRejectedMessage(error ?? {})}`,
    );
  }, [error, isError, skipKpi]);

  const ordersQ = useListOrdersQuery({});
  const orders = pickOrders(ordersQ.data);

  const ordersErrToastShown = useRef(false);
  useEffect(() => {
    if (!ordersQ.isError) {
      ordersErrToastShown.current = false;
      return;
    }
    if (ordersErrToastShown.current) return;
    ordersErrToastShown.current = true;
    toast.error(
      `Could not load orders: ${mutationRejectedMessage(ordersQ.error ?? {})}`,
    );
  }, [ordersQ.error, ordersQ.isError]);

  return (
    <div className="space-y-8">
      <PortalBusyOverlay active={ordersQ.isLoading} message="Loading orders…" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          {portal.charAt(0).toUpperCase() + portal.slice(1)} overview
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          KPI surface from backend ({endpoint}). Use the sidebar to open
          task-focused views as you flesh them out.
        </p>
      </div>

      <DashboardCard
        title="Signals"
        description="Structured KPI payload scoped to department."
      >
        {isFetching && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        )}
        {isError && (
          <p className="text-sm text-rose-600 dark:text-rose-400">
            Couldn&apos;t load KPI for this workspace.
          </p>
        )}
        {!isFetching && !isError && data !== undefined && (
          <pre
            className={`max-h-[min(420px,50vh)] overflow-auto rounded-md bg-slate-950/95 p-3 font-mono text-xs ${toneClass} shadow-inner ring-1 ring-black/25 dark:bg-black/70`}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </DashboardCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentActivity />
        <FlagList />
      </div>

      <DashboardCard
        title="Orders snapshot"
        description="Latest rows via `GET /api/orders`."
      >
        <OrderTable
          orders={orders}
          emptyHint={ordersQ.isError ? "Could not load orders." : undefined}
          portal={portal}
        />
      </DashboardCard>
    </div>
  );
}
