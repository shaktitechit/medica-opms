"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { useAppSelector } from "@/store";
import { DashboardCard } from "@/components/widgets";
import { ApprovalRecordCard } from "../approvals/ApprovalRecordCard";
import { ApprovalModal } from "../modals/ApprovalModal";
import {
  adminApprovalActionLabel,
  canOpenAdminApprovalModal,
} from "@/components/portal/shared/orderAdminApprovalDisplay";
import {
  useListOrderApprovalsQuery,
  useListUsersQuery,
  useCheckOrderRatesQuery,
  useListDispatchesQuery,
} from "@/store/api";
import {
  rateLookupKey,
  resolveRateDisplayStatus,
} from "@/components/portal/shared/orderLineRateDisplay";
import type { CheckOrderRatesItem } from "@/store/api/slices/partyOrderProductsRateApi";
import { pickList } from "../orderDetailUtils";

export type ApprovalsTabPortal = "admin" | "finance" | "account";

type ApprovalsTabProps = {
  portal: ApprovalsTabPortal;
  orderId: string;
  detail: Record<string, unknown> | null;
  status?: string;
  readOnlyItems?: Record<string, unknown>[];
  refetchOrder?: () => void;
  partyLabel?: string;
};

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

const PORTAL_COPY: Record<
  ApprovalsTabPortal,
  { title: string; description: string; emptyHint: string }
> = {
  admin: {
    title: "Admin Approvals",
    description:
      "Each sales review approval with financial breakdown, approved items, and PDF export.",
    emptyHint:
      "Admin sales approvals will appear here once items are reviewed and approved.",
  },
  finance: {
    title: "Order Approvals",
    description:
      "Sales approval batches for this order — approve or amend quantities and rates once admin has cleared the batch.",
    emptyHint:
      "Approvals will appear here once admin has reviewed items on this order.",
  },
  account: {
    title: "Order Approvals",
    description:
      "Sales approval batches for this order — approve or amend account clearance once admin and finance have cleared the batch.",
    emptyHint:
      "Approvals will appear here once admin and finance have reviewed items on this order.",
  },
};

export function ApprovalsTab({
  portal,
  orderId,
  detail,
  status = "",
  readOnlyItems = [],
  refetchOrder,
  partyLabel = "—",
}: ApprovalsTabProps) {
  const currentUser = useAppSelector((state) => state.auth.user);
  const userDept = currentUser?.department;
  const isSuperAdmin = userDept === "super_admin";
  const isUserAdmin = userDept === "admin" || isSuperAdmin;

  const isAdmin = portal === "admin";
  const approvalsQ = useListOrderApprovalsQuery(
    { order: orderId },
    { skip: !orderId },
  );
  const usersQ = useListUsersQuery({});
  const rateCheckQ = useCheckOrderRatesQuery(orderId, {
    skip: !orderId || !isAdmin,
  });
  const dispatchesQ = useListDispatchesQuery(
    { order: orderId },
    { skip: !orderId },
  );

  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [amendApprovalId, setAmendApprovalId] = useState<string | null>(null);
  const [isAmendModalOpen, setIsAmendModalOpen] = useState(false);
  const [amendMode, setAmendMode] = useState<ApprovalsTabPortal>("admin");

  const hasActiveDispatch = useMemo(() => {
    const list = pickList(dispatchesQ?.data);
    return list.some(
      (d) => String(d.dispatch_status).toLowerCase() !== "cancelled",
    );
  }, [dispatchesQ.data]);

  const approvals = useMemo(() => {
    const rows = pickList(approvalsQ.data);
    return [...rows].sort(
      (a, b) =>
        Number(b.revision_number ?? 0) - Number(a.revision_number ?? 0),
    );
  }, [approvalsQ.data]);

  const isCreatedBySales = useMemo(
    () => approvals.some((app) => app.is_sales_submited === true),
    [approvals],
  );

  const mayApprove = useMemo(
    () =>
      isAdmin &&
      isUserAdmin &&
      canOpenAdminApprovalModal(status, readOnlyItems) &&
      !isCreatedBySales,
    [isAdmin, isUserAdmin, status, readOnlyItems, isCreatedBySales],
  );

  const canCreateApproval = useMemo(
    () =>
      isAdmin &&
      isUserAdmin &&
      approvals.length === 0 &&
      canOpenAdminApprovalModal(status, readOnlyItems) &&
      !hasActiveDispatch,
    [isAdmin, isUserAdmin, approvals.length, status, readOnlyItems, hasActiveDispatch],
  );

  const createApprovalLabel = useMemo(
    () =>
      approvals.length === 0
        ? "Create Approval"
        : adminApprovalActionLabel(status, readOnlyItems),
    [approvals.length, status, readOnlyItems],
  );

  const selectedApproval = useMemo(
    () =>
      amendApprovalId
        ? (approvals.find(
            (app) => String(app._id ?? app.id) === amendApprovalId,
          ) ?? null)
        : null,
    [approvals, amendApprovalId],
  );

  const openAmendModal = useCallback((approvalId: string, mode: ApprovalsTabPortal) => {
    setAmendApprovalId(approvalId);
    setAmendMode(mode);
    setIsAmendModalOpen(true);
  }, []);

  const openCreateApprovalModal = useCallback(() => {
    setAmendMode("admin");
    setApprovalModalOpen(true);
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
    if (tasks.length > 0) await Promise.all(tasks);
  }, [refetchOrder, approvalsQ]);

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of pickList(usersQ.data)) {
      const id = String(u._id ?? u.id ?? "");
      if (id) map[id] = String(u.name || u.username || id);
    }
    return map;
  }, [usersQ.data]);

  const rateItemByLine = useMemo(() => {
    const map = new Map<string, CheckOrderRatesItem>();
    for (const item of rateCheckQ.data?.items ?? []) {
      map.set(rateLookupKey(item.product, item.applied_rate_type), item);
    }
    return map;
  }, [rateCheckQ.data]);

  const allRatesMapped = useMemo(() => {
    if (!isAdmin || readOnlyItems.length === 0) return true;
    return readOnlyItems.every((line) => {
      // Kit bucket individuals are saved at zero price and do not need negotiated rates.
      if (idFromRef(line.kit_parent_product)) return true;
      const productId = idFromRef(line.product);
      const rateType = String(line.applied_rate_type ?? "MANUAL");
      const rateItem = rateItemByLine.get(rateLookupKey(productId, rateType));
      return resolveRateDisplayStatus(rateItem) === "negotiated";
    });
  }, [isAdmin, readOnlyItems, rateItemByLine]);

  const orderNo = String(detail?.order_no ?? orderId);
  const copy = PORTAL_COPY[portal];

  return (
    <div className="space-y-4">
      {isAdmin && (mayApprove || canCreateApproval) && !allRatesMapped && (
        <div className="rounded-xl border border-amber-250 bg-amber-50/50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-955/20 dark:text-amber-300">
          <b>Rate Mapping Needed:</b> Some items do not have negotiated rates
          mapped yet. Click{" "}
          <b>{canCreateApproval ? "Create Approval" : "Admin Approve"}</b> and
          map them inline in the modal before final sign-off.
        </div>
      )}

      <DashboardCard
        title={copy.title}
        description={copy.description}
        action={
          canCreateApproval ? (
            <button
              type="button"
              onClick={openCreateApprovalModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Approval
            </button>
          ) : undefined
        }
      >
        {hasActiveDispatch && !isSuperAdmin && (
          <div className="mb-4 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-500/30">
            Amendment is locked because a dispatch execution has already been
            initiated for this order.
          </div>
        )}
        {approvalsQ.isLoading ? (
          <p className="text-xs font-sans text-slate-500">Loading approvals…</p>
        ) : approvalsQ.isError ? (
          <p className="text-xs font-sans text-rose-600 dark:text-rose-400">
            Could not load approvals for this order. Refresh the page or try
            again.
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
            <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
              {canCreateApproval
                ? "This order is submitted but has no approval batch yet. Create one to review line items, map rates, and approve."
                : copy.emptyHint}
            </p>
            {canCreateApproval ? (
              <button
                type="button"
                onClick={openCreateApprovalModal}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {createApprovalLabel}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {approvals.map((app) => (
              <ApprovalRecordCard
                key={String(app._id ?? app.id)}
                portal={portal}
                approval={app}
                orderNo={orderNo}
                partyLabel={partyLabel}
                orderDate={detail?.order_date}
                expectedDeliveryDate={detail?.expected_delivery_date}
                userNameById={userNameById}
                onAmend={openAmendModal}
                amendingApprovalId={amendApprovalId}
                isAmendBlocked={hasActiveDispatch && !isSuperAdmin}
              />
            ))}
          </div>
        )}
      </DashboardCard>

      <ApprovalModal
        key={amendApprovalId || (approvalModalOpen ? "create" : "closed")}
        open={approvalModalOpen || isAmendModalOpen}
        onClose={() => {
          setApprovalModalOpen(false);
          setIsAmendModalOpen(false);
          setAmendApprovalId(null);
        }}
        mode={amendMode}
        approval={selectedApproval}
        orderId={orderId}
        orderStatus={status}
        readOnlyItems={readOnlyItems}
        refetchOrder={refetchOrder}
        detail={detail}
        onSuccess={() => void handleAmended()}
      />
    </div>
  );
}

export default ApprovalsTab;
