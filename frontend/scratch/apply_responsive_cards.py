import re

# File Paths
pages = {
    "sales": r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\sales\ListMyOrdersPage.tsx",
    "admin": r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\admin\order\ListAdminOrdersPage.tsx",
    "finance": r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\finance\order\ListFinanceOrdersPage.tsx",
    "dispatch": r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\dispatch\order\ListDispatchOrdersPage.tsx"
}

def apply_responsiveness(portal_name, file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Define the template for dynamic card rendering
    view_link = portal_name
    is_sales = (portal_name == "sales")

    card_loop_markup = f"""            <div className="p-4 flex flex-col gap-3.5 bg-slate-50/10 dark:bg-slate-955/10">
              {{paginatedOrders.map((o) => {{
                const id = orderKey(o);
                const ref =
                  typeof o.order_no === "string"
                    ? o.order_no
                    : typeof o.order_number === "string"
                      ? o.order_number
                      : id || "—";
                {"const total = Number(o.grand_total ?? o.total ?? 0);" if not is_sales else ""}
                const pri = typeof o.priority === "string" ? o.priority : "normal";
                const statusRaw = deriveOrderWorkflowStatus(o) || "draft";
                const isDraftRow = statusRaw === "draft";
                const statusDims = computeOrderStatusDimensions(
                  o as Record<string, unknown>,
                );
                const partyLabel = resolveOrderCounterparty(
                  o as Record<string, unknown>,
                  partyNameById,
                );

                const orderDateStr = formatDateShort((o as any).order_date ?? (o as any).created_at ?? (o as any).createdAt);
                const expectedDeliveryStr = formatDateShort((o as any).expected_delivery_date);

                let stripeColor = "bg-slate-350 dark:bg-slate-700";
                if (pri === "urgent") stripeColor = "bg-rose-500";
                else if (pri === "high") stripeColor = "bg-amber-500";
                else if (pri === "normal") stripeColor = "bg-blue-500";

                return (
                  <div
                    key={{id || ref}}
                    className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 transition-all duration-300 hover:shadow-md hover:border-blue-500/20 dark:border-white/10 dark:bg-slate-900 flex flex-col lg:flex-row lg:items-center justify-between gap-4 pl-5 animate-fadeIn"
                  >
                    {{/* Priority Accent Stripe */}}
                    <div className={{`absolute left-0 top-0 bottom-0 w-1.5 ${{stripeColor}}`}} />

                    {{/* Top Row: Order Info & Mobile Actions */}}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-white/5 lg:border-none lg:pb-0 lg:flex-row lg:items-center lg:justify-start lg:gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-50">
                          {{ref}}
                        </span>
                        {{renderPriorityBadge(pri)}}
                      </div>

                      {{/* Mobile Actions (hidden on lg and up) */}}
                      <div className="flex items-center gap-2 lg:hidden">
                        {{id ? (
                          <Link
                            href={{`/{view_link}/order/${{id}}`}}
                            className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-600 shadow-sm transition hover:bg-blue-100 hover:text-blue-700 dark:bg-blue-955/40 dark:text-blue-400 dark:hover:bg-blue-955/60 dark:hover:text-blue-300"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Link>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}}
                        {{isDraftRow && id ? (
                          <button
                            type="button"
                            onClick={{() => setDeleteTarget({{ id, label: ref }})}}
                            disabled={{isDeletingOrder}}
                            className="inline-flex items-center justify-center rounded border border-slate-200 hover:border-rose-350 p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:text-rose-455 dark:hover:bg-rose-950/30 transition cursor-pointer"
                            title="Delete Draft Order"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}}
                      </div>
                    </div>

                    {{/* Party Title */}}
                    <span
                      className="text-sm font-semibold text-slate-800 dark:text-slate-200 max-w-[280px] truncate"
                      title={{partyLabel}}
                    >
                      {{partyLabel}}
                    </span>

                    {{/* Financials & Dates */}}
                    <div className="grid grid-cols-2 sm:flex sm:items-center sm:gap-8 text-xs text-slate-500 dark:text-slate-400">
                      {"" if is_sales else """                      <div className="flex flex-col min-w-[90px]">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Grand Total
                        </span>
                        <span className="mt-0.5 font-bold tabular-nums text-slate-900 dark:text-slate-550 dark:text-slate-50 text-sm">
                          ${Number.isFinite(total) ? total.toFixed(2) : "0.00"}
                        </span>
                      </div>"""}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Created
                        </span>
                        <span className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-355">
                          {{orderDateStr}}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Expected Delivery
                        </span>
                        <span className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-355">
                          {{expectedDeliveryStr}}
                        </span>
                      </div>
                    </div>

                    {{/* Status Dimension - Mobile Box vs Desktop Flex Row */}}
                    {{/* Mobile View (< sm) */}}
                    <div className="flex flex-col gap-2.5 bg-slate-50/50 p-3 rounded-lg dark:bg-slate-955/5 sm:hidden border border-slate-100 dark:border-white/5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider">Department</span>
                        {{renderStatusDimensionBadge(statusDims?.departmental)}}
                      </div>
                      <div className="flex items-center justify-between text-xs border-t border-slate-200/40 pt-2 dark:border-white/5">
                        <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider">Fulfillment</span>
                        {{renderStatusDimensionBadge(statusDims?.fulfillment)}}
                      </div>
                      <div className="flex items-center justify-between text-xs border-t border-slate-200/40 pt-2 dark:border-white/5">
                        <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider">Last Action</span>
                        {{renderStatusDimensionBadge(statusDims?.action)}}
                      </div>
                    </div>

                    {{/* Tablet/Desktop View (>= sm) */}}
                    <div className="hidden sm:flex sm:items-center sm:gap-6">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                          Department
                        </span>
                        {{renderStatusDimensionBadge(statusDims?.departmental)}}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                          Fulfillment
                        </span>
                        {{renderStatusDimensionBadge(statusDims?.fulfillment)}}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                          Last Action
                        </span>
                        {{renderStatusDimensionBadge(statusDims?.action)}}
                      </div>
                    </div>

                    {{/* Desktop Actions (hidden on lg and below) */}}
                    <div className="hidden lg:flex lg:items-center lg:gap-2">
                      {{id ? (
                        <Link
                          href={{`/{view_link}/order/${{id}}`}}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-600 shadow-sm transition hover:bg-blue-100 hover:text-blue-700 dark:bg-blue-955/40 dark:text-blue-400 dark:hover:bg-blue-955/60 dark:hover:text-blue-300"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Order
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}}
                      {{isDraftRow && id ? (
                        <button
                          type="button"
                          onClick={{() => setDeleteTarget({{ id, label: ref }})}}
                          disabled={{isDeletingOrder}}
                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 hover:border-rose-350 p-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:text-rose-455 dark:hover:bg-rose-950/30 transition cursor-pointer"
                          title="Delete Draft Order"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}}
                    </div>
                  </div>
                );
              }})}}
            </div>"""

    # We need to find and replace the card loop wrapper
    pattern = re.compile(
        r'<div className="p-4 flex flex-col gap-3\.5 bg-slate-50/10 dark:bg-slate-955/10">.*?</div>\s*(?=\{\s*/\*\s*Pagination)',
        re.DOTALL
    )
    
    # Let's perform replacement
    new_content, count = pattern.subn(card_loop_markup + "\n", content)
    if count == 0:
        print(f"Warning: Card wrapper pattern not found/replaced in {portal_name} page.")
    else:
        print(f"Successfully applied responsive card layout to {portal_name} page.")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)

for name, path in pages.items():
    apply_responsiveness(name, path)
