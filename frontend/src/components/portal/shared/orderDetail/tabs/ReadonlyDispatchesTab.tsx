"use client";

import { useMemo } from "react";
import { DashboardCard } from "@/components/widgets";
import {
  useListDispatchesQuery,
  useListTransportsQuery,
  useListUsersQuery,
  useListTransportAgentsQuery,
} from "@/store/api";
import { pickList, formatDate } from "../orderDetailUtils";
import { DispatchBatchCard } from "./DispatchBatchCard";

type ReadonlyDispatchesTabProps = {
  orderId: string;
  detail: Record<string, any> | null;
  refetchOrder?: () => void;
};

export function ReadonlyDispatchesTab({
  orderId,
  detail,
}: ReadonlyDispatchesTabProps) {
  const dispatchesQ = useListDispatchesQuery({ order: orderId });
  const transportsQ = useListTransportsQuery({ order: orderId });
  const usersQ = useListUsersQuery({});
  const transportAgentsQ = useListTransportAgentsQuery({});

  const dispatches = useMemo(
    () => pickList(dispatchesQ.data),
    [dispatchesQ.data],
  );
  const transports = useMemo(
    () => pickList(transportsQ.data),
    [transportsQ.data],
  );
  const transportAgents = useMemo(
    () => pickList(transportAgentsQ.data),
    [transportAgentsQ.data],
  );

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of pickList(usersQ.data)) {
      const id = String(u._id ?? u.id ?? "");
      if (id) map[id] = String(u.username || u.name || id);
    }
    return map;
  }, [usersQ.data]);

  const orderItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items;
  }, [detail]);

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Recorded Dispatch Batches"
        description="View dispatch details, dispatched items list, and associated logistics assignments."
      >
        {dispatchesQ.isLoading ? (
          <p className="text-sm text-slate-500 font-sans">Loading dispatches...</p>
        ) : dispatches.length === 0 ? (
          <p className="text-sm text-slate-500 font-sans">
            No dispatch batches recorded yet.
          </p>
        ) : (
          <div className="space-y-6 font-sans">
            {dispatches.map((disp) => (
              <DispatchBatchCard
                key={String(disp._id ?? disp.id ?? "")}
                dispatch={disp}
                orderItems={orderItems}
                transports={transports}
                transportAgents={transportAgents}
                userNameById={userNameById}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

export default ReadonlyDispatchesTab;
