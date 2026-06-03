import re

# File Paths
finance_path = r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\finance\order\ListFinanceOrdersPage.tsx"
dispatch_path = r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\dispatch\order\ListDispatchOrdersPage.tsx"

helpers_to_inject = """
function formatDateShort(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function renderStatusDimensionBadge(dimension: OrderStatusDimension | null | undefined) {
  if (!dimension) return null;
  const title = dimension.detail
    ? `${dimension.label} — ${dimension.detail}`
    : dimension.label;
  return (
    <div className="flex flex-col items-start min-w-[70px]">
      <span
        className={`inline-flex max-w-[10rem] truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${dimensionToneClass(dimension.tone)}`}
        title={title}
      >
        {dimension.label}
      </span>
      {dimension.detail && (
        <span
          className="mt-0.5 max-w-[10rem] truncate text-[9px] text-slate-500 dark:text-slate-400 font-medium"
          title={dimension.detail}
        >
          {dimension.detail}
        </span>
      )}
    </div>
  );
}
"""

def process_file(file_path, portal_type):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update Imports
    content = content.replace(
        'import { OrderStatusDimensionCell } from "@/components/portal/shared/OrderStatusDimensionCell";',
        ''
    )
    content = content.replace(
        'import { computeOrderStatusDimensions } from "@/components/portal/shared/orderStatusDimensions";',
        'import {\n  computeOrderStatusDimensions,\n  dimensionToneClass,\n  type OrderStatusDimension,\n} from "@/components/portal/shared/orderStatusDimensions";'
    )

    # 2. Inject Helpers before default export
    target_export = f"export default function List{portal_type}OrdersPage()"
    if target_export in content and "formatDateShort" not in content:
        content = content.replace(target_export, helpers_to_inject + "\n" + target_export)

    # 3. Update query hook parameters
    content = content.replace(
        f"const {{ data, isFetching, isError, refetch }} = useListOrdersQuery({{}});",
        f"const {{ data, isFetching, isError, refetch }} = useListOrdersQuery({{\n    status: statusFilter !== \"all\" ? statusFilter : undefined,\n  }});"
    )

    # 4. Remove local status filter in filteredOrders
    local_status_filter = """      // 2. Status filter
      if (statusFilter !== "all") {
        if (deriveOrderWorkflowStatus(o).toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      }"""
    content = content.replace(local_status_filter, "")

    # 5. Build Horizontal Cards Markup
    if portal_type == "Finance":
        team_display = """                    {/* Assigned Staff */}
                    <div className="flex flex-col text-xs text-slate-500 dark:text-slate-400 min-w-[160px]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                        Assigned Team
                      </span>
                      <span className="truncate max-w-[160px] text-slate-750 dark:text-slate-300" title={assignedFinanceName}>
                        <strong className="text-slate-400 dark:text-slate-505 font-bold uppercase text-[9px] tracking-wider mr-1">Finance:</strong>{assignedFinanceName}
                      </span>
                      <span className="truncate max-w-[160px] text-slate-750 dark:text-slate-300" title={assignedSalesName}>
                        <strong className="text-slate-400 dark:text-slate-505 font-bold uppercase text-[9px] tracking-wider mr-1">Sales:</strong>{assignedSalesName}
                      </span>
                    </div>"""
        view_link = "finance"
    else: # Dispatch
        team_display = """                    {/* Assigned Staff */}
                    <div className="flex flex-col text-xs text-slate-500 dark:text-slate-400 min-w-[160px]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                        Assigned Team
                      </span>
                      <span className="truncate max-w-[160px] text-slate-750 dark:text-slate-300" title={assignedAdminName}>
                        <strong className="text-slate-400 dark:text-slate-505 font-bold uppercase text-[9px] tracking-wider mr-1">Admin:</strong>{assignedAdminName}
                      </span>
                      <span className="truncate max-w-[160px] text-slate-750 dark:text-slate-300" title={assignedSalesName}>
                        <strong className="text-slate-400 dark:text-slate-505 font-bold uppercase text-[9px] tracking-wider mr-1">Sales:</strong>{assignedSalesName}
                      </span>
                    </div>"""
        view_link = "dispatch"

    cards_markup = f"""            <div className="p-4 flex flex-col gap-3.5 bg-slate-50/10 dark:bg-slate-955/10">
              {{paginatedOrders.map((o) => {{
                const id = orderKey(o);
                const ref =
                  typeof o.order_no === "string"
                    ? o.order_no
                    : typeof o.order_number === "string"
                      ? o.order_number
                      : id || "—";
                const total = Number(o.grand_total ?? o.total ?? 0);
                const pri = typeof o.priority === "string" ? o.priority : "normal";
                const statusDims = computeOrderStatusDimensions(
                  o as Record<string, unknown>,
                );
                const partyLabel = resolveOrderCounterparty(
                  o as Record<string, unknown>,
                  partyNameById,
                );
                {"const assignedAdminName = resolveUserDisplay(o.assigned_admin_user, userNameById);" if portal_type == "Dispatch" else ""}
                {"const assignedFinanceName = resolveUserDisplay(o.assigned_finance_user, userNameById);" if portal_type == "Finance" else ""}
                const assignedSalesName = resolveUserDisplay(o.assigned_sales_user, userNameById);

                const orderDateStr = formatDateShort((o as any).order_date ?? (o as any).created_at ?? (o as any).createdAt);
                const expectedDeliveryStr = formatDateShort((o as any).expected_delivery_date);

                let stripeColor = "bg-slate-350 dark:bg-slate-700";
                if (pri === "urgent") stripeColor = "bg-rose-500";
                else if (pri === "high") stripeColor = "bg-amber-500";
                else if (pri === "normal") stripeColor = "bg-blue-500";

                return (
                  <div
                    key={{id || ref}}
                    className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4.5 transition-all duration-300 hover:shadow-md hover:border-blue-500/20 dark:border-white/10 dark:bg-slate-900 flex flex-col lg:flex-row lg:items-center justify-between gap-4 pl-6 animate-fadeIn"
                  >
                    {{/* Priority Accent Stripe */}}
                    <div className={{`absolute left-0 top-0 bottom-0 w-1.5 ${{stripeColor}}`}} />

                    {{/* Order Info & Party */}}
                    <div className="flex flex-col min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-50">
                          {{ref}}
                        </span>
                        {{renderPriorityBadge(pri)}}
                      </div>
                      <span
                        className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200 max-w-[280px] truncate"
                        title={{partyLabel}}
                      >
                        {{partyLabel}}
                      </span>
                    </div>

                    {{/* Financials & Dates */}}
                    <div className="grid grid-cols-3 gap-4 sm:flex sm:items-center sm:gap-8 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex flex-col min-w-[90px]">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Grand Total
                        </span>
                        <span className="mt-0.5 font-bold tabular-nums text-slate-900 dark:text-slate-50 text-sm">
                          ${{Number.isFinite(total) ? total.toFixed(2) : "0.00"}}
                        </span>
                      </div>
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
                          Delivery
                        </span>
                        <span className="mt-0.5 font-semibold tabular-nums text-slate-700 dark:text-slate-355">
                          {{expectedDeliveryStr}}
                        </span>
                      </div>
                    </div>

{team_display}

                    {{/* Status Dimensions Grid */}}
                    <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-6">
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

                    {{/* Actions */}}
                    <div className="flex items-center gap-2 self-end lg:self-auto">
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
                    </div>
                  </div>
                );
              }})}}
            </div>"""

    # We need to find and replace the table block:
    # <div className="overflow-x-auto"> ... </div> before the pagination footer
    table_block_pattern = re.compile(
        r'<div className="overflow-x-auto">.*?</table>\s*</div>',
        re.DOTALL
    )
    content, count = table_block_pattern.subn(cards_markup, content)
    if count == 0:
        print(f"Warning: Table pattern not found/replaced in {portal_type} page.")
    else:
        print(f"Successfully replaced table block in {portal_type} page.")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

process_file(finance_path, "Finance")
process_file(dispatch_path, "Dispatch")
