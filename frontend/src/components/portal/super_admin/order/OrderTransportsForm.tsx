"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { RefreshCw, Save, X } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  useListDriversQuery,
  useListTransportAgentsQuery,
  useListVehiclesQuery,
} from "@/store/api";
import {
  NamedOption,
  refId,
  toDateInput,
  formatDateOnly,
} from "./utils";

type OrderTransportsFormProps = {
  order: any;
  dispatches: any[];
  transports: any[];
  users: NamedOption[];
  saving: boolean;
  onClose: () => void;
  onCreate: (payload: Record<string, any>) => Promise<void>;
  onSave: (transportId: string, payload: Record<string, any>) => Promise<void>;
};

function pickList(raw: unknown): Record<string, any>[] {
  if (Array.isArray(raw)) return raw as Record<string, any>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, any>;
    if (Array.isArray(o.items)) return o.items as Record<string, any>[];
    if (Array.isArray(o.data)) return o.data as Record<string, any>[];
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

export function OrderTransportsForm({
  order,
  dispatches,
  transports,
  users,
  saving,
  onClose,
  onCreate,
  onSave,
}: OrderTransportsFormProps) {
  const orderId = refId(order._id || order.id);
  const sortedTransports = useMemo(
    () =>
      [...transports].sort((a, b) => {
        return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
      }),
    [transports],
  );

  const [selectedId, setSelectedId] = useState(() =>
    sortedTransports[0] ? refId(sortedTransports[0]._id || sortedTransports[0].id) : "new"
  );

  const transportAgentsQ = useListTransportAgentsQuery({ is_active: "true" });
  const driversQ = useListDriversQuery({});
  const vehiclesQ = useListVehiclesQuery({});

  const transportAgents = useMemo(() => pickList(transportAgentsQ.data), [transportAgentsQ.data]);
  const drivers = useMemo(() => pickList(driversQ.data), [driversQ.data]);
  const vehicles = useMemo(() => pickList(vehiclesQ.data), [vehiclesQ.data]);

  const selectedTransport = useMemo(
    () =>
      selectedId !== "new"
        ? sortedTransports.find((t) => refId(t._id || t.id) === selectedId) || null
        : null,
    [sortedTransports, selectedId],
  );

  // Form states
  const [dispatchId, setDispatchId] = useState("");
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
  const [dispatchDate, setDispatchDate] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [lrNumber, setLrNumber] = useState("");
  const [ewayBillNo, setEwayBillNo] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState("Kg");
  const [packedBoxes, setPackedBoxes] = useState("");
  const [openBoxes, setOpenBoxes] = useState("");
  const [totalQuantity, setTotalQuantity] = useState("");
  const [remarks, setRemarks] = useState("");
  const [shipmentStatus, setShipmentStatus] = useState("pending");

  const selectedTransportAgent = useMemo(() => {
    if (!transportAgentId) return null;
    return transportAgents.find((a: any) => refId(a._id || a.id) === transportAgentId) ?? null;
  }, [transportAgentId, transportAgents]);

  const transportAgentType = String(selectedTransportAgent?.agent_type ?? "third_party");
  const isInternalFleet = transportAgentType === "internal_fleet";

  const filteredVehicles = useMemo(() => {
    if (!transportAgentId) return [];
    return vehicles.filter((v: any) => refId(v.transport_agent) === transportAgentId);
  }, [vehicles, transportAgentId]);

  const filteredDrivers = useMemo(() => {
    if (!transportAgentId) return [];
    return drivers.filter((d: any) => refId(d.transport_agent) === transportAgentId);
  }, [drivers, transportAgentId]);

  const resetForm = useCallback(() => {
    setDispatchId(dispatches[0] ? refId(dispatches[0]._id || dispatches[0].id) : "");
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
    setDispatchDate(new Date().toISOString().split("T")[0]);
    setExpectedDeliveryDate("");
    setLrNumber("");
    setEwayBillNo("");
    setTrackingNumber("");
    setWeight("");
    setWeightUnit("Kg");
    setPackedBoxes("");
    setOpenBoxes("");
    setTotalQuantity("");
    setRemarks("");
    setShipmentStatus("pending");
  }, [dispatches]);

  // Load selected transport details
  useEffect(() => {
    if (selectedId === "new") {
      resetForm();
      return;
    }
    if (!selectedTransport) return;

    setDispatchId(refId(selectedTransport.dispatch));
    setTransportAgentId(refId(selectedTransport.transport_agent));
    setTransporterName(selectedTransport.transporter_name || "");
    setTransporterPhone(selectedTransport.transporter_phone || "");
    setVehicleId(refId(selectedTransport.vehicle));
    setDriverId(refId(selectedTransport.driver));
    setVehicleNo(selectedTransport.vehicle_no || "");
    setDriverName(selectedTransport.driver_name || "");
    setDriverPhone(selectedTransport.driver_phone || "");
    setSourceLocation(selectedTransport.source_location || "");
    setDestinationLocation(selectedTransport.destination_location || "");
    setRouteDetails(selectedTransport.route_details || "");
    setDispatchDate(toDateInput(selectedTransport.dispatch_date));
    setExpectedDeliveryDate(toDateInput(selectedTransport.expected_delivery_date));
    setLrNumber(selectedTransport.lr_number || "");
    setEwayBillNo(selectedTransport.eway_bill_no || "");
    setTrackingNumber(selectedTransport.tracking_number || "");
    setWeight(selectedTransport.weight != null ? String(selectedTransport.weight) : "");
    setWeightUnit(selectedTransport.weight_unit || "Kg");
    setPackedBoxes(selectedTransport.packed_boxes != null ? String(selectedTransport.packed_boxes) : "");
    setOpenBoxes(selectedTransport.open_boxes != null ? String(selectedTransport.open_boxes) : "");
    setTotalQuantity(selectedTransport.total_quantity != null ? String(selectedTransport.total_quantity) : "");
    setRemarks(selectedTransport.remarks || "");
    setShipmentStatus(selectedTransport.shipment_status || "pending");
  }, [selectedId, selectedTransport, resetForm]);

  // Auto-fill transporter name and phone if third-party agent changes
  useEffect(() => {
    if (selectedTransportAgent && !isInternalFleet) {
      setTransporterName(selectedTransportAgent.agent_name || "");
      setTransporterPhone(selectedTransportAgent.mobile || "");
    }
  }, [selectedTransportAgent, isInternalFleet]);

  // Auto-fill driver / vehicle details if selected from list
  useEffect(() => {
    if (vehicleId) {
      const vObj = vehicles.find((v) => refId(v._id || v.id) === vehicleId);
      if (vObj) setVehicleNo(vObj.vehicle_no || "");
    }
  }, [vehicleId, vehicles]);

  useEffect(() => {
    if (driverId) {
      const dObj = drivers.find((d) => refId(d._id || d.id) === driverId);
      if (dObj) {
        setDriverName(dObj.driver_name || "");
        setDriverPhone(dObj.mobile || "");
      }
    }
  }, [driverId, drivers]);

  const handleSave = async () => {
    if (!dispatchId) {
      toast.error("Linked dispatch reference is required");
      return;
    }
    if (!transportAgentId) {
      toast.error("Transport agent is required");
      return;
    }

    const payload: Record<string, any> = {
      order: orderId,
      dispatch: dispatchId,
      transport_agent: transportAgentId,
      transporter_type: isInternalFleet ? "internal" : "external",
      transporter_name: transporterName.trim() || undefined,
      transporter_phone: transporterPhone.trim() || undefined,
      source_location: sourceLocation.trim() || undefined,
      destination_location: destinationLocation.trim() || undefined,
      route_details: routeDetails.trim() || undefined,
      dispatch_date: dispatchDate ? new Date(dispatchDate).toISOString() : undefined,
      expected_delivery_date: expectedDeliveryDate ? new Date(expectedDeliveryDate).toISOString() : undefined,
      remarks: remarks.trim() || undefined,
      lr_number: lrNumber.trim() || undefined,
      eway_bill_no: ewayBillNo.trim() || undefined,
      tracking_number: trackingNumber.trim() || undefined,
      weight: weight ? Number(weight) : undefined,
      weight_unit: weightUnit || undefined,
      packed_boxes: optionalWholeNumber(packedBoxes),
      open_boxes: optionalWholeNumber(openBoxes),
      total_quantity: optionalWholeNumber(totalQuantity),
      shipment_status: shipmentStatus,
    };

    if (isInternalFleet) {
      payload.vehicle = vehicleId || undefined;
      payload.driver = driverId || undefined;
      payload.vehicle_no = vehicleNo || undefined;
      payload.driver_name = driverName || undefined;
      payload.driver_phone = driverPhone || undefined;
    }

    if (selectedId === "new") {
      await onCreate(payload);
    } else {
      await onSave(selectedId, payload);
    }
  };

  const inputClass =
    "w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs outline-none focus:border-amber-500";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/40">
          <div>
            <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
              Order Transports — {order.order_no || orderId}
            </h3>
            <p className="text-2xs text-amber-800/80 dark:text-amber-200/70">
              Manage transport shipments linked to dispatches. Create new or edit existing details.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4 font-sans">
          <div className="flex flex-wrap gap-2 items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
            <div className="flex flex-wrap gap-2">
              {sortedTransports.map((t) => {
                const id = refId(t._id || t.id);
                const active = id === selectedId;
                const label =
                  String(t.lr_number || "").trim() ||
                  `Transport ${formatDateOnly(t.createdAt)}`;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedId(id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-amber-600 text-white shadow"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setSelectedId("new")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                selectedId === "new"
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
              }`}
            >
              + Create New Transport
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 space-y-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Linked Dispatch Batch *
                </label>
                <select
                  value={dispatchId}
                  onChange={(e) => setDispatchId(e.target.value)}
                  className={inputClass}
                  required
                >
                  <option value="">— Select Dispatch —</option>
                  {dispatches.map((d) => (
                    <option key={refId(d._id || d.id)} value={refId(d._id || d.id)}>
                      {String(d.dispatch_no || d.bill_number || "Draft")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Transport Agent *
                </label>
                <select
                  value={transportAgentId}
                  onChange={(e) => setTransportAgentId(e.target.value)}
                  className={inputClass}
                  required
                >
                  <option value="">— Select Agent —</option>
                  {transportAgents.map((a) => (
                    <option key={refId(a._id || a.id)} value={refId(a._id || a.id)}>
                      {a.agent_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Shipment Status
                </label>
                <select
                  value={shipmentStatus}
                  onChange={(e) => setShipmentStatus(e.target.value)}
                  className={inputClass}
                >
                  <option value="pending">pending</option>
                  <option value="in_transit">in_transit</option>
                  <option value="out_for_delivery">out_for_delivery</option>
                  <option value="delivered">delivered</option>
                  <option value="returned">returned</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  LR Number
                </label>
                <input
                  type="text"
                  value={lrNumber}
                  onChange={(e) => setLrNumber(e.target.value)}
                  className={inputClass}
                  placeholder="LR-XXXX"
                />
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Transporter Name
                </label>
                <input
                  type="text"
                  value={transporterName}
                  onChange={(e) => setTransporterName(e.target.value)}
                  className={inputClass}
                  disabled={isInternalFleet}
                />
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Transporter Phone
                </label>
                <input
                  type="text"
                  value={transporterPhone}
                  onChange={(e) => setTransporterPhone(e.target.value)}
                  className={inputClass}
                  disabled={isInternalFleet}
                />
              </div>

              {isInternalFleet && (
                <>
                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Vehicle
                    </label>
                    <select
                      value={vehicleId}
                      onChange={(e) => setVehicleId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">— Select Vehicle —</option>
                      {filteredVehicles.map((v) => (
                        <option key={refId(v._id || v.id)} value={refId(v._id || v.id)}>
                          {v.vehicle_no} ({v.model || "Default"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                      Driver
                    </label>
                    <select
                      value={driverId}
                      onChange={(e) => setDriverId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">— Select Driver —</option>
                      {filteredDrivers.map((d) => (
                        <option key={refId(d._id || d.id)} value={refId(d._id || d.id)}>
                          {d.driver_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  E-Way Bill No
                </label>
                <input
                  type="text"
                  value={ewayBillNo}
                  onChange={(e) => setEwayBillNo(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Tracking Number
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Dispatch Date
                </label>
                <input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Expected Delivery Date
                </label>
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Source Location
                </label>
                <input
                  type="text"
                  value={sourceLocation}
                  onChange={(e) => setSourceLocation(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Destination Location
                </label>
                <input
                  type="text"
                  value={destinationLocation}
                  onChange={(e) => setDestinationLocation(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Route Details
                </label>
                <input
                  type="text"
                  value={routeDetails}
                  onChange={(e) => setRouteDetails(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Weight
                </label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Weight Unit
                </label>
                <select
                  value={weightUnit}
                  onChange={(e) => setWeightUnit(e.target.value)}
                  className={inputClass}
                >
                  <option value="Kg">Kg</option>
                  <option value="Ton">Ton</option>
                  <option value="Gram">Gram</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Packed Boxes
                </label>
                <input
                  type="number"
                  value={packedBoxes}
                  onChange={(e) => setPackedBoxes(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Open Boxes
                </label>
                <input
                  type="number"
                  value={openBoxes}
                  onChange={(e) => setOpenBoxes(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Total Quantity
                </label>
                <input
                  type="number"
                  value={totalQuantity}
                  onChange={(e) => setTotalQuantity(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-4">
                <label className="mb-1 block text-2xs font-semibold text-slate-500 uppercase">
                  Remarks / Notes
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 shrink-0 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-950 dark:text-slate-355 dark:hover:bg-white/5"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {saving ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {selectedId === "new" ? "Create transport" : "Save transport"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
