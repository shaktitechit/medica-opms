"use client";

import { useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import {
  useListDispatchesQuery,
  useListOrderApprovalsQuery,
  useListTransportsQuery,
  useListTransportAgentsQuery,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { pickList, formatDate } from "../orderDetailUtils";
import { CreateTransportModal } from "../modals/CreateTransportModal";
import { TransportShipmentCard } from "./TransportShipmentCard";

type ReadonlyTransportsTabProps = {
  orderId: string;
  detail: Record<string, any> | null;
  refetchOrder?: () => void;
};

export function ReadonlyTransportsTab({
  orderId,
  detail,
  refetchOrder,
}: ReadonlyTransportsTabProps) {
  const isSuperAdmin = useAppSelector(
    (state) => state.auth.user?.department === "super_admin",
  );
  const transportsQ = useListTransportsQuery({ order: orderId });
  const transportAgentsQ = useListTransportAgentsQuery({});
  const dispatchesQ = useListDispatchesQuery(
    { order: orderId },
    { skip: !orderId || !isSuperAdmin },
  );
  const approvalsQ = useListOrderApprovalsQuery(
    { order: orderId },
    { skip: !orderId || !isSuperAdmin },
  );

  const [editingTransport, setEditingTransport] = useState<Record<string, any> | null>(
    null,
  );

  const transports = useMemo(
    () => pickList(transportsQ.data),
    [transportsQ.data],
  );
  const transportAgents = useMemo(
    () => pickList(transportAgentsQ.data),
    [transportAgentsQ.data],
  );
  const dispatches = useMemo(
    () => pickList(dispatchesQ.data),
    [dispatchesQ.data],
  );
  const approvals = useMemo(
    () => pickList(approvalsQ.data) as Record<string, unknown>[],
    [approvalsQ.data],
  );
  const orderItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

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
                actions={
                  isSuperAdmin ? (
                    <button
                      type="button"
                      onClick={() => setEditingTransport(tr)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
                    >
                      Edit transport
                    </button>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </DashboardCard>

      <CreateTransportModal
        open={editingTransport !== null}
        onClose={() => setEditingTransport(null)}
        orderId={orderId}
        dispatchId={
          editingTransport
            ? typeof editingTransport.dispatch === "object" &&
              editingTransport.dispatch !== null
              ? String(
                  editingTransport.dispatch._id ??
                    editingTransport.dispatch.id ??
                    "",
                )
              : String(editingTransport.dispatch ?? "")
            : ""
        }
        dispatches={dispatches}
        transports={transports}
        approvals={approvals}
        orderItems={orderItems}
        expectedDeliveryDate={
          detail?.expected_delivery_date != null
            ? String(detail.expected_delivery_date)
            : undefined
        }
        shippingAddress={detail?.shipping_address}
        editingTransport={editingTransport}
        onCreated={() => {
          setEditingTransport(null);
          if (!transportsQ.isUninitialized) void transportsQ.refetch();
          refetchOrder?.();
        }}
      />
    </div>
  );
}

export default ReadonlyTransportsTab;
