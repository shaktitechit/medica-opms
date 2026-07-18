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
  accountTabQueryParams,
  buildPendingReturnOrderIds,
  orderMatchesAccountTab,
} from "./accountOrderUtils";

const OverrideContext = createContext<(count: number | null) => void>(() => {});

/**
 * While mounted (e.g. on AccountOverview), prefer the client-computed pending count
 * over the lightweight list query so the tab badge stays in sync with on-page stats.
 */
export function useAccountTabAlertOverride(count: number) {
  const setOverride = useContext(OverrideContext);

  useEffect(() => {
    setOverride(count);
    return () => setOverride(null);
  }, [count, setOverride]);
}

type AccountTabAlertProviderProps = {
  children: ReactNode;
};

export function AccountTabAlertProvider({ children }: AccountTabAlertProviderProps) {
  const [overrideCount, setOverrideCount] = useState<number | null>(null);
  const setOverride = useMemo(() => setOverrideCount, []);

  return (
    <OverrideContext.Provider value={setOverride}>
      <AccountTabAlertInner overrideCount={overrideCount} />
      {children}
    </OverrideContext.Provider>
  );
}

function AccountTabAlertInner({
  overrideCount,
}: {
  overrideCount: number | null;
}) {
  const { data, isError } = useListOrdersQuery(
    accountTabQueryParams("pending_account_approval"),
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
      orderMatchesAccountTab(order, "pending_account_approval", options),
    ).length;
  }, [data, returnsData]);

  const count = overrideCount ?? queryCount;

  useBrowserTabAlert({
    count,
    enabled: !isError || overrideCount != null,
    alertLabel: "pending account approval",
  });

  return null;
}
