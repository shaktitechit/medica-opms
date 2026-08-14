"use client";

import { useCallback, useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { CreateAccountDispatchModal } from "../modals/CreateAccountDispatchModal";
import {
  CreateTransportModal,
  type CreateTransportFormDefaults,
} from "../modals/CreateTransportModal";
import { SettleRestOrderModal } from "../modals/SettleRestOrderModal";
import {
  canEditAccountDispatch,
  filterAccountApprovalsForUser,
  findFirstSettleableRelease,
  groupAccountDispatchesByRelease,
  idFromRef,
  isFullyClearedApproval,
  listDispatchableAccountApprovals,
  summarizeReleaseDispatchState,
} from "../accountDispatchAvailability";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import {
  useListDispatchesQuery,
  useListOrderApprovalsQuery,
  useListOrderReturnsQuery,
  useListTransportsQuery,
  useListUsersQuery,
  useListTransportAgentsQuery,
  usePatchDispatchMutation,
} from "@/store/api";
import { publicApiOrigin } from "@/lib/env";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { useAppSelector } from "@/store/hooks";
import {
  FilePreviewModal,
  useFilePreview,
  type PreviewFile,
} from "@/components/portal/shared/FilePreviewModal";
import { DispatchItemsKitTable } from "./DispatchItemsKitTable";

type DispatchesTabProps = {
  orderId: string;
  detail: Record<string, any> | null;
  refetchOrder?: () => void;
  partyLabel?: string;
  isAssignedToMe?: boolean;
  transportFormDefaults?: CreateTransportFormDefaults;
  disableTransportAgent?: boolean;
};

function pickList(raw: unknown): Record<string, any>[] {
  if (Array.isArray(raw)) return raw as Record<string, any>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, any>[];
    if (Array.isArray(o.data)) return o.data as Record<string, any>[];
  }
  return [];
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function formatDateOnly(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
}

function resolveFileUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${publicApiOrigin()}${normalized}`;
}

function billDocumentMeta(
  billDocument: unknown,
): { name: string; url: string; mime: string } | null {
  if (!billDocument) return null;
  if (typeof billDocument === "object" && billDocument !== null) {
    const doc = billDocument as Record<string, unknown>;
    const url = String(doc.url ?? "");
    const name = String(doc.original_name ?? doc.file_name ?? "Bill document");
    if (url) {
      return {
        name,
        url,
        mime: String(doc.mime_type ?? ""),
      };
    }
  }
  return null;
}

function formatAgentType(t: unknown): string {
  const s = String(t || "").toLowerCase();
  if (s === "internal_fleet") return "Internal Fleet";
  if (s === "third_party") return "Third Party";
  return s.replace(/_/g, " ");
}

export function AccountDispatchesTab({
  orderId,
  detail,
  refetchOrder,
  partyLabel = "—",
  isAssignedToMe = false,
  transportFormDefaults,
  disableTransportAgent,
}: DispatchesTabProps) {
  const currentUser = useAppSelector((state) => state.auth.user);
  const token = useAppSelector((state) => state.auth.token);
  const isSuperAdmin = String(currentUser?.department ?? "") === "super_admin";
  const {
    previewDoc,
    previewBlobUrl,
    previewLoading,
    openPreview,
    closePreview,
  } = useFilePreview(token);
  const currentUserId = useMemo(
    () => String(currentUser?._id ?? currentUser?.id ?? ""),
    [currentUser],
  );

  const dispatchesQ = useListDispatchesQuery({ order: orderId });
  const returnsQ = useListOrderReturnsQuery({ order: orderId });
  const transportsQ = useListTransportsQuery({ order: orderId });
  const usersQ = useListUsersQuery({});
  const transportAgentsQ = useListTransportAgentsQuery({});
  const approvalsQ = useListOrderApprovalsQuery(
    { order: orderId },
    { skip: !orderId },
  );

  const [isCreateDispatchModalOpen, setIsCreateDispatchModalOpen] = useState(false);
  const [createDispatchApprovalId, setCreateDispatchApprovalId] = useState("");
  const [editingDispatch, setEditingDispatch] = useState<Record<string, any> | null>(null);
  const [settleModalContext, setSettleModalContext] = useState<{
    approval: Record<string, unknown>;
    releaseNo: string;
  } | null>(null);
  const [submittingDispatchId, setSubmittingDispatchId] = useState<string | null>(null);
  const [createTransportDispatchId, setCreateTransportDispatchId] = useState<string | null>(null);
  const [confirmCancelDispatchId, setConfirmCancelDispatchId] = useState<string | null>(null);
  const [cancellingDispatchId, setCancellingDispatchId] = useState<string | null>(null);
  const [patchDispatch] = usePatchDispatchMutation();
  const dispatches = useMemo(() => pickList(dispatchesQ.data), [dispatchesQ.data]);
  const orderReturns = useMemo(() => pickList(returnsQ.data), [returnsQ.data]);
  const transports = useMemo(() => pickList(transportsQ.data), [transportsQ.data]);
  const users = useMemo(() => pickList(usersQ.data), [usersQ.data]);
  const transportAgents = useMemo(() => pickList(transportAgentsQ.data), [transportAgentsQ.data]);

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) {
      const id = String(u._id ?? u.id ?? "");
      if (id) map[id] = String(u.username || u.name || id);
    }
    return map;
  }, [users]);

  const orderItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items;
  }, [detail]);

  const accountApprovals = useMemo(() => {
    return filterAccountApprovalsForUser(pickList(approvalsQ.data));
  }, [approvalsQ.data]);

  const dispatchableApprovals = useMemo(() => {
    return listDispatchableAccountApprovals(
      accountApprovals,
      dispatches,
      orderItems,
    );
  }, [accountApprovals, dispatches, orderItems]);

  const orderStatus = deriveOrderWorkflowStatus(detail);

  const releaseGroups = useMemo(
    () => groupAccountDispatchesByRelease(dispatches, accountApprovals),
    [dispatches, accountApprovals],
  );

  const canCreateDispatch =
    !["cancelled", "on_hold"].includes(orderStatus) &&
    dispatchableApprovals.length > 0;

  const editableDraftForClearedRelease = useMemo(() => {
    if (["cancelled", "on_hold"].includes(orderStatus)) return null;
    if (dispatchableApprovals.length > 0) return null;
    for (const approval of accountApprovals) {
      if (!isFullyClearedApproval(approval)) continue;
      if (Boolean(approval.dispatch_release_resolved)) continue;
      const approvalId = idFromRef(approval._id ?? approval.id);
      const draft = dispatches.find((disp) => {
        const status = String(disp.dispatch_status ?? disp.status ?? "draft");
        if (status !== "draft" && status !== "cancelled") return false;
        if (status === "cancelled") return false;
        const dispApproval = disp.finance_approval;
        const dispApprovalId =
          typeof dispApproval === "object" && dispApproval !== null
            ? idFromRef(
                (dispApproval as Record<string, unknown>)._id ??
                  (dispApproval as Record<string, unknown>).id,
              )
            : idFromRef(dispApproval);
        return dispApprovalId === approvalId;
      });
      if (draft) return draft;
    }
    return null;
  }, [accountApprovals, dispatches, dispatchableApprovals.length, orderStatus]);

  const financeClearedButNotAccount = useMemo(() => {
    const all = pickList(approvalsQ.data);
    return all.some(
      (app) =>
        Boolean(app.is_finance_approved) &&
        !Boolean(app.is_account_approved) &&
        Array.isArray(app.approval_items) &&
        (app.approval_items as Record<string, unknown>[]).some(
          (it) => Number(it.approved_quantity || 0) > 0,
        ),
    );
  }, [approvalsQ.data]);

  const adminOrFinanceMissing = useMemo(() => {
    const all = pickList(approvalsQ.data);
    return all.some(
      (app) =>
        Boolean(app.is_account_approved) &&
        (!Boolean(app.is_admin_approved) || !Boolean(app.is_finance_approved)) &&
        Array.isArray(app.approval_items) &&
        (app.approval_items as Record<string, unknown>[]).some(
          (it) => Number(it.approved_quantity || 0) > 0,
        ),
    );
  }, [approvalsQ.data]);

  const createDispatchDisabledReason = useMemo(() => {
    if (["cancelled", "on_hold"].includes(orderStatus)) {
      return "Order is on hold or cancelled.";
    }
    if (canCreateDispatch) return "";
    if (editableDraftForClearedRelease) {
      return "Remaining quantity is already on a draft dispatch — edit that draft.";
    }
    if (adminOrFinanceMissing) {
      return "Admin, finance, and account clearance are all required before dispatch.";
    }
    if (financeClearedButNotAccount) {
      return "Account clearance is still required on the approval batch.";
    }
    if (accountApprovals.length === 0) {
      return "No fully cleared approval batch yet (admin, finance, and account).";
    }
    return "No remaining quantity to dispatch on cleared approvals.";
  }, [
    orderStatus,
    canCreateDispatch,
    editableDraftForClearedRelease,
    adminOrFinanceMissing,
    financeClearedButNotAccount,
    accountApprovals.length,
  ]);

  const firstSettleableRelease = useMemo(
    () =>
      ["cancelled", "on_hold"].includes(orderStatus)
        ? null
        : findFirstSettleableRelease(
            accountApprovals,
            dispatches,
            orderItems,
            orderReturns,
            { includeWarehouseReturns: true },
          ),
    [accountApprovals, dispatches, orderItems, orderReturns, orderStatus],
  );

  const openCreateDispatch = useCallback((approvalId?: string) => {
    setEditingDispatch(null);
    setCreateDispatchApprovalId(approvalId ?? "");
    setIsCreateDispatchModalOpen(true);
  }, []);

  const openEditDispatch = useCallback((disp: Record<string, any>) => {
    setCreateDispatchApprovalId("");
    setEditingDispatch(disp);
    setIsCreateDispatchModalOpen(true);
  }, []);

  const openSettleRestOrder = useCallback(
    (approval: Record<string, unknown>, releaseNo: string) => {
      setSettleModalContext({ approval, releaseNo });
    },
    [],
  );

  const openPrimaryDispatchAction = useCallback(() => {
    if (canCreateDispatch) {
      openCreateDispatch();
      return;
    }
    if (editableDraftForClearedRelease) {
      openEditDispatch(editableDraftForClearedRelease);
    }
  }, [
    canCreateDispatch,
    editableDraftForClearedRelease,
    openCreateDispatch,
    openEditDispatch,
  ]);

  const handleRefetch = useCallback(() => {
    refetchOrder?.();
    if (!dispatchesQ.isUninitialized) void dispatchesQ.refetch();
    if (!returnsQ.isUninitialized) void returnsQ.refetch();
    if (!approvalsQ.isUninitialized) void approvalsQ.refetch();
    if (!transportsQ.isUninitialized) void transportsQ.refetch();
  }, [
    refetchOrder,
    dispatchesQ,
    returnsQ,
    approvalsQ,
    transportsQ,
  ]);

  const handleCancelDispatch = useCallback(
    async (dispId: string) => {
      if (!dispId) return;
      setCancellingDispatchId(dispId);
      try {
        await patchDispatch({
          id: dispId,
          patch: { dispatch_status: "cancelled" },
        }).unwrap();
        toast.success("Dispatch batch cancelled");
        setConfirmCancelDispatchId(null);
        handleRefetch();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      } finally {
        setCancellingDispatchId(null);
      }
    },
    [patchDispatch, handleRefetch],
  );

  const handleSubmitDispatch = useCallback(
    async (disp: Record<string, any>) => {
      const dispId = String(disp._id ?? disp.id ?? "");
      if (!dispId) return;
      setSubmittingDispatchId(dispId);
      try {
        await patchDispatch({
          id: dispId,
          patch: { dispatch_status: "submitted" },
        }).unwrap();
        toast.success("Dispatch submitted to Dispatch team");
        handleRefetch();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      } finally {
        setSubmittingDispatchId(null);
      }
    },
    [patchDispatch, handleRefetch],
  );

  const handleDownloadBillDocument = useCallback(
    async (fileUrl: string, fileName: string) => {
      try {
        const response = await fetch(resolveFileUrl(fileUrl), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error("Failed to download file");
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
      } catch {
        toast.error("Failed to download bill document");
      }
    },
    [token],
  );

  const handleViewBillDocument = useCallback(
    (billDoc: { name: string; url: string; mime: string }) => {
      void openPreview({
        name: billDoc.name,
        url: resolveFileUrl(billDoc.url),
        mime: billDoc.mime,
      });
    },
    [openPreview],
  );

  const handlePreviewBillDownload = useCallback(
    (doc: PreviewFile) => {
      void handleDownloadBillDocument(doc.url, doc.name);
    },
    [handleDownloadBillDocument],
  );

  return (
    <div className="space-y-6 font-sans">
      <FilePreviewModal
        doc={previewDoc}
        blobUrl={previewBlobUrl}
        loading={previewLoading}
        onClose={closePreview}
        onDownload={handlePreviewBillDownload}
        subtitle="Bill document preview"
      />

      <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
              Dispatch control
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Record billing and warehouse dispatch batches from account-cleared approval releases.
            </p>
            <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              {dispatches.length} batch{dispatches.length === 1 ? "" : "es"} recorded
              {dispatchableApprovals.length > 0
                ? ` · ${dispatchableApprovals.length} release${dispatchableApprovals.length === 1 ? "" : "s"} with remaining quantity`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canCreateDispatch && !editableDraftForClearedRelease}
              title={
                canCreateDispatch || editableDraftForClearedRelease
                  ? undefined
                  : createDispatchDisabledReason
              }
              onClick={() => openPrimaryDispatchAction()}
              className={`shrink-0 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                editableDraftForClearedRelease && !canCreateDispatch
                  ? "bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400"
                  : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
              }`}
            >
              {editableDraftForClearedRelease && !canCreateDispatch
                ? "Edit draft dispatch"
                : "Create dispatch"}
            </button>
            <button
              type="button"
              disabled={!firstSettleableRelease}
              title={
                firstSettleableRelease
                  ? "Move undispatched approval qty to Unbilled Order"
                  : "Available when dispatched qty is less than approved qty on a release"
              }
              onClick={() => {
                if (!firstSettleableRelease) return;
                openSettleRestOrder(
                  firstSettleableRelease.approval,
                  firstSettleableRelease.releaseNo,
                );
              }}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              Settle & Unbilled Order
            </button>
          </div>
        </div>
        {!canCreateDispatch && !editableDraftForClearedRelease && createDispatchDisabledReason ? (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            {createDispatchDisabledReason}
          </p>
        ) : null}
      </div>

      <DashboardCard
        title="Recorded Dispatch Batches"
        description="View dispatch details, dispatched items list, and associated logistics assignments."
      >
        {dispatchesQ.isLoading ? (
          <p className="text-sm text-slate-500 font-sans">Loading dispatches...</p>
        ) : dispatches.length === 0 ? (
          <p className="text-sm text-slate-500 font-sans">No dispatch batches recorded yet.</p>
        ) : (
          <div className="space-y-8 font-sans">
            {releaseGroups.map((group) => {
              const activeReleaseDispatches = group.dispatches.filter((disp) => {
                const status = String(disp.dispatch_status ?? disp.status ?? "draft");
                return status !== "cancelled";
              });
              const releaseSummary = summarizeReleaseDispatchState(
                group.approval,
                dispatches,
                orderItems,
                orderReturns,
                { includeWarehouseReturns: true },
              );

              return (
                <div key={group.releaseId} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-white/10">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                        Release {group.releaseNo}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {activeReleaseDispatches.length} dispatch batch
                        {activeReleaseDispatches.length === 1 ? "" : "es"} recorded
                        {releaseSummary.isReleaseResolved ? (
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                            {" "}
                            · Release resolved
                          </span>
                        ) : releaseSummary.remainingTotal > 0 ? (
                          ` · ${releaseSummary.remainingTotal} unit${releaseSummary.remainingTotal === 1 ? "" : "s"} remaining`
                        ) : null}
                      </p>
                    </div>
                    {releaseSummary.canResolveRelease && group.approval ? (
                      <button
                        type="button"
                        onClick={() =>
                          openSettleRestOrder(
                            group.approval as Record<string, unknown>,
                            group.releaseNo,
                          )
                        }
                        className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                      >
                        Settle & Unbilled
                      </button>
                    ) : null}
                  </div>

                  <div className="space-y-6">
                    {group.dispatches.map((disp: any) => {
              const dispId = String(disp._id ?? disp.id ?? "");
              const dispatchStatus = String(disp.dispatch_status ?? disp.status ?? "draft");
              const dispatchTransports = transports.filter((tr) => {
                const trDispatchId = typeof tr.dispatch === "object" && tr.dispatch !== null
                  ? String(tr.dispatch._id ?? tr.dispatch.id ?? "")
                  : String(tr.dispatch ?? "");
                return trDispatchId === dispId;
              });

              const activeTransport = dispatchTransports.find((tr) => {
                const status = String(tr.shipment_status ?? tr.status ?? "");
                return status !== "returned";
              });

              const transport = activeTransport || dispatchTransports[dispatchTransports.length - 1];

              const canEditDispatch =
                isSuperAdmin ||
                canEditAccountDispatch({
                  dispatch: disp,
                  approval: group.approval,
                  transports,
                });
              const canSubmitDispatch =
                canEditDispatch &&
                (dispatchStatus === "draft" || dispatchStatus === "cancelled");
              const isSubmitting = submittingDispatchId === dispId;
              const hasTransport = !!activeTransport;
              const canManageTransport =
                isSuperAdmin &&
                dispatchStatus !== "cancelled" &&
                (dispatchStatus === "submitted" || dispatchStatus === "transport_created" || hasTransport);
              const canCreateTransport =
                isSuperAdmin &&
                dispatchStatus === "submitted" &&
                !hasTransport;
              const canCancelSubmittedDispatch =
                isSuperAdmin &&
                dispatchStatus === "submitted" &&
                !hasTransport;
              const isCancelling = cancellingDispatchId === dispId;
              const dispatchItems = Array.isArray(disp.dispatch_items) ? disp.dispatch_items : disp.items || [];

              const packedByVal = disp.packed_by;
              const dispatchedByVal = disp.dispatched_by;

              const packedByName = typeof packedByVal === "object" && packedByVal !== null
                ? (packedByVal.name || packedByVal.username || "")
                : typeof packedByVal === "string"
                  ? (userNameById[packedByVal] || packedByVal)
                  : "";

              const dispatchedByName = typeof dispatchedByVal === "object" && dispatchedByVal !== null
                ? (dispatchedByVal.name || dispatchedByVal.username || "")
                : typeof dispatchedByVal === "string"
                  ? (userNameById[dispatchedByVal] || dispatchedByVal)
                  : "";

              const billDoc = billDocumentMeta(disp.bill_document);
              const billNumber = String(disp.bill_number ?? "").trim();
              const billingDate = disp.billing_date;

              const statusBadgeClass =
                dispatchStatus === "cancelled"
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400"
                  : dispatchStatus === "submitted"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
                    : dispatchStatus === "transport_created"
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400";

              return (
                <div
                  key={dispId}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-white/5">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
                          {disp.dispatch_no || "Batch Details"}
                        </h4>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass}`}>
                          {dispatchStatus.replace(/_/g, " ")}
                        </span>
                        {disp.finance_approval && (
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono">
                            Release: {typeof disp.finance_approval === "object" ? disp.finance_approval.approval_no : disp.finance_approval}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Dispatch Date: {formatDate(disp.dispatched_at ?? disp.dispatch_date)}
                      </p>
                    </div>

                    {(canEditDispatch || canManageTransport) ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {canEditDispatch ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditDispatch(disp)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
                            >
                              {dispatchStatus === "draft" || dispatchStatus === "cancelled"
                                ? "Edit"
                                : "Edit dispatch"}
                            </button>
                            {canSubmitDispatch ? (
                              <button
                                type="button"
                                onClick={() => void handleSubmitDispatch(disp)}
                                disabled={isSubmitting}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                              >
                                {isSubmitting ? "Submitting…" : "Submit"}
                              </button>
                            ) : null}
                          </>
                        ) : null}

                        {canCreateTransport ? (
                          <button
                            type="button"
                            onClick={() => setCreateTransportDispatchId(dispId)}
                            disabled={isCancelling}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M13 16h6a1 1 0 001-1v-4a1 1 0 00-.316-.707l-4-4A1 1 0 0015 6h-2m6 10a2 2 0 100-4 2 2 0 000 4z" />
                            </svg>
                            Create Transport
                          </button>
                        ) : null}

                        {canCancelSubmittedDispatch ? (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelDispatchId(dispId)}
                            disabled={isCancelling}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:hover:bg-rose-900/30"
                            title="Cancel this dispatch batch"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            Cancel
                          </button>
                        ) : null}

                        {isSuperAdmin && (dispatchStatus === "transport_created" || hasTransport) && !canCreateTransport ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400">
                            Transport Created
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-6 mt-4 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                        Dispatched Items
                      </h5>
                      <div className="overflow-x-auto rounded-lg border border-slate-200/60 dark:border-white/5">
                        <DispatchItemsKitTable
                          dispatchItems={dispatchItems as Record<string, unknown>[]}
                          orderItems={orderItems as Record<string, unknown>[]}
                        />
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg bg-slate-50/50 p-4 border border-slate-100 dark:bg-slate-900/10 dark:border-white/5 text-xs">
                      <div>
                        <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Bill Number
                        </span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {billNumber || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Billing Date
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {formatDateOnly(billingDate)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Bill Document
                        </span>
                        {billDoc ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleViewBillDocument(billDoc)}
                              className="rounded border border-slate-200 px-2 py-0.5 text-2xs font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-white/10 dark:text-blue-300 dark:hover:bg-blue-950/30"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDownloadBillDocument(billDoc.url, billDoc.name)}
                              className="rounded border border-slate-200 px-2 py-0.5 text-2xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                            >
                              Download
                            </button>
                            <span className="block w-full truncate text-2xs text-slate-500 dark:text-slate-400" title={billDoc.name}>
                              {billDoc.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">—</span>
                        )}
                      </div>
                      <div>
                        <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Warehouse Location
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {disp.warehouse_location || disp.warehouse || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Remarks
                        </span>
                        <span className="italic text-slate-800 dark:text-slate-200">
                          {disp.remarks || "No remarks"}
                        </span>
                      </div>
                      {packedByName && (
                        <div>
                          <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                            Packed By
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {packedByName} {disp.packed_at && `on ${formatDate(disp.packed_at)}`}
                          </span>
                        </div>
                      )}
                      {dispatchedByName && (
                        <div>
                          <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                            Dispatched By
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {dispatchedByName} {disp.dispatched_at && `on ${formatDate(disp.dispatched_at)}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {transport && (
                    <div className="mt-5 border-t border-slate-100 pt-4 dark:border-white/5">
                      <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5 font-sans">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M13 16h6a1 1 0 001-1v-4a1 1 0 00-.316-.707l-4-4A1 1 0 0015 6h-2m6 10a2 2 0 100-4 2 2 0 000 4z" />
                        </svg>
                        Associated Transit Logistics
                      </h5>
                      <div className="grid gap-4 rounded-lg bg-slate-50/50 p-4 border border-slate-100 dark:bg-slate-900/20 dark:border-white/5 sm:grid-cols-3 text-xs font-sans">
                        <div className="space-y-2">
                          <div>
                            <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">Transport Agent</span>
                            {(() => {
                              const agentId =
                                transport.transport_agent && typeof transport.transport_agent === "object"
                                  ? String(transport.transport_agent._id ?? transport.transport_agent.id ?? "")
                                  : typeof transport.transport_agent === "string"
                                    ? transport.transport_agent
                                    : "";

                              const agentObj: Record<string, any> | null =
                                transportAgents.find(
                                  (a) => String(a._id ?? a.id ?? "") === agentId
                                ) ||
                                (transport.transport_agent && typeof transport.transport_agent === "object"
                                  ? (transport.transport_agent as Record<string, any>)
                                  : null);

                              if (agentObj) {
                                return (
                                  <>
                                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 block">
                                      {String(agentObj.agent_code || "—")}
                                    </span>
                                    {agentObj.agent_name && (
                                      <span className="text-xs text-slate-600 dark:text-slate-300 block mt-0.5">
                                        {String(agentObj.agent_name)}
                                      </span>
                                    )}
                                    {agentObj.agent_type && (
                                      <span className="text-2xs text-slate-500 capitalize block mt-0.5">
                                        {formatAgentType(agentObj.agent_type)}
                                      </span>
                                    )}
                                  </>
                                );
                              }
                              return (
                                <span className="font-semibold text-slate-800 dark:text-slate-200 block">—</span>
                              );
                            })()}
                          </div>
                          <div>
                            <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">Shipment No</span>
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{transport.shipment_no}</span>
                          </div>
                          <div>
                            <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">Shipment Status</span>
                            <span className={`inline-flex items-center rounded-full mt-1 px-2 py-0.5 text-2xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300`}>
                              {String(transport.shipment_status ?? "created").replace(/_/g, " ").toUpperCase()}
                            </span>
                          </div>
                          {transport.source_location && (
                            <div>
                              <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">Source Location</span>
                              <span className="text-slate-800 dark:text-slate-200">{transport.source_location}</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div>
                            <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">Driver Details</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block">{transport.driver_name || "—"}</span>
                            {(transport.driver_mobile || transport.driver_phone) && (
                              <span className="text-slate-500 block mt-0.5">{transport.driver_mobile || transport.driver_phone}</span>
                            )}
                          </div>
                          <div>
                            <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">Vehicle Number</span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100 uppercase">{transport.vehicle_number || transport.vehicle_no || "—"}</span>
                          </div>
                          {(transport.weight !== undefined && transport.weight !== null) && (
                            <div>
                              <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">Shipment Weight</span>
                              <span className="font-semibold text-slate-900 dark:text-slate-100">{transport.weight} {transport.weight_unit || "Kg"}</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div>
                            <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">LR / E-way Bill</span>
                            <span className="text-slate-800 dark:text-slate-200 font-mono">
                              LR: {transport.lr_number || "—"} / Eway: {transport.eway_bill_no || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">Expected Delivery</span>
                            <span className="text-slate-800 dark:text-slate-200">
                              {formatDate(transport.expected_delivery_date)}
                            </span>
                          </div>
                          {transport.tracking_number && (
                            <div>
                              <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400">Tracking Number</span>
                              <span className="text-slate-800 dark:text-slate-200 font-mono">{transport.tracking_number}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                    );
                  })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>

      <CreateAccountDispatchModal
        open={isCreateDispatchModalOpen}
        onClose={() => {
          setIsCreateDispatchModalOpen(false);
          setCreateDispatchApprovalId("");
          setEditingDispatch(null);
        }}
        orderId={orderId}
        detail={detail}
        partyLabel={partyLabel}
        orderItems={orderItems}
        dispatches={dispatches}
        // When editing a submitted batch, the release is no longer "dispatchable"
        // for create — still pass full cleared approvals so the modal can resolve it.
        approvals={editingDispatch ? accountApprovals : dispatchableApprovals}
        initialApprovalId={createDispatchApprovalId || undefined}
        editingDispatch={editingDispatch}
        onCreated={handleRefetch}
      />

      <SettleRestOrderModal
        open={settleModalContext !== null}
        onClose={() => setSettleModalContext(null)}
        orderId={orderId}
        approval={settleModalContext?.approval ?? null}
        dispatches={dispatches}
        orderItems={orderItems}
        releaseNo={settleModalContext?.releaseNo}
        onSettled={handleRefetch}
      />

      <CreateTransportModal
        open={createTransportDispatchId !== null}
        onClose={() => setCreateTransportDispatchId(null)}
        orderId={orderId}
        dispatchId={createTransportDispatchId ?? ""}
        dispatches={dispatches}
        transports={transports}
        approvals={accountApprovals as Record<string, unknown>[]}
        orderItems={orderItems as Record<string, unknown>[]}
        expectedDeliveryDate={
          detail?.expected_delivery_date != null
            ? String(detail.expected_delivery_date)
            : undefined
        }
        shippingAddress={
          detail?.shipping_address ||
          (detail?.party && typeof detail.party === "object"
            ? (detail.party as { shipping_address?: unknown }).shipping_address
            : undefined)
        }
        defaultTransportAgentId={transportFormDefaults?.transportAgentId}
        formDefaults={transportFormDefaults}
        disableTransportAgent={disableTransportAgent}
        onCreated={handleRefetch}
      />

      {confirmCancelDispatchId && (
        <LargeModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
            <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center gap-3 bg-rose-50/60 dark:bg-rose-950/20">
                <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 bg-rose-100 dark:bg-rose-950/50">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 font-sans">
                    Cancel Dispatch Batch?
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                    {(() => {
                      const target = dispatches.find(
                        (d) => String(d._id ?? d.id ?? "") === confirmCancelDispatchId,
                      );
                      const label = String(target?.dispatch_no ?? "").trim();
                      return label
                        ? `This will cancel dispatch batch ${label}.`
                        : "This will cancel the selected dispatch batch.";
                    })()}
                  </p>
                </div>
              </div>

              <div className="px-6 py-4">
                <p className="text-xs text-slate-600 dark:text-slate-300 font-sans">
                  Dispatched quantities will be released back for this order. This action cannot be undone once a transport has been created.
                </p>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 dark:border-white/5 flex justify-end gap-3 font-sans text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setConfirmCancelDispatchId(null)}
                  disabled={Boolean(cancellingDispatchId)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 transition disabled:opacity-50"
                >
                  Keep Dispatch
                </button>
                <button
                  type="button"
                  disabled={Boolean(cancellingDispatchId)}
                  onClick={() => void handleCancelDispatch(confirmCancelDispatchId)}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-white hover:bg-rose-700 disabled:opacity-50 dark:bg-rose-500 dark:hover:bg-rose-400 transition"
                >
                  {cancellingDispatchId ? "Cancelling..." : "Yes, Cancel Batch"}
                </button>
              </div>
            </div>
          </div>
        </LargeModalPortal>
      )}
    </div>
  );
}

export default AccountDispatchesTab;
