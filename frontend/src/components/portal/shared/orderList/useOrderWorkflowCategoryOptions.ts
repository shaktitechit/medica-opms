"use client";

import { useMemo } from "react";

import { pickList } from "@/components/portal/sales/partyDisplay";
import { useListDispatchesQuery, useListTransportsQuery } from "@/store/api";

import {
  buildOrderWorkflowCategoryOptions,
  type OrderWorkflowCategoryOptions,
} from "./orderWorkflowTabs";

/**
 * Same category options for dashboard Quick Access and ListOrdersPage
 * workflow tabs (transports + transport_created dispatches).
 */
export function useOrderWorkflowCategoryOptions(): OrderWorkflowCategoryOptions {
  const { data: transportsData } = useListTransportsQuery({});
  const { data: dispatchesData } = useListDispatchesQuery({});

  return useMemo(
    () =>
      buildOrderWorkflowCategoryOptions({
        transports: pickList(transportsData),
        dispatches: pickList(dispatchesData),
      }),
    [transportsData, dispatchesData],
  );
}
