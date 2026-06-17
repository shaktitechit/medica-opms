"use client";

import { useCallback, useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import { ApprovalRecordCard } from "@/components/portal/admin/order/components/orderApproval/ApprovalRecordCard";
import { AccountAmendFinanceApprovalModal } from "./AccountAmendFinanceApprovalModal";
import {
  useListOrderApprovalsQuery,
  useListUsersQuery,
  useListDispatchesQuery,
} from "@/store/api";

type ApprovalTabProps = {
  orderId: string;
  detail: Record<string, unknown> | null;
  readOnlyItems?: Record<string, unknown>[];
  refetchOrder?: () => void;
  partyLabel?: string;
};

function pickList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
  }
  return [];
}

export function ApprovalTab({
  orderId,
  detail,
  readOnlyItems = [],
  refetchOrder,
  partyLabel = "—",
}: ApprovalTabProps) {
  const approvalsQ = useListOrderApprovalsQuery(
    { order: orderId },
    { skip: !orderId },
  );
  const usersQ = useListUsersQuery({});
  const dispatchesQ = useListDispatchesQuery(
    { order: orderId },
    { skip: !orderId },
  );

  const [amendApprovalId, setAmendApprovalId] = useState<string | null>(null);
  const [isAmendModalOpen, setIsAmendModalOpen] = useState(false);

  const hasActiveDispatch = useMemo(() => {
    const list = pickList(dispatchesQ?.data);
    return list.some(
      (d) => String(d.dispatch_status).toLowerCase() !== "cancelled",
    );
  }, [dispatchesQ.data]);

  const approvals = useMemo(() => {
    const rows = pickList(approvalsQ.data);
    return [...rows].sort(
      (a, b) => Number(b.revision_number ?? 0) - Number(a.revision_number ?? 0),
    );
  }, [approvalsQ.data]);

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of pickList(usersQ.data)) {
      const id = String(u._id ?? u.id ?? "");
      if (id) map[id] = String(u.name || u.username || id);
    }
    return map;
  }, [usersQ.data]);

  const selectedApproval = useMemo(
    () =>
      amendApprovalId
        ? approvals.find((app) => String(app._id ?? app.id) === amendApprovalId) ?? null
        : null,
    [approvals, amendApprovalId],
  );

  const openAmendModal = useCallback((approvalId: string) => {
    setAmendApprovalId(approvalId);
    setIsAmendModalOpen(true);
  }, []);

  const handleAmended = useCallback(async () => {
    const tasks: Promise<unknown>[] = [];
    if (refetchOrder) {
      const res = refetchOrder() as unknown;
      if (res instanceof Promise) tasks.push(res);
    }
    if (!approvalsQ.isUninitialized) {
      tasks.push(approvalsQ.refetch() as Promise<unknown>);
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }, [refetchOrder, approvalsQ]);

  const orderNo = String(detail?.order_no ?? orderId);

  return (
    <div className="space-y-4">
      <DashboardCard
        title="Order Approvals"
        description="Sales approval batches for this order — approve or amend account clearance once admin and finance have cleared the batch."
      >
        {hasActiveDispatch && (
          <div className="mb-4 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-500/30">
            Amendment is locked because a dispatch execution has already been initiated for this order.
          </div>
        )}
        {approvalsQ.isLoading ? (
          <p className="text-xs font-sans text-slate-500">Loading approvals…</p>
        ) : approvalsQ.isError ? (
          <p className="text-xs font-sans text-rose-600 dark:text-rose-400">
            Could not load approvals for this order. Refresh the page or try again.
          </p>
        ) : approvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-200">
              No order approvals
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Approvals will appear here once admin and finance have reviewed items on this order.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {approvals.map((app) => (
              <ApprovalRecordCard
                key={String(app._id ?? app.id)}
                portal="account"
                approval={app}
                orderNo={orderNo}
                partyLabel={partyLabel}
                orderDate={detail?.order_date}
                expectedDeliveryDate={detail?.expected_delivery_date}
                userNameById={userNameById}
                onAmend={openAmendModal}
                amendingApprovalId={amendApprovalId}
                isAmendBlocked={hasActiveDispatch}
              />
            ))}
          </div>
        )}
      </DashboardCard>

      <AccountAmendFinanceApprovalModal
        key={amendApprovalId ?? "closed"}
        open={isAmendModalOpen}
        approval={selectedApproval}
        orderId={orderId}
        detail={detail}
        readOnlyItems={readOnlyItems}
        refetchOrder={refetchOrder}
        onAmended={() => void handleAmended()}
        onClose={() => {
          setIsAmendModalOpen(false);
          setAmendApprovalId(null);
        }}
      />
    </div>
  );
}

export default ApprovalTab;
