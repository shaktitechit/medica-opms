"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAppSelector } from "@/store";
import {
  useGetOrderQuery,
  useListFlagsQuery,
  useGetOrderHistoryQuery,
  useTransitionOrderMutation,
  useListAttachmentsQuery,
  useCreateAttachmentMutation,
  useListUsersQuery,
  usePatchOrderMutation,
  useListPartiesQuery,
  useGetPartyQuery,
  useGetOrderFulfillmentQuery,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";

import {
  buildPartyNameById,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { OrderDetailTabsNav } from "@/components/portal/shared/OrderDetailTabsNav";
import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";
import { OrderDepartmentFulfillmentPanel } from "@/components/portal/shared/OrderDepartmentFulfillmentPanel";
import OrderTab from "./components/OrderTab";
import FlagsTab from "./components/FlagsTab";
import AttachmentsTab from "./components/AttachmentsTab";
import FinanceApprovalsTab from "./components/FinanceApprovalsTab";
import DispatchesTab from "./components/DispatchesTab";
import TransportsTab from "./components/TransportsTab";

const btnSecondaryClass =
  "rounded-lg border border-slate-200/95 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5";

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

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

function formatStatusLabel(v: string): string {
  return v
    ? v
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
    : "—";
}

function statusBadgeClass(status: string): string {
  if (status === "cancelled" || status.includes("rejected")) {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-500/20";
  }
  if (status === "on_hold" || status === "submitted") {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/15 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-500/20";
  }
  if (status.includes("dispatch") || status.includes("transport")) {
    return "bg-blue-50 text-blue-700 ring-1 ring-blue-600/15 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-500/20";
  }
  if (status === "delivered" || status.includes("approved")) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10";
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

function detailRefId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return "";
}

function displayText(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export default function SalesOrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { data, isFetching, isError, refetch } = useGetOrderQuery(orderId);
  const user = useAppSelector((s) => s.auth.user);

  const [activeTab, setActiveTab] = useState<
    "flags" | "attachments" | "finance_approvals" | "dispatches" | "transports"
  >("finance_approvals");

  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitRemarks, setSubmitRemarks] = useState("");
  const [submitAssignee, setSubmitAssignee] = useState("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  const adminUsersQ = useListUsersQuery({ department: "admin" });
  const adminUsers = useMemo(() => pickList(adminUsersQ.data), [adminUsersQ.data]);
  const usersQ = useListUsersQuery({});
  const users = useMemo(() => pickList(usersQ.data), [usersQ.data]);

  const resolveUser = useCallback(
    (userVal: unknown): { name: string; phone: string } => {
      if (!userVal) return { name: "—", phone: "" };
      if (typeof userVal === "object" && userVal !== null) {
        const u = userVal as Record<string, unknown>;
        if (u.name || u.phone) {
          return {
            name: String(u.name || u.username || "—"),
            phone: String(u.phone || ""),
          };
        }
      }
      const userId = typeof userVal === "string" ? userVal : String((userVal as any)?._id ?? (userVal as any)?.id ?? "");
      if (!userId) return { name: "—", phone: "" };
      const found = users.find((u) => String((u as any)._id ?? (u as any).id ?? "") === userId);
      if (found) {
        return {
          name: String((found as any).name || (found as any).username || "—"),
          phone: String((found as any).phone || ""),
        };
      }
      return { name: "—", phone: "" };
    },
    [users]
  );
  const partiesQ = useListPartiesQuery({});
  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );

  const [patchOrder] = usePatchOrderMutation();

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadRemarks, setUploadRemarks] = useState("");
  const [createAttachment, { isLoading: isUploading }] = useCreateAttachmentMutation();

  const attachmentsQ = useListAttachmentsQuery({
    entity_type: "order",
    entity_id: orderId,
  });
  const attachmentsList = useMemo(() => pickList(attachmentsQ.data), [attachmentsQ.data]);
  const attachmentsCount = attachmentsList.length;

  const flagsQ = useListFlagsQuery({ order: orderId });
  const openFlagsCount = useMemo(() => {
    const arr = pickList(flagsQ.data);
    return arr.filter((f) => {
      if (!f || typeof f !== "object") return false;
      return (f as Record<string, unknown>).status === "open";
    }).length;
  }, [flagsQ.data]);

  const historyQ = useGetOrderHistoryQuery(orderId);
  const historyCount = useMemo(() => {
    const arr = pickList(historyQ.data);
    return arr.length;
  }, [historyQ.data]);

  const fulfillmentQ = useGetOrderFulfillmentQuery(orderId);

  const [transitionOrder] = useTransitionOrderMutation();

  const detail =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;

  const status = deriveOrderWorkflowStatus(detail);
  const isDraft = status === "draft";

  const fulfillmentSnapshot = useMemo(
    () =>
      fulfillmentQ.data && typeof fulfillmentQ.data === "object"
        ? (fulfillmentQ.data as Record<string, unknown>)
        : null,
    [fulfillmentQ.data],
  );
  const currentPartyId = detail ? detailRefId(detail.party) : "";
  const partyDetailQ = useGetPartyQuery(currentPartyId, {
    skip: !currentPartyId,
  });

  const custLabel = useMemo(
    () =>
      detail ? resolveOrderCounterparty(detail, partyNameById) : "—",
    [detail, partyNameById],
  );

  const resolveUserId = useCallback((userVal: unknown): string => {
    if (!userVal) return "";
    if (typeof userVal === "string") return userVal;
    if (typeof userVal === "object" && userVal !== null) {
      const o = userVal as Record<string, unknown>;
      return String(o._id ?? o.id ?? "");
    }
    return "";
  }, []);



  const allDepartmentsAssigned = useMemo(() => {
    if (!detail) return false;
    return Boolean(
      resolveUserId(detail.assigned_sales_user) &&
      resolveUserId(detail.assigned_finance_user) &&
      resolveUserId(detail.assigned_dispatch_user) &&
      resolveUserId(detail.assigned_admin_user)
    );
  }, [detail, resolveUserId]);

  const readOnlyItems = useMemo(() => {
    if (!detail || !Array.isArray(detail.order_items)) return [];
    return detail.order_items as Record<string, unknown>[];
  }, [detail]);

  const orderKpis = useMemo(() => {
    const fulfillment =
      fulfillmentQ.data && typeof fulfillmentQ.data === "object"
        ? (fulfillmentQ.data as Record<string, unknown>)
        : null;
    const totals =
      fulfillment?.totals && typeof fulfillment.totals === "object"
        ? (fulfillment.totals as Record<string, unknown>)
        : null;

    const totalLines = readOnlyItems.length;
    const totalQty = Number(totals?.ordered ?? readOnlyItems.reduce(
      (sum, line) => sum + Number(line.ordered_quantity ?? line.quantity ?? 0),
      0,
    ));
    const financeApprovedQty = Number(totals?.approved ?? readOnlyItems.reduce(
      (sum, line) => sum + Number(line.approved_quantity || 0),
      0,
    ));
    const dispatchedQty = Number(totals?.dispatched ?? readOnlyItems.reduce(
      (sum, line) => sum + Number(line.dispatched_quantity || 0),
      0,
    ));
    const pendingQty = Number(
      totals?.pendingDispatch ??
        readOnlyItems.reduce((sum, line) => {
          const approved = Number(line.approved_quantity || 0);
          const cap = approved > 0 ? approved : Number(line.ordered_quantity ?? line.quantity ?? 0);
          return sum + Math.max(0, cap - Number(line.dispatched_quantity || 0));
        }, 0),
    );

    return {
      totalLines,
      totalQty,
      dispatchedQty,
      pendingQty,
      financeApprovedQty,
      openFlags: openFlagsCount,
      allDepartmentsAssigned,
    };
  }, [allDepartmentsAssigned, fulfillmentQ.data, openFlagsCount, readOnlyItems]);



  const handleRefetch = useCallback(() => {
    refetch();
    if (!flagsQ.isUninitialized) flagsQ.refetch();
    if (!historyQ.isUninitialized) historyQ.refetch();
    if (!attachmentsQ.isUninitialized) attachmentsQ.refetch();
    if (!fulfillmentQ.isUninitialized) fulfillmentQ.refetch();
  }, [attachmentsQ, fulfillmentQ, flagsQ, historyQ, refetch]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.error("Please select a file first");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("entity_type", "order");
      formData.append("entity_id", orderId);
      formData.append("remarks", uploadRemarks.trim());

      await createAttachment(formData).unwrap();
      toast.success("Attachment uploaded successfully");
      setUploadFile(null);
      setUploadRemarks("");
      setIsUploadModalOpen(false);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  };

  const handleSubmitOrder = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!orderId) return;
      if (!submitAssignee) {
        toast.error("Please select an admin operator.");
        return;
      }
      setIsSubmittingOrder(true);
      try {
        await patchOrder({
          id: orderId,
          patch: {
            assigned_admin_user: submitAssignee,
          },
        }).unwrap();

        await transitionOrder({
          id: orderId,
          body: {
            next_status: "submitted",
            remarks: submitRemarks.trim() || undefined,
          },
        }).unwrap();

        toast.success("Order submitted successfully.");
        setIsSubmitModalOpen(false);
        setSubmitRemarks("");
        setSubmitAssignee("");
        handleRefetch();
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
      } finally {
        setIsSubmittingOrder(false);
      }
    },
    [orderId, submitAssignee, submitRemarks, patchOrder, transitionOrder, handleRefetch]
  );

  return (
    <div className="space-y-6">
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <form
            onSubmit={handleSubmitOrder}
            className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900"
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Submit Order
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Assign an admin operator and add remarks to submit this order.
            </p>

            <div className="mt-4 space-y-4 font-sans text-sm">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Assign Admin Operator *
                </label>
                <select
                  required
                  value={submitAssignee}
                  onChange={(e) => setSubmitAssignee(e.target.value)}
                  className="w-full mt-1.5 rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50 font-medium"
                >
                  <option value="">-- Select Admin Operator --</option>
                  {adminUsers.map((u) => {
                    const userRow = u as Record<string, unknown>;
                    const id = String(userRow._id ?? userRow.id ?? "");
                    return (
                      <option key={id} value={id}>
                        {displayText(userRow.name)} ({displayText(userRow.email)})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Remarks (Optional)
                </label>
                <textarea
                  value={submitRemarks}
                  onChange={(e) => setSubmitRemarks(e.target.value)}
                  rows={3}
                  className="w-full mt-1.5 rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                  placeholder="Type remarks..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 font-sans font-medium">
              <button
                type="button"
                onClick={() => {
                  setIsSubmitModalOpen(false);
                  setSubmitRemarks("");
                  setSubmitAssignee("");
                }}
                className="rounded-lg border border-slate-200/95 px-3 py-2 text-sm text-slate-800 transition hover:bg-slate-50 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingOrder}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {isSubmittingOrder ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Submitting...
                  </>
                ) : (
                  "Confirm Submit"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-slate-900 transition-all">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                Upload Attachment
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setUploadFile(null);
                  setUploadRemarks("");
                }}
                className="rounded-md text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 p-1"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="mt-4 space-y-4">
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 p-6 text-center hover:border-blue-500 transition cursor-pointer relative">
                <input
                  type="file"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadFile(e.target.files[0]);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                
                <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>

                <div className="mt-4 flex text-sm text-slate-600 dark:text-slate-400">
                  <span className="relative rounded-md font-semibold text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    Upload a file
                  </span>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-slate-500">Any file up to 50MB</p>
              </div>

              {uploadFile && (
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950 border border-slate-100 dark:border-white/5 flex items-center justify-between">
                  <div className="flex items-center space-x-2 min-w-0">
                    <svg className="h-5 w-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                        {uploadFile.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadFile(null)}
                    className="text-xs text-rose-500 hover:underline font-medium"
                  >
                    Remove
                  </button>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Remarks (Optional)
                </label>
                <textarea
                  value={uploadRemarks}
                  onChange={(e) => setUploadRemarks(e.target.value)}
                  rows={2}
                  className="w-full mt-1.5 rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50"
                  placeholder="Add remarks or notes for this attachment..."
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadModalOpen(false);
                    setUploadFile(null);
                    setUploadRemarks("");
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !uploadFile}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Uploading...
                    </>
                  ) : (
                    "Upload"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(isFetching || isError || !detail) && (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.back()} className={btnSecondaryClass}>
            Back
          </button>
        </div>
      )}

      {isFetching && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Loading order...
        </p>
      )}
      {isError && (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          Could not load order details.
        </p>
      )}

      {!isFetching && !isError && detail && (
        <>
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <button
                      type="button"
                      onClick={() => router.back()}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Orders
                    </button>
                    <span>/</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      Order Details
                    </span>
                  </div>
                  <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
                    {detail.order_no ? String(detail.order_no) : "Order"}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>
                      Party:{" "}
                      <b className="font-semibold text-slate-700 dark:text-slate-200">
                        {custLabel}
                      </b>
                    </span>
                    <span>Order Date: {formatDateShort(detail.order_date)}</span>
                    <span>
                      Expected: {formatDateShort(detail.expected_delivery_date)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-[10px] text-slate-500 dark:text-slate-400 sm:grid-cols-4">
                  <div>
                    <span className="block uppercase tracking-wide">Created By</span>
                    <b className="text-[11px] text-slate-800 dark:text-slate-100">
                      Sales
                    </b>
                  </div>
                  <div>
                    <span className="block uppercase tracking-wide">Created On</span>
                    <b className="text-[11px] text-slate-800 dark:text-slate-100">
                      {formatDateShort(detail.createdAt)}
                    </b>
                  </div>
                  <div>
                    <span className="block uppercase tracking-wide">Last Modified</span>
                    <b className="text-[11px] text-slate-800 dark:text-slate-100">
                      {formatDateShort(detail.updatedAt)}
                    </b>
                  </div>
                  <div>
                    <span className="block uppercase tracking-wide">Priority</span>
                    <b className="capitalize text-[11px] text-slate-800 dark:text-slate-100">
                      {String(detail.priority || "normal")}
                    </b>
                  </div>
                </div>
              </div>

              <OrderDepartmentFulfillmentPanel
                className="mt-3"
                order={detail}
                fulfillmentSnapshot={fulfillmentSnapshot}
              />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-white/10">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(true)}
                    className={btnSecondaryClass}
                  >
                    Upload Attachment
                  </button>
                  <button
                    type="button"
                    disabled={status !== "draft"}
                    onClick={() => {
                      setSubmitAssignee(resolveUserId(detail?.assigned_admin_user) || "");
                      setSubmitRemarks("");
                      setIsSubmitModalOpen(true);
                    }}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                  >
                    Submit Order
                  </button>
                </div>
                <button type="button" onClick={handleRefetch} className={btnSecondaryClass}>
                  Refresh
                </button>
              </div>
            </div>

            {/* <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                ["Total Items", String(orderKpis.totalLines), "Catalog lines"],
                ["Total Qty", String(orderKpis.totalQty), "Ordered quantity"],
                ["Pending Qty", String(orderKpis.pendingQty), "Pending dispatch"],
                ["Dispatched", String(orderKpis.dispatchedQty), "Completed qty"],
                ["Finance Approved", String(orderKpis.financeApprovedQty), "Approved quantity"],
                [
                  "Risk / Flags",
                  String(orderKpis.openFlags),
                  orderKpis.openFlags > 0 ? "Needs attention" : "No open flags",
                ],
              ].map(([label, value, help]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {label}
                  </div>
                  <div className="mt-1 text-base font-bold tabular-nums text-slate-950 dark:text-slate-50">
                    {value}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                    {help}
                  </div>
                </div>
              ))}
            </div> */}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
                <div>
                  <h2 className="text-sm font-bold text-slate-950 dark:text-slate-50">
                    Order Details
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Status, routing, and delivery information.
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(status)}`}
                >
                  {formatStatusLabel(status)}
                </span>
              </div>

              <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-slate-500">Order No</dt>
                  <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {String(detail.order_no ?? "—")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Priority</dt>
                  <dd className="mt-0.5 capitalize font-semibold text-slate-900 dark:text-slate-100">
                    {typeof detail.priority === "string" ? detail.priority : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Order Date</dt>
                  <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                    {formatDate(detail.order_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Expected Delivery</dt>
                  <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                    {formatDate(detail.expected_delivery_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Assigned Sales</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {resolveUser(detail.assigned_sales_user).name}
                    {resolveUser(detail.assigned_sales_user).phone && (
                      <span className="ml-1 text-slate-500 font-normal">
                        ({resolveUser(detail.assigned_sales_user).phone})
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Assigned Admin</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {resolveUser(detail.assigned_admin_user).name}
                    {resolveUser(detail.assigned_admin_user).phone && (
                      <span className="ml-1 text-slate-500 font-normal">
                        ({resolveUser(detail.assigned_admin_user).phone})
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Assigned Finance</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {resolveUser(detail.assigned_finance_user).name}
                    {resolveUser(detail.assigned_finance_user).phone && (
                      <span className="ml-1 text-slate-500 font-normal">
                        ({resolveUser(detail.assigned_finance_user).phone})
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-slate-500">Assigned Dispatch</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {resolveUser(detail.assigned_dispatch_user).name}
                    {resolveUser(detail.assigned_dispatch_user).phone && (
                      <span className="ml-1 text-slate-500 font-normal">
                        ({resolveUser(detail.assigned_dispatch_user).phone})
                      </span>
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-slate-500">Remarks</dt>
                  <dd className="mt-0.5 min-h-8 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-slate-900 dark:bg-slate-950/40 dark:text-slate-100">
                    {typeof detail.remarks === "string" && detail.remarks.trim()
                      ? detail.remarks
                      : "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
                <div>
                  <h2 className="text-sm font-bold text-slate-950 dark:text-slate-50">
                    Party Details
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Counterparty profile and delivery addresses.
                  </p>
                </div>
                {partyDetailQ.data &&
                typeof partyDetailQ.data === "object" &&
                "party_type" in partyDetailQ.data ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-950 dark:text-slate-300 dark:ring-white/10">
                    {String((partyDetailQ.data as Record<string, unknown>).party_type ?? "party")}
                  </span>
                ) : null}
              </div>

              {partyDetailQ.isFetching ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Loading party details...
                </p>
              ) : partyDetailQ.isError ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  Error loading party details.
                </p>
              ) : partyDetailQ.data ? (
                (() => {
                  const p = partyDetailQ.data as Record<string, unknown>;
                  return (
                    <div className="space-y-3 text-xs">
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Party Name</dt>
                          <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                            {displayText(p.party_name) !== "—" ? displayText(p.party_name) : custLabel}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Contact</dt>
                          <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                            {displayText(p.contact_person)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Mobile</dt>
                          <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                            {displayText(p.mobile)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Email</dt>
                          <dd className="mt-0.5 truncate text-slate-900 dark:text-slate-100">
                            {displayText(p.email)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">GST Number</dt>
                          <dd className="mt-0.5 font-mono text-slate-900 dark:text-slate-100">
                            {displayText(p.gst_no)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Payment Terms</dt>
                          <dd className="mt-0.5 text-slate-900 dark:text-slate-100">
                            {displayText(p.payment_terms)}
                          </dd>
                        </div>
                      </dl>
                      <div className="grid gap-3 border-t border-slate-100 pt-3 dark:border-white/10 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Billing Address</dt>
                          <dd className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                            {formatStructuredAddress(p.billing_address)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Shipping Address</dt>
                          <dd className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                            {formatStructuredAddress(p.shipping_address)}
                          </dd>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No party linked on this order.
                </p>
              )}
            </section>
          </div>

          <OrderTab
            orderId={orderId}
            detail={detail}
            isDraft={isDraft}
            user={user}
            refetchOrder={handleRefetch}
          />

          <OrderDetailTabsNav
            tabs={[
              { id: "flags", name: "Flags", count: openFlagsCount, dangerBadge: true },
              { id: "attachments", name: "Attachments", count: attachmentsCount },
              { id: "finance_approvals", name: "Finance Approvals & Allocations" },
              { id: "dispatches", name: "Dispatches" },
              { id: "transports", name: "Transports" },
            ]}
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as typeof activeTab)}
          />

          {/* TABS CONTENT */}
          {activeTab === "flags" && (
            <FlagsTab orderId={orderId} refetchOrder={handleRefetch} />
          )}

          {activeTab === "attachments" && (
            <AttachmentsTab
              orderId={orderId}
              attachments={attachmentsList}
              isLoading={attachmentsQ.isLoading}
            />
          )}

          {activeTab === "finance_approvals" && (
            <FinanceApprovalsTab
              orderId={orderId}
              detail={detail}
              refetchOrder={handleRefetch}
            />
          )}

          {activeTab === "dispatches" && (
            <DispatchesTab
              orderId={orderId}
              detail={detail}
              refetchOrder={handleRefetch}
            />
          )}

          {activeTab === "transports" && (
            <TransportsTab
              orderId={orderId}
              detail={detail}
              refetchOrder={handleRefetch}
            />
          )}
        </>
      )}
    </div>
  );
}
