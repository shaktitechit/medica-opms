"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Download, ExternalLink, RefreshCw, X } from "lucide-react";

import {
  FilePreviewModal,
  useFilePreview,
  type PreviewFile,
} from "@/components/portal/shared/FilePreviewModal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { ListEntitySearchPanel } from "@/components/portal/shared/orderList/ListEntitySearchPanel";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import { OrderListBottomTabStrip } from "@/components/portal/shared/orderList/OrderListBottomTabStrip";
import { publicApiOrigin } from "@/lib/env";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/store/hooks";
import {
  useApproveWorkPlanExpenseMutation,
  useListUsersQuery,
  useListWorkPlanExpensesQuery,
  useRejectWorkPlanExpenseMutation,
  type WorkPlanExpenseRecord,
} from "@/store/api";
import { RejectExpenseModal } from "./RejectExpenseModal";
import { DownloadExpensesModal } from "./DownloadExpensesModal";
import {
  ADMIN_WORK_PLAN_EXPENSE_STATUS_TABS,
  formatPlanDate,
  planIdOf,
  renderExpenseStatusBadge,
  salesUserLabel,
} from "./workPlanUtils";

type Props = {
  portalHome?: string;
};

function planRef(exp: WorkPlanExpenseRecord) {
  const wp = exp.work_plan;
  if (!wp || typeof wp === "string") {
    return {
      id: String(wp || ""),
      plan_date: undefined,
      sales_user: undefined,
      location: undefined as string | undefined,
    };
  }
  return {
    id: planIdOf(wp),
    plan_date: wp.plan_date,
    sales_user: wp.sales_user,
    location: wp.location,
  };
}

function visitLabel(exp: WorkPlanExpenseRecord) {
  const visit = exp.work_plan_visit;
  if (!visit) return "Plan-level";
  if (typeof visit === "string") return "Visit";
  const party =
    (typeof visit.party === "object" && visit.party?.party_name) ||
    visit.party_name ||
    "";
  const seq = visit.sequence != null ? `#${visit.sequence}` : "Visit";
  return party ? `${seq} — ${party}` : seq;
}

function formatMoney(n?: number) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function resolveFileUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${publicApiOrigin()}${normalized}`;
}

function receiptPreview(exp: WorkPlanExpenseRecord): PreviewFile | null {
  return attachmentPreview(exp.receipt_attachment, "Receipt");
}

function attachmentPreview(
  att: WorkPlanExpenseRecord["receipt_attachment"],
  fallbackName: string,
): PreviewFile | null {
  if (!att || typeof att === "string") return null;

  let path = String(att.url || "").trim();
  const key = String(att.key || "").trim();
  if (!path && key) {
    path = `/api/files/${encodeURIComponent(key)}/view`;
  }
  if (!path) return null;

  const filesMatch = path.match(/\/api\/files\/([^/?#]+)\/(view|download)/i);
  if (filesMatch) {
    path = `/api/files/${filesMatch[1]}/${filesMatch[2].toLowerCase()}`;
  } else if (key && !path.includes("/api/files/")) {
    path = `/api/files/${encodeURIComponent(key)}/view`;
  }

  return {
    name: String(att.original_name || att.file_name || fallbackName),
    url: resolveFileUrl(path),
    mime: String(att.mime_type || ""),
  };
}

export default function ListAdminExpensesPage({
  portalHome = "/admin",
}: Props) {
  const searchParams = useSearchParams();
  const base = portalHome;
  const isAdmin = true;
  const token = useAppSelector((s) => s.auth.token);
  const {
    previewDoc,
    previewBlobUrl,
    previewLoading,
    openPreview,
    closePreview,
  } = useFilePreview(token);

  const initialStatusRaw = searchParams.get("status") || "all";
  const initialStatus =
    initialStatusRaw === "draft" ? "all" : initialStatusRaw;
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [salesUserFilter, setSalesUserFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [rejectTarget, setRejectTarget] = useState<WorkPlanExpenseRecord | null>(
    null,
  );
  const [downloadOpen, setDownloadOpen] = useState(false);

  const queryArgs = useMemo(() => {
    const q: Record<string, string | number | undefined> = {
      page: currentPage,
      limit: itemsPerPage,
    };
    if (statusFilter && statusFilter !== "all") q.status = statusFilter;
    if (dateFrom) q.from = dateFrom;
    if (dateTo) q.to = dateTo;
    if (isAdmin && salesUserFilter) q.sales_user = salesUserFilter;
    return q;
  }, [currentPage, itemsPerPage, statusFilter, dateFrom, dateTo, isAdmin, salesUserFilter]);

  const { data, isLoading, isFetching, isError, refetch } =
    useListWorkPlanExpensesQuery(queryArgs);
  const usersQ = useListUsersQuery({ department: "sales" });
  const [approveExpense, approveState] = useApproveWorkPlanExpenseMutation();
  const [rejectExpense, rejectState] = useRejectWorkPlanExpenseMutation();

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 0;
  const busy = approveState.isLoading || rejectState.isLoading;

  const salesUsers = useMemo(() => {
    const raw = usersQ.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: unknown[] }).data;
    }
    return [];
  }, [usersQ.data]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const plan = planRef(r);
      const sales = salesUserLabel(plan.sales_user).toLowerCase();
      const category = (r.category || "").toLowerCase();
      const vendor = (r.vendor_name || "").toLowerCase();
      const status = (r.status || "").toLowerCase();
      const mode = (r.payment_mode || "").toLowerCase();
      return (
        sales.includes(q) ||
        category.includes(q) ||
        vendor.includes(q) ||
        status.includes(q) ||
        mode.includes(q)
      );
    });
  }, [rows, searchQuery]);

  const handleReceiptDownload = async (doc: PreviewFile) => {
    try {
      const response = await fetch(doc.url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Failed to download file");
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute("download", doc.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Failed to download receipt");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Sales Expenses
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Review and approve work plan expenses across sales executives
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDownloadOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
          >
            <Download className="h-3.5 w-3.5" />
            Download expenses
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <ListEntitySearchPanel
        searchQuery={searchQuery}
        onSearchChange={(v) => {
          setSearchQuery(v);
          setCurrentPage(1);
        }}
        desktopPlaceholder="Search category, vendor, sales user…"
        mobilePlaceholder="Search…"
      />

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-500">
            Sales executive
          </label>
          <select
            value={salesUserFilter}
            onChange={(e) => {
              setSalesUserFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950"
          >
            <option value="">All</option>
            {(salesUsers as Array<{ _id?: string; id?: string; name?: string }>).map(
              (u) => {
                const id = String(u._id || u.id || "");
                return (
                  <option key={id} value={id}>
                    {u.name || id}
                  </option>
                );
              },
            )}
          </select>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <PortalBusyOverlay
          active={isLoading || isFetching || busy}
          message={busy ? "Updating expense…" : "Loading expenses…"}
        />
        {isError ? (
          <div className="p-6 text-sm text-rose-600">Failed to load expenses.</div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Expense date</th>
                <th className="px-3 py-2.5 font-semibold">Plan date</th>
                <th className="px-3 py-2.5 font-semibold">Sales executive</th>
                <th className="px-3 py-2.5 font-semibold">Location / City</th>
                <th className="px-3 py-2.5 font-semibold">Visit</th>
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 font-semibold">Amount</th>
                <th className="px-3 py-2.5 font-semibold">Payment</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Receipt</th>
                <th className="px-3 py-2.5 font-semibold">Approved / Rejected by</th>
                <th className="px-3 py-2.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center text-slate-500">
                    No expenses found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const id = planIdOf(row);
                  const plan = planRef(row);
                  const canDecide = row.status === "submitted" && Boolean(plan.id);
                  const receipt = receiptPreview(row);
                  const startImg = attachmentPreview(
                    row.start_reading_image,
                    "Start reading",
                  );
                  const endImg = attachmentPreview(
                    row.end_reading_image,
                    "End reading",
                  );
                  return (
                    <tr
                      key={id}
                      className="border-t border-slate-100 hover:bg-slate-50/80 dark:border-white/5 dark:hover:bg-white/[0.03]"
                    >
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                        {formatPlanDate(row.expense_date)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {formatPlanDate(plan.plan_date)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {salesUserLabel(plan.sales_user)}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {plan.location || "—"}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {visitLabel(row)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        <div>{row.category || "—"}</div>
                        {row.sub_category ? (
                          <div className="text-[11px] text-slate-500">{row.sub_category}</div>
                        ) : null}
                        {row.sub_category === "Private Bike" &&
                        (row.start_reading != null || row.closing_reading != null) ? (
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            Reading: {row.start_reading ?? "—"} → {row.closing_reading ?? "—"}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {formatMoney(row.amount)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {row.payment_mode || "—"}
                      </td>
                      <td className="px-3 py-2.5">{renderExpenseStatusBadge(row.status)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          {receipt ? (
                            <button
                              type="button"
                              onClick={() => void openPreview(receipt)}
                              className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Receipt
                            </button>
                          ) : null}
                          {startImg ? (
                            <button
                              type="button"
                              onClick={() => void openPreview(startImg)}
                              className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Start reading
                            </button>
                          ) : null}
                          {endImg ? (
                            <button
                              type="button"
                              onClick={() => void openPreview(endImg)}
                              className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                              End reading
                            </button>
                          ) : null}
                          {!receipt && !startImg && !endImg ? (
                            <span className="text-[11px] text-slate-400">—</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                        {row.status === "approved" || row.status === "rejected"
                          ? salesUserLabel(row.approved_by)
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {canDecide ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  try {
                                    await approveExpense({
                                      id: plan.id,
                                      expenseId: id,
                                    }).unwrap();
                                    toast.success("Expense approved");
                                  } catch (rejected) {
                                    toast.error(mutationRejectedMessage(rejected));
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/40 dark:text-emerald-300"
                              >
                                <Check className="h-3 w-3" />
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setRejectTarget(row)}
                                className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/40 dark:text-rose-300"
                              >
                                <X className="h-3 w-3" />
                                Reject
                              </button>
                            </>
                          ) : null}
                          {plan.id ? (
                            <Link
                              href={`${base}/work-planner/${plan.id}?tab=expenses`}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium hover:bg-slate-50 dark:border-white/15 dark:hover:bg-white/5"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open plan
                            </Link>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      <OrderListPaginationBar
        startEntry={total === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
        endEntry={Math.min(currentPage * itemsPerPage, total)}
        totalEntries={total}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={(n) => {
          setItemsPerPage(n);
          setCurrentPage(1);
        }}
        currentPage={currentPage}
        totalPages={Math.max(pages, 1)}
        onPageChange={setCurrentPage}
      />

      <OrderListBottomTabStrip
        tabs={ADMIN_WORK_PLAN_EXPENSE_STATUS_TABS}
        activeTab={statusFilter}
        onTabChange={(id) => {
          setStatusFilter(id === "draft" ? "all" : id);
          setCurrentPage(1);
        }}
        filteredCount={filteredRows.length}
        isFetching={isFetching}
        searchQuery={searchQuery}
        onClearSearch={() => setSearchQuery("")}
        priorityFilter="all"
        onPriorityFilterChange={() => {}}
        filterLabel="Status"
        filterOptions={[{ value: "all", label: "All" }]}
        showReset={
          Boolean(searchQuery || dateFrom || dateTo || salesUserFilter || statusFilter !== "all")
        }
        onReset={() => {
          setSearchQuery("");
          setDateFrom("");
          setDateTo("");
          setSalesUserFilter("");
          setStatusFilter("all");
          setCurrentPage(1);
        }}
      />

      <RejectExpenseModal
        open={rejectTarget != null}
        isRejecting={rejectState.isLoading}
        onClose={() => setRejectTarget(null)}
        onConfirm={async (reason) => {
          if (!rejectTarget) return;
          const plan = planRef(rejectTarget);
          if (!plan.id) return;
          try {
            await rejectExpense({
              id: plan.id,
              expenseId: planIdOf(rejectTarget),
              rejection_reason: reason,
            }).unwrap();
            toast.success("Expense rejected");
            setRejectTarget(null);
          } catch (rejected) {
            toast.error(mutationRejectedMessage(rejected));
          }
        }}
      />

      <FilePreviewModal
        doc={previewDoc}
        blobUrl={previewBlobUrl}
        loading={previewLoading}
        onClose={closePreview}
        onDownload={handleReceiptDownload}
        subtitle="Expense receipt"
      />

      <DownloadExpensesModal
        open={downloadOpen}
        onClose={() => setDownloadOpen(false)}
      />
    </div>
  );
}
