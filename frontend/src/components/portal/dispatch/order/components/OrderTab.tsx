import React, { useMemo } from "react";
import { DashboardCard } from "@/components/widgets";
import { useGetPartyQuery } from "@/store/api";

function partyIdFromDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  const p = detail.party;
  if (typeof p === "string") return p.trim();
  if (p && typeof p === "object" && "_id" in p)
    return String((p as { _id: unknown })._id ?? "");
  return "";
}

function formatStructuredAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "—";
  const a = addr as Record<string, unknown>;
  const parts: string[] = [];
  if (a.address_line_1) parts.push(String(a.address_line_1).trim());
  if (a.address_line_2) parts.push(String(a.address_line_2).trim());
  const cityLine = [a.city, a.state, a.pincode]
    .map((x) => (x ? String(x).trim() : ""))
    .filter(Boolean)
    .join(", ");
  if (cityLine) parts.push(cityLine);
  if (a.country && String(a.country).trim() !== "India") {
    parts.push(String(a.country).trim());
  }
  return parts.length ? parts.join("\n") : "—";
}

interface OrderTabProps {
  detail: Record<string, unknown> | null;
  status: string;
  formatMoney: (v: unknown) => string;
  readOnlyItems: unknown[];
}

export function OrderTab({
  detail,
  status,
  formatMoney,
  readOnlyItems,
}: OrderTabProps) {
  if (!detail) return null;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <DashboardCard
            title="Order Items"
            description="Catalog lines, quantities, prices, and line totals."
          >
            <div className="space-y-5 text-sm">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 font-sans">
                  Line items
                </h3>
                {!readOnlyItems.length ? (
                  <p className="text-slate-500 dark:text-slate-400 font-sans">No lines.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md ring-1 ring-slate-200/90 dark:ring-white/10">
                    <table className="w-full text-left text-xs font-sans">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-medium">
                        <tr>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2 text-center">Qty</th>
                          <th className="px-3 py-2 text-right">Price</th>
                          <th className="px-3 py-2 text-right">Line total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/80 dark:divide-white/10">
                        {readOnlyItems.map((lineRaw, idx) => {
                          const line = lineRaw as Record<string, any>;
                          const name =
                            typeof line.product_name === "string"
                              ? line.product_name
                              : "—";
                          const qty = line.ordered_quantity ?? line.quantity;
                          const price = line.unit_price;
                          const lt = line.total_amount;
                          const key =
                            line._id != null ? String(line._id) : `line-${idx}`;
                          return (
                            <tr key={key} className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300">
                              <td className="max-w-[200px] px-3 py-2">
                                <span className="line-clamp-2 font-medium text-slate-900 dark:text-slate-100">{name}</span>
                                {typeof line.sku === "string" && line.sku ? (
                                  <span className="mt-0.5 block text-2xs text-slate-400 font-sans">
                                    SKU {line.sku}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-center tabular-nums">
                                {String(qty ?? "—")}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatMoney(price)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-mono">
                                {formatMoney(lt)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </DashboardCard>
        </div>

        <div className="space-y-6">
          <DashboardCard
            title="Financial Breakdown"
            description="Aggregated totals and payment state."
          >
            <div className="space-y-4 text-sm font-normal font-sans">
              <div className="flex justify-between border-b border-slate-100 pb-2 font-semibold text-slate-900 dark:border-white/5 dark:text-slate-50">
                <span>Grand Total</span>
                <span className="font-mono">{formatMoney(detail.grand_total)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-white/5">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-mono">{formatMoney(detail.subtotal)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-white/5">
                <span className="text-slate-500">GST</span>
                <span className="font-mono">{formatMoney(detail.gst_amount)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-white/5">
                <span className="text-slate-500">Discount</span>
                <span className="font-mono">-{formatMoney(detail.discount_amount)}</span>
              </div>
            </div>
          </DashboardCard>
        </div>
      </div>
    </>
  );
}
