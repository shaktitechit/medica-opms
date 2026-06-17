"use client";

import { useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import { ApprovalRecordCard } from "./ApprovalRecordCard";
import { ApprovalModal } from "./ApprovalModal";
import { canOpenAdminApprovalModal } from "@/components/portal/shared/orderAdminApprovalDisplay";
import {
  useListOrderApprovalsQuery,
  useListUsersQuery,
  useCheckOrderRatesQuery,
} from "@/store/api";
import {
  rateLookupKey,
  resolveRateDisplayStatus,
} from "@/components/portal/shared/orderLineRateDisplay";
import type { CheckOrderRatesItem } from "@/store/api/slices/partyOrderProductsRateApi";

type ApprovalTabProps = {
  orderId: string;
  detail: Record<string, unknown> | null;
  status?: string;
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
  status = "",
  readOnlyItems = [],
  refetchOrder,
  partyLabel = "—",
}: ApprovalTabProps) {
  const adminApprovalsQ = useListOrderApprovalsQuery(
    { order: orderId },
    { skip: !orderId },
  );
  const usersQ = useListUsersQuery({});
  const rateCheckQ = useCheckOrderRatesQuery(orderId, { skip: !orderId });

  const [approvalModalOpen, setApprovalModalOpen] = useState(false);

  const mayApprove = useMemo(
    () => canOpenAdminApprovalModal(status, readOnlyItems),
    [status, readOnlyItems],
  );

  const approvals = useMemo(() => {
    const rows = pickList(adminApprovalsQ.data);
    return [...rows].sort(
      (a, b) =>
        Number(b.revision_number ?? 0) - Number(a.revision_number ?? 0),
    );
  }, [adminApprovalsQ.data]);

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
    if (readOnlyItems.length === 0) return true;
    return readOnlyItems.every((line) => {
      const productId = idFromRef(line.product);
      const rateType = String(line.applied_rate_type ?? "MANUAL");
      const rateItem = rateItemByLine.get(rateLookupKey(productId, rateType));
      return resolveRateDisplayStatus(rateItem) === "negotiated";
    });
  }, [readOnlyItems, rateItemByLine]);

  const orderNo = String(detail?.order_no ?? orderId);

  return (
    <div className="space-y-4">
      {mayApprove && (
        <div className="space-y-3">
          {!allRatesMapped && (
            <div className="rounded-xl border border-amber-250 bg-amber-50/50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              <b>Rate Mapping Needed:</b> Some items do not have negotiated rates mapped yet. You can click <b>Create Approval</b> and map them inline in the preview before final sign-off.
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/40 px-4 py-3 dark:border-emerald-555/10 dark:bg-emerald-950/10">
            <div>
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
                Review and Approve Order
              </p>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                Verify rates and create the central approval document.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setApprovalModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 cursor-pointer"
            >
              Create Approval
            </button>
          </div>
        </div>
      )}

      <DashboardCard
        title="Admin Approvals"
        description="Each sales review approval with financial breakdown, approved items, and PDF export."
      >
        {adminApprovalsQ.isLoading ? (
          <p className="text-xs font-sans text-slate-500">Loading approvals…</p>
        ) : adminApprovalsQ.isError ? (
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
              No admin approvals
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Admin sales approvals will appear here once items are reviewed and approved on the Order Approval tab.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {approvals.map((app) => (
              <ApprovalRecordCard
                key={String(app._id ?? app.id)}
                approval={app}
                orderNo={orderNo}
                partyLabel={partyLabel}
                orderDate={detail?.order_date}
                expectedDeliveryDate={detail?.expected_delivery_date}
                userNameById={userNameById}
              />
            ))}
          </div>
        )}
      </DashboardCard>

      <ApprovalModal
        open={approvalModalOpen}
        onClose={() => setApprovalModalOpen(false)}
        orderId={orderId}
        orderStatus={status}
        readOnlyItems={readOnlyItems}
        refetchOrder={refetchOrder}
        detail={detail}
        onApproved={() => {
          void adminApprovalsQ.refetch();
        }}
      />
    </div>
  );
}

export default ApprovalTab;
