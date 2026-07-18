"use client";

import { DashboardCard } from "@/components/widgets";

interface DeliveriesTabProps {
  deliveries: any[];
  isFetching: boolean;
  formatDate: (v: unknown) => string;
  orderItems?: any[];
}

export function DeliveriesTab({
  deliveries,
  isFetching,
  formatDate,
  orderItems = [],
}: DeliveriesTabProps) {
  return (
    <div className="space-y-6">
      <DashboardCard
        title="Recorded Shipment Deliveries"
        description="View logged delivery completions, receiving staff/client details, and overall remarks history."
      >
        {isFetching ? (
          <p className="text-sm text-slate-500 font-sans">Loading deliveries...</p>
        ) : deliveries.length === 0 ? (
          <p className="text-sm text-slate-500 font-sans">
            No delivery records compiled for this order yet.
          </p>
        ) : (
          <div className="space-y-8 font-sans">
            {deliveries.map((del: any) => {
              const delId = String(del._id ?? del.id ?? "");
              const deliveryNo = del.delivery_no || "Delivery Record";
              const status = del.delivery_status || "pending";
              const items = Array.isArray(del.delivery_items) ? del.delivery_items : [];
              
              const dispatchNo = del.dispatch && typeof del.dispatch === "object"
                ? del.dispatch.dispatch_no
                : "—";
                
              const transportNo = del.transport && typeof del.transport === "object"
                ? del.transport.shipment_no || del.transport.vehicle_number
                : "—";

              return (
                <div
                  key={delId}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 hover:shadow-md transition duration-200"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-white/5">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
                          {deliveryNo}
                        </h4>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            status === "delivered"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                              : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                          }`}
                        >
                          {status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Recorded: {formatDate(del.createdAt)}
                      </p>
                    </div>
                  </div>

                  {/* Delivery details & Items */}
                  <div className="grid gap-6 mt-4 sm:grid-cols-3">
                    <div className="sm:col-span-2 space-y-3">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Delivered Products Registry
                      </h5>
                      <div className="overflow-hidden rounded-lg border border-slate-200/60 dark:border-white/5">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200/60 dark:border-white/5">
                            <tr>
                              <th className="px-3 py-2">Product Name</th>
                              <th className="px-3 py-2 text-center w-28">Delivered Qty</th>
                              <th className="px-3 py-2">Remarks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-900">
                            {items.map((item: any, idx: number) => {
                              const itemId = typeof item.product === "object" && item.product !== null 
                                ? String(item.product._id ?? item.product.id ?? "") 
                                : String(item.product ?? "");
                              const matchItem = orderItems.find((oi: any) => {
                                const oiId = typeof oi.product === "object" && oi.product !== null 
                                  ? String(oi.product._id ?? oi.product.id ?? "") 
                                  : String(oi.product ?? "");
                                return oiId === itemId;
                              });
                              const productName = matchItem?.product_name || item.product?.product_name || "—";
                              return (
                                <tr key={idx} className="hover:bg-slate-50/20 dark:hover:bg-white/5 transition">
                                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                                    {productName}
                                  </td>
                                  <td className="px-3 py-2 text-center font-bold text-emerald-600 dark:text-emerald-400">
                                    {item.delivered_quantity}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                                    {item.remarks || "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-lg bg-slate-50/50 p-4 border border-slate-100 dark:bg-slate-950/10 dark:border-white/5 text-xs">
                      <div>
                        <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Recipient Information
                        </span>
                        <div className="space-y-0.5">
                          <div>
                            <span className="text-slate-400">Received By: </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {del.received_by || "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Actual Date: </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {formatDate(del.actual_delivery_date || del.delivered_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Linked References
                        </span>
                        <div className="space-y-0.5">
                          <div>
                            <span className="text-slate-400">Dispatch Batch: </span>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {dispatchNo}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Transport: </span>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {transportNo}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <span className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          Overall Remarks
                        </span>
                        <p className="italic text-slate-700 dark:text-slate-300">
                          {del.remarks || "No overall remarks provided."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
