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
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { pickList } from "@/components/portal/sales/partyDisplay";
import {
  buildPendingReturnOrderIds,
  computeDispatchOrderStats,
} from "@/components/portal/dispatch/dispatchOrderUtils";
import { useListOrdersQuery, useListOrderReturnsQuery } from "@/store/api";

const OverrideContext = createContext<(count: number | null) => void>(() => {});

/**
 * While mounted (e.g. on DispatchOverview), prefer the client-computed pending count
 * over the list-query fallback so tab badge stays in sync with on-page stats.
 */
export function useDispatchTabAlertOverride(count: number) {
  const setOverride = useContext(OverrideContext);

  useEffect(() => {
    setOverride(count);
    return () => setOverride(null);
  }, [count, setOverride]);
}

type DispatchTabAlertProviderProps = {
  children: ReactNode;
};

export function DispatchTabAlertProvider({ children }: DispatchTabAlertProviderProps) {
  const [overrideCount, setOverrideCount] = useState<number | null>(null);
  const setOverride = useMemo(() => setOverrideCount, []);

  return (
    <OverrideContext.Provider value={setOverride}>
      <DispatchTabAlertInner overrideCount={overrideCount} />
      {children}
    </OverrideContext.Provider>
  );
}

function DispatchTabAlertInner({
  overrideCount,
}: {
  overrideCount: number | null;
}) {
  const { data, isError } = useListOrdersQuery(
    {},
    {
      pollingInterval: 30_000,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );
  const returnsQ = useListOrderReturnsQuery(
    {},
    {
      pollingInterval: 30_000,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );

  const queryCount = useMemo(() => {
    const pendingReturnOrderIds = buildPendingReturnOrderIds(pickList(returnsQ.data));
    const orders = pickOrders(data);
    const stats = computeDispatchOrderStats(orders, { pendingReturnOrderIds });
    return stats.transport_pending.count;
  }, [data, returnsQ.data]);

  const count = overrideCount ?? queryCount;

  useBrowserTabAlert({
    count,
    enabled: (!isError && !returnsQ.isError) || overrideCount != null,
    alertLabel: "pending dispatch actions",
  });

  return null;
}
