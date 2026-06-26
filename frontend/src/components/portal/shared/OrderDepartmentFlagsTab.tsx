"use client";

import { useCallback, useState, useEffect } from "react";

import { DashboardCard } from "@/components/widgets";
import { ALL_FLAG_TYPES, FLAGS_FOR_TARGET_DEPARTMENT } from "@/components/portal/shared/flagTypes";
import { ResolveFlagModal } from "@/components/portal/shared/ResolveFlagModal";
import { usePatchFlagMutation, useCreateAttachmentMutation, useCreateFlagMutation } from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";


const departmentLabels: Record<string, string> = {
  sales: "Sales",
  finance: "Finance",
  dispatch: "Dispatch",
  admin: "Admin",
  account: "Account",
};

export type OrderDepartmentFlagsTabProps = {
  orderId: string;
  flagsQ: {
    refetch: () => unknown;
    isFetching: boolean;
    isUninitialized?: boolean;
  };
  rawFlags: Record<string, unknown>[];
  formatDate: (v: unknown) => string;
  userNameById: Record<string, string>;
  setShowRaiseFlagModal?: (v: boolean) => void;
  currentDepartment: string;
  refetchOrder: () => void;
};

/** Flags list + resolve in a modal with optional attachment (order entity). */
export function OrderDepartmentFlagsTab({
  orderId,
  flagsQ,
  rawFlags,
  formatDate,
  userNameById,
  setShowRaiseFlagModal,
  currentDepartment,
  refetchOrder,
}: OrderDepartmentFlagsTabProps) {
  const [resolvingFlag, setResolvingFlag] = useState<Record<string, unknown> | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolveFile, setResolveFile] = useState<File | null>(null);

  const [patchFlag, { isLoading: isPatchingFlag }] = usePatchFlagMutation();
  const [createAttachment, { isLoading: isUploadingAttachment }] =
    useCreateAttachmentMutation();
  const isBusy = isPatchingFlag || isUploadingAttachment;

  // Internal Raise Flag State & Logic
  const [internalShowRaiseFlagModal, setInternalShowRaiseFlagModal] = useState(false);
  const [newFlagDept, setNewFlagDept] = useState(() => {
    return currentDepartment === "sales" ? "admin" : "sales";
  });
  const [newFlagType, setNewFlagType] = useState("urgent");
  const [newFlagSeverity, setNewFlagSeverity] = useState("medium");
  const [newFlagTitle, setNewFlagTitle] = useState("");
  const [newFlagDesc, setNewFlagDesc] = useState("");
  const [newFlagDueDate, setNewFlagDueDate] = useState("");

  useEffect(() => {
    const allowed = FLAGS_FOR_TARGET_DEPARTMENT[newFlagDept] || [];
    if (allowed.length > 0 && !allowed.includes(newFlagType)) {
      setNewFlagType(allowed[0]);
    }
  }, [newFlagDept]);

  const [createFlag, { isLoading: isCreatingFlag }] = useCreateFlagMutation();

  const handleRaiseFlag = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!orderId || !newFlagTitle.trim()) return;

      try {
        await createFlag({
          order: orderId,
          flag_type: newFlagType,
          severity: newFlagSeverity,
          title: newFlagTitle.trim(),
          description: newFlagDesc.trim(),
          blocks_order: false,
          department: newFlagDept,
          due_date: newFlagDueDate ? new Date(newFlagDueDate).toISOString() : undefined,
        }).unwrap();

        toast.success("Flag raised successfully.");
        setInternalShowRaiseFlagModal(false);
        if (setShowRaiseFlagModal) setShowRaiseFlagModal(false);
        setNewFlagTitle("");
        setNewFlagDesc("");
        setNewFlagType("urgent");
        setNewFlagSeverity("medium");
        setNewFlagDept(currentDepartment === "sales" ? "admin" : "sales");
        setNewFlagDueDate("");
        if (!flagsQ.isUninitialized) flagsQ.refetch();
        refetchOrder();
      } catch (err) {
        toast.error(mutationRejectedMessage(err));
      }
    },
    [
      orderId,
      newFlagType,
      newFlagSeverity,
      newFlagTitle,
      newFlagDesc,
      newFlagDept,
      newFlagDueDate,
      createFlag,
      flagsQ,
      refetchOrder,
      setShowRaiseFlagModal,
      currentDepartment,
    ]
  );


  const closeResolveModal = () => {
    setResolvingFlag(null);
    setResolutionNote("");
    setResolveFile(null);
  };

  const openResolveModal = (flag: Record<string, unknown>) => {
    setResolvingFlag(flag);
    setResolutionNote("");
    setResolveFile(null);
  };

  const handleResolveFlag = useCallback(async () => {
    if (!resolvingFlag) return;
    const id = String(resolvingFlag._id ?? resolvingFlag.id ?? "");

    try {
      await patchFlag({
        id,
        patch: {
          status: "resolved",
          resolution_note: resolutionNote.trim() || undefined,
        },
      }).unwrap();

      if (resolveFile) {
        const formData = new FormData();
        formData.append("file", resolveFile);
        formData.append("entity_type", "order");
        formData.append("entity_id", orderId);
        formData.append(
          "remarks",
          `Flag resolution attachment — ${String(resolvingFlag.title ?? ALL_FLAG_TYPES[String(resolvingFlag.flag_type ?? "")]?.label ?? "Flag")}`
        );
        await createAttachment(formData).unwrap();
      }

      toast.success("Flag resolved successfully.");
      closeResolveModal();
      if (!flagsQ.isUninitialized) flagsQ.refetch();
      refetchOrder();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  }, [
    resolvingFlag,
    resolutionNote,
    resolveFile,
    patchFlag,
    createAttachment,
    orderId,
    flagsQ,
    refetchOrder,
  ]);

  const modalSubtitle =
    resolvingFlag &&
    String(
      resolvingFlag.title ??
        ALL_FLAG_TYPES[String(resolvingFlag.flag_type ?? "")]?.label ??
        "Flag",
    );

  return (
    <>
      <DashboardCard
        title="Order Issue Flags"
        description="Monitor active issues, resolve blockages, or flag other departments."
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setInternalShowRaiseFlagModal(true);
              if (setShowRaiseFlagModal) setShowRaiseFlagModal(true);
            }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            Raise Flag
          </button>
        </div>

        {flagsQ.isFetching ? (
          <p className="text-sm text-slate-500">Loading flags...</p>
        ) : rawFlags.length === 0 ? (
          <p className="text-sm text-slate-500">
            No flags have been raised on this order.
          </p>
        ) : (
          <div className="space-y-4">
            {rawFlags.map((flag) => {
              const id = String(flag._id ?? flag.id ?? "");
              const type = String(flag.flag_type ?? "");
              const severity = String(flag.severity ?? "medium");
              const status = String(flag.status ?? "open");
              const isResolved =
                status === "resolved" || status === "dismissed";
              const isTarget = String(flag.department) === currentDepartment;

              let severityColor =
                "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400";
              if (severity === "low") {
                severityColor =
                  "bg-slate-50 text-slate-700 dark:bg-slate-900/20 dark:text-slate-400";
              } else if (severity === "high") {
                severityColor =
                  "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400";
              } else if (severity === "critical") {
                severityColor =
                  "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400";
              }

              return (
                <div
                  key={id}
                  className={`rounded-xl border p-4 transition duration-150 ${
                    isResolved
                      ? "border-slate-200 bg-slate-50/50 dark:border-white/5 dark:bg-slate-900/40"
                      : isTarget
                        ? "border-emerald-200 bg-white shadow-sm dark:border-emerald-900/40 dark:bg-slate-900"
                        : "border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-[200px] flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isResolved
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400"
                          }`}
                        >
                          {status.replace("_", " ")}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${severityColor}`}
                        >
                          {severity}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400">
                          →{" "}
                          {departmentLabels[String(flag.department)] ||
                            String(flag.department ?? "General")}
                        </span>
                        {isTarget && !isResolved ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                            Action required
                          </span>
                        ) : null}
                      </div>

                      <h4 className="text-base font-bold text-slate-900 dark:text-slate-50">
                        {String(
                          flag.title ?? ALL_FLAG_TYPES[type]?.label ?? type,
                        )}
                      </h4>

                      {typeof flag.description === "string" && flag.description ? (
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {flag.description}
                        </p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-sans text-xs text-slate-500">
                        <span>
                          Raised by:{" "}
                          {userNameById[String(flag.raised_by)] ||
                            String(flag.raised_by ?? "System")}
                        </span>
                        <span>•</span>
                        <span>{formatDate(flag.createdAt)}</span>
                        {typeof flag.due_date === "string" && flag.due_date ? (
                          <>
                            <span>•</span>
                            <span>Due: {formatDate(flag.due_date)}</span>
                          </>
                        ) : null}
                      </div>

                      {isResolved ? (
                        <div className="mt-3 rounded-lg border border-emerald-100/50 bg-emerald-50/50 p-3 text-sm text-emerald-800 dark:border-emerald-900/20 dark:bg-emerald-950/20 dark:text-emerald-300">
                          <p className="font-semibold">Resolution summary</p>
                          {typeof flag.resolution_note === "string" &&
                          flag.resolution_note ? (
                            <p className="mt-1">{flag.resolution_note}</p>
                          ) : null}
                          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                            Resolved by:{" "}
                            {userNameById[String(flag.resolved_by)] ||
                              String(flag.resolved_by ?? "System")}{" "}
                            on {formatDate(flag.resolved_at)}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {!isResolved && isTarget ? (
                      <div className="flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => openResolveModal(flag)}
                          className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50 dark:border-emerald-500 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
                        >
                          Resolve flag
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>

      <ResolveFlagModal
        open={Boolean(resolvingFlag)}
        subtitle={modalSubtitle || ""}
        resolutionNote={resolutionNote}
        onResolutionNoteChange={setResolutionNote}
        file={resolveFile}
        onFileChange={setResolveFile}
        onClose={closeResolveModal}
        onConfirm={handleResolveFlag}
        isBusy={isBusy}
      />

      {/* Raise Flag Modal overlay */}
      {internalShowRaiseFlagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-xl border border-slate-200/90 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-555 dark:text-slate-50 font-sans font-medium">
                Raise Departmental Flag
              </h3>
              <button
                type="button"
                onClick={() => {
                  setInternalShowRaiseFlagModal(false);
                  if (setShowRaiseFlagModal) setShowRaiseFlagModal(false);
                }}
                className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-355 dark:hover:text-slate-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={(e) => void handleRaiseFlag(e)} className="mt-4 space-y-4 font-sans text-xs">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="flag-dept" className={labelClass}>Target Department</label>
                  <select
                    id="flag-dept"
                    value={newFlagDept}
                    onChange={(e) => setNewFlagDept(e.target.value)}
                    className={inputClass}
                    required
                  >
                    {Object.entries(departmentLabels)
                      .filter(([val]) => val !== currentDepartment)
                      .map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="flag-type" className={labelClass}>Flag Type</label>
                  <select
                    id="flag-type"
                    value={newFlagType}
                    onChange={(e) => setNewFlagType(e.target.value)}
                    className={inputClass}
                    required
                  >
                    {(FLAGS_FOR_TARGET_DEPARTMENT[newFlagDept] ?? Object.keys(ALL_FLAG_TYPES)).map((val) => (
                      <option key={val} value={val}>
                        {ALL_FLAG_TYPES[val]?.label || val}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="flag-severity" className={labelClass}>Severity</label>
                  <select
                    id="flag-severity"
                    value={newFlagSeverity}
                    onChange={(e) => setNewFlagSeverity(e.target.value)}
                    className={inputClass}
                    required
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="flag-due" className={labelClass}>Due Date (Optional)</label>
                  <input
                    id="flag-due"
                    type="date"
                    value={newFlagDueDate}
                    onChange={(e) => setNewFlagDueDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="flag-title" className={labelClass}>Flag Title</label>
                <input
                  id="flag-title"
                  type="text"
                  value={newFlagTitle}
                  onChange={(e) => setNewFlagTitle(e.target.value)}
                  className={inputClass}
                  placeholder="E.g., Missing delivery address details"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="flag-desc" className={labelClass}>Description / Instructions</label>
                <textarea
                  id="flag-desc"
                  rows={3}
                  value={newFlagDesc}
                  onChange={(e) => setNewFlagDesc(e.target.value)}
                  className={inputClass}
                  placeholder="Add detailed context for the assigned department..."
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/5 font-sans font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setInternalShowRaiseFlagModal(false);
                    if (setShowRaiseFlagModal) setShowRaiseFlagModal(false);
                  }}
                  className={btnSecondaryClass}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFlag}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {isCreatingFlag ? "Raising Flag..." : "Raise Flag"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
