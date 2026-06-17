"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCreateTransportMutation,
  useListDriversQuery,
  useListTransportAgentsQuery,
  useListVehiclesQuery,
} from "@/store/api";

type CreateTransportModalProps = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  dispatchId: string;
  dispatches: any[];
  transports?: any[];
  expectedDeliveryDate?: string;
  shippingAddress?: any;
  onCreated?: () => void;
};

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

function optionalWholeNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function sumDispatchItemQuantities(dispatch: Record<string, unknown>): number {
  const items = Array.isArray(dispatch.dispatch_items)
    ? dispatch.dispatch_items
    : Array.isArray(dispatch.items)
      ? dispatch.items
      : [];
  return items.reduce((sum, item) => {
    const row = item as Record<string, unknown>;
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

  useEffect(() => {
    if (!open) return;

    if (!destinationLocation && shippingAddress) {
      const a = shippingAddress as Record<string, any>;
      const parts: string[] = [];
      if (a.address_line_1) parts.push(String(a.address_line_1).trim());
      if (a.address_line_2) parts.push(String(a.address_line_2).trim());
      if (a.city) parts.push(String(a.city).trim());
      if (a.state) parts.push(String(a.state).trim());
      if (a.pincode) parts.push(String(a.pincode).trim());
      setDestinationLocation(parts.filter(Boolean).join(", "));
    }

    if (!expectedDelivDate && expectedDeliveryDate) {
      setExpectedDelivDate(new Date(String(expectedDeliveryDate)).toISOString().split("T")[0]);
    }
  }, [open, shippingAddress, expectedDeliveryDate, destinationLocation, expectedDelivDate]);

  useEffect(() => {
    if (!open || !dispatchId) return;

    const disp = dispatches.find((d: any) => String(d._id ?? d.id) === dispatchId);
    if (disp) {
      if (!sourceLocation) {
        const warehouseVal = (disp as any).warehouse_location || (disp as any).warehouse || "";
        const locationStr =
          typeof warehouseVal === "object" && warehouseVal !== null
            ? ((warehouseVal as any).name || (warehouseVal as any)._id || "")
            : String(warehouseVal);
        setSourceLocation(locationStr);
      }
      if (!transportDispatchDate) {
        const dDate =
          (disp as any).dispatched_at ??
          (disp as any).dispatch_date ??
          new Date().toISOString();
        setTransportDispatchDate(new Date(String(dDate)).toISOString().split("T")[0]);
      }
      setTotalQuantity((prev) => {
        if (prev.trim()) return prev;
        const qtyTotal = sumDispatchItemQuantities(disp as Record<string, unknown>);
        return qtyTotal > 0 ? String(qtyTotal) : prev;
      });
    }
  }, [open, dispatchId, dispatches, sourceLocation, transportDispatchDate]);

  const hasSelectedDispatchTransport = useMemo(() => {
    if (!dispatchId) return false;
    return transports.some((tr: any) => {
      const trDispatchId =
        typeof tr.dispatch === "object" && tr.dispatch !== null
          ? String(tr.dispatch._id ?? tr.dispatch.id ?? "")
          : String(tr.dispatch ?? "");
      const isReturned = String(tr.shipment_status ?? tr.status ?? "") === "returned";
      return trDispatchId === dispatchId && !isReturned;
    });
  }, [dispatchId, transports]);

  const handleCreateTransport = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!orderId) return;
      if (!dispatchId) {
        toast.error("Please select a dispatch reference.");
        return;
      }
      if (!transportAgentId) {
        toast.error("Please select a transport agent.");
        return;
      }

      try {
        const payload: Record<string, any> = {
          order: orderId,
          dispatch: dispatchId,
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

        await createTransport(payload).unwrap();

        toast.success("Transport recorded successfully.");
        handleClose();
        onCreated?.();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      }
    },
    [
      orderId,
      dispatchId,
      transportAgentId,
      isInternalFleet,
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
      handleClose,
      onCreated,
    ],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-3 dark:border-white/5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 font-sans">
              Plan & Transport Details
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
          <div className="flex items-center gap-1 text-[11px] font-sans text-slate-500 dark:text-slate-400">
            <span>Configure transport details for this shipment dispatch batch.</span>
          </div>
        </div>

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
                  value={dispatchId}
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
                  className={inputClass}
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
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
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
                  LR Number
                </label>
                <input
                  id="lr-number-input"
                  type="text"
                  value={lrNumber}
                  onChange={(e) => setLrNumber(e.target.value)}
                  className={inputClass}
                  placeholder="LR Shipment Number"
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
                  disabled={isCreatingTransport}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isCreatingTransport || hasSelectedDispatchTransport
                  }
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {isCreatingTransport
                    ? "Planning Transport..."
                    : hasSelectedDispatchTransport
                      ? "Transport Created"
                      : "Plan & Transport"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
