"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Printer, Send, Truck, XCircle } from "lucide-react";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { CreateTransportModal } from "@/components/portal/dispatch/order/components/CreateTransportModal";
import { OrderDeliveryModal } from "@/components/portal/dispatch/order/components/OrderDeliveryModal";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/store/hooks";
import {
  useCancelTransportPlanMutation,
  useCancelTransportPlanOrderMutation,
  useGetOrderQuery,
  useGetTransportPlanQuery,
  useListDispatchesQuery,
  usePatchTransportMutation,
  useSubmitTransportPlanMutation,
  type TransportPlanOrderRecord,
} from "@/store/api";
import { CancelTransportPlanModal } from "./CancelTransportPlanModal";
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
  const dept = user?.department || rawPortal;
  const isPlanner = ["account", "admin", "super_admin"].includes(String(dept));
  const isExecutor = ["dispatch", "admin", "super_admin"].includes(String(dept));

  const { data, isLoading, isFetching, isError, refetch } =
    useGetTransportPlanQuery(planId);
  const [submitPlan, submitState] = useSubmitTransportPlanMutation();
  const [cancelPlan, cancelState] = useCancelTransportPlanMutation();
  const [cancelPlanOrder, cancelLineState] = useCancelTransportPlanOrderMutation();
  const [patchTransport, patchTransportState] = usePatchTransportMutation();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [createTransportLineId, setCreateTransportLineId] = useState<string | null>(null);
  const [confirmCancelLineId, setConfirmCancelLineId] = useState<string | null>(null);
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

  const createLine = useMemo(
    () => (data?.orders ?? []).find((l) => planIdOf(l) === createTransportLineId) || null,
    [data?.orders, createTransportLineId]
  );
  const createOrderId = idOf(createLine?.order);
  const createDispatchId = idOf(createLine?.dispatch);

  const dispatchesQ = useListDispatchesQuery(
    { order: createOrderId },
    { skip: !createOrderId || !createTransportLineId }
  );
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
    cancelLineState.isLoading ||
    patchTransportState.isLoading;

  const orders = (data?.orders ?? []).filter((o) => o.status !== "cancelled");
  const summary = data?.summary || {
    total_orders: orders.length,
    total_packages: 0,
    total_weight: 0,
    total_invoice_value: 0,
  };

  const planAgentId = idOf(data?.transport_agent);
  const planIsActive =
    data?.status !== "completed" && data?.status !== "cancelled";
  const canRunTransportActions =
    isExecutor && canExecutePlan(data?.status) && planIsActive;
  const canCancelLine =
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
            <>
              <Link
                href={`${base}/transport-planner/${planId}/edit`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
              >
                Edit
              </Link>
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
            </>
          ) : null}

          {isPlanner && data?.status !== "completed" && data?.status !== "cancelled" ? (
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
        {[
          { label: "Total orders", value: summary.total_orders ?? 0 },
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

      <div className="min-h-0 flex-1 space-y-3 overflow-auto">
        {orders.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">
            No orders on this plan.
          </div>
        ) : (
          orders.map((line) => {
            const lineId = planIdOf(line);
            const ord = line.order && typeof line.order === "object" ? line.order : null;
            const disp =
              line.dispatch && typeof line.dispatch === "object" ? line.dispatch : null;
            const transport = line.transport || null;
            const transportId = idOf(transport);
            const shipmentStatus = shipmentStatusOf(line);
            const nextStatus = transport
              ? NEXT_STATUS_MAP[shipmentStatus] ?? null
              : null;
            const agent =
              transport?.transport_agent && typeof transport.transport_agent === "object"
                ? transport.transport_agent
                : null;
            const vehicleNo = transport?.vehicle_number || transport?.vehicle_no || "—";
            const driverPhone = transport?.driver_mobile || transport?.driver_phone || "";
            const invoice =
              line.invoice_number || disp?.bill_number || "—";
            const lr = line.lr_number || transport?.lr_number || "—";
            const packages =
              line.packages ??
              (transport?.packed_boxes != null || transport?.open_boxes != null
                ? Number(transport?.packed_boxes || 0) + Number(transport?.open_boxes || 0)
                : null);
            const weight = line.weight ?? transport?.weight ?? null;
            const showCreateTransport =
              canRunTransportActions &&
              !hasActiveTransport(line) &&
              ["pending", "packed"].includes(String(line.status || "pending"));
            const showCancelLine =
              canCancelLine &&
              !hasActiveTransport(line) &&
              ["pending", "packed"].includes(String(line.status || "pending"));

            return (
              <div
                key={lineId}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {orderNoOf(line.order)}
                      </h3>
                      {renderOrderStatusBadge(line.status)}
                      {transport ? (
                        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                          {(shipmentStatus || "created").replaceAll("_", " ")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {partyLabel(line.party || ord?.party)} · Dispatch{" "}
                      <span className="font-mono">
                        {disp?.dispatch_no || idOf(line.dispatch) || "—"}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {showCreateTransport ? (
                      <button
                        type="button"
                        onClick={() => setCreateTransportLineId(lineId)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <Truck className="h-3.5 w-3.5" />
                        Create Transport
                      </button>
                    ) : null}
                    {showCancelLine ? (
                      <button
                        type="button"
                        onClick={() => setConfirmCancelLineId(lineId)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-300"
                      >
                        Cancel
                      </button>
                    ) : null}

                    {canRunTransportActions && transport && nextStatus ? (
                      <button
                        type="button"
                        disabled={patchTransportState.isLoading}
                        onClick={() => {
                          if (nextStatus === "delivered") {
                            const orderId = idOf(line.order);
                            const dispatchId = idOf(line.dispatch);
                            if (!orderId || !dispatchId || !transportId) {
                              toast.error("Missing order/dispatch reference for delivery");
                              return;
                            }
                            setDeliveryModal({
                              transportId,
                              dispatchId,
                              orderId,
                            });
                            return;
                          }
                          setStatusConfirm({ transportId, nextStatus });
                          setStatusRemarks("");
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50 ${
                          nextStatus === "in_transit"
                            ? "bg-blue-600 hover:bg-blue-700"
                            : nextStatus === "out_for_delivery"
                              ? "bg-amber-600 hover:bg-amber-700"
                              : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                      >
                        {STATUS_LABEL[nextStatus] || nextStatus}
                      </button>
                    ) : null}

                    {canRunTransportActions &&
                    transport &&
                    ["delivered", "returned", "delivery_failed"].includes(shipmentStatus) ? (
                      <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
                        {shipmentStatus === "delivered" ? "Delivered" : "Finalized"}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Invoice
                    </div>
                    <div className="mt-0.5 font-mono font-medium text-slate-800 dark:text-slate-100">
                      {invoice}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      LR number
                    </div>
                    <div className="mt-0.5 font-mono font-medium text-slate-800 dark:text-slate-100">
                      {lr}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Packages
                    </div>
                    <div className="mt-0.5 font-medium tabular-nums text-slate-800 dark:text-slate-100">
                      {packages ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Weight
                    </div>
                    <div className="mt-0.5 font-medium tabular-nums text-slate-800 dark:text-slate-100">
                      {weight != null
                        ? `${weight}${transport?.weight_unit ? ` ${transport.weight_unit}` : ""}`
                        : "—"}
                    </div>
                  </div>
                </div>

                {transport ? (
                  <div className="mt-3 grid gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-xs dark:border-white/5 dark:bg-slate-950/30 sm:grid-cols-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Transport agent
                      </div>
                      <div className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">
                        {agent?.agent_name || agentLabel(data?.transport_agent)}
                      </div>
                      {agent?.agent_code ? (
                        <div className="font-mono text-[11px] text-slate-500">
                          {agent.agent_code}
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Driver
                      </div>
                      <div className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">
                        {transport.driver_name || "—"}
                      </div>
                      {driverPhone ? (
                        <div className="text-[11px] text-slate-500">{driverPhone}</div>
                      ) : null}
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Vehicle
                      </div>
                      <div className="mt-0.5 font-semibold uppercase text-slate-800 dark:text-slate-100">
                        {vehicleNo}
                      </div>
                      {transport.shipment_no ? (
                        <div className="font-mono text-[11px] text-slate-500">
                          {transport.shipment_no}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    Invoice, LR, packages, weight, agent, driver and vehicle details will
                    fill when transport is created.
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

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

      <CreateTransportModal
        open={createTransportLineId !== null && !!createOrderId && !!createDispatchId}
        onClose={() => setCreateTransportLineId(null)}
        orderId={createOrderId}
        dispatchId={createDispatchId}
        dispatches={uniqueById([
          ...(createLine?.dispatch && typeof createLine.dispatch === "object"
            ? [createLine.dispatch as Record<string, unknown>]
            : []),
          ...pickList(dispatchesQ.data),
        ])}
        transports={createLine?.transport ? [createLine.transport] : []}
        expectedDeliveryDate={
          createLine?.order && typeof createLine.order === "object"
            ? (createLine.order as { expected_delivery_date?: string }).expected_delivery_date
            : undefined
        }
        shippingAddress={
          (createLine?.party && typeof createLine.party === "object"
            ? (createLine.party as { shipping_address?: unknown }).shipping_address
            : undefined) ||
          (createLine?.order &&
          typeof createLine.order === "object" &&
          createLine.order.party &&
          typeof createLine.order.party === "object"
            ? (createLine.order.party as { shipping_address?: unknown }).shipping_address
            : undefined)
        }
        defaultTransportAgentId={planAgentId || undefined}
        onCreated={() => {
          setCreateTransportLineId(null);
          handleRefetch();
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

      {confirmCancelLineId ? (
        <LargeModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center gap-3 border-b border-slate-100 bg-rose-50/60 px-6 py-4 dark:border-white/5 dark:bg-rose-950/20">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Cancel plan line?
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    This removes the order dispatch from this transport plan. Transport must
                    not have been created yet.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setConfirmCancelLineId(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200"
                >
                  Keep
                </button>
                <button
                  type="button"
                  disabled={cancelLineState.isLoading}
                  onClick={() => {
                    void runAction(
                      () =>
                        cancelPlanOrder({
                          id: planId,
                          planOrderId: confirmCancelLineId,
                        }).unwrap(),
                      "Plan line cancelled"
                    ).then(() => setConfirmCancelLineId(null));
                  }}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {cancelLineState.isLoading ? "Cancelling…" : "Yes, cancel"}
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
    </div>
  );
}
