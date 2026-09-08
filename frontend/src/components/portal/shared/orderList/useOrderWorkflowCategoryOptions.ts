"use client";

import { useMemo } from "react";

import { useGetOrderWorkflowContextQuery } from "@/store/api";
import { useAppSelector } from "@/store/hooks";

import type { OrderWorkflowCategoryOptions } from "./orderWorkflowTabs";

/**
 * Same category options for dashboard Quick Access and ListOrdersPage
 * workflow tabs (transports + transport_created dispatches), backed by
 * the lightweight GET /orders/workflow-context endpoint.
 */
export function useOrderWorkflowCategoryOptions(): OrderWorkflowCategoryOptions {
  const token = useAppSelector((state) => state.auth.token);
  const { data } = useGetOrderWorkflowContextQuery(undefined, {
    skip: !token,
  });

  return useMemo(
    () => ({
      activeTransportOrderIds: new Set(data?.activeTransportOrderIds ?? []),
      transportCreatedOrderIds: new Set(data?.transportCreatedOrderIds ?? []),
      dispatchTransportOrderIds: new Set(data?.dispatchTransportOrderIds ?? []),
      submittedDispatchOrderIds: new Set(data?.submittedDispatchOrderIds ?? []),
    }),
    [data],
  );
}
