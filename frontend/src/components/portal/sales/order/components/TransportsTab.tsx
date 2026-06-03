"use client";

import { useMemo } from "react";
import { DashboardCard } from "@/components/widgets";
import { useListTransportsQuery } from "@/store/api";

type TransportsTabProps = {
  orderId: string;
  detail: Record<string, any> | null;
  refetchOrder?: () => void;
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

export function TransportsTab({ orderId }: TransportsTabProps) {
  const transportsQ = useListTransportsQuery({ order: orderId });
  const transports = useMemo(() => pickList(transportsQ.data), [transportsQ.data]);

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Recorded Transport Logistics"
        description="View details of transporters, vehicles, drivers, route assignments, and current shipment status."
      >
        {transportsQ.isLoading ? (
          <p className="text-sm text-slate-500 font-sans">Loading transports...</p>
        ) : transports.length === 0 ? (
          <p className="text-sm text-slate-500 font-sans">No transport arrangements recorded yet.</p>
        ) : (
          <div className="space-y-6 font-sans">
            {transports.map((tr: any) => {
              const trId = String(tr._id ?? tr.id ?? "");
              const shipmentStatus = String(tr.shipment_status ?? tr.status ?? "created");
              const vehicleNumber = tr.vehicle_number ?? tr.vehicle_no;
              const driverMobile = tr.driver_mobile ?? tr.driver_phone;

              return (
                <div
                  key={trId}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 animate-fadeIn"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-white/5">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
                          {tr.shipment_no || vehicleNumber || "Transport Shipment"}
                        </h4>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            shipmentStatus === "delivered"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                              : shipmentStatus === "returned" || shipmentStatus === "delivery_failed"
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400"
                              : shipmentStatus === "in_transit" || shipmentStatus === "out_for_delivery"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                              : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                          }`}
                        >
                          {shipmentStatus.replace(/_/g, " ").toUpperCase()}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Dispatch Date: {formatDate(tr.dispatch_date)}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-6 mt-4 sm:grid-cols-3">
                    <div className="space-y-4">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Transporter Info
                      </h5>
                      <div>
                        <span className="block text-[10px] text-slate-400">Type</span>
                        <span className="text-sm font-semibold capitalize text-slate-800 dark:text-slate-200">
                          {tr.transporter_type}
                        </span>
                      </div>
                      {tr.transporter_type === "external" ? (
                        <>
                          <div>
                            <span className="block text-[10px] text-slate-400">Transporter Name</span>
                            <span className="text-sm text-slate-800 dark:text-slate-200">
                              {tr.transporter_name || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-slate-400">Phone</span>
                            <span className="text-sm text-slate-800 dark:text-slate-200">
                              {tr.transporter_phone || "—"}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs italic text-slate-400">Internal fleet delivery</div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Driver & Vehicle Details
                      </h5>
                      <div>
                        <span className="block text-[10px] text-slate-400">Vehicle Number</span>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase">
                          {vehicleNumber || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">Driver Name</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200">
                          {tr.driver_name || "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400">Driver Phone</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200">
                          {driverMobile || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                        Locations & Dates
                      </h5>
                      <div>
                        <span className="block text-[10px] text-slate-400">Route</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200 block">
                          From: {tr.source_location || "—"}
                        </span>
                        <span className="text-sm text-slate-800 dark:text-slate-200 block mt-0.5">
                          To: {tr.destination_location || "—"}
                        </span>
                      </div>
                      {tr.route_details && (
                        <div>
                          <span className="block text-[10px] text-slate-400">Route Details</span>
                          <span className="text-sm text-slate-800 dark:text-slate-200">
                            {tr.route_details}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="block text-[10px] text-slate-400">Expected Delivery</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200">
                          {formatDate(tr.expected_delivery_date)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {tr.remarks && (
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Remarks
                      </span>
                      <p className="text-xs text-slate-700 dark:text-slate-300 italic">
                        {tr.remarks}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

export default TransportsTab;
