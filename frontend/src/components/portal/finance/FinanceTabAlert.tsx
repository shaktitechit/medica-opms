"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useBrowserTabAlert } from "@/hooks/useBrowserTabAlert";
import { pickList } from "@/components/portal/sales/partyDisplay";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { useListOrderReturnsQuery, useListOrdersQuery } from "@/store/api";
import {
  buildPendingReturnOrderIds,
  financeTabQueryParams,
  orderMatchesFinanceTab,
} from "./financeOrderUtils";

const OverrideContext = createContext<(count: number | null) => void>(() => {});

/**
 * While mounted (e.g. on FinanceOverview), prefer the client-computed pending count
 * over the lightweight list query so the tab badge stays in sync with on-page stats.
 */
export function useFinanceTabAlertOverride(count: number) {
  const setOverride = useContext(OverrideContext);

  useEffect(() => {
    setOverride(count);
    return () => setOverride(null);
  }, [count, setOverride]);
}

type FinanceTabAlertProviderProps = {
  children: ReactNode;
};

export function FinanceTabAlertProvider({ children }: FinanceTabAlertProviderProps) {
  const [overrideCount, setOverrideCount] = useState<number | null>(null);
  const setOverride = useMemo(() => setOverrideCount, []);

  return (
    <OverrideContext.Provider value={setOverride}>
      <FinanceTabAlertInner overrideCount={overrideCount} />
      {children}
    </OverrideContext.Provider>
  );
}

function FinanceTabAlertInner({
  overrideCount,
}: {
  overrideCount: number | null;
}) {
  const { data, isError } = useListOrdersQuery(
    financeTabQueryParams("pending_finance_approval"),
    {
      pollingInterval: 30_000,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );
  const { data: returnsData } = useListOrderReturnsQuery({});

  const queryCount = useMemo(() => {
    const pendingReturnOrderIds = buildPendingReturnOrderIds(pickList(returnsData));
    const options = { pendingReturnOrderIds };
    return pickOrders(data).filter((order) =>
      orderMatchesFinanceTab(order, "pending_finance_approval", options),
    ).length;
  }, [data, returnsData]);

  const count = overrideCount ?? queryCount;

  useBrowserTabAlert({
    count,
    enabled: !isError || overrideCount != null,
    alertLabel: "pending finance approval",
  });

  return null;
}
