"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Trash2, Upload, Download } from "lucide-react";

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
  useDeleteWorkPlanExpenseMutation,
  useListWorkPlanExpensesQuery,
  useSubmitWorkPlanExpenseMutation,
  type WorkPlanExpenseRecord,
} from "@/store/api";
import {
  WORK_PLAN_EXPENSE_STATUS_TABS,
  formatPlanDate,
  planIdOf,
  renderExpenseStatusBadge,
  salesUserLabel,
} from "./workPlanUtils";
import { DownloadExpensesModal } from "./DownloadExpensesModal";

function planRef(exp: WorkPlanExpenseRecord) {
  const wp = exp.work_plan;
  if (!wp || typeof wp === "string") {
    return { id: String(wp || ""), plan_date: undefined };
  }
  return {
    id: planIdOf(wp),
    plan_date: wp.plan_date,
    location: wp.location,
  };
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

export default function ListSalesExpensesPage() {
  const searchParams = useSearchParams();
  const base = "/sales";
  const token = useAppSelector((s) => s.auth.token);
  const {
    previewDoc,
    previewBlobUrl,
    previewLoading,
    openPreview,
    closePreview,
  } = useFilePreview(token);

  const initialStatus = searchParams.get("status") || "all";
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const queryArgs = useMemo(() => {
    const q: Record<string, string | number | undefined> = {
      page: currentPage,
      limit: itemsPerPage,
    };
    if (statusFilter && statusFilter !== "all") q.status = statusFilter;
    if (dateFrom) q.from = dateFrom;
    if (dateTo) q.to = dateTo;
    return q;
  }, [currentPage, itemsPerPage, statusFilter, dateFrom, dateTo]);

  const { data, isLoading, isFetching, isError, refetch } =
    useListWorkPlanExpensesQuery(queryArgs);
  const [submitExpense, submitState] = useSubmitWorkPlanExpenseMutation();
  const [deleteExpense, deleteState] = useDeleteWorkPlanExpenseMutation();

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 0;
  const busy = submitState.isLoading || deleteState.isLoading;

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const category = (r.category || "").toLowerCase();
      const vendor = (r.vendor_name || "").toLowerCase();
      const status = (r.status || "").toLowerCase();
      const mode = (r.payment_mode || "").toLowerCase();
      const desc = (r.description || "").toLowerCase();
      return (
        category.includes(q) ||
        vendor.includes(q) ||
        status.includes(q) ||
        mode.includes(q) ||
        desc.includes(q)
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
            Track and submit expenses linked to your work plans
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
        desktopPlaceholder="Search category, vendor, description…"
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
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                    No expenses found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const id = planIdOf(row);
                  const plan = planRef(row);
                  const receipt = receiptPreview(row);
                  const startImg = attachmentPreview(
                    row.start_reading_image,
                    "Start reading",
                  );
                  const endImg = attachmentPreview(
                    row.end_reading_image,
                    "End reading",
                  );
                  const isDraft = row.status === "draft";
                  const canAct = isDraft && Boolean(plan.id);
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
                          {canAct ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  try {
                                    await submitExpense({
                                      id: plan.id,
                                      expenseId: id,
                                    }).unwrap();
                                    toast.success("Expense submitted");
                                  } catch (rejected) {
                                    toast.error(mutationRejectedMessage(rejected));
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-900/40 dark:text-indigo-300"
                              >
                                <Upload className="h-3 w-3" />
                                Submit
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  if (!confirm("Delete this draft expense?")) return;
                                  try {
                                    await deleteExpense({
                                      id: plan.id,
                                      expenseId: id,
                                    }).unwrap();
                                    toast.success("Expense deleted");
                                  } catch (rejected) {
                                    toast.error(mutationRejectedMessage(rejected));
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/40 dark:text-rose-300"
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
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
        tabs={WORK_PLAN_EXPENSE_STATUS_TABS}
        activeTab={statusFilter}
        onTabChange={(id) => {
          setStatusFilter(id);
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
          Boolean(searchQuery || dateFrom || dateTo || statusFilter !== "all")
        }
        onReset={() => {
          setSearchQuery("");
          setDateFrom("");
          setDateTo("");
          setStatusFilter("all");
          setCurrentPage(1);
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
