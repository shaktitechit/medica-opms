"use client";

import { useMemo } from "react";
import { DashboardCard } from "@/components/widgets";
import { useListTransportsQuery, useListTransportAgentsQuery } from "@/store/api";
import { pickList, formatDate } from "../orderDetailUtils";
import { TransportShipmentCard } from "./TransportShipmentCard";

type ReadonlyTransportsTabProps = {
  orderId: string;
  detail: Record<string, any> | null;
  refetchOrder?: () => void;
};

export function ReadonlyTransportsTab({ orderId }: ReadonlyTransportsTabProps) {
  const transportsQ = useListTransportsQuery({ order: orderId });
  const transportAgentsQ = useListTransportAgentsQuery({});

  const transports = useMemo(
    () => pickList(transportsQ.data),
    [transportsQ.data],
  );
  const transportAgents = useMemo(
    () => pickList(transportAgentsQ.data),
    [transportAgentsQ.data],
  );

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Recorded Transport Logistics"
        description="View details of transporters, vehicles, drivers, route assignments, and current shipment status."
      >
        {transportsQ.isLoading || transportAgentsQ.isLoading ? (
          <p className="text-sm text-slate-500 font-sans">Loading transports...</p>
        ) : transports.length === 0 ? (
          <p className="text-sm text-slate-500 font-sans">
            No transport arrangements recorded yet.
          </p>
        ) : (
          <div className="space-y-6 font-sans">
            {transports.map((tr) => (
              <TransportShipmentCard
                key={String(tr._id ?? tr.id ?? "")}
                transport={tr}
                transportAgents={transportAgents}
                formatDate={formatDate}
                showRemarksHistory
              />
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

export default ReadonlyTransportsTab;
