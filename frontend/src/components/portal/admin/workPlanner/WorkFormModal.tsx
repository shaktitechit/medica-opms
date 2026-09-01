"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { type WorkPlanWorkRecord } from "@/store/api";
import { formatPlanDate } from "./workPlanUtils";

export type WorkFormModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initial?: WorkPlanWorkRecord | null;
  /** Work plan date (YYYY-MM-DD or ISO). Combined with the selected times on save. */
  planDate?: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void | Promise<void>;
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";

function ymdFromPlanDate(planDate?: string | null): string {
  if (!planDate) return "";
  const trimmed = String(planDate).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function timeFromIso(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function combinePlanDateAndTime(
  planDate: string | undefined | null,
  time: string,
): string | undefined {
  if (!time) return undefined;
  const ymd = ymdFromPlanDate(planDate) || new Date().toISOString().slice(0, 10);
  const local = new Date(`${ymd}T${time}`);
  if (isNaN(local.getTime())) return undefined;
  return local.toISOString();
}

export function WorkFormModal({
  open,
  mode,
  initial,
  planDate,
  isSaving,
  onClose,
  onSubmit,
}: WorkFormModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [plannedStartTime, setPlannedStartTime] = useState("");
  const [plannedEndTime, setPlannedEndTime] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const planDateYmd = ymdFromPlanDate(planDate);
  const planDateLabel = planDateYmd
    ? formatPlanDate(`${planDateYmd}T00:00:00`)
    : "—";

  useEffect(() => {
    if (open) {
      if (initial) {
        setTitle(initial.title || "");
        setDescription(initial.description || "");
        setPlannedStartTime(timeFromIso(initial.planned_start_time));
        setPlannedEndTime(timeFromIso(initial.planned_end_time));
      } else {
        setTitle("");
        setDescription("");
        setPlannedStartTime("");
        setPlannedEndTime("");
      }
      setErrors({});
    }
  }, [open, initial]);

  if (!open) return null;

  function handleSave() {
    const errs: Record<string, string> = {};
    if (!title.trim()) {
      errs.title = "Task title/description is required";
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      planned_start_time: combinePlanDateAndTime(planDate, plannedStartTime),
      planned_end_time: combinePlanDateAndTime(planDate, plannedEndTime),
    });
  }

  return (
    <LargeModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
        role="presentation"
        onClick={() => !isSaving && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {mode === "create" ? "Add Work Task" : "Edit Work Task"}
              </h2>
              <p className="text-2xs text-slate-500">
                Describe your office task or work status for today
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4 px-5 py-4">
            <div>
              <label className={labelClass}>Task Title / Summary *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Email follow-ups, Inventory check, Sales report"
                className={inputClass}
              />
              {errors.title && (
                <span className="mt-1 block text-2xs text-rose-600">{errors.title}</span>
              )}
            </div>

            <div>
              <label className={labelClass}>Description / Notes</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details of the work task"
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
              />
            </div>

            <div>
              <label className={labelClass}>Plan Date</label>
              <input
                type="text"
                value={planDateLabel}
                disabled
                readOnly
                className={inputClass}
              />
              <span className="mt-1 block text-2xs text-slate-500">
                Date is taken from the work plan. Only the time can be changed.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start Time</label>
                <input
                  type="time"
                  value={plannedStartTime}
                  onChange={(e) => setPlannedStartTime(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>End Time</label>
                <input
                  type="time"
                  value={plannedEndTime}
                  onChange={(e) => setPlannedEndTime(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-white/10">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </LargeModalPortal>
  );
}
