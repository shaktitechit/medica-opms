"use client";

import { useCallback, useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import { ApprovalRecordCard } from "@/components/portal/admin/order/components/orderApproval/ApprovalRecordCard";
import { FinanceAmendSalesApprovalModal } from "./FinanceAmendSalesApprovalModal";
import { SendFinanceApprovalToAccountModal } from "./SendFinanceApprovalToAccountModal";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useListOrderApprovalsQuery,
  useListUsersQuery,
  useSendOrderApprovalToAccountMutation,
  useListDispatchesQuery,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";

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

function idFromRef(ref: unknown): string {
  if (typeof ref === "string") return ref.trim();
  if (ref && typeof ref === "object" && "_id" in ref) {
    return String((ref as { _id: unknown })._id ?? "").trim();
  }
  if (ref && typeof ref === "object" && "id" in ref) {
    return String((ref as { id: unknown }).id ?? "").trim();
  }
  return "";
}

export function ApprovalTab({
  orderId,
  detail,
  readOnlyItems = [],
  refetchOrder,
  partyLabel = "—",
}: ApprovalTabProps) {
  const currentUser = useAppSelector((state) => state.auth.user);
  const currentUserId = useMemo(() => {
    return String(currentUser?._id ?? currentUser?.id ?? "");
  }, [currentUser]);

  const approvalsQ = useListOrderApprovalsQuery(
    { order: orderId, assigned_finance_user: currentUserId },
    { skip: !orderId || !currentUserId },
  );
  const usersQ = useListUsersQuery({});
  const dispatchesQ = useListDispatchesQuery(
    { order: orderId },
    { skip: !orderId },
  );

  const hasActiveDispatch = useMemo(() => {
    const list = pickList(dispatchesQ?.data);
    return list.some(
      (d) => String(d.dispatch_status).toLowerCase() !== "cancelled",
    );
  }, [dispatchesQ.data]);

  const [amendApprovalId, setAmendApprovalId] = useState<string | null>(null);
  const [isAmendModalOpen, setIsAmendModalOpen] = useState(false);
  const [sendingApprovalId, setSendingApprovalId] = useState<string | null>(null);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [activeSendApproval, setActiveSendApproval] = useState<Record<string, unknown> | null>(null);
  const [sendToAccount, { isLoading: isSendingToAccount }] =
    useSendOrderApprovalToAccountMutation();

  const approvals = useMemo(() => {
    const rows = pickList(approvalsQ.data);
    const filtered = rows.filter((app) => {
      const assigneeId = idFromRef(app.assigned_finance_user);
      return assigneeId && assigneeId === currentUserId;
    });
    return [...filtered].sort(
      (a, b) =>
        Number(b.revision_number ?? 0) - Number(a.revision_number ?? 0),
    );
  }, [approvalsQ.data, currentUserId]);

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of pickList(usersQ.data)) {
      const id = String(u._id ?? u.id ?? "");
      if (id) map[id] = String(u.name || u.username || id);
    }
    return map;
  }, [usersQ.data]);

  const accountUsers = useMemo(() => {
    return pickList(usersQ.data).filter(
      (u) =>
        String(u.department).toLowerCase() === "account" ||
        String(u.role).toLowerCase() === "account",
    );
  }, [usersQ.data]);

  const selectedApproval = useMemo(
    () =>
      amendApprovalId
        ? approvals.find(
          (app) => String(app._id ?? app.id) === amendApprovalId,
        ) ?? null
        : null,
    [approvals, amendApprovalId],
  );

  const isFirstTimeSending = !idFromRef(detail?.assigned_account_user);
  const defaultAccountUser = isFirstTimeSending
    ? idFromRef(activeSendApproval?.assigned_account_user)
    : idFromRef(detail?.assigned_account_user);

  const openAmendModal = useCallback((approvalId: string) => {
    setAmendApprovalId(approvalId);
    setIsAmendModalOpen(true);
  }, []);

  const openSendToAccountModal = useCallback(
    (approvalId: string) => {
      const app = approvals.find((row) => String(row._id ?? row.id) === approvalId);
      if (!app) return;
      setActiveSendApproval(app);
      setSendingApprovalId(approvalId);
      setIsSendModalOpen(true);
    },
    [approvals],
  );

  const closeSendModal = useCallback(() => {
    setIsSendModalOpen(false);
    setActiveSendApproval(null);
    setSendingApprovalId(null);
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

  const handleSendToAccount = useCallback(
    async ({
      assignedAccountUser,
      remarks,
    }: {
      assignedAccountUser: string;
      remarks: string;
    }) => {
      if (!activeSendApproval || !assignedAccountUser) return;

      const approvalId = String(activeSendApproval._id ?? activeSendApproval.id ?? "");
      if (!approvalId) return;

      try {
        await sendToAccount({
          id: approvalId,
          body: {
            assigned_account_user: assignedAccountUser,
            approval_notes: remarks.trim() || undefined,
            remarks: remarks.trim() || undefined,
          },
        }).unwrap();

        toast.success("Finance approval sent to account successfully.");
        closeSendModal();
        if (!approvalsQ.isUninitialized) {
          await approvalsQ.refetch();
        }
        refetchOrder?.();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      }
    },
    [activeSendApproval, sendToAccount, closeSendModal, approvalsQ, refetchOrder],
  );

  const sendBusy = isSendingToAccount;
  const orderNo = String(detail?.order_no ?? orderId);

  return (
    <div className="space-y-4">
      <DashboardCard
        title="Order Approvals"
        description="Sales approval batches assigned to you — amend and approve quantities and rates, then send to account."
      >
        {hasActiveDispatch && (
          <div className="mb-4 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-955/30 dark:text-amber-300 dark:ring-amber-500/30 font-sans">
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
              Approvals will appear here once admin has reviewed items and assigned them to you.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {approvals.map((app) => (
              <ApprovalRecordCard
                key={String(app._id ?? app.id)}
                portal="finance"
                approval={app}
                orderNo={orderNo}
                partyLabel={partyLabel}
                orderDate={detail?.order_date}
                expectedDeliveryDate={detail?.expected_delivery_date}
                userNameById={userNameById}
                onAmend={openAmendModal}
                onSendToAccount={openSendToAccountModal}
                amendingApprovalId={amendApprovalId}
                sendingApprovalId={sendingApprovalId}
                sendToAccountBusy={sendBusy}
                isAmendBlocked={hasActiveDispatch}
              />
            ))}
          </div>
        )}
      </DashboardCard>

      <FinanceAmendSalesApprovalModal
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

      <SendFinanceApprovalToAccountModal
        open={isSendModalOpen}
        approval={activeSendApproval}
        detail={detail}
        userNameById={userNameById}
        accountUsers={accountUsers}
        defaultAccountUser={defaultAccountUser}
        isFirstTimeSending={isFirstTimeSending}
        isSubmitting={sendBusy}
        onClose={closeSendModal}
        onSubmit={(payload) => void handleSendToAccount(payload)}
      />
    </div>
  );
}

export default ApprovalTab;
