"use client";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { useEffect, useState } from "react";

export type CompleteVisitAnswers = {
  meeting_with_doctor: boolean;
  meeting_with_purchase: boolean;
  meeting_with_finance: boolean;
  meeting_with_engineer: boolean;
  new_product_introduced: boolean;
  order_received: boolean;
};

export type CompleteVisitPayload = CompleteVisitAnswers & {
  outcome: string;
};

export type CompleteVisitModalProps = {
  open: boolean;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: (payload: CompleteVisitPayload) => void | Promise<void>;
};

const QUESTIONS: { key: keyof CompleteVisitAnswers; label: string }[] = [
  { key: "meeting_with_doctor", label: "Meeting with doctor?" },
  { key: "meeting_with_purchase", label: "Meeting with purchase?" },
  { key: "meeting_with_finance", label: "Meeting with finance?" },
  { key: "meeting_with_engineer", label: "Meeting with engineer/technician?" },
  { key: "new_product_introduced", label: "New product introduced?" },
  { key: "order_received", label: "Order received?" },
];

type YesNo = boolean | null;

function YesNoRadios({
  name,
  label,
  value,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  value: YesNo;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </legend>
      <div className="flex items-center gap-4">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-800 dark:text-slate-100">
          <input
            type="radio"
            name={name}
            checked={value === true}
            disabled={disabled}
            onChange={() => onChange(true)}
            className="h-3.5 w-3.5 border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Yes
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-800 dark:text-slate-100">
          <input
            type="radio"
            name={name}
            checked={value === false}
            disabled={disabled}
            onChange={() => onChange(false)}
            className="h-3.5 w-3.5 border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          No
        </label>
      </div>
    </fieldset>
  );
}

export function CompleteVisitModal({
  open,
  isSaving,
  onClose,
  onConfirm,
}: CompleteVisitModalProps) {
  const [outcome, setOutcome] = useState("");
  const [answers, setAnswers] = useState<Record<keyof CompleteVisitAnswers, YesNo>>({
    meeting_with_doctor: null,
    meeting_with_purchase: null,
    meeting_with_finance: null,
    meeting_with_engineer: null,
    new_product_introduced: null,
    order_received: null,
  });

  useEffect(() => {
    if (!open) {
      setOutcome("");
      setAnswers({
        meeting_with_doctor: null,
        meeting_with_purchase: null,
        meeting_with_finance: null,
        meeting_with_engineer: null,
        new_product_introduced: null,
        order_received: null,
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, isSaving, onClose]);

  if (!open) return null;

  const allAnswered = QUESTIONS.every((q) => answers[q.key] !== null);
  const canSubmit = Boolean(outcome.trim()) && allAnswered && !isSaving;

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
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Complete visit
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Record the outcome of this customer visit.
            </p>
          </div>
          <div className="space-y-4 px-5 py-4">
            {QUESTIONS.map((q) => (
              <YesNoRadios
                key={q.key}
                name={q.key}
                label={q.label}
                value={answers[q.key]}
                disabled={isSaving}
                onChange={(next) =>
                  setAnswers((prev) => ({ ...prev, [q.key]: next }))
                }
              />
            ))}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Outcome
              </label>
              <textarea
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                rows={3}
                disabled={isSaving}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                placeholder="What was discussed / decided?"
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="rounded-lg border border-slate-200/95 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() =>
                void onConfirm({
                  outcome: outcome.trim(),
                  meeting_with_doctor: answers.meeting_with_doctor as boolean,
                  meeting_with_purchase: answers.meeting_with_purchase as boolean,
                  meeting_with_finance: answers.meeting_with_finance as boolean,
                  meeting_with_engineer: answers.meeting_with_engineer as boolean,
                  new_product_introduced: answers.new_product_introduced as boolean,
                  order_received: answers.order_received as boolean,
                })
              }
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Complete"}
            </button>
          </div>
        </div>
      </div>
    </LargeModalPortal>
  );
}

export default CompleteVisitModal;
