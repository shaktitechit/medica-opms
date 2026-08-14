"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCreateTransportMutation,
  usePatchTransportMutation,
  useListDriversQuery,
  useListTransportAgentsQuery,
  useListVehiclesQuery,
  useListOrderApprovalsQuery,
  useResolvePartialDispatchReleaseMutation,
} from "@/store/api";
import { LargeModalBackdrop } from "@/components/portal/shared/LargeModalBackdrop";
import { largeModalPanelScrollClass } from "@/components/portal/shared/modalLayout";
import {
  buildReleaseSettlePayload,
  idFromRef,
  type AccountResolvePreviewRow,
} from "../accountDispatchAvailability";
import { isKitShellDispatchSource } from "../dispatchKitDisplay";

/** Optional prefills (e.g. from a transport plan). */
export type CreateTransportFormDefaults = {
  transportAgentId?: string;
  dispatchDate?: string;
  expectedDeliveryDate?: string;
  lrNumber?: string;
  weight?: string | number;
  weightUnit?: string;
  packedBoxes?: string | number;
  openBoxes?: string | number;
  totalQuantity?: string | number;
  remarks?: string;
  sourceLocation?: string;
};

type CreateTransportModalProps = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  dispatchId: string;
  dispatches: any[];
  transports?: any[];
  expectedDeliveryDate?: string;
  shippingAddress?: any;
  /** Finance / account approvals used for kit-aware auto-settle on create. */
  approvals?: Record<string, unknown>[];
  orderItems?: Record<string, unknown>[];
  /** @deprecated Prefer `formDefaults.transportAgentId` */
  defaultTransportAgentId?: string;
  formDefaults?: CreateTransportFormDefaults;
  /** When true, transport agent select input is locked/disabled. */
  disableTransportAgent?: boolean;
  /** When set, modal patches this shipment instead of creating. */
  editingTransport?: Record<string, unknown> | null;
  onCreated?: () => void;
};

function toDateInputValue(value: unknown): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function optionalString(value: unknown): string {
  if (value == null || value === "") return "";
  return String(value);
}

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

function pickList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
  }
  return [];
}

function isKitHeaderSettleRow(row: AccountResolvePreviewRow): boolean {
  return Boolean(row.isKitParent) || row.orderItemId.startsWith("__kit__");
}

function isSettleQtyRow(row: AccountResolvePreviewRow): boolean {
  return !isKitHeaderSettleRow(row);
}

function optionalWholeNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function sumDispatchItemQuantities(
  dispatch: Record<string, unknown>,
  orderItems: Record<string, unknown>[] = [],
): number {
  const items = Array.isArray(dispatch.dispatch_items)
    ? (dispatch.dispatch_items as Record<string, unknown>[])
    : Array.isArray(dispatch.items)
      ? (dispatch.items as Record<string, unknown>[])
      : [];
  return items.reduce((sum, row) => {
    // Kit shells are commercial-only — qty lives on kit bucket lines.
    if (isKitShellDispatchSource(row, items, orderItems)) return sum;
    return sum + Number(row.dispatched_quantity ?? row.dispatch_quantity ?? 0);
  }, 0);
}

export function CreateTransportModal({
  open,
  onClose,
  orderId,
  dispatchId,
  dispatches,
  transports = [],
  expectedDeliveryDate,
  shippingAddress,
  approvals = [],
  orderItems = [],
  defaultTransportAgentId,
  formDefaults,
  disableTransportAgent = false,
  editingTransport = null,
  onCreated,
}: CreateTransportModalProps) {
  const [transportAgentId, setTransportAgentId] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [transporterPhone, setTransporterPhone] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [sourceLocation, setSourceLocation] = useState("");
  const [destinationLocation, setDestinationLocation] = useState("");
  const [routeDetails, setRouteDetails] = useState("");
  const [transportDispatchDate, setTransportDispatchDate] = useState("");
  const [expectedDelivDate, setExpectedDelivDate] = useState("");
  const [transportRemarks, setTransportRemarks] = useState("");
  const [lrNumber, setLrNumber] = useState("");
  const [ewayBillNo, setEwayBillNo] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState("Kg");
  const [packedBoxes, setPackedBoxes] = useState("");
  const [openBoxes, setOpenBoxes] = useState("");
  const [totalQuantity, setTotalQuantity] = useState("");

  const [createTransport, { isLoading: isCreatingTransport }] = useCreateTransportMutation();
  const [patchTransport, { isLoading: isPatchingTransport }] = usePatchTransportMutation();
  const [resolvePartialDispatchRelease, { isLoading: isSettlingRelease }] =
    useResolvePartialDispatchReleaseMutation();
  const isSavingTransport =
    isCreatingTransport || isPatchingTransport || isSettlingRelease;
  const isEditMode = Boolean(editingTransport);
  const editingTransportId = editingTransport
    ? idFromRef(editingTransport._id ?? editingTransport.id)
    : "";

  // Self-fetch approvals so settle summary/work on edit does not depend on parent props.
  const approvalsQ = useListOrderApprovalsQuery(
    { order: orderId },
    { skip: !orderId || !open },
  );
  const resolvedApprovals = useMemo(() => {
    const fromQuery = pickList(approvalsQ.data);
    if (fromQuery.length > 0) return fromQuery;
    return approvals;
  }, [approvalsQ.data, approvals]);
  const resolvedDispatchId =
    dispatchId || idFromRef(editingTransport?.dispatch);
  const transportAgentsQ = useListTransportAgentsQuery(
    { is_active: "true" },
    { skip: !open },
  );
  const driversQ = useListDriversQuery({}, { skip: !open });
  const vehiclesQ = useListVehiclesQuery({}, { skip: !open });

  const transportAgents = useMemo(
    () => pickList(transportAgentsQ.data),
    [transportAgentsQ.data],
  );
  const drivers = useMemo(() => pickList(driversQ.data), [driversQ.data]);
  const vehicles = useMemo(() => pickList(vehiclesQ.data), [vehiclesQ.data]);

  const selectedTransportAgent = useMemo(() => {
    if (!transportAgentId) return null;
    return (
      transportAgents.find(
        (a: any) => String(a._id ?? a.id ?? "") === transportAgentId,
      ) ?? null
    );
  }, [transportAgentId, transportAgents]);

  const transportAgentType = String(
    selectedTransportAgent?.agent_type ?? "third_party",
  );
  const isInternalFleet = transportAgentType === "internal_fleet";
  const isLrNumberRequired = selectedTransportAgent?.lr_number_required === true;

  const filteredVehicles = useMemo(() => {
    if (!transportAgentId) return [];
    return vehicles.filter((v: any) => {
      const a = v.transport_agent;
      const aid =
        typeof a === "object" && a !== null
          ? String(a._id ?? a.id ?? "")
          : String(a ?? "");
      return aid === transportAgentId;
    });
  }, [vehicles, transportAgentId]);

  const filteredDrivers = useMemo(() => {
    if (!transportAgentId) return [];
    return drivers.filter((d: any) => {
      const a = d.transport_agent;
      const aid =
        typeof a === "object" && a !== null
          ? String(a._id ?? a.id ?? "")
          : String(a ?? "");
      return aid === transportAgentId;
    });
  }, [drivers, transportAgentId]);

  useEffect(() => {
    if (!open || !isEditMode || !isInternalFleet) return;
    const vNo = optionalString(
      editingTransport?.vehicle_number ?? editingTransport?.vehicle_no,
    );
    if (vNo && !vehicleId) {
      const match = filteredVehicles.find(
        (v: any) => String(v.vehicle_no ?? "") === vNo,
      );
      if (match) setVehicleId(idFromRef(match._id ?? match.id));
    }
    const dName = optionalString(editingTransport?.driver_name);
    const dPhone = optionalString(
      editingTransport?.driver_mobile ?? editingTransport?.driver_phone,
    );
    if ((dName || dPhone) && !driverId) {
      const match = filteredDrivers.find((d: any) => {
        const nameMatch = dName && String(d.name ?? "") === dName;
        const phoneMatch =
          dPhone &&
          (String(d.phone ?? "") === dPhone || String(d.mobile ?? "") === dPhone);
        return Boolean(nameMatch || phoneMatch);
      });
      if (match) setDriverId(idFromRef(match._id ?? match.id));
    }
  }, [
    open,
    isEditMode,
    isInternalFleet,
    editingTransport,
    filteredVehicles,
    filteredDrivers,
    vehicleId,
    driverId,
  ]);

  const resetForm = useCallback(() => {
    setTransportAgentId("");
    setTransporterName("");
    setTransporterPhone("");
    setVehicleId("");
    setDriverId("");
    setVehicleNo("");
    setDriverName("");
    setDriverPhone("");
    setSourceLocation("");
    setDestinationLocation("");
    setRouteDetails("");
    setTransportDispatchDate("");
    setExpectedDelivDate("");
    setTransportRemarks("");
    setLrNumber("");
    setEwayBillNo("");
    setTrackingNumber("");
    setWeight("");
    setWeightUnit("Kg");
    setPackedBoxes("");
    setOpenBoxes("");
    setTotalQuantity("");
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  // Prefill once whenever the modal opens (edit snapshot, or plan / order defaults).
  useEffect(() => {
    if (!open) return;

    if (editingTransport) {
      setTransportAgentId(idFromRef(editingTransport.transport_agent));
      setTransporterName(optionalString(editingTransport.transporter_name));
      setTransporterPhone(optionalString(editingTransport.transporter_phone));
      setVehicleId("");
      setDriverId("");
      setVehicleNo(
        optionalString(
          editingTransport.vehicle_number ?? editingTransport.vehicle_no,
        ),
      );
      setDriverName(optionalString(editingTransport.driver_name));
      setDriverPhone(
        optionalString(
          editingTransport.driver_mobile ?? editingTransport.driver_phone,
        ),
      );
      setSourceLocation(optionalString(editingTransport.source_location));
      setDestinationLocation(optionalString(editingTransport.destination_location));
      setRouteDetails(optionalString(editingTransport.route_details));
      setTransportDispatchDate(toDateInputValue(editingTransport.dispatch_date));
      setExpectedDelivDate(
        toDateInputValue(editingTransport.expected_delivery_date),
      );
      setTransportRemarks(optionalString(editingTransport.remarks));
      setLrNumber(optionalString(editingTransport.lr_number));
      setEwayBillNo(optionalString(editingTransport.eway_bill_no));
      setTrackingNumber(optionalString(editingTransport.tracking_number));
      setWeight(optionalString(editingTransport.weight));
      setWeightUnit(optionalString(editingTransport.weight_unit) || "Kg");
      setPackedBoxes(optionalString(editingTransport.packed_boxes));
      setOpenBoxes(optionalString(editingTransport.open_boxes));
      setTotalQuantity(optionalString(editingTransport.total_quantity));
      return;
    }

    const agentId =
      formDefaults?.transportAgentId || defaultTransportAgentId || "";
    if (agentId) setTransportAgentId(String(agentId));

    const planDispatchDate = toDateInputValue(formDefaults?.dispatchDate);
    if (planDispatchDate) setTransportDispatchDate(planDispatchDate);

    const expected =
      toDateInputValue(formDefaults?.expectedDeliveryDate) ||
      toDateInputValue(expectedDeliveryDate);
    if (expected) setExpectedDelivDate(expected);

    const lr = optionalString(formDefaults?.lrNumber);
    if (lr) setLrNumber(lr);

    const w = optionalString(formDefaults?.weight);
    if (w) setWeight(w);
    if (formDefaults?.weightUnit) setWeightUnit(String(formDefaults.weightUnit));

    const packed = optionalString(formDefaults?.packedBoxes);
    if (packed) setPackedBoxes(packed);
    const openQty = optionalString(formDefaults?.openBoxes);
    if (openQty) setOpenBoxes(openQty);
    const totalQty = optionalString(formDefaults?.totalQuantity);
    if (totalQty) setTotalQuantity(totalQty);

    const remarks = optionalString(formDefaults?.remarks);
    if (remarks) setTransportRemarks(remarks);

    const source = optionalString(formDefaults?.sourceLocation);
    if (source) setSourceLocation(source);

    if (shippingAddress) {
      const a = shippingAddress as Record<string, any>;
      const parts: string[] = [];
      if (a.address_line_1) parts.push(String(a.address_line_1).trim());
      if (a.address_line_2) parts.push(String(a.address_line_2).trim());
      if (a.city) parts.push(String(a.city).trim());
      if (a.state) parts.push(String(a.state).trim());
      if (a.pincode) parts.push(String(a.pincode).trim());
      const dest = parts.filter(Boolean).join(", ");
      if (dest) setDestinationLocation(dest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply snapshot of defaults when modal opens
  }, [open, editingTransport]);

  useEffect(() => {
    if (!open || !resolvedDispatchId || isEditMode) return;

    const disp = dispatches.find((d: any) => String(d._id ?? d.id) === resolvedDispatchId);
    if (!disp) return;

    setSourceLocation((prev) => {
      if (prev.trim()) return prev;
      const warehouseVal = (disp as any).warehouse_location || (disp as any).warehouse || "";
      return typeof warehouseVal === "object" && warehouseVal !== null
        ? String((warehouseVal as any).name || (warehouseVal as any)._id || "")
        : String(warehouseVal || "");
    });

    setTransportDispatchDate((prev) => {
      if (prev.trim()) return prev;
      const dDate =
        (disp as any).dispatched_at ??
        (disp as any).dispatch_date ??
        new Date().toISOString();
      return toDateInputValue(dDate);
    });

    setTotalQuantity((prev) => {
      if (prev.trim()) return prev;
      const qtyTotal = sumDispatchItemQuantities(
        disp as Record<string, unknown>,
        orderItems,
      );
      return qtyTotal > 0 ? String(qtyTotal) : prev;
    });
  }, [open, resolvedDispatchId, dispatches, orderItems, isEditMode]);

  const releaseApproval = useMemo(() => {
    if (!resolvedDispatchId) return null;
    const disp = dispatches.find(
      (d: any) => String(d._id ?? d.id) === resolvedDispatchId,
    ) as Record<string, unknown> | undefined;
    if (!disp) return null;
    const approvalRef = disp.finance_approval;
    const approvalId =
      typeof approvalRef === "object" && approvalRef !== null
        ? idFromRef(
            (approvalRef as Record<string, unknown>)._id ??
              (approvalRef as Record<string, unknown>).id,
          )
        : idFromRef(approvalRef);
    if (!approvalId) return null;
    return (
      resolvedApprovals.find(
        (a) => idFromRef(a._id ?? a.id) === approvalId,
      ) ?? null
    );
  }, [resolvedDispatchId, dispatches, resolvedApprovals]);

  const settlePayload = useMemo(
    () =>
      buildReleaseSettlePayload(
        releaseApproval,
        orderItems,
        dispatches as Record<string, unknown>[],
      ),
    [releaseApproval, orderItems, dispatches],
  );

  const settleTotals = useMemo(() => {
    return settlePayload.settleRows.reduce(
      (acc, row) => {
        if (!isSettleQtyRow(row)) return acc;
        acc.remainingClearance += row.remainingClearance;
        acc.settledReturnsQty += row.settledReturnsQty;
        acc.removedQty += row.removedQty;
        acc.settledQty += row.settledQty;
        acc.clearedQty += row.clearedQty;
        acc.dispatchedQty += row.dispatchedQty;
        return acc;
      },
      {
        remainingClearance: 0,
        settledReturnsQty: 0,
        removedQty: 0,
        settledQty: 0,
        clearedQty: 0,
        dispatchedQty: 0,
      },
    );
  }, [settlePayload.settleRows]);

  const settleHasReturns = useMemo(
    () =>
      settlePayload.settleRows.some(
        (row) => isSettleQtyRow(row) && row.settledReturnsQty > 0,
      ),
    [settlePayload.settleRows],
  );

  const hasSelectedDispatchTransport = useMemo(() => {
    if (isEditMode || !resolvedDispatchId) return false;
    return transports.some((tr: any) => {
      const trDispatchId =
        typeof tr.dispatch === "object" && tr.dispatch !== null
          ? String(tr.dispatch._id ?? tr.dispatch.id ?? "")
          : String(tr.dispatch ?? "");
      const isReturned = String(tr.shipment_status ?? tr.status ?? "") === "returned";
      return trDispatchId === resolvedDispatchId && !isReturned;
    });
  }, [isEditMode, resolvedDispatchId, transports]);

  const handleCreateTransport = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!orderId) return;
      if (!resolvedDispatchId) {
        toast.error("Please select a dispatch reference.");
        return;
      }
      if (!transportAgentId) {
        toast.error("Please select a transport agent.");
        return;
      }
      if (isLrNumberRequired && !lrNumber.trim()) {
        toast.error("LR number is required for this transport agent.");
        return;
      }

      try {
        const payload: Record<string, any> = {
          order: orderId,
          dispatch: resolvedDispatchId,
          transport_agent: transportAgentId,
          transporter_type: isInternalFleet ? "internal" : "external",
          transporter_name:
            String(
              selectedTransportAgent?.agent_name ?? transporterName.trim() ?? "",
            ) || undefined,
          transporter_phone:
            String(selectedTransportAgent?.mobile ?? transporterPhone.trim() ?? "") ||
            undefined,
          source_location: sourceLocation.trim() || undefined,
          destination_location: destinationLocation.trim() || undefined,
          route_details: routeDetails.trim() || undefined,
          dispatch_date: transportDispatchDate
            ? new Date(transportDispatchDate).toISOString()
            : undefined,
          expected_delivery_date: expectedDelivDate
            ? new Date(expectedDelivDate).toISOString()
            : undefined,
          remarks: transportRemarks.trim() || undefined,
          lr_number: lrNumber.trim() || undefined,
          eway_bill_no: ewayBillNo.trim() || undefined,
          tracking_number: trackingNumber.trim() || undefined,
          weight: weight ? Number(weight) : undefined,
          weight_unit: weightUnit || undefined,
          packed_boxes: optionalWholeNumber(packedBoxes),
          open_boxes: optionalWholeNumber(openBoxes),
          total_quantity: optionalWholeNumber(totalQuantity),
          // Kit-aware settle on create and edit: buckets amend order/approval;
          // unbilled gets kit shells (+ individuals) only.
          ...(settlePayload.hasSettleWork
            ? {
                settle_approval_items: settlePayload.approvalItems,
                settle_rest_items: settlePayload.settledRestItems,
                settle_amendment_notes: isEditMode
                  ? "Auto-settled when transport was updated — remaining clearance moved to Unbilled Order"
                  : "Auto-settled when transport was created — remaining clearance moved to Unbilled Order",
              }
            : {}),
        };

        if (isInternalFleet) {
          if (!vehicleId) {
            toast.error("Please select a vehicle.");
            return;
          }
          if (!driverId) {
            toast.error("Please select a driver.");
            return;
          }
          payload.vehicle = vehicleId;
          payload.driver = driverId;

          const selectedVehicle = vehicles.find(
            (v: any) => String(v._id ?? v.id ?? "") === vehicleId,
          ) as any;
          const selectedDriver = drivers.find(
            (d: any) => String(d._id ?? d.id ?? "") === driverId,
          ) as any;
          if (selectedVehicle) {
            payload.vehicle_no = selectedVehicle.vehicle_no || "";
          }
          if (selectedDriver) {
            payload.driver_name = selectedDriver.name || "";
            payload.driver_phone = selectedDriver.phone || "";
          }
        } else {
          if (vehicleId) {
            const selectedVehicle = vehicles.find(
              (v: any) => String(v._id ?? v.id ?? "") === vehicleId,
            ) as any;
            if (selectedVehicle) payload.vehicle_no = selectedVehicle.vehicle_no || "";
          } else {
            payload.vehicle_no = vehicleNo.trim() || undefined;
          }

          if (driverId) {
            const selectedDriver = drivers.find(
              (d: any) => String(d._id ?? d.id ?? "") === driverId,
            ) as any;
            if (selectedDriver) {
              payload.driver_name = selectedDriver.name || "";
              payload.driver_phone = selectedDriver.phone || "";
            }
          } else {
            payload.driver_name = driverName.trim() || undefined;
            payload.driver_phone = driverPhone.trim() || undefined;
          }
        }

        let settledOnSave = false;
        if (isEditMode) {
          if (!editingTransportId) return;
          // Keep dispatch on patch so backend settle can resolve the release.
          const { order: _order, ...patch } = payload;
          await patchTransport({ id: editingTransportId, patch }).unwrap();
        } else {
          await createTransport(payload).unwrap();
          // Create path auto-settles in transport.service; treat client settle work as done.
          settledOnSave = settlePayload.hasSettleWork;
        }

        // Edit must settle explicitly — backend auto-settle was silently skipping/failing.
        const dispatchForSettle = dispatches.find(
          (d: any) => String(d._id ?? d.id) === resolvedDispatchId,
        ) as Record<string, unknown> | undefined;
        const approvalRef = dispatchForSettle?.finance_approval;
        const approvalIdForSettle =
          (releaseApproval
            ? idFromRef(releaseApproval._id ?? releaseApproval.id)
            : "") ||
          (typeof approvalRef === "object" && approvalRef !== null
            ? idFromRef(
                (approvalRef as Record<string, unknown>)._id ??
                  (approvalRef as Record<string, unknown>).id,
              )
            : idFromRef(approvalRef));

        if (isEditMode && approvalIdForSettle) {
          try {
            await resolvePartialDispatchRelease({
              id: approvalIdForSettle,
              body: {
                amendment_notes:
                  "Settled when transport was updated — remaining clearance moved to Unbilled Order",
                ...(settlePayload.hasSettleWork
                  ? {
                      approval_items: settlePayload.approvalItems,
                      settled_rest_items: settlePayload.settledRestItems,
                    }
                  : {}),
              },
            }).unwrap();
            settledOnSave = true;
          } catch (settleErr) {
            const settleMsg = mutationRejectedMessage(settleErr);
            // Nothing left to settle / already done — transport save still succeeded.
            if (
              /already been resolved|no remaining clearance|no remaining/i.test(
                settleMsg,
              )
            ) {
              settledOnSave = settlePayload.hasSettleWork;
            } else {
              toast.error(
                `Transport saved, but settle & unbilled failed: ${settleMsg}`,
              );
              handleClose();
              onCreated?.();
              return;
            }
          }
        }

        if (settledOnSave) {
          toast.success(
            settlePayload.unbilledUnits > 0
              ? `Transport ${isEditMode ? "updated" : "recorded"} — settled to Unbilled Order (${settlePayload.unbilledUnits} unit${settlePayload.unbilledUnits === 1 ? "" : "s"}; kit shells only for kits).`
              : `Transport ${isEditMode ? "updated" : "recorded"} — remaining clearance settled on approval/order.`,
          );
        } else {
          toast.success(
            isEditMode
              ? "Transport updated successfully."
              : "Transport recorded successfully.",
          );
        }
        handleClose();
        onCreated?.();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      }
    },
    [
      orderId,
      resolvedDispatchId,
      transportAgentId,
      isInternalFleet,
      isLrNumberRequired,
      selectedTransportAgent,
      sourceLocation,
      destinationLocation,
      routeDetails,
      transportDispatchDate,
      expectedDelivDate,
      transportRemarks,
      lrNumber,
      ewayBillNo,
      trackingNumber,
      weight,
      weightUnit,
      packedBoxes,
      openBoxes,
      totalQuantity,
      vehicleId,
      driverId,
      transporterName,
      transporterPhone,
      vehicleNo,
      driverName,
      driverPhone,
      vehicles,
      drivers,
      createTransport,
      patchTransport,
      resolvePartialDispatchRelease,
      releaseApproval,
      dispatches,
      isEditMode,
      editingTransportId,
      handleClose,
      onCreated,
      settlePayload,
    ],
  );

  if (!open) return null;

  return (
    <LargeModalBackdrop>
      <div className={largeModalPanelScrollClass}>
        <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-3 dark:border-white/5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 font-sans">
              {isEditMode ? "Edit Transport Details" : "Plan & Transport Details"}
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1"
            >
              <span className="sr-only">Close</span>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="flex flex-col gap-1 text-xs font-sans text-slate-500 dark:text-slate-400">
            <span>
              {isEditMode
                ? "Update transporter, vehicle, driver, and shipment details for this transport."
                : "Configure transport details for this shipment dispatch batch."}
            </span>
          </div>
        </div>

        {releaseApproval ? (
          <div className="mt-4 space-y-3 rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
            <div>
              <h4 className="text-sm font-bold text-indigo-950 dark:text-indigo-100">
                Settlement & Unbilled summary
              </h4>
              <p className="mt-0.5 text-xs text-indigo-800/80 dark:text-indigo-200/80">
                {isEditMode ? "Saving this transport" : "Creating transport"} will
                settle remaining clearance on release{" "}
                <span className="font-semibold">
                  {String(releaseApproval.approval_no ?? "—")}
                </span>
                . Kit buckets stay on the order; kit shells and individuals move to
                Unbilled Order.
              </p>
            </div>

            {settlePayload.hasSettleWork ? (
              <>
                <div className="grid gap-2 sm:grid-cols-4 text-xs font-sans">
                  <div className="rounded-lg border border-indigo-200/60 bg-white/70 px-3 py-2 dark:border-indigo-900/30 dark:bg-slate-950/40">
                    <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                      Cleared
                    </div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-50">
                      {settleTotals.clearedQty}
                    </div>
                  </div>
                  <div className="rounded-lg border border-indigo-200/60 bg-white/70 px-3 py-2 dark:border-indigo-900/30 dark:bg-slate-950/40">
                    <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                      Dispatched
                    </div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400">
                      {settleTotals.dispatchedQty}
                    </div>
                  </div>
                  <div className="rounded-lg border border-indigo-200/60 bg-white/70 px-3 py-2 dark:border-indigo-900/30 dark:bg-slate-950/40">
                    <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                      After settle
                    </div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {settleTotals.settledQty}
                    </div>
                  </div>
                  <div className="rounded-lg border border-indigo-200/60 bg-white/70 px-3 py-2 dark:border-indigo-900/30 dark:bg-slate-950/40">
                    <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500">
                      To unbilled
                    </div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums text-indigo-600 dark:text-indigo-300">
                      {settlePayload.unbilledUnits}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-indigo-200/70 bg-white dark:border-indigo-900/40 dark:bg-slate-950">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-medium dark:bg-slate-900">
                      <tr>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2 text-center">Cleared</th>
                        <th className="px-3 py-2 text-center">Dispatched</th>
                        {settleHasReturns ? (
                          <th className="px-3 py-2 text-center text-rose-600 dark:text-rose-400">
                            Returned
                          </th>
                        ) : null}
                        <th className="px-3 py-2 text-center">Remaining</th>
                        <th className="px-3 py-2 text-center text-emerald-700 dark:text-emerald-300">
                          After settle
                        </th>
                        <th className="px-3 py-2 text-center text-indigo-600 dark:text-indigo-400">
                          To unbilled
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {settlePayload.settleRows.map((row) => {
                        const isKitParent = isKitHeaderSettleRow(row);
                        const isBucket = Boolean(row.isKitBucket);
                        return (
                          <tr
                            key={row.orderItemId}
                            className={
                              isBucket
                                ? "bg-slate-50/80 dark:bg-slate-950/60"
                                : isKitParent
                                  ? "bg-violet-50/40 dark:bg-violet-950/20"
                                  : "bg-white dark:bg-slate-900"
                            }
                          >
                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                              <div
                                className={
                                  isBucket
                                    ? "ml-3 border-l-2 border-violet-300 pl-2 dark:border-violet-700"
                                    : undefined
                                }
                              >
                                <div>
                                  {row.productName}
                                  {isKitParent ? (
                                    <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
                                      KIT
                                    </span>
                                  ) : null}
                                  {isBucket ? (
                                    <span className="ml-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40 px-1 py-0.5 rounded">
                                      KIT BUCKET
                                    </span>
                                  ) : null}
                                </div>
                                {row.sku ? (
                                  <div className="mt-0.5 font-mono text-2xs font-normal text-slate-500 dark:text-slate-400">
                                    {row.sku}
                                  </div>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums">
                              {row.clearedQty}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums text-blue-600 dark:text-blue-400">
                              {row.dispatchedQty}
                            </td>
                            {settleHasReturns ? (
                              <td className="px-3 py-2 text-center tabular-nums text-rose-600 dark:text-rose-400">
                                {row.settledReturnsQty > 0
                                  ? row.settledReturnsQty
                                  : "—"}
                              </td>
                            ) : null}
                            <td className="px-3 py-2 text-center tabular-nums text-amber-700 dark:text-amber-300">
                              {isBucket ? "—" : row.remainingClearance}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                              {row.settledQty}
                            </td>
                            <td className="px-3 py-2 text-center tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">
                              {isBucket ? "—" : row.removedQty}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50/80 text-xs font-semibold dark:bg-slate-900/80">
                      <tr>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                          Total
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {settleTotals.clearedQty}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-blue-600 dark:text-blue-400">
                          {settleTotals.dispatchedQty}
                        </td>
                        {settleHasReturns ? (
                          <td className="px-3 py-2 text-center tabular-nums text-rose-600 dark:text-rose-400">
                            {settleTotals.settledReturnsQty}
                          </td>
                        ) : null}
                        <td className="px-3 py-2 text-center tabular-nums text-amber-700 dark:text-amber-300">
                          {settleTotals.remainingClearance}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-emerald-700 dark:text-emerald-300">
                          {settleTotals.settledQty}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums text-indigo-600 dark:text-indigo-400">
                          {settlePayload.unbilledUnits}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-xs text-indigo-800/90 dark:text-indigo-200/90">
                No remaining clearance to settle on this release — saving transport
                will not change Unbilled Order quantities.
              </p>
            )}
          </div>
        ) : null}

        {dispatches.length === 0 ? (
          <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-955/20 dark:border-amber-900/30 text-amber-800 dark:text-amber-300 text-sm font-sans">
            ⚠️ <strong>No dispatches found:</strong> You must create at least one dispatch batch
            before arranging transport logistics.
          </div>
        ) : (
          <form onSubmit={handleCreateTransport} className="mt-4 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 font-sans">
                <label htmlFor="transport-dispatch-ref" className={labelClass}>
                  Dispatch Reference *
                </label>
                <select
                  id="transport-dispatch-ref"
                  value={resolvedDispatchId}
                  className={`${inputClass} bg-slate-50/50 dark:bg-slate-900/50 cursor-not-allowed opacity-90`}
                  disabled
                  required
                >
                  <option value="">— Select Dispatch Batch —</option>
                  {dispatches.map((d: any) => {
                    const did = String(d._id ?? d.id ?? "");
                    return (
                      <option key={did} value={did}>
                        {d.dispatch_no} (
                        {String(d.dispatch_status ?? d.status ?? "draft").replace(/_/g, " ")})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-1.5 font-sans">
                <label htmlFor="transport-agent-select" className={labelClass}>
                  Transport Agent *
                </label>
                <select
                  id="transport-agent-select"
                  value={transportAgentId}
                  onChange={(e) => {
                    setTransportAgentId(e.target.value);
                    setVehicleId("");
                    setDriverId("");
                  }}
                  className={`${inputClass} ${
                    disableTransportAgent
                      ? "bg-slate-50/50 dark:bg-slate-900/50 cursor-not-allowed opacity-90"
                      : ""
                  }`}
                  disabled={disableTransportAgent}
                  required
                >
                  <option value="">— Select Transport Agent —</option>
                  {transportAgents.map((a: any) => {
                    const aid = String(a._id ?? a.id ?? "");
                    const label = `${String(a.agent_name ?? "Unnamed")} (${String(
                      a.agent_code ?? aid,
                    )})`;
                    return (
                      <option key={aid} value={aid}>
                        {label} — {String(a.agent_type ?? "third_party").replace(/_/g, " ")}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {isInternalFleet ? (
              <div className="grid gap-4 sm:grid-cols-2 bg-slate-50/50 dark:bg-slate-950/30 p-4 rounded-xl border border-slate-100 dark:border-white/5">
                <div className="space-y-1.5 font-sans">
                  <label htmlFor="internal-vehicle" className={labelClass}>
                    Vehicle *
                  </label>
                  <select
                    id="internal-vehicle"
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className={inputClass}
                    required
                  >
                    <option value="">— Select Vehicle —</option>
                    {filteredVehicles.map((v: any) => {
                      const vid = String(v._id ?? v.id ?? "");
                      return (
                        <option key={vid} value={vid}>
                          {v.vehicle_no} ({v.vehicle_type} - {String(v.capacity_kg ?? "N/A")}kg)
                          — {String(v.status || "available").replace(/_/g, " ")}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="space-y-1.5 font-sans">
                  <label htmlFor="internal-driver" className={labelClass}>
                    Driver *
                  </label>
                  <select
                    id="internal-driver"
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value)}
                    className={inputClass}
                    required
                  >
                    <option value="">— Select Driver —</option>
                    {filteredDrivers.map((d: any) => {
                      const drid = String(d._id ?? d.id ?? "");
                      return (
                        <option key={drid} value={drid}>
                          {d.name} ({d.phone}) — {String(d.status || "available").replace(/_/g, " ")}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-4 bg-slate-50/50 dark:bg-slate-950/30 p-4 rounded-xl border border-slate-100 dark:border-white/5 font-sans">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Agent Type:{" "}
                  <span className="font-semibold capitalize text-slate-700 dark:text-slate-200">
                    {transportAgentType.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="ext-transporter-name" className={labelClass}>
                      Transporter / Company Name
                    </label>
                    <input
                      id="ext-transporter-name"
                      type="text"
                      onChange={(e) => setTransporterName(e.target.value)}
                      className={inputClass}
                      placeholder="E.g., FedEx, DHL"
                      value={String(selectedTransportAgent?.agent_name ?? transporterName)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="ext-transporter-phone" className={labelClass}>
                      Transporter Contact Phone
                    </label>
                    <input
                      id="ext-transporter-phone"
                      type="tel"
                      onChange={(e) => setTransporterPhone(e.target.value)}
                      className={inputClass}
                      placeholder="E.g., +91 9999999999"
                      value={String(selectedTransportAgent?.mobile ?? transporterPhone)}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <label htmlFor="ext-vehicle-id" className={labelClass}>
                      Linked Vehicle (Optional)
                    </label>
                    <select
                      id="ext-vehicle-id"
                      value={vehicleId}
                      onChange={(e) => setVehicleId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">— None —</option>
                      {filteredVehicles.map((v: any) => {
                        const vid = String(v._id ?? v.id ?? "");
                        return (
                          <option key={vid} value={vid}>
                            {v.vehicle_no}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="ext-vehicle-no" className={labelClass}>
                      Vehicle Number
                    </label>
                    <input
                      id="ext-vehicle-no"
                      type="text"
                      value={vehicleNo}
                      onChange={(e) => setVehicleNo(e.target.value)}
                      className={inputClass}
                      placeholder="E.g., MH12AB1234"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="ext-driver-id" className={labelClass}>
                      Linked Driver (Optional)
                    </label>
                    <select
                      id="ext-driver-id"
                      value={driverId}
                      onChange={(e) => setDriverId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">— None —</option>
                      {filteredDrivers.map((d: any) => {
                        const did = String(d._id ?? d.id ?? "");
                        return (
                          <option key={did} value={did}>
                            {d.name} ({d.phone})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="ext-driver-name" className={labelClass}>
                      Driver Name
                    </label>
                    <input
                      id="ext-driver-name"
                      type="text"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      className={inputClass}
                      placeholder="Driver full name"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label htmlFor="ext-driver-phone" className={labelClass}>
                      Driver Phone
                    </label>
                    <input
                      id="ext-driver-phone"
                      type="tel"
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                      className={inputClass}
                      placeholder="Driver phone number"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3 font-sans">
              <div className="space-y-1.5">
                <label htmlFor="lr-number-input" className={labelClass}>
                  LR Number{isLrNumberRequired ? " *" : ""}
                </label>
                <input
                  id="lr-number-input"
                  type="text"
                  value={lrNumber}
                  onChange={(e) => setLrNumber(e.target.value)}
                  className={inputClass}
                  placeholder="LR Shipment Number"
                  required={isLrNumberRequired}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="eway-bill-input" className={labelClass}>
                  E-way Bill No
                </label>
                <input
                  id="eway-bill-input"
                  type="text"
                  value={ewayBillNo}
                  onChange={(e) => setEwayBillNo(e.target.value)}
                  className={inputClass}
                  placeholder="12-digit E-way Bill"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="tracking-number-input" className={labelClass}>
                  Tracking Number
                </label>
                <input
                  id="tracking-number-input"
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className={inputClass}
                  placeholder="Tracking ID / Code"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 font-sans">
              <div className="space-y-1.5">
                <label htmlFor="source-location-input" className={labelClass}>
                  Source / Warehouse
                </label>
                <input
                  id="source-location-input"
                  type="text"
                  value={sourceLocation}
                  onChange={(e) => setSourceLocation(e.target.value)}
                  className={inputClass}
                  placeholder="E.g., Mumbai Hub"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="destination-location-input" className={labelClass}>
                  Destination Address
                </label>
                <input
                  id="destination-location-input"
                  type="text"
                  value={destinationLocation}
                  onChange={(e) => setDestinationLocation(e.target.value)}
                  className={inputClass}
                  placeholder="E.g., Customer Warehouse"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="route-details-input" className={labelClass}>
                  Route Details
                </label>
                <input
                  id="route-details-input"
                  type="text"
                  value={routeDetails}
                  onChange={(e) => setRouteDetails(e.target.value)}
                  className={inputClass}
                  placeholder="E.g., Via NH-48"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 font-sans">
              <div className="space-y-1.5">
                <label htmlFor="transport-date-input" className={labelClass}>
                  Expected Dispatch Date
                </label>
                <input
                  id="transport-date-input"
                  type="date"
                  value={transportDispatchDate}
                  onChange={(e) => setTransportDispatchDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="expected-delivery-input" className={labelClass}>
                  Expected Delivery Date
                </label>
                <input
                  id="expected-delivery-input"
                  type="date"
                  value={expectedDelivDate}
                  onChange={(e) => setExpectedDelivDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 font-sans">
              <div className="space-y-1.5">
                <label htmlFor="weight-input" className={labelClass}>
                  Total Weight
                </label>
                <input
                  id="weight-input"
                  type="number"
                  step="any"
                  min="0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className={inputClass}
                  placeholder="E.g., 25.5"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="weight-unit-input" className={labelClass}>
                  Weight Unit
                </label>
                <select
                  id="weight-unit-input"
                  value={weightUnit}
                  onChange={(e) => setWeightUnit(e.target.value)}
                  className={inputClass}
                >
                  <option value="Kg">Kg</option>
                  <option value="Lbs">Lbs</option>
                  <option value="Ton">Ton</option>
                  <option value="Gm">Gm</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 font-sans">
              <div className="space-y-1.5">
                <label htmlFor="packed-boxes-input" className={labelClass}>
                  Number of Packed Boxes{" "}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  id="packed-boxes-input"
                  type="number"
                  min="0"
                  step="1"
                  value={packedBoxes}
                  onChange={(e) => setPackedBoxes(e.target.value)}
                  className={inputClass}
                  placeholder="E.g., 12"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="open-boxes-input" className={labelClass}>
                  Number of Open Boxes{" "}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  id="open-boxes-input"
                  type="number"
                  min="0"
                  step="1"
                  value={openBoxes}
                  onChange={(e) => setOpenBoxes(e.target.value)}
                  className={inputClass}
                  placeholder="E.g., 2"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="total-quantity-input" className={labelClass}>
                  Total Quantity{" "}
                  <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  id="total-quantity-input"
                  type="number"
                  min="0"
                  step="1"
                  value={totalQuantity}
                  onChange={(e) => setTotalQuantity(e.target.value)}
                  className={inputClass}
                  placeholder="Total item quantity"
                />
              </div>
            </div>

            <div className="space-y-1.5 font-sans">
              <label htmlFor="transport-remarks-input" className={labelClass}>
                Remarks / Transit Notes
              </label>
              <textarea
                id="transport-remarks-input"
                rows={2}
                value={transportRemarks}
                onChange={(e) => setTransportRemarks(e.target.value)}
                className={inputClass}
                placeholder="Enter transport remarks..."
              />
            </div>

            <div className="mt-6 flex flex-col items-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5 font-sans">
              {hasSelectedDispatchTransport && (
                <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/20 px-2 py-1 rounded">
                  ⚠️ Transport already created for this dispatch batch.
                </span>
              )}
              <div className="flex justify-end gap-3 font-medium">
                <button
                  type="button"
                  onClick={handleClose}
                  className={btnSecondaryClass}
                  disabled={isSavingTransport}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isSavingTransport || hasSelectedDispatchTransport
                  }
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {isSavingTransport
                    ? isEditMode
                      ? "Saving Transport..."
                      : "Planning Transport..."
                    : isEditMode
                      ? "Save Transport"
                      : hasSelectedDispatchTransport
                        ? "Transport Created"
                        : "Plan & Transport"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </LargeModalBackdrop>
  );
}
