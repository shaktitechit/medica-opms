"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Printer, Send, Truck, XCircle } from "lucide-react";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import type { CreateTransportFormDefaults } from "@/components/portal/shared/orderDetail/modals/CreateTransportModal";
import { OrderDeliveryModal } from "@/components/portal/dispatch/order/components/OrderDeliveryModal";
import { OrderDetailModal } from "@/components/portal/sales/components/modals/OrderDetailModal";
import { buildPartyNameById } from "@/components/portal/sales/partyDisplay";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/store/hooks";
import {
  useCancelTransportPlanMutation,
  useGetOrderQuery,
  useGetTransportPlanQuery,
  useListDispatchesQuery,
  usePatchTransportMutation,
  useRemoveTransportPlanOrderMutation,
  useSubmitTransportPlanMutation,
  useListOrderApprovalsQuery,
  usePatchDispatchMutation,
  usePatchTransportPlanOrderMutation,
  useListPartiesQuery,
  type TransportPlanOrderRecord,
} from "@/store/api";
import { CreateAccountDispatchModal } from "@/components/portal/account/order/components/CreateAccountDispatchModal";
import { CancelTransportPlanModal } from "./CancelTransportPlanModal";
import { ApprovalsTab } from "@/components/portal/shared/orderDetail/tabs/ApprovalsTab";
import { DispatchesTab } from "@/components/portal/shared/orderDetail/tabs/DispatchesTab";
import { TransportsTab } from "@/components/portal/shared/orderDetail/tabs/TransportsTab";
import { DeliveriesTab } from "@/components/portal/shared/orderDetail/tabs/DeliveriesTab";
import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import { formatDate } from "@/components/portal/shared/orderDetail/orderDetailUtils";
import {
  useListUsersQuery,
  useListTransportsQuery,
  useListOrderDeliveriesQuery,
} from "@/store/api";
import {
  agentLabel,
  canEditPlan,
  canExecutePlan,
  formatMoney,
  formatPlanDate,
  orderNoOf,
  partyLabel,
  planIdOf,
  renderOrderStatusBadge,
  renderPlanStatusBadge,
} from "./transportPlanUtils";

type TransportPlanDetailPageProps = {
  planId: string;
  portalHome?: string;
};

const NEXT_STATUS_MAP: Record<string, string | null> = {
  created: "in_transit",
  transporter_assigned: "in_transit",
  vehicle_assigned: "in_transit",
  pickup_pending: "in_transit",
  picked_up: "in_transit",
  in_transit: "out_for_delivery",
  out_for_delivery: "delivered",
  delivered: null,
  delivery_failed: null,
  returned: null,
};

const STATUS_LABEL: Record<string, string> = {
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
};

function idOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const row = value as { _id?: string; id?: string };
    return String(row._id || row.id || "");
  }
  return "";
}

function shipmentStatusOf(line: TransportPlanOrderRecord): string {
  return String(line.transport?.shipment_status || "").toLowerCase();
}

function hasActiveTransport(line: TransportPlanOrderRecord): boolean {
  const status = shipmentStatusOf(line);
  return Boolean(line.transport) && status !== "returned";
}

function pickList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
  }
  return [];
}

function uniqueById(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const id = idOf(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

type PlanOrderTabsSectionProps = {
  orderId: string;
  detail: Record<string, unknown>;
  disp?: Record<string, unknown> | null;
  userDept: string;
  transportFormDefaults?: CreateTransportFormDefaults;
};

function PlanOrderTabsSection({
  orderId,
  detail,
  disp,
  userDept,
  transportFormDefaults,
}: PlanOrderTabsSectionProps) {
  const [activeTab, setActiveTab] = useState<
    "approvals" | "dispatches" | "transports" | "deliveries"
  >("approvals");

  const dispatchesQ = useListDispatchesQuery({ order: orderId }, { skip: !orderId });
  const transportsQ = useListTransportsQuery({ order: orderId }, { skip: !orderId });
  const usersQ = useListUsersQuery({});
  const [patchTransport, patchTransportState] = usePatchTransportMutation();

  const handleUpdateTransportStatus = useCallback(
    async (
      transportId: string,
      nextStatus: string,
      remarks?: string,
      suppressToast?: boolean,
    ) => {
      try {
        await patchTransport({
          id: transportId,
          patch: { status: nextStatus, ...(remarks ? { remarks } : {}) },
        }).unwrap();
        if (!suppressToast) {
          toast.success(
            `Transport status updated to ${nextStatus.replace(/_/g, " ")}`,
          );
        }
        void transportsQ.refetch();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      }
    },
    [patchTransport, transportsQ],
  );

  const dispatches = useMemo(() => pickList(dispatchesQ.data), [dispatchesQ.data]);
  const transports = useMemo(() => pickList(transportsQ.data), [transportsQ.data]);
  const users = useMemo(() => pickList(usersQ.data), [usersQ.data]);
  const userNameById = useMemo(() => buildUserNameById(users), [users]);

  const orderItems = useMemo(() => {
    if (Array.isArray(detail.order_items)) return detail.order_items as Record<string, unknown>[];
    return [];
  }, [detail]);

  const partyObj = detail.party && typeof detail.party === "object" ? (detail.party as Record<string, unknown>) : null;
  const partyLabelStr = String(partyObj?.name || partyObj?.party_name || "—");

  const approvalsPortal =
    userDept === "finance" ? "finance" : userDept === "account" ? "account" : "admin";

  const dispatchesMode =
    userDept === "account" || userDept === "super_admin"
      ? "account"
      : userDept === "dispatch"
        ? "dispatch_ops"
        : "readonly";

  const transportsMode =
    userDept === "dispatch" || userDept === "super_admin"
      ? "dispatch_ops"
      : "readonly";

  return (
    <div className="mt-4 border-t border-slate-100 dark:border-white/5 pt-3">
      {/* Sub-tab navigation bar */}
      <div className="flex border-b border-slate-200 dark:border-white/10 mb-4 gap-1 sm:gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("approvals")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition ${activeTab === "approvals"
            ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
            : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
        >
          Approvals
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("dispatches")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition ${activeTab === "dispatches"
            ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
            : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
        >
          Dispatches
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("transports")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition ${activeTab === "transports"
            ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
            : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
        >
          Transports
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("deliveries")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition ${activeTab === "deliveries"
            ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
            : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
        >
          Deliveries
        </button>
      </div>

      {/* Active Tab Component */}
      {activeTab === "approvals" && (
        <ApprovalsTab
          portal={approvalsPortal}
          orderId={orderId}
          detail={detail}
          status={String(detail.status || "")}
          readOnlyItems={orderItems}
          refetchOrder={() => undefined}
          partyLabel={partyLabelStr}
        />
      )}

      {activeTab === "dispatches" && (
        <DispatchesTab
          mode={dispatchesMode}
          orderId={orderId}
          detail={detail}
          refetchOrder={() => undefined}
          partyLabel={partyLabelStr}
          isAssignedToMe={true}
          dispatches={dispatches}
          transports={transports}
          isFetching={dispatchesQ.isFetching}
          userNameById={userNameById}
          orderItems={orderItems}
          orderStatus={String(detail.status || "")}
          expectedDeliveryDate={
            detail.expected_delivery_date
              ? String(detail.expected_delivery_date)
              : undefined
          }
          shippingAddress={partyObj?.shipping_address}
          transportFormDefaults={transportFormDefaults}
          disableTransportAgent={true}
          onRefetch={() => {
            void dispatchesQ.refetch();
            void transportsQ.refetch();
          }}
        />
      )}

      {activeTab === "transports" && (
        <TransportsTab
          mode={transportsMode}
          orderId={orderId}
          detail={detail}
          refetchOrder={() => undefined}
          transports={transports}
          isFetching={transportsQ.isFetching}
          isPatchingTransport={patchTransportState.isLoading}
          onUpdateStatus={handleUpdateTransportStatus}
          formatDate={formatDate}
          onRefetch={() => {
            void transportsQ.refetch();
          }}
          dispatches={dispatches}
          orderItems={orderItems}
        />
      )}

      {activeTab === "deliveries" && (
        <DeliveriesTab
          orderId={orderId}
          detail={detail}
          refetchOrder={() => undefined}
        />
      )}
    </div>
  );
}

export default function TransportPlanDetailPage({
  planId,
  portalHome,
}: TransportPlanDetailPageProps) {
  const params = useParams();
  const user = useAppSelector((s) => s.auth.user);
  const rawPortal =
    typeof params.portal === "string"
      ? params.portal
      : Array.isArray(params.portal)
        ? params.portal[0]
        : "account";
  const base = portalHome || `/${rawPortal}`;
  const userDept = String(user?.department || "").toLowerCase();
  const portalName = String(rawPortal || "").toLowerCase();

  const isPlanner =
    ["account", "admin", "finance", "super_admin"].includes(userDept) ||
    (["account", "admin", "finance", "super_admin"].includes(portalName) && userDept !== "dispatch");

  const isExecutor =
    ["dispatch", "super_admin"].includes(userDept) ||
    (["dispatch", "super_admin"].includes(portalName) && !["account", "admin", "finance"].includes(userDept));

  const { data, isLoading, isFetching, isError, refetch } =
    useGetTransportPlanQuery(planId);
  const [submitPlan, submitState] = useSubmitTransportPlanMutation();
  const [cancelPlan, cancelState] = useCancelTransportPlanMutation();
  const [removePlanOrder, removeLineState] = useRemoveTransportPlanOrderMutation();
  const [patchTransport, patchTransportState] = usePatchTransportMutation();

  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [activeOrderIndex, setActiveOrderIndex] = useState(0);
  const partiesQ = useListPartiesQuery({});
  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data]
  );

  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmRemoveLineId, setConfirmRemoveLineId] = useState<string | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<{
    transportId: string;
    nextStatus: string;
  } | null>(null);
  const [statusRemarks, setStatusRemarks] = useState("");
  const [deliveryModal, setDeliveryModal] = useState<{
    transportId: string;
    dispatchId: string;
    orderId: string;
  } | null>(null);

  const [createDispatchModal, setCreateDispatchModal] = useState<{
    orderId: string;
    planOrderId: string;
    partyLabel?: string;
  } | null>(null);

  const [previewDispatch, setPreviewDispatch] = useState<{
    dispatch: Record<string, unknown>;
    planOrderId: string;
    partyLabel?: string;
  } | null>(null);

  const [patchDispatch, patchDispatchState] = usePatchDispatchMutation();
  const [patchTransportPlanOrder, patchPlanOrderState] = usePatchTransportPlanOrderMutation();

  const dispatchOrderQ = useGetOrderQuery(createDispatchModal?.orderId ?? "", {
    skip: !createDispatchModal?.orderId,
  });
  const dispatchDispatchesQ = useListDispatchesQuery(
    { order: createDispatchModal?.orderId },
    { skip: !createDispatchModal?.orderId }
  );
  const dispatchApprovalsQ = useListOrderApprovalsQuery(
    { order: createDispatchModal?.orderId },
    { skip: !createDispatchModal?.orderId }
  );

  const dispatchOrderItems = useMemo(() => {
    const detail = dispatchOrderQ.data as Record<string, unknown> | undefined;
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [dispatchOrderQ.data]);

  const dispatchDispatches = useMemo(() => {
    return pickList(dispatchDispatchesQ.data);
  }, [dispatchDispatchesQ.data]);

  const dispatchApprovals = useMemo(() => {
    return pickList(dispatchApprovalsQ.data);
  }, [dispatchApprovalsQ.data]);

  const deliveryDispatchesQ = useListDispatchesQuery(
    { order: deliveryModal?.orderId },
    { skip: !deliveryModal?.orderId }
  );
  const deliveryOrderQ = useGetOrderQuery(deliveryModal?.orderId ?? "", {
    skip: !deliveryModal?.orderId,
  });

  const deliveryOrderItems = useMemo(() => {
    const detail = deliveryOrderQ.data as Record<string, unknown> | undefined;
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [deliveryOrderQ.data]);

  const deliveryDispatches = useMemo(() => {
    const fromApi = pickList(deliveryDispatchesQ.data);
    const line = (data?.orders ?? []).find(
      (l) => idOf(l.dispatch) === deliveryModal?.dispatchId
    );
    if (line?.dispatch && typeof line.dispatch === "object") {
      return uniqueById([line.dispatch as Record<string, unknown>, ...fromApi]);
    }
    return fromApi;
  }, [data?.orders, deliveryDispatchesQ.data, deliveryModal?.dispatchId]);

  const busy =
    isLoading ||
    isFetching ||
    submitState.isLoading ||
    cancelState.isLoading ||
    removeLineState.isLoading ||
    patchTransportState.isLoading;

  const orders = (data?.orders ?? []).filter((o) => o.status !== "cancelled");
  const deliveredOrdersCount = orders.filter(
    (l) => shipmentStatusOf(l) === "delivered",
  ).length;
  const pendingOrdersCount = orders.length - deliveredOrdersCount;

  const summary = data?.summary || {
    total_orders: orders.length,
    total_packages: 0,
    total_weight: 0,
    total_invoice_value: 0,
  };

  const planAgentId = idOf(data?.transport_agent);
  const planIsActive =
    data?.status !== "completed" && data?.status !== "cancelled";
  /** Remove order from plan — only before transport is created. */
  const canRemoveLine =
    (isPlanner || isExecutor) &&
    planIsActive &&
    ["planned", "submitted", "in_transit", "draft"].includes(String(data?.status || ""));

  const runAction = useCallback(
    async (fn: () => Promise<unknown>, success: string) => {
      try {
        await fn();
        toast.success(success);
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
      }
    },
    []
  );

  const handleRefetch = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleAdvanceStatus = async () => {
    if (!statusConfirm) return;
    try {
      await patchTransport({
        id: statusConfirm.transportId,
        patch: {
          status: statusConfirm.nextStatus,
          ...(statusRemarks.trim() ? { remarks: statusRemarks.trim() } : {}),
        },
      }).unwrap();
      toast.success(
        `Transport marked ${STATUS_LABEL[statusConfirm.nextStatus] || statusConfirm.nextStatus}`
      );
      setStatusConfirm(null);
      setStatusRemarks("");
      handleRefetch();
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  };

  const printDocuments = () => {
    window.print();
  };

  if (isError) {
    return (
      <div className="p-6 text-sm text-rose-600">
        Failed to load transport plan.{" "}
        <button type="button" className="underline" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      <PortalBusyOverlay active={busy} message="Loading…" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Link
            href={`${base}/transport-planner`}
            className="mt-0.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Transport plan
              </h1>
              {renderPlanStatusBadge(data?.status)}
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {formatPlanDate(data?.plan_date)} · {agentLabel(data?.transport_agent)}
            </p>
            {data?.remarks ? (
              <p className="mt-1 text-xs text-slate-500">Remarks: {data.remarks}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isPlanner && canEditPlan(data?.status) ? (
            <Link
              href={`${base}/transport-planner/${planId}/edit`}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
            >
              Edit
            </Link>
          ) : null}

          {isPlanner && (data?.status === "planned" || data?.status === "draft") ? (
            <button
              type="button"
              onClick={() =>
                void runAction(
                  () => submitPlan(planId).unwrap(),
                  "Plan submitted to Dispatch"
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              <Send className="h-3.5 w-3.5" />
              Submit
            </button>
          ) : null}

          {isPlanner &&
            data?.status !== "completed" &&
            data?.status !== "cancelled" &&
            !orders.some((line) => hasActiveTransport(line)) ? (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-950/20"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel plan
            </button>
          ) : null}

          {isExecutor && canExecutePlan(data?.status) ? (
            <button
              type="button"
              onClick={printDocuments}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
          <div className="text-[11px] text-slate-500">Total orders</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {summary.total_orders ?? orders.length}
            </span>
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <span className="text-emerald-600 dark:text-emerald-400">
                {deliveredOrdersCount} delivered
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-amber-600 dark:text-amber-400">
                {pendingOrdersCount} pending
              </span>
            </div>
          </div>
        </div>

        {[
          { label: "Packages", value: summary.total_packages ?? 0 },
          { label: "Weight", value: summary.total_weight ?? 0 },
          {
            label: "Invoice value",
            value: formatMoney(summary.total_invoice_value ?? 0),
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900"
          >
            <div className="text-[11px] text-slate-500">{card.label}</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">
          No orders on this plan.
        </div>
      ) : (
        <div className="flex flex-col min-h-0 flex-1 space-y-4">
          {/* Horizontal Order Tabs Header */}
          <div className="flex overflow-x-auto border-b border-slate-200 dark:border-white/10 gap-2 pb-0.5 scrollbar-thin">
            {orders.map((line, idx) => {
              const lineId = planIdOf(line);
              const isSelected = activeOrderIndex === idx;
              const ord = line.order && typeof line.order === "object" ? line.order : null;
              const partyName = partyLabel(line.party || ord?.party);
              const ordNo = orderNoOf(line.order);
              const shipmentStatus = shipmentStatusOf(line);

              return (
                <button
                  key={lineId}
                  type="button"
                  onClick={() => setActiveOrderIndex(idx)}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg transition shrink-0 border-b-2 ${isSelected
                    ? "bg-blue-50 text-blue-700 border-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5"
                    }`}
                >
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-xs">{partyName}</span>
                    <span className="text-[10px] opacity-75 font-mono">{ordNo}</span>
                  </div>
                  {shipmentStatus ? (
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${shipmentStatus === "delivered"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                    >
                      {shipmentStatus.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Active Order Card */}
          {(() => {
            const line = orders[activeOrderIndex] || orders[0];
            if (!line) return null;
            const lineId = planIdOf(line);
            const ord = line.order && typeof line.order === "object" ? line.order : null;
            const disp =
              line.dispatch && typeof line.dispatch === "object" ? line.dispatch : null;
            const transport = line.transport || null;
            const shipmentStatus = shipmentStatusOf(line);
            const showRemoveLine =
              canRemoveLine &&
              !hasActiveTransport(line) &&
              ["pending", "packed"].includes(String(line.status || "pending"));

            const lineRecord = line as unknown as Record<string, unknown>;
            const isDelivered = Boolean(lineRecord.delivered_at) || shipmentStatus === "delivered";
            const isDispatched = !isDelivered && ["dispatched", "in_transit", "out_for_delivery", "picked_up"].includes(shipmentStatus);
            const statusVal = line.status === "cancelled" ? "cancelled" : isDelivered ? "delivered" : isDispatched ? "dispatched" : (line.status || "pending");

            const lineTransportDefaults: CreateTransportFormDefaults = {
              transportAgentId: planAgentId || undefined,
              dispatchDate: data?.plan_date
                ? String(data.plan_date).slice(0, 10)
                : undefined,
              remarks: data?.remarks || undefined,
              lrNumber: line.lr_number || undefined,
              weight: line.weight ?? undefined,
              packedBoxes: line.packages ?? undefined,
              expectedDeliveryDate:
                ord && typeof ord === "object" && "expected_delivery_date" in ord
                  ? String(
                    (ord as { expected_delivery_date?: unknown })
                      .expected_delivery_date ?? "",
                  ) || undefined
                  : undefined,
            };

            return (
              <div
                key={lineId}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900 min-h-0 flex-1 overflow-auto"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {orderNoOf(line.order)}
                      </h3>
                      {ord && (
                        <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 text-[11px] font-semibold capitalize text-indigo-700 dark:text-indigo-400 ring-1 ring-inset ring-indigo-700/10">
                          Order: {String(ord.status || "").replaceAll("_", " ")}
                        </span>
                      )}
                      {statusVal && (
                        <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 text-[11px] font-semibold capitalize text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-700/10">
                          Dispatch: {String(statusVal).replaceAll("_", " ")}
                        </span>
                      )}
                      {transport && (
                        <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 text-[11px] font-semibold capitalize text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-700/10">
                          Transit: {(shipmentStatus || "created").replaceAll("_", " ")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-slate-50">
                      {partyLabel(line.party || ord?.party)}

                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {showRemoveLine ? (
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveLineId(lineId)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300"
                      >
                        Remove
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        const orderId = idOf(line.order);
                        if (orderId) {
                          setViewOrderId(orderId);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors duration-200"
                    >
                      View Order
                    </button>
                  </div>
                </div>

                {/* Order Detail Sub-Tabs (Approvals, Dispatches, Transports, Deliveries) */}
                {ord && idOf(line.order) ? (
                  <PlanOrderTabsSection
                    orderId={idOf(line.order)}
                    detail={ord}
                    disp={disp}
                    userDept={userDept}
                    transportFormDefaults={lineTransportDefaults}
                  />
                ) : null}
              </div>
            );
          })()}
        </div>
      )}

      <CancelTransportPlanModal
        open={cancelOpen}
        isSaving={cancelState.isLoading}
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          await runAction(
            () =>
              cancelPlan({
                id: planId,
                cancellation_reason: reason || undefined,
              }).unwrap(),
            "Transport plan cancelled"
          );
          setCancelOpen(false);
        }}
      />

      <OrderDeliveryModal
        open={deliveryModal !== null}
        onClose={() => setDeliveryModal(null)}
        orderId={deliveryModal?.orderId ?? ""}
        transportId={deliveryModal?.transportId ?? ""}
        dispatchId={deliveryModal?.dispatchId ?? ""}
        dispatches={deliveryDispatches}
        orderItems={deliveryOrderItems}
        onRefetch={() => {
          setDeliveryModal(null);
          handleRefetch();
        }}
      />

      {confirmRemoveLineId ? (
        <LargeModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center gap-3 border-b border-slate-100 bg-rose-50/60 px-6 py-4 dark:border-white/5 dark:bg-rose-950/20">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Remove order from plan?
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    This removes the order from this transport plan only. The order and its
                    dispatch stay unchanged. Not available after transport is created.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setConfirmRemoveLineId(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200"
                >
                  Keep
                </button>
                <button
                  type="button"
                  disabled={removeLineState.isLoading}
                  onClick={() => {
                    void runAction(
                      () =>
                        removePlanOrder({
                          id: planId,
                          planOrderId: confirmRemoveLineId,
                        }).unwrap(),
                      "Order removed from transport plan"
                    ).then(() => setConfirmRemoveLineId(null));
                  }}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {removeLineState.isLoading ? "Removing…" : "Yes, remove"}
                </button>
              </div>
            </div>
          </div>
        </LargeModalPortal>
      ) : null}

      {statusConfirm ? (
        <LargeModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
              <div className="border-b border-slate-100 bg-blue-50/60 px-6 py-4 dark:border-white/5 dark:bg-blue-950/20">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Confirm status update
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Mark shipment as{" "}
                  <span className="font-semibold">
                    {STATUS_LABEL[statusConfirm.nextStatus] ||
                      statusConfirm.nextStatus.replaceAll("_", " ")}
                  </span>
                </p>
              </div>
              <div className="space-y-2 px-6 py-4">
                <label className="block text-xs font-medium text-slate-600">
                  Remarks (optional)
                </label>
                <textarea
                  rows={3}
                  value={statusRemarks}
                  onChange={(e) => setStatusRemarks(e.target.value)}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-slate-950"
                  placeholder="Add transit notes…"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    setStatusConfirm(null);
                    setStatusRemarks("");
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={patchTransportState.isLoading}
                  onClick={() => void handleAdvanceStatus()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {patchTransportState.isLoading ? "Updating…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </LargeModalPortal>
      ) : null}

      {createDispatchModal ? (
        <CreateAccountDispatchModal
          open={true}
          onClose={() => setCreateDispatchModal(null)}
          orderId={createDispatchModal.orderId}
          detail={dispatchOrderQ.data as Record<string, unknown> | null}
          partyLabel={createDispatchModal.partyLabel}
          orderItems={dispatchOrderItems}
          dispatches={dispatchDispatches}
          approvals={dispatchApprovals}
          editingDispatch={previewDispatch?.dispatch}
          onCreated={(res) => {
            const planOrderId = createDispatchModal.planOrderId;
            const partyLabel = createDispatchModal.partyLabel;
            setCreateDispatchModal(null);
            setPreviewDispatch(null);
            if (res && planOrderId) {
              setPreviewDispatch({
                dispatch: res as Record<string, unknown>,
                planOrderId,
                partyLabel,
              });
            }
            refetch();
          }}
        />
      ) : null}

      {previewDispatch ? (
        <LargeModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
            <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
              <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 dark:border-white/5 dark:bg-slate-950/20 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Preview Dispatch: {String(previewDispatch.dispatch.dispatch_no || "Draft")}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Customer: {previewDispatch.partyLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewDispatch(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <span className="sr-only">Close</span>
                  &times;
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="font-semibold text-slate-500">Bill Number:</span>{" "}
                    <span className="text-slate-800 dark:text-slate-200">
                      {String(previewDispatch.dispatch.bill_number || "—")}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Billing Date:</span>{" "}
                    <span className="text-slate-800 dark:text-slate-200">
                      {previewDispatch.dispatch.billing_date
                        ? new Date(String(previewDispatch.dispatch.billing_date)).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Warehouse Location:</span>{" "}
                    <span className="text-slate-800 dark:text-slate-200">
                      {String(previewDispatch.dispatch.warehouse_location || "—")}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">Remarks:</span>{" "}
                    <span className="text-slate-800 dark:text-slate-200">
                      {String(previewDispatch.dispatch.remarks || "—")}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 dark:border-white/5">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Dispatched Items
                  </h4>
                  <div className="overflow-x-auto rounded-lg border border-slate-200/60 dark:border-white/5">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950 font-medium text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2 text-center w-24">Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {Array.isArray(previewDispatch.dispatch.dispatch_items) &&
                          previewDispatch.dispatch.dispatch_items.map((item: any, idx: number) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                                {item.product_name || "—"}
                              </td>
                              <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">
                                {item.dispatched_quantity ?? item.dispatch_quantity ?? "—"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-white/5 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => setPreviewDispatch(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200"
                >
                  Close (Keep Draft)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const orderId =
                      idOf(previewDispatch.dispatch.order) ||
                      String(previewDispatch.dispatch.order || "");
                    setCreateDispatchModal({
                      orderId,
                      planOrderId: previewDispatch.planOrderId,
                      partyLabel: previewDispatch.partyLabel,
                    });
                    setPreviewDispatch(null);
                  }}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300"
                >
                  Edit Dispatch
                </button>
                <button
                  type="button"
                  disabled={patchDispatchState.isLoading || patchPlanOrderState.isLoading}
                  onClick={async () => {
                    try {
                      const dispatchId = String(previewDispatch.dispatch._id || previewDispatch.dispatch.id || "");
                      await patchDispatch({
                        id: dispatchId,
                        patch: { dispatch_status: "submitted" },
                      }).unwrap();

                      await patchTransportPlanOrder({
                        id: planId,
                        planOrderId: previewDispatch.planOrderId,
                        patch: { dispatch: dispatchId },
                      }).unwrap();

                      toast.success("Dispatch submitted and mapped to transport plan successfully.");
                      setPreviewDispatch(null);
                      refetch();
                    } catch (err) {
                      toast.error(mutationRejectedMessage(err));
                    }
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {patchDispatchState.isLoading || patchPlanOrderState.isLoading
                    ? "Submitting…"
                    : "Submit to Dispatch Team"}
                </button>
              </div>
            </div>
          </div>
        </LargeModalPortal>
      ) : null}

      {viewOrderId && (
        <OrderDetailModal
          orderId={viewOrderId}
          partyNameById={partyNameById}
          onClose={() => setViewOrderId(null)}
        />
      )}
    </div>
  );
}
