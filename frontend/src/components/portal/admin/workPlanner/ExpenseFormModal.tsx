"use client";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { useEffect, useMemo, useState } from "react";

import { toast } from "@/lib/toast";
import { useCreateAttachmentMutation } from "@/store/api";
import {
  WORK_PLAN_EXPENSE_CATEGORIES,
  WORK_PLAN_EXPENSE_PAYMENT_MODES,
  WORK_PLAN_TRAVEL_SUB_CATEGORIES,
  type WorkPlanExpenseAttachment,
  type WorkPlanExpenseRecord,
  type WorkPlanVisitRecord,
} from "@/store/api/slices/workPlansApi";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";

const DEFAULT_TRAVEL_SUB = WORK_PLAN_TRAVEL_SUB_CATEGORIES[0];

export type ExpenseFormPayload = {
  expense_date: string;
  category: string;
  sub_category?: string;
  amount: number;
  payment_mode: string;
  vendor_name?: string;
  bill_number?: string;
  bill_date?: string;
  description?: string;
  work_plan_visit?: string | null;
  receipt_attachment?: string | null;
  start_reading?: number | null;
  closing_reading?: number | null;
  start_reading_image?: string | null;
  end_reading_image?: string | null;
};

export type ExpenseFormModalProps = {
  open: boolean;
  isSaving: boolean;
  visits: WorkPlanVisitRecord[];
  initial?: WorkPlanExpenseRecord | null;
  defaultVisitId?: string | null;
  onClose: () => void;
  onConfirm: (payload: ExpenseFormPayload) => void | Promise<void>;
};

function ymd(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function visitOptionLabel(v: WorkPlanVisitRecord, index: number) {
  const party =
    (typeof v.party === "object" && v.party?.party_name) ||
    v.party_name ||
    `Visit ${v.sequence ?? index + 1}`;
  return `#${v.sequence ?? index + 1} — ${party}`;
}

function attachmentIdOf(
  att?: string | WorkPlanExpenseAttachment | null,
): string | null {
  if (!att) return null;
  if (typeof att === "string") return att;
  return att._id || null;
}

function attachmentLabelOf(
  att?: string | WorkPlanExpenseAttachment | null,
  fallback = "Attached",
): string {
  if (!att) return "";
  if (typeof att === "string") return fallback;
  return att.original_name || att.file_name || fallback;
}

/** Attachment.entity_id is ObjectId — draft-* placeholders cause 400. */
function provisionalEntityId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function ExpenseFormModal({
  open,
  isSaving,
  visits,
  initial,
  defaultVisitId,
  onClose,
  onConfirm,
}: ExpenseFormModalProps) {
  const [createAttachment, attachState] = useCreateAttachmentMutation();
  const editing = Boolean(initial?._id || initial?.id);

  const [expenseDate, setExpenseDate] = useState("");
  const [category, setCategory] = useState("Travel");
  const [subCategory, setSubCategory] = useState<string>(DEFAULT_TRAVEL_SUB);
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [vendorName, setVendorName] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState("");
  const [description, setDescription] = useState("");
  const [visitId, setVisitId] = useState("");
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptLabel, setReceiptLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [startReading, setStartReading] = useState("");
  const [closingReading, setClosingReading] = useState("");
  const [startReadingImageId, setStartReadingImageId] = useState<string | null>(
    null,
  );
  const [startReadingImageLabel, setStartReadingImageLabel] = useState("");
  const [startReadingFile, setStartReadingFile] = useState<File | null>(null);
  const [endReadingImageId, setEndReadingImageId] = useState<string | null>(null);
  const [endReadingImageLabel, setEndReadingImageLabel] = useState("");
  const [endReadingFile, setEndReadingFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setExpenseDate(ymd(initial.expense_date) || ymd(new Date()));
      setCategory(String(initial.category || "Travel"));
      setSubCategory(String(initial.sub_category || DEFAULT_TRAVEL_SUB));
      setAmount(
        initial.amount != null && Number.isFinite(Number(initial.amount))
          ? String(initial.amount)
          : "",
      );
      setPaymentMode(String(initial.payment_mode || "Cash"));
      setVendorName(initial.vendor_name || "");
      setBillNumber(initial.bill_number || "");
      setBillDate(ymd(initial.bill_date));
      setDescription(initial.description || "");
      setVisitId(
        initial.work_plan_visit ? String(initial.work_plan_visit) : "",
      );
      const rid = attachmentIdOf(initial.receipt_attachment);
      setReceiptId(rid);
      setReceiptLabel(
        attachmentLabelOf(initial.receipt_attachment, "Attached receipt"),
      );
      setFile(null);
      setStartReading(
        initial.start_reading != null && Number.isFinite(Number(initial.start_reading))
          ? String(initial.start_reading)
          : "",
      );
      setClosingReading(
        initial.closing_reading != null &&
          Number.isFinite(Number(initial.closing_reading))
          ? String(initial.closing_reading)
          : "",
      );
      const sid = attachmentIdOf(initial.start_reading_image);
      setStartReadingImageId(sid);
      setStartReadingImageLabel(
        attachmentLabelOf(initial.start_reading_image, "Start reading image"),
      );
      setStartReadingFile(null);
      const eid = attachmentIdOf(initial.end_reading_image);
      setEndReadingImageId(eid);
      setEndReadingImageLabel(
        attachmentLabelOf(initial.end_reading_image, "End reading image"),
      );
      setEndReadingFile(null);
    } else {
      setExpenseDate(ymd(new Date()));
      setCategory("Travel");
      setSubCategory(DEFAULT_TRAVEL_SUB);
      setAmount("");
      setPaymentMode("Cash");
      setVendorName("");
      setBillNumber("");
      setBillDate("");
      setDescription("");
      setVisitId(defaultVisitId ? String(defaultVisitId) : "");
      setReceiptId(null);
      setReceiptLabel("");
      setFile(null);
      setStartReading("");
      setClosingReading("");
      setStartReadingImageId(null);
      setStartReadingImageLabel("");
      setStartReadingFile(null);
      setEndReadingImageId(null);
      setEndReadingImageLabel("");
      setEndReadingFile(null);
    }
  }, [open, initial, defaultVisitId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving && !attachState.isLoading) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, isSaving, attachState.isLoading, onClose]);

  const busy = isSaving || attachState.isLoading;
  const isTravel = category === "Travel";
  const isPrivateBike = isTravel && subCategory === "Private Bike";

  const travelSubOptions = useMemo(() => {
    const base = [...WORK_PLAN_TRAVEL_SUB_CATEGORIES] as string[];
    if (subCategory && !base.includes(subCategory)) base.unshift(subCategory);
    return base;
  }, [subCategory]);

  const canSubmit = useMemo(() => {
    if (!expenseDate || !category || !paymentMode) return false;
    if (isTravel && !subCategory) return false;
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) return false;
    if (isPrivateBike) {
      const start = Number(startReading);
      const closing = Number(closingReading);
      if (!Number.isFinite(start) || start < 0) return false;
      if (!Number.isFinite(closing) || closing < 0) return false;
      if (closing < start) return false;
      if (!(startReadingFile || startReadingImageId)) return false;
      if (!(endReadingFile || endReadingImageId)) return false;
    }
    return true;
  }, [
    expenseDate,
    category,
    paymentMode,
    isTravel,
    subCategory,
    amount,
    isPrivateBike,
    startReading,
    closingReading,
    startReadingFile,
    startReadingImageId,
    endReadingFile,
    endReadingImageId,
  ]);

  if (!open) return null;

  const uploadAttachment = async (uploadFile: File, remarks: string) => {
    const entityId = String(initial?._id || initial?.id || provisionalEntityId());
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("entity_type", "work_plan_expense");
    fd.append("entity_id", entityId);
    fd.append("remarks", remarks);
    const uploaded = (await createAttachment(fd).unwrap()) as {
      _id?: string;
      id?: string;
    };
    const id = String(uploaded._id || uploaded.id || "");
    if (!id) throw new Error("No attachment id");
    return id;
  };

  const handleSubmit = async () => {
    if (!canSubmit || busy) return;
    let nextReceiptId = receiptId;
    let nextStartImageId = startReadingImageId;
    let nextEndImageId = endReadingImageId;
    try {
      if (file) {
        nextReceiptId = await uploadAttachment(file, "Work plan expense receipt");
      }
      if (isPrivateBike) {
        if (startReadingFile) {
          if (!startReadingFile.type.startsWith("image/")) {
            toast.error("Start reading must be an image");
            return;
          }
          nextStartImageId = await uploadAttachment(
            startReadingFile,
            "Private Bike start reading",
          );
        }
        if (endReadingFile) {
          if (!endReadingFile.type.startsWith("image/")) {
            toast.error("End reading must be an image");
            return;
          }
          nextEndImageId = await uploadAttachment(
            endReadingFile,
            "Private Bike end reading",
          );
        }
      }

      await onConfirm({
        expense_date: expenseDate,
        category,
        sub_category: isTravel ? subCategory : undefined,
        amount: Number(amount),
        payment_mode: paymentMode,
        vendor_name: vendorName.trim() || undefined,
        bill_number: billNumber.trim() || undefined,
        bill_date: billDate || undefined,
        description: description.trim() || undefined,
        work_plan_visit: visitId || null,
        receipt_attachment: nextReceiptId,
        start_reading: isPrivateBike ? Number(startReading) : null,
        closing_reading: isPrivateBike ? Number(closingReading) : null,
        start_reading_image: isPrivateBike ? nextStartImageId : null,
        end_reading_image: isPrivateBike ? nextEndImageId : null,
      });
    } catch {
      // Parent / upload toast handles errors
    }
  };

  return (
    <LargeModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
        role="presentation"
        onClick={() => !busy && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editing ? "Edit expense" : "Add expense"}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Link to a visit or keep it at plan level. Receipts are optional.
              {isPrivateBike
                ? " Private Bike requires start/closing meter readings and images."
                : ""}
            </p>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Expense date
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  disabled={busy}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Amount
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  disabled={busy}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Link to visit
              </label>
              <select
                value={visitId}
                disabled={busy}
                onChange={(e) => setVisitId(e.target.value)}
                className={inputClass}
              >
                <option value="">Plan-level (no visit)</option>
                {visits.map((v, i) => {
                  const id = String(v._id || v.id || "");
                  return (
                    <option key={id} value={id}>
                      {visitOptionLabel(v, i)}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Category
                </label>
                <select
                  value={category}
                  disabled={busy}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCategory(next);
                    if (next === "Travel" && !subCategory) {
                      setSubCategory(DEFAULT_TRAVEL_SUB);
                    }
                  }}
                  className={inputClass}
                >
                  {WORK_PLAN_EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {isTravel ? (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Sub-category
                  </label>
                  <select
                    value={subCategory}
                    disabled={busy}
                    onChange={(e) => setSubCategory(e.target.value)}
                    className={inputClass}
                  >
                    {travelSubOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Payment mode
                  </label>
                  <select
                    value={paymentMode}
                    disabled={busy}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className={inputClass}
                  >
                    {WORK_PLAN_EXPENSE_PAYMENT_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {isTravel ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Payment mode
                </label>
                <select
                  value={paymentMode}
                  disabled={busy}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className={inputClass}
                >
                  {WORK_PLAN_EXPENSE_PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {isPrivateBike ? (
              <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-white/10">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Private Bike meter readings
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Start reading
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={startReading}
                      disabled={busy}
                      onChange={(e) => setStartReading(e.target.value)}
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Closing reading
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={closingReading}
                      disabled={busy}
                      onChange={(e) => setClosingReading(e.target.value)}
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Start reading image
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setStartReadingFile(f);
                      if (f) setStartReadingImageLabel(f.name);
                    }}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-white/10 dark:file:text-slate-100"
                  />
                  {startReadingImageLabel ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {startReadingFile
                        ? `Selected: ${startReadingImageLabel}`
                        : `Current: ${startReadingImageLabel}`}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    End reading image
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setEndReadingFile(f);
                      if (f) setEndReadingImageLabel(f.name);
                    }}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-white/10 dark:file:text-slate-100"
                  />
                  {endReadingImageLabel ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {endReadingFile
                        ? `Selected: ${endReadingImageLabel}`
                        : `Current: ${endReadingImageLabel}`}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Vendor name
                </label>
                <input
                  value={vendorName}
                  disabled={busy}
                  onChange={(e) => setVendorName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Bill number
                </label>
                <input
                  value={billNumber}
                  disabled={busy}
                  onChange={(e) => setBillNumber(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Bill date
              </label>
              <input
                type="date"
                value={billDate}
                disabled={busy}
                onChange={(e) => setBillDate(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Description
              </label>
              <textarea
                value={description}
                disabled={busy}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Receipt (image / PDF)
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  if (f) setReceiptLabel(f.name);
                }}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 dark:text-slate-300 dark:file:bg-white/10 dark:file:text-slate-100"
              />
              {receiptLabel ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {file ? `Selected: ${receiptLabel}` : `Current: ${receiptLabel}`}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-lg border border-slate-200/95 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !canSubmit}
              onClick={() => void handleSubmit()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : editing ? "Save" : "Add expense"}
            </button>
          </div>
        </div>
      </div>
    </LargeModalPortal>
  );
}

export default ExpenseFormModal;
