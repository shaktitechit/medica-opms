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
import { useListOrdersQuery } from "@/store/api";

const OverrideContext = createContext<(count: number | null) => void>(() => {});

/**
 * While mounted (e.g. on AdminOverview), prefer the client-computed pending count
 * over the lightweight list query so the tab badge stays in sync with on-page stats.
 */
export function useAdminTabAlertOverride(count: number) {
  const setOverride = useContext(OverrideContext);

  useEffect(() => {
    setOverride(count);
    return () => setOverride(null);
  }, [count, setOverride]);
}

type AdminTabAlertProviderProps = {
  children: ReactNode;
};

export function AdminTabAlertProvider({ children }: AdminTabAlertProviderProps) {
  const [overrideCount, setOverrideCount] = useState<number | null>(null);
  const setOverride = useMemo(() => setOverrideCount, []);

  return (
    <OverrideContext.Provider value={setOverride}>
      <AdminTabAlertInner overrideCount={overrideCount} />
      {children}
    </OverrideContext.Provider>
  );
}

function AdminTabAlertInner({
  overrideCount,
}: {
  overrideCount: number | null;
}) {
  const { data, isError } = useListOrdersQuery(
    { status: "pending_review" },
    {
      pollingInterval: 30_000,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );

  const queryCount = useMemo(() => pickOrders(data).length, [data]);
  const count = overrideCount ?? queryCount;

  useBrowserTabAlert({
    count,
    enabled: !isError || overrideCount != null,
    alertLabel: "pending admin approval",
  });

  return null;
}
