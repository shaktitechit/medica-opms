"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardCard } from "@/components/widgets";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCreateTransportMutation,
  useListDriversQuery,
  useListTransportAgentsQuery,
  useListVehiclesQuery,
  useTransitionOrderMutation,
  useListOrderApprovalsQuery,
} from "@/store/api";
import { formatAgentType } from "../../fleetDisplay";
import { groupAccountDispatchesByRelease } from "@/components/portal/account/order/components/accountDispatchAvailability";
import { useAppSelector } from "@/store/hooks";
import { publicApiOrigin } from "@/lib/env";

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

function resolveFileUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${publicApiOrigin()}${normalized}`;
}

function billDocumentMeta(
  billDocument: unknown,
): { name: string; url: string } | null {
  if (!billDocument) return null;
  if (typeof billDocument === "object" && billDocument !== null) {
    const doc = billDocument as Record<string, unknown>;
    const url = String(doc.url ?? "");
    const name = String(doc.original_name ?? doc.file_name ?? "Bill document");
    if (url) return { name, url };
  }
  return null;
}

function formatDateOnly(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString();
}

interface DispatchesTabProps {
  dispatches: any[];
  transports?: any[];
  isFetching: boolean;
  isPatchingDispatch: boolean;
  onUpdateStatus: (dispatchId: string, nextStatus: string) => void;
  formatDate: (v: unknown) => string;
  userNameById?: Record<string, string>;
  orderItems?: any[];
  orderId: string;
  orderStatus: string;
  expectedDeliveryDate?: string;
  shippingAddress?: any;
  onRefetch?: () => void;
}

export function DispatchesTab({
  dispatches,
  transports = [],
  isFetching,
  isPatchingDispatch,
  onUpdateStatus,
  formatDate,
  userNameById,
  orderItems = [],
  orderId,
  orderStatus,
  expectedDeliveryDate,
  shippingAddress,
  onRefetch,
}: DispatchesTabProps) {
  // Create Transport form state variables
  const [isCreateTransportModalOpen, setIsCreateTransportModalOpen] = useState(false);
  const [transportDispatchId, setTransportDispatchId] = useState("");
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

  const [createTransport, { isLoading: isCreatingTransport }] = useCreateTransportMutation();
  const [transitionOrder, { isLoading: isTransitioning }] = useTransitionOrderMutation();
  const transportAgentsQ = useListTransportAgentsQuery(
    { is_active: "true" },
    { skip: !isCreateTransportModalOpen }
  );
  const driversQ = useListDriversQuery(
    {},
    { skip: !isCreateTransportModalOpen }
  );
  const vehiclesQ = useListVehiclesQuery(
    {},
    { skip: !isCreateTransportModalOpen }
  );

  const token = useAppSelector((state) => state.auth.token);
  const approvalsQ = useListOrderApprovalsQuery(
    { order: orderId },
    { skip: !orderId },
  );
  const approvals = useMemo(() => pickList(approvalsQ.data), [approvalsQ.data]);

  const currentUser = useAppSelector((state) => state.auth.user);
  const currentUserId = useMemo(
    () => String(currentUser?._id ?? currentUser?.id ?? ""),
    [currentUser],
  );

  const filteredDispatchesForUser = useMemo(() => {
    return dispatches.filter((disp) => {
      const assigneeId = typeof disp.dispatch_assignee_user === "object" && disp.dispatch_assignee_user !== null
        ? String((disp.dispatch_assignee_user as any)._id ?? (disp.dispatch_assignee_user as any).id ?? "")
        : String(disp.dispatch_assignee_user ?? "");
      return assigneeId === currentUserId;
    });
  }, [dispatches, currentUserId]);

  const releaseGroups = useMemo(
    () => groupAccountDispatchesByRelease(filteredDispatchesForUser, approvals),
    [filteredDispatchesForUser, approvals],
  );


  const handleViewBillDocument = useCallback(
    async (fileUrl: string) => {
      try {
        const response = await fetch(resolveFileUrl(fileUrl), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error("Failed to view file");
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
      } catch {
        toast.error("Failed to view bill document");
      }
    },
    [token],
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

  const handleCloseCreateTransportModal = useCallback(() => {
    setIsCreateTransportModalOpen(false);
    setTransportDispatchId("");
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
  }, []);

  const handleOpenCreateTransportForDispatch = useCallback((dispId: string) => {
    setTransportDispatchId(dispId);
    setIsCreateTransportModalOpen(true);
  }, []);

  // Pre-populate destination location and expected delivery date
  useEffect(() => {
    if (!isCreateTransportModalOpen) return;

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
  }, [isCreateTransportModalOpen, shippingAddress, expectedDeliveryDate, destinationLocation, expectedDelivDate]);

  // Pre-populate source location and dispatch date when a dispatch is selected
  useEffect(() => {
    if (!isCreateTransportModalOpen || !transportDispatchId) return;

    const disp = filteredDispatchesForUser.find((d: any) => String(d._id ?? d.id) === transportDispatchId);
    if (disp) {
      if (!sourceLocation) {
        const warehouseVal = (disp as any).warehouse_location || (disp as any).warehouse || "";
        const locationStr = typeof warehouseVal === "object" && warehouseVal !== null
          ? ((warehouseVal as any).name || (warehouseVal as any)._id || "")
          : String(warehouseVal);
        setSourceLocation(locationStr);
      }
      if (!transportDispatchDate) {
        const dDate = (disp as any).dispatched_at ?? (disp as any).dispatch_date ?? new Date().toISOString();
        setTransportDispatchDate(new Date(String(dDate)).toISOString().split("T")[0]);
      }
    }
  }, [isCreateTransportModalOpen, transportDispatchId, filteredDispatchesForUser, sourceLocation, transportDispatchDate]);



  const hasSelectedDispatchTransport = useMemo(() => {
    if (!transportDispatchId) return false;
    return transports.some((tr: any) => {
      const trDispatchId = typeof tr.dispatch === "object" && tr.dispatch !== null
        ? String(tr.dispatch._id ?? tr.dispatch.id ?? "")
        : String(tr.dispatch ?? "");
      const isReturned = String(tr.shipment_status ?? tr.status ?? "") === "returned";
      return trDispatchId === transportDispatchId && !isReturned;
    });
  }, [transportDispatchId, transports]);

  const handleCreateTransport = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId) return;
    if (!transportDispatchId) {
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
        dispatch: transportDispatchId,
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
        dispatch_date: transportDispatchDate ? new Date(transportDispatchDate).toISOString() : undefined,
        expected_delivery_date: expectedDelivDate ? new Date(expectedDelivDate).toISOString() : undefined,
        remarks: transportRemarks.trim() || undefined,
        lr_number: lrNumber.trim() || undefined,
        eway_bill_no: ewayBillNo.trim() || undefined,
        tracking_number: trackingNumber.trim() || undefined,
        weight: weight ? Number(weight) : undefined,
        weight_unit: weightUnit || undefined,
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

        const selectedVehicle = vehicles.find((v: any) => String(v._id ?? v.id ?? "") === vehicleId) as any;
        const selectedDriver = drivers.find((d: any) => String(d._id ?? d.id ?? "") === driverId) as any;
        if (selectedVehicle) {
          payload.vehicle_no = selectedVehicle.vehicle_no || "";
        }
        if (selectedDriver) {
          payload.driver_name = selectedDriver.name || "";
          payload.driver_phone = selectedDriver.phone || "";
        }
      } else {
        // For third-party/courier, linked vehicle/driver are optional.
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

      if (orderStatus === "full_dispatch_created" || orderStatus === "partial_dispatch_created") {
        try {
          const activeDispatches = dispatches.filter((d: any) => d.dispatch_status !== "cancelled");
          const transportedDispatchIds = new Set((transports || []).map((t: any) => String(t.dispatch)));
          transportedDispatchIds.add(String(transportDispatchId));
          const allTransported = activeDispatches.length > 0 &&
            activeDispatches.every((d: any) => transportedDispatchIds.has(String(d._id ?? d.id)));

          const nextStatus = (orderStatus === "full_dispatch_created" && allTransported)
            ? "fully_transported"
            : "partially_transported";

          await transitionOrder({
            id: orderId,
            body: {
              next_status: nextStatus,
              remarks: `Planned and arranged transport via ${payload.vehicle_no || "Third-party transporter"}`,
            },
          }).unwrap();
        } catch (transErr) {
          console.error("Order status transition failed:", transErr);
        }
      }

      toast.success("Transport recorded and order status updated successfully.");
      handleCloseCreateTransportModal();
      if (onRefetch) onRefetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  }, [
    orderId,
    transportDispatchId,
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
    orderStatus,
    transitionOrder,
    handleCloseCreateTransportModal,
    onRefetch,
  ]);

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Recorded Dispatch Batches"
        description="View dispatch details, dispatched items list, and manage dispatch status."
      >
        {isFetching || approvalsQ.isLoading ? (
          <p className="text-sm text-slate-500 font-sans">Loading dispatches...</p>
        ) : filteredDispatchesForUser.length === 0 ? (
          <p className="text-sm text-slate-500 font-sans">No dispatch batches recorded yet.</p>
        ) : (
          <div className="space-y-8 font-sans">
            {releaseGroups.map((group) => {
              const activeReleaseDispatches = group.dispatches.filter((disp) => {
                const status = String(disp.dispatch_status ?? disp.status ?? "partially_dispatched");
                return status !== "cancelled";
              });
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
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {group.dispatches.map((disp: any) => {
                      const dispId = String(disp._id ?? disp.id ?? "");
                      const dispatchStatus = String(disp.dispatch_status ?? disp.status ?? "partially_dispatched");
                      const dispatchItems = Array.isArray(disp.dispatch_items) ? disp.dispatch_items : disp.items || [];

                      // Resolve packing and dispatch staff names
                      const packedByVal = disp.packed_by;
                      const dispatchedByVal = disp.dispatched_by;

                      const packedByName = typeof packedByVal === "object" && packedByVal !== null
                        ? (packedByVal.name || packedByVal.username || "")
                        : userNameById && typeof packedByVal === "string"
                          ? (userNameById[packedByVal] || packedByVal)
                          : "";

                      const dispatchedByName = typeof dispatchedByVal === "object" && dispatchedByVal !== null
                        ? (dispatchedByVal.name || dispatchedByVal.username || "")
                        : userNameById && typeof dispatchedByVal === "string"
                          ? (userNameById[dispatchedByVal] || dispatchedByVal)
                          : "";

                      // Check if transport records match this dispatch
                      const dispatchTransports = transports.filter((tr) => {
                        const trDispatchId = typeof tr.dispatch === "object" && tr.dispatch !== null
                          ? String(tr.dispatch._id ?? tr.dispatch.id ?? "")
                          : String(tr.dispatch ?? "");
                        return trDispatchId === dispId;
                      });

                      // Find active transport (non-returned)
                      const activeTransport = dispatchTransports.find((tr) => {
                        const status = String(tr.shipment_status ?? tr.status ?? "");
                        return status !== "returned";
                      });

                      // Display active transport if it exists, otherwise display the latest returned transport
                      const transport = activeTransport || dispatchTransports[dispatchTransports.length - 1];
                      const hasTransport = !!activeTransport;

                      const billDoc = billDocumentMeta(disp.bill_document);
                      const billNumber = String(disp.bill_number ?? "").trim();
                      const billingDate = disp.billing_date;

                      const dispatchAssigneeName = (() => {
                        const val = disp.dispatch_assignee_user;
                        if (!val) return "—";
                        if (typeof val === "object" && val !== null) {
                          return String((val as any).name || (val as any).username || "—");
                        }
                        if (typeof val === "string" && userNameById) {
                          return userNameById[val] || val;
                        }
                        return "—";
                      })();

                      return (
                <div
                  key={dispId}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-white/5">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
                          {disp.dispatch_no || "Batch Details"}
                        </h4>
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

                    <div className="flex items-center gap-2">
                      {dispatchStatus === "cancelled" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          Cancelled
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenCreateTransportForDispatch(dispId)}
                            disabled={hasTransport || isPatchingDispatch}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition ${hasTransport
                                ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed"
                                : "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                              }`}
                          >
                            {hasTransport ? (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Transport Created
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M13 16h6a1 1 0 001-1v-4a1 1 0 00-.316-.707l-4-4A1 1 0 0015 6h-2m6 10a2 2 0 100-4 2 2 0 000 4z" />
                                </svg>
                                Create Transport
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => onUpdateStatus(dispId, "cancelled")}
                            disabled={hasTransport || isPatchingDispatch}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition ${hasTransport
                                ? "bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed"
                                : "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:hover:bg-rose-900/30"
                              }`}
                            title={hasTransport ? "Cannot cancel once a transport assignment exists" : "Cancel this dispatch batch"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-6 mt-4 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                        Dispatched Items
                      </h5>
                      <div className="overflow-x-auto rounded-lg border border-slate-200/60 dark:border-white/5">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-medium">
                            <tr>
                              <th className="px-3 py-2">Product</th>
                              <th className="px-3 py-2 text-center w-24">Ordered</th>
                              <th className="px-3 py-2 text-right w-24">This Batch</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {dispatchItems.map((item: any, idx: number) => {
                              const matchItem = orderItems.find(
                                (oi: any) => String(oi._id ?? oi.id ?? "") === String(item.order_item_id)
                              );
                              const productName = matchItem?.product_name || item.product_name || item.product?.product_name || "—";
                              const orderedQty = matchItem
                                ? (matchItem.ordered_quantity ?? matchItem.quantity ?? 0)
                                : (item.ordered_quantity ?? "—");

                              return (
                                <tr key={String(item.order_item_id || idx)} className="bg-white dark:bg-slate-900">
                                  <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                                    {productName}
                                  </td>
                                  <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">
                                    {orderedQty}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-blue-600 dark:text-blue-400">
                                    {item.dispatched_quantity ?? item.dispatch_quantity ?? "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg bg-slate-50/50 p-4 border border-slate-100 dark:bg-slate-950/10 dark:border-white/5 text-xs">
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Bill Number
                        </span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {billNumber || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Billing Date
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {formatDateOnly(billingDate)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Bill Document
                        </span>
                        {billDoc ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleViewBillDocument(billDoc.url)}
                              className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-white/10 dark:text-blue-300 dark:hover:bg-blue-950/30"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDownloadBillDocument(billDoc.url, billDoc.name)}
                              className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                            >
                              Download
                            </button>
                            <span className="block w-full truncate text-[10px] text-slate-500 dark:text-slate-400" title={billDoc.name}>
                              {billDoc.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">—</span>
                        )}
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Assigned Dispatch User
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {dispatchAssigneeName}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Warehouse Location
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {disp.warehouse_location || disp.warehouse || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Remarks
                        </span>
                        <span className="italic text-slate-800 dark:text-slate-200">
                          {disp.remarks || "No remarks"}
                        </span>
                      </div>
                      {packedByName && (
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                            Packed By
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {packedByName} {disp.packed_at && `on ${formatDate(disp.packed_at)}`}
                          </span>
                        </div>
                      )}
                      {dispatchedByName && (
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
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
                        Transit & Logistics Details
                      </h5>
                      <div className="grid gap-4 rounded-lg bg-slate-50/50 p-4 border border-slate-100 dark:bg-slate-950/20 dark:border-white/5 sm:grid-cols-3 text-xs font-sans">
                        <div className="space-y-2">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Transport Agent</span>
                            {(() => {
                              const agentId =
                                transport.transport_agent && typeof transport.transport_agent === "object"
                                  ? String(transport.transport_agent._id ?? transport.transport_agent.id ?? "")
                                  : typeof transport.transport_agent === "string"
                                    ? transport.transport_agent
                                    : "";

                              const agentObj: Record<string, unknown> | null =
                                transportAgents.find(
                                  (a) => String(a._id ?? a.id ?? "") === agentId
                                ) ||
                                (transport.transport_agent && typeof transport.transport_agent === "object"
                                  ? (transport.transport_agent as Record<string, unknown>)
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
                                      <span className="text-[10px] text-slate-500 capitalize block mt-0.5">
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
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Shipment No</span>
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{transport.shipment_no}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Shipment Status</span>
                            <span className={`inline-flex items-center rounded-full mt-1 px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300`}>
                              {String(transport.shipment_status ?? "created").replace(/_/g, " ").toUpperCase()}
                            </span>
                          </div>
                          {transport.source_location && (
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Source Location</span>
                              <span className="text-slate-800 dark:text-slate-200">{transport.source_location}</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Driver Details</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block">{transport.driver_name || "—"}</span>
                            {(transport.driver_mobile || transport.driver_phone) && (
                              <span className="text-slate-500 block mt-0.5">{transport.driver_mobile || transport.driver_phone}</span>
                            )}
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Vehicle Number</span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100 uppercase">{transport.vehicle_number || transport.vehicle_no || "—"}</span>
                          </div>
                          {(transport.weight !== undefined && transport.weight !== null) && (
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Shipment Weight</span>
                              <span className="font-semibold text-slate-900 dark:text-slate-100">{transport.weight} {transport.weight_unit || "Kg"}</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">LR / E-way Bill</span>
                            <span className="text-slate-800 dark:text-slate-200 font-mono">
                              LR: {transport.lr_number || "—"} / Eway: {transport.eway_bill_no || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Delivery</span>
                            <span className="text-slate-800 dark:text-slate-200">
                              {formatDate(transport.expected_delivery_date)}
                            </span>
                          </div>
                          {transport.tracking_number && (
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Tracking Number</span>
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

      {isCreateTransportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 font-sans">
                  Plan & Transport Details
                </h3>
                <button
                  type="button"
                  onClick={handleCloseCreateTransportModal}
                  className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-1 text-[11px] font-sans text-slate-500 dark:text-slate-400">
                <span>Configure transport details for this shipment dispatch batch.</span>
              </div>
            </div>

            {filteredDispatchesForUser.length === 0 ? (
              <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-955/20 dark:border-amber-900/30 text-amber-800 dark:text-amber-300 text-sm font-sans">
                ⚠️ <strong>No dispatches found:</strong> You must create at least one dispatch batch before arranging transport logistics.
              </div>
            ) : (
              <form onSubmit={handleCreateTransport} className="mt-4 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 font-sans">
                    <label htmlFor="transport-dispatch-ref" className={labelClass}>Dispatch Reference *</label>
                    <select
                      id="transport-dispatch-ref"
                      value={transportDispatchId}
                      onChange={(e) => setTransportDispatchId(e.target.value)}
                      className={`${inputClass} bg-slate-50/50 dark:bg-slate-900/50 cursor-not-allowed opacity-90`}
                      disabled
                      required
                    >
                      <option value="">— Select Dispatch Batch —</option>
                      {filteredDispatchesForUser.map((d: any) => {
                        const did = String(d._id ?? d.id ?? "");
                        return (
                          <option key={did} value={did}>
                            {d.dispatch_no} ({String(d.dispatch_status ?? d.status ?? "draft").replace(/_/g, " ")})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="space-y-1.5 font-sans">
                    <label htmlFor="transport-agent-select" className={labelClass}>Transport Agent *</label>
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
                      <label htmlFor="internal-vehicle" className={labelClass}>Vehicle *</label>
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
                              {v.vehicle_no} ({v.vehicle_type} - {String(v.capacity_kg ?? "N/A")}kg) — {String(v.status || "available").replace(/_/g, " ")}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="space-y-1.5 font-sans">
                      <label htmlFor="internal-driver" className={labelClass}>Driver *</label>
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
                        <label htmlFor="ext-transporter-name" className={labelClass}>Transporter / Company Name</label>
                        <input
                          id="ext-transporter-name"
                          type="text"
                          onChange={(e) => setTransporterName(e.target.value)}
                          className={inputClass}
                          placeholder="E.g., FedEx, DHL"
                          value={
                            String(selectedTransportAgent?.agent_name ?? transporterName)
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="ext-transporter-phone" className={labelClass}>Transporter Contact Phone</label>
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
                        <label htmlFor="ext-vehicle-id" className={labelClass}>Linked Vehicle (Optional)</label>
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
                        <label htmlFor="ext-vehicle-no" className={labelClass}>Vehicle Number</label>
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
                        <label htmlFor="ext-driver-id" className={labelClass}>Linked Driver (Optional)</label>
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
                        <label htmlFor="ext-driver-name" className={labelClass}>Driver Name</label>
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
                        <label htmlFor="ext-driver-phone" className={labelClass}>Driver Phone</label>
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
                    <label htmlFor="lr-number-input" className={labelClass}>LR Number</label>
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
                    <label htmlFor="eway-bill-input" className={labelClass}>E-way Bill No</label>
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
                    <label htmlFor="tracking-number-input" className={labelClass}>Tracking Number</label>
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
                    <label htmlFor="source-location-input" className={labelClass}>Source / Warehouse</label>
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
                    <label htmlFor="destination-location-input" className={labelClass}>Destination Address</label>
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
                    <label htmlFor="route-details-input" className={labelClass}>Route Details</label>
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
                    <label htmlFor="transport-date-input" className={labelClass}>Expected Dispatch Date</label>
                    <input
                      id="transport-date-input"
                      type="date"
                      value={transportDispatchDate}
                      onChange={(e) => setTransportDispatchDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="expected-delivery-input" className={labelClass}>Expected Delivery Date</label>
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
                    <label htmlFor="weight-input" className={labelClass}>Total Weight</label>
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
                    <label htmlFor="weight-unit-input" className={labelClass}>Weight Unit</label>
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

                <div className="space-y-1.5 font-sans">
                  <label htmlFor="transport-remarks-input" className={labelClass}>Remarks / Transit Notes</label>
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
                      onClick={handleCloseCreateTransportModal}
                      className={btnSecondaryClass}
                      disabled={isCreatingTransport || isTransitioning}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingTransport || isTransitioning || hasSelectedDispatchTransport}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                    >
                      {isCreatingTransport ? "Planning Transport..." : hasSelectedDispatchTransport ? "Transport Created" : "Plan & Transport"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
