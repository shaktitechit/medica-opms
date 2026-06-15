"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";

import EditOrderModal from "@/components/portal/sales/order/components/EditOrderModal";
import { useAppSelector } from "@/store";
import { OrderTab } from "./OrderTab";

type OrderItemsTabProps = {
  detail: Record<string, unknown> | null;
  status: string;
  readOnlyItems: Record<string, unknown>[];
  refetchOrder?: () => void;
  partyLabel?: string;
};

function formatMoney(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "—";
}

function canAmendOrderItems(status: string): boolean {
  return status === "submitted" || status === "on_hold";
}

export function OrderItemsTab({
  detail,
  status,
  readOnlyItems,
  refetchOrder,
  partyLabel = "—",
}: OrderItemsTabProps) {
  const user = useAppSelector((s) => s.auth.user);
  const [editOpen, setEditOpen] = useState(false);

  const orderId = String(detail?._id ?? detail?.id ?? "");
  const mayEditItems = useMemo(() => canAmendOrderItems(status), [status]);

  return (
    <div className="space-y-4">
      {mayEditItems && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-slate-950/30">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Amend order lines
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Add, remove, or change products and quantities before rate mapping and approval.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-white/5"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Items
          </button>
        </div>
      )}

      <OrderTab
        detail={detail}
        status={status}
        formatMoney={formatMoney}
        readOnlyItems={readOnlyItems}
        refetchOrder={refetchOrder}
        partyLabel={partyLabel}
        showApproveAction={false}
        showApprovalProgress={false}
      />

      <EditOrderModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        orderId={orderId}
        detail={detail}
        user={user}
        refetchOrder={() => refetchOrder?.()}
        itemsOnly
        orderStatus={status}
        title="Amend Order Items"
        description="Update products, quantities, unit prices, discount %, GST %, map negotiated party rates, and line remarks. Party and header fields are unchanged."
      />
    </div>
  );
}

export default OrderItemsTab;
