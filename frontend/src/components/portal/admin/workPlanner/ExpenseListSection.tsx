"use client";

import { useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, Upload, X } from "lucide-react";

import {
  FilePreviewModal,
  useFilePreview,
  type PreviewFile,
} from "@/components/portal/shared/FilePreviewModal";
import { publicApiOrigin } from "@/lib/env";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/store/hooks";
import {
  useAddWorkPlanExpenseMutation,
  useApproveAllWorkPlanExpensesMutation,
  useApproveWorkPlanExpenseMutation,
  useDeleteWorkPlanExpenseMutation,
  usePatchWorkPlanExpenseMutation,
  useRejectAllWorkPlanExpensesMutation,
  useRejectWorkPlanExpenseMutation,
  useSubmitAllWorkPlanExpensesMutation,
  useSubmitWorkPlanExpenseMutation,
  type WorkPlanExpenseRecord,
  type WorkPlanVisitRecord,
} from "@/store/api";

import {
  ExpenseFormModal,
  type ExpenseFormPayload,
} from "./ExpenseFormModal";
import { RejectExpenseModal } from "./RejectExpenseModal";

function expenseIdOf(e: WorkPlanExpenseRecord) {
  return String(e._id || e.id || "");
}

function formatMoney(n?: number) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function statusBadge(status?: string) {
  const s = status || "draft";
  const styles: Record<string, string> = {
    draft:
      "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200",
    submitted:
      "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    approved:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    rejected:
      "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${styles[s] || styles.draft}`}
    >
      {s}
    </span>
  );
}

function resolveFileUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${publicApiOrigin()}${normalized}`;
}

function receiptPreview(exp: WorkPlanExpenseRecord): PreviewFile | null {
  const att = exp.receipt_attachment;
  if (!att || typeof att === "string") return null;

  let path = String(att.url || "").trim();
  const key = String(att.key || "").trim();
  if (!path && key) {
    path = `/api/files/${encodeURIComponent(key)}/view`;
  }
  if (!path) return null;

  // Prefer API-relative /api/files/... paths so auth fetch hits the backend origin.
  const filesMatch = path.match(/\/api\/files\/([^/?#]+)\/(view|download)/i);
  if (filesMatch) {
    path = `/api/files/${filesMatch[1]}/${filesMatch[2].toLowerCase()}`;
  } else if (key && !path.includes("/api/files/")) {
    path = `/api/files/${encodeURIComponent(key)}/view`;
  }

  return {
    name: String(att.original_name || att.file_name || "Receipt"),
    url: resolveFileUrl(path),
    mime: String(att.mime_type || ""),
  };
}

function visitLabel(
  visitRef:
    | string
    | null
    | undefined
    | {
        _id?: string;
        id?: string;
        sequence?: number;
        party_name?: string;
        party?: string | { _id?: string; party_name?: string };
      },
  visits: WorkPlanVisitRecord[],
) {
  if (!visitRef) return "Plan-level";
  const visitId =
    typeof visitRef === "object"
      ? String(visitRef._id || visitRef.id || "")
      : String(visitRef);
  if (!visitId) return "Plan-level";
  const v =
    visits.find((x) => String(x._id || x.id) === visitId) ||
    (typeof visitRef === "object" ? visitRef : null);
  if (!v) return "Visit";
  const party =
    (typeof v.party === "object" && v.party?.party_name) ||
    ("party_name" in v ? v.party_name : "") ||
    "";
  const seq = "sequence" in v ? v.sequence : undefined;
  return `#${seq ?? "?"} ${party}`.trim();
}

export type ExpenseListSectionProps = {
  planId: string;
  expenses: WorkPlanExpenseRecord[];
  visits: WorkPlanVisitRecord[];
  expenseTotal?: number;
  expenseApprovedTotal?: number;
  isAdmin?: boolean;
  canManage?: boolean;
};

export function ExpenseListSection({
  planId,
  expenses,
  visits,
  expenseTotal = 0,
  expenseApprovedTotal = 0,
  isAdmin = false,
  canManage = true,
}: ExpenseListSectionProps) {
  const token = useAppSelector((s) => s.auth.token);
  const {
    previewDoc,
    previewBlobUrl,
    previewLoading,
    openPreview,
    closePreview,
  } = useFilePreview(token);

  const [addExpense, addState] = useAddWorkPlanExpenseMutation();
  const [patchExpense, patchState] = usePatchWorkPlanExpenseMutation();
  const [deleteExpense, deleteState] = useDeleteWorkPlanExpenseMutation();
  const [submitExpense, submitState] = useSubmitWorkPlanExpenseMutation();
  const [approveExpense, approveState] = useApproveWorkPlanExpenseMutation();
  const [rejectExpense, rejectState] = useRejectWorkPlanExpenseMutation();
  const [submitAll, submitAllState] = useSubmitAllWorkPlanExpensesMutation();
  const [approveAll, approveAllState] = useApproveAllWorkPlanExpensesMutation();
  const [rejectAll, rejectAllState] = useRejectAllWorkPlanExpensesMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkPlanExpenseRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<WorkPlanExpenseRecord | null>(
    null,
  );
  const [rejectAllOpen, setRejectAllOpen] = useState(false);

  const busy =
    addState.isLoading ||
    patchState.isLoading ||
    deleteState.isLoading ||
    submitState.isLoading ||
    approveState.isLoading ||
    rejectState.isLoading ||
    submitAllState.isLoading ||
    approveAllState.isLoading ||
    rejectAllState.isLoading;

  const sorted = useMemo(
    () =>
      [...expenses].sort((a, b) => {
        const da = new Date(a.expense_date || 0).getTime();
        const db = new Date(b.expense_date || 0).getTime();
        return da - db;
      }),
    [expenses],
  );

  const submittableCount = useMemo(
    () =>
      expenses.filter(
        (e) => e.status === "draft" || e.status === "rejected",
      ).length,
    [expenses],
  );
  const submittedCount = useMemo(
    () => expenses.filter((e) => e.status === "submitted").length,
    [expenses],
  );

  const handleSave = async (payload: ExpenseFormPayload) => {
    try {
      if (editing) {
        await patchExpense({
          id: planId,
          expenseId: expenseIdOf(editing),
          patch: payload,
        }).unwrap();
        toast.success("Expense updated");
      } else {
        await addExpense({ id: planId, body: payload }).unwrap();
        toast.success("Expense added");
      }
      setFormOpen(false);
      setEditing(null);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
      throw rejected;
    }
  };

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
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/10">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Day expenses
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Total {formatMoney(expenseTotal)}
            {expenseApprovedTotal != null ? (
              <>
                {" "}
                · Approved {formatMoney(expenseApprovedTotal)}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {canManage && submittableCount > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                try {
                  await submitAll({ id: planId }).unwrap();
                  toast.success(`Submitted ${submittableCount} expense(s)`);
                } catch (rejected) {
                  toast.error(mutationRejectedMessage(rejected));
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-900/40 dark:text-indigo-300"
            >
              <Upload className="h-3.5 w-3.5" />
              Submit all ({submittableCount})
            </button>
          ) : null}
          {isAdmin && submittedCount > 0 ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  try {
                    await approveAll({ id: planId }).unwrap();
                    toast.success(`Approved ${submittedCount} expense(s)`);
                  } catch (rejected) {
                    toast.error(mutationRejectedMessage(rejected));
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/40 dark:text-emerald-300"
              >
                <Check className="h-3.5 w-3.5" />
                Approve all ({submittedCount})
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejectAllOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/40 dark:text-rose-300"
              >
                <X className="h-3.5 w-3.5" />
                Reject all ({submittedCount})
              </button>
            </>
          ) : null}
          {canManage ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add expense
            </button>
          ) : null}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          No expenses yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold">Visit</th>
                <th className="px-3 py-2 font-semibold">Amount</th>
                <th className="px-3 py-2 font-semibold">Payment</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Receipt</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {sorted.map((exp) => {
                const id = expenseIdOf(exp);
                const editable =
                  canManage &&
                  (isAdmin
                    ? exp.status !== "approved"
                    : exp.status === "draft" || exp.status === "rejected");
                const canSubmit =
                  canManage &&
                  (exp.status === "draft" || exp.status === "rejected");
                const canApprove = isAdmin && exp.status === "submitted";
                const receipt = receiptPreview(exp);

                return (
                  <tr key={id} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">
                      {formatDate(exp.expense_date)}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                      <div>{exp.category || "—"}</div>
                      {exp.sub_category ? (
                        <div className="text-xs text-slate-500">
                          {exp.sub_category}
                        </div>
                      ) : null}
                      {exp.vendor_name ? (
                        <div className="text-xs text-slate-500">
                          {exp.vendor_name}
                        </div>
                      ) : null}
                      {exp.rejection_reason ? (
                        <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                          {exp.rejection_reason}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {visitLabel(exp.work_plan_visit, visits)}
                    </td>
                    <td className="px-3 py-2 tabular-nums font-medium text-slate-900 dark:text-slate-50">
                      {formatMoney(exp.amount)}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {exp.payment_mode || "—"}
                    </td>
                    <td className="px-3 py-2">{statusBadge(exp.status)}</td>
                    <td className="px-3 py-2">
                      {receipt ? (
                        <button
                          type="button"
                          onClick={() => void openPreview(receipt)}
                          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Preview
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {editable ? (
                          <button
                            type="button"
                            disabled={busy}
                            title="Edit"
                            onClick={() => {
                              setEditing(exp);
                              setFormOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 dark:border-white/15 dark:text-slate-200"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                        ) : null}
                        {canSubmit ? (
                          <button
                            type="button"
                            disabled={busy}
                            title="Submit"
                            onClick={async () => {
                              try {
                                await submitExpense({
                                  id: planId,
                                  expenseId: id,
                                }).unwrap();
                                toast.success("Expense submitted");
                              } catch (rejected) {
                                toast.error(mutationRejectedMessage(rejected));
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded border border-indigo-200 px-2 py-1 text-[11px] font-medium text-indigo-700 dark:border-indigo-900/40 dark:text-indigo-300"
                          >
                            <Upload className="h-3 w-3" />
                            Submit
                          </button>
                        ) : null}
                        {editable ? (
                          <button
                            type="button"
                            disabled={busy}
                            title="Delete"
                            onClick={async () => {
                              try {
                                await deleteExpense({
                                  id: planId,
                                  expenseId: id,
                                }).unwrap();
                                toast.success("Expense deleted");
                              } catch (rejected) {
                                toast.error(mutationRejectedMessage(rejected));
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-700 dark:border-rose-900/40 dark:text-rose-300"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        ) : null}
                        {canApprove ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                try {
                                  await approveExpense({
                                    id: planId,
                                    expenseId: id,
                                  }).unwrap();
                                  toast.success("Expense approved");
                                } catch (rejected) {
                                  toast.error(
                                    mutationRejectedMessage(rejected),
                                  );
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/40 dark:text-emerald-300"
                            >
                              <Check className="h-3 w-3" />
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setRejectTarget(exp)}
                              className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-700 dark:border-rose-900/40 dark:text-rose-300"
                            >
                              <X className="h-3 w-3" />
                              Reject
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ExpenseFormModal
        open={formOpen}
        isSaving={addState.isLoading || patchState.isLoading}
        visits={visits}
        initial={editing}
        onClose={() => {
          if (busy) return;
          setFormOpen(false);
          setEditing(null);
        }}
        onConfirm={handleSave}
      />

      <FilePreviewModal
        doc={previewDoc}
        blobUrl={previewBlobUrl}
        loading={previewLoading}
        onClose={closePreview}
        onDownload={handleReceiptDownload}
        subtitle="Expense receipt"
      />

      <RejectExpenseModal
        open={rejectTarget != null}
        isRejecting={rejectState.isLoading}
        onClose={() => setRejectTarget(null)}
        onConfirm={async (reason) => {
          if (!rejectTarget) return;
          try {
            await rejectExpense({
              id: planId,
              expenseId: expenseIdOf(rejectTarget),
              rejection_reason: reason,
            }).unwrap();
            toast.success("Expense rejected");
            setRejectTarget(null);
          } catch (rejected) {
            toast.error(mutationRejectedMessage(rejected));
          }
        }}
      />

      <RejectExpenseModal
        open={rejectAllOpen}
        isRejecting={rejectAllState.isLoading}
        onClose={() => setRejectAllOpen(false)}
        onConfirm={async (reason) => {
          try {
            await rejectAll({ id: planId, rejection_reason: reason }).unwrap();
            toast.success(`Rejected ${submittedCount} expense(s)`);
            setRejectAllOpen(false);
          } catch (rejected) {
            toast.error(mutationRejectedMessage(rejected));
          }
        }}
      />
    </section>
  );
}

export default ExpenseListSection;
