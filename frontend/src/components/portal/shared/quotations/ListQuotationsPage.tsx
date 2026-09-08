/**
 * @fileoverview Universal Quotation Master Page.
 * Accessible across Sales, Admin, Finance, and Super Admin portals.
 * @module components/portal/shared/quotations/ListQuotationsPage
 */
"use client";

import React, { useState, useMemo } from "react";
import {
  FileText,
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  Mail,
  RefreshCw,
  TrendingUp,
  CheckCircle2,
  Clock,
  Building2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  BookOpen,
  Check,
  X,
  Lock,
  Send,
} from "lucide-react";
import {
  useListQuotationsQuery,
  useDeleteQuotationMutation,
  useSubmitQuotationForApprovalMutation,
  useApproveQuotationMutation,
  useRejectQuotationMutation,
  type QuotationRecord,
  type LeadQuotationRecord,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { toast } from "@/lib/toast";
import {
  formatCurrencyINR,
  isAssignedSignatory,
  canViewQuotationPdf,
  canEmailQuotation,
  canEditQuotation,
  canManageQuotations,
  canSubmitForApproval,
  isDraftVisible,
} from "./quotationUtils";
import { QuotationViewModal } from "./QuotationViewModal";
import { QuotationFormModal } from "./QuotationFormModal";
import { SendQuotationEmailModal } from "./SendQuotationEmailModal";
import { TermsAndConditionsModal } from "./TermsAndConditionsModal";

type Props = {
  portalHome?: string;
  portalLabel?: string;
};

const STATUS_OPTIONS: Array<{ value: string; label: string; badgeClass: string }> = [
  { value: "all", label: "All Statuses", badgeClass: "" },
  { value: "pending_approval", label: "Pending Approval", badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  { value: "approved", label: "Approved", badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" },
  { value: "draft", label: "Draft", badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { value: "sent", label: "Sent", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" },
  { value: "accepted", label: "Accepted", badgeClass: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300" },
  { value: "rejected", label: "Rejected", badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
  { value: "expired", label: "Expired", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
];

export function ListQuotationsPage({
  portalHome = "/admin",
  portalLabel = "Admin Portal",
}: Props) {
  void portalHome;
  // Query parameters state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 25;

  const authUser = useAppSelector((state) => state.auth.user);

  // RTK Query API call
  const { data: rawQuotations, isLoading, isFetching, refetch } = useListQuotationsQuery({
    search: searchTerm || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    page,
    limit,
  });

  const quotations: QuotationRecord[] = useMemo(() => {
    let list: QuotationRecord[] = [];
    if (Array.isArray(rawQuotations)) list = rawQuotations;
    else if (rawQuotations && typeof rawQuotations === "object" && "quotations" in rawQuotations) {
      list = (rawQuotations as { quotations: QuotationRecord[] }).quotations || [];
    }
    return list.filter((q) => isDraftVisible(authUser, q as unknown as Parameters<typeof isDraftVisible>[1]));
  }, [rawQuotations, authUser]);

  // Modal States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [viewQuotation, setViewQuotation] = useState<LeadQuotationRecord | null>(null);
  const [editQuotation, setEditQuotation] = useState<LeadQuotationRecord | null>(null);
  const [emailQuotation, setEmailQuotation] = useState<LeadQuotationRecord | null>(null);
  const [deleteQuotationTarget, setDeleteQuotationTarget] = useState<QuotationRecord | null>(null);
  const [submitApprovalTarget, setSubmitApprovalTarget] = useState<QuotationRecord | null>(null);
  const [approveTarget, setApproveTarget] = useState<QuotationRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<QuotationRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");

  const [deleteQuotation, { isLoading: isDeleting }] = useDeleteQuotationMutation();
  const [submitForApproval, { isLoading: isSubmitting }] = useSubmitQuotationForApprovalMutation();
  const [approveQuotation, { isLoading: isApproving }] = useApproveQuotationMutation();
  const [rejectQuotation, { isLoading: isRejecting }] = useRejectQuotationMutation();

  const handleSubmitForApproval = async () => {
    if (!submitApprovalTarget) return;
    const qNo = submitApprovalTarget.quotation_no;
    try {
      await submitForApproval({ quotationId: submitApprovalTarget._id }).unwrap();
      toast.success(`Quotation ${qNo} submitted for signatory approval`);
      setSubmitApprovalTarget(null);
      refetch();
    } catch {
      toast.error("Failed to submit quotation for approval");
    }
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    const qNo = approveTarget.quotation_no;
    try {
      await approveQuotation({ quotationId: approveTarget._id }).unwrap();
      toast.success(`Quotation ${qNo} approved successfully`);
      setApproveTarget(null);
      refetch();
    } catch {
      toast.error("Failed to approve quotation");
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    const qNo = rejectTarget.quotation_no;
    if (!rejectionReason.trim()) {
      toast.error("Please provide a reason for rejecting this quotation");
      return;
    }
    try {
      await rejectQuotation({
        quotationId: rejectTarget._id,
        rejection_reason: rejectionReason.trim(),
      }).unwrap();
      toast.success(`Quotation ${qNo} rejected`);
      setRejectTarget(null);
      setRejectionReason("");
      refetch();
    } catch {
      toast.error("Failed to reject quotation");
    }
  };

  // Metrics computation
  const metrics = useMemo(() => {
    const totalCount = quotations.length;
    const grandTotalSum = quotations.reduce((sum, q) => sum + (q.grand_total || 0), 0);
    const acceptedCount = quotations.filter((q) => q.status === "accepted").length;
    const acceptedValue = quotations
      .filter((q) => q.status === "accepted")
      .reduce((sum, q) => sum + (q.grand_total || 0), 0);
    const pendingCount = quotations.filter((q) => q.status === "draft" || q.status === "sent").length;

    return {
      totalCount,
      grandTotalSum,
      acceptedCount,
      acceptedValue,
      pendingCount,
    };
  }, [quotations]);

  const handleDelete = async () => {
    if (!deleteQuotationTarget) return;
    try {
      await deleteQuotation({ quotationId: deleteQuotationTarget._id }).unwrap();
      toast.success(`Quotation ${deleteQuotationTarget.quotation_no} deleted`);
      setDeleteQuotationTarget(null);
      refetch();
    } catch {
      toast.error("Failed to delete quotation");
    }
  };

  return (
    <div className="w-full space-y-6 p-4 sm:p-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <FileText className="h-5 w-5" />
            </div>
            Quotation Master
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            View, generate, track, and manage all customer quotations across department operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setIsTermsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            <BookOpen className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            Terms &amp; Conditions
          </button>

          {canManageQuotations(authUser) && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Generate Quotation
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Quotations</span>
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <FileText className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{metrics.totalCount}</div>
          <p className="mt-1 text-xs text-slate-500">Active quotation documents</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Quoted Value</span>
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
            {formatCurrencyINR(metrics.grandTotalSum)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Sum of all generated proposals</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Accepted Quotes</span>
            <div className="rounded-xl bg-teal-50 p-2.5 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {metrics.acceptedCount} ({formatCurrencyINR(metrics.acceptedValue)})
          </div>
          <p className="mt-1 text-xs text-slate-500">Successfully converted quotes</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending / Draft</span>
            <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-amber-600 dark:text-amber-400">{metrics.pendingCount}</div>
          <p className="mt-1 text-xs text-slate-500">Awaiting customer response</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by quote #, ref #, customer, or subject..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {/* Status Pill Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                statusFilter === opt.value
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quotations Data Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-white/10 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-bold text-slate-500 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-5 py-3.5">Quotation / Ref</th>
                <th className="px-5 py-3.5">Customer &amp; Source</th>
                <th className="px-5 py-3.5">Subject</th>
                <th className="px-5 py-3.5">Date &amp; Validity</th>
                <th className="px-5 py-3.5 text-right">Grand Total</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Signatory</th>
                <th className="px-5 py-3.5">Created By</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-slate-400">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-blue-500 mb-2" />
                    Loading quotations...
                  </td>
                </tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-slate-500">
                    <FileText className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="font-semibold text-slate-700 dark:text-slate-300">No Quotations Found</p>
                    <p className="text-xs text-slate-400 mt-1">Generate a new direct or lead-linked quotation to get started.</p>
                  </td>
                </tr>
              ) : (
                quotations.map((q) => {
                  const leadInfo = typeof q.lead === "object" && q.lead !== null ? q.lead : null;
                  const createdByInfo = q.created_by;

                  const statusOpt = STATUS_OPTIONS.find((s) => s.value === q.status) || {
                    badgeClass: "bg-slate-100 text-slate-700",
                    label: q.status,
                  };

                  return (
                    <tr
                      key={q._id}
                      className="group hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
                    >
                      {/* Quotation / Ref */}
                      <td className="px-5 py-4 font-medium text-slate-900 dark:text-white">
                        <div className="font-bold text-blue-600 dark:text-blue-400">{q.quotation_no}</div>
                        {q.ref_no && (
                          <div className="text-xs text-slate-400 font-mono">Ref: {q.ref_no}</div>
                        )}
                      </td>

                      {/* Customer & Lead Source */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          {q.customer_name || "Customer"}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {leadInfo ? (
                            <span className="inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              Lead: {leadInfo.lead_no || leadInfo.organization_name || "Linked"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              Direct Quotation
                            </span>
                          )}
                          {q.email && <span className="text-xs text-slate-400">• {q.email}</span>}
                        </div>
                      </td>

                      {/* Subject */}
                      <td className="px-5 py-4 max-w-xs truncate text-slate-700 dark:text-slate-300">
                        {q.subject || "Medical Equipment Proposal"}
                      </td>

                      {/* Date & Validity */}
                      <td className="px-5 py-4 text-xs text-slate-600 dark:text-slate-400">
                        <div>
                          {q.quotation_date
                            ? new Date(q.quotation_date).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "-"}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Valid: {q.validity_days || 15} days
                        </div>
                      </td>

                      {/* Grand Total */}
                      <td className="px-5 py-4 text-right font-bold text-slate-900 dark:text-white">
                        {formatCurrencyINR(q.grand_total || 0)}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                              q.approval_status === "pending_approval" || q.status === "pending_approval"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                                : q.approval_status === "approved"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                                : statusOpt.badgeClass
                            }`}
                          >
                            {(q.approval_status === "pending_approval" || q.status === "pending_approval") && (
                              <Clock className="h-3 w-3" />
                            )}
                            {q.approval_status === "pending_approval" || q.status === "pending_approval"
                              ? "Pending Approval"
                              : q.status}
                          </span>
                          {q.approval_status === "rejected" && (
                            <span className="text-[10px] text-rose-500 font-medium">
                              Reason: {q.rejection_reason || "Rejected"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Signatory */}
                      <td className="px-5 py-4 text-xs text-slate-700 dark:text-slate-300">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {q.signatory_name || "Authorized Signatory"}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {q.signatory_designation || "Signatory"}
                        </div>
                        {q.signatory_email && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                            {q.signatory_email}
                          </div>
                        )}
                      </td>

                      {/* Created By */}
                      <td className="px-5 py-4 text-xs text-slate-600 dark:text-slate-400">
                        <div className="font-medium">{createdByInfo?.name || "System"}</div>
                        {createdByInfo?.department && (
                          <div className="text-[11px] text-slate-400 capitalize">{createdByInfo.department}</div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        {(() => {
                          const isSignatory = isAssignedSignatory(authUser, q);
                          const canViewPdf = canViewQuotationPdf(authUser, q);
                          const canEmail = canEmailQuotation(q);
                          const canEdit = canEditQuotation(authUser, q);
                          const isPending = q.approval_status === "pending_approval" || q.status === "pending_approval";
                          const canSubmit = canSubmitForApproval(authUser, q as unknown as Parameters<typeof canSubmitForApproval>[1]);

                          return (
                            <div className="flex items-center justify-end gap-1">
                              {/* Draft: Send for Approval Button */}
                              {canSubmit && (
                                <button
                                  type="button"
                                  title="Send for Signatory Approval"
                                  disabled={isSubmitting}
                                  onClick={() => setSubmitApprovalTarget(q)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 cursor-pointer disabled:opacity-50 mr-1"
                                >
                                  <Send className="h-3.5 w-3.5" /> Send for Approval
                                </button>
                              )}

                              {/* Signatory Direct Approval / Rejection Buttons */}
                              {isPending && isSignatory && (
                                <div className="flex items-center gap-1 mr-1 border-r border-slate-200 dark:border-white/10 pr-1.5">
                                  <button
                                    type="button"
                                    title="Approve Quotation"
                                    disabled={isApproving || isRejecting}
                                    onClick={() => setApproveTarget(q)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                                  >
                                    <Check className="h-3.5 w-3.5" /> Approve
                                  </button>
                                  <button
                                    type="button"
                                    title="Reject Quotation"
                                    disabled={isApproving || isRejecting}
                                    onClick={() => {
                                      setRejectTarget(q);
                                      setRejectionReason("");
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300 cursor-pointer disabled:opacity-50"
                                  >
                                    <X className="h-3.5 w-3.5" /> Reject
                                  </button>
                                </div>
                              )}

                              {/* View / PDF */}
                              <button
                                type="button"
                                title={canViewPdf ? "View / Print PDF" : "PDF view restricted until assigned signatory approves"}
                                onClick={() => {
                                  if (!canViewPdf) {
                                    toast.warning("PDF view is locked for non-signatories until the quotation is approved.");
                                    return;
                                  }
                                  setViewQuotation(q as unknown as LeadQuotationRecord);
                                }}
                                className={`rounded-lg p-1.5 transition cursor-pointer ${
                                  canViewPdf
                                    ? "text-slate-500 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950 dark:hover:text-blue-400"
                                    : "text-amber-500/70 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                }`}
                              >
                                {canViewPdf ? <Eye className="h-4 w-4" /> : <Lock className="h-4 w-4 text-amber-500" />}
                              </button>

                              {/* Email */}
                              <button
                                type="button"
                                title={
                                  canEmail
                                    ? "Send Email"
                                    : q.status === "accepted" || q.status === "rejected" || q.status === "expired"
                                    ? `Email sending disabled for ${q.status} quotation`
                                    : "Email locked until assigned signatory approves"
                                }
                                onClick={() => {
                                  if (!canEmail) {
                                    if (q.status === "accepted" || q.status === "rejected" || q.status === "expired") {
                                      toast.warning(`Email cannot be sent because this quotation is ${q.status}.`);
                                    } else {
                                      toast.warning("Email workflow is locked until the assigned signatory approves this quotation.");
                                    }
                                    return;
                                  }
                                  setEmailQuotation(q as unknown as LeadQuotationRecord);
                                }}
                                className={`rounded-lg p-1.5 transition cursor-pointer ${
                                  canEmail
                                    ? "text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                                    : "text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                }`}
                              >
                                <Mail className={`h-4 w-4 ${!canEmail ? "opacity-40" : ""}`} />
                              </button>

                              {/* Edit */}
                              <button
                                type="button"
                                title={canEdit ? "Edit Quotation" : "Only the assigned signatory can edit approved quotations"}
                                onClick={() => {
                                  if (!canEdit) {
                                    toast.warning("Approved quotations can only be edited by the assigned signatory.");
                                    return;
                                  }
                                  setEditQuotation(q as unknown as LeadQuotationRecord);
                                }}
                                className={`rounded-lg p-1.5 transition cursor-pointer ${
                                  canEdit
                                    ? "text-slate-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950 dark:hover:text-amber-400"
                                    : "text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                                }`}
                              >
                                <Pencil className={`h-4 w-4 ${!canEdit ? "opacity-40" : ""}`} />
                              </button>

                              {/* Delete */}
                              <button
                                type="button"
                                title="Delete"
                                onClick={() => setDeleteQuotationTarget(q)}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950 dark:hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-white/10">
          <div className="text-xs text-slate-500">
            Showing Page <span className="font-semibold">{page}</span> ({quotations.length} items)
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </button>
            <button
              type="button"
              disabled={quotations.length < limit}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal: View Quotation */}
      <QuotationViewModal
        open={Boolean(viewQuotation)}
        quotation={viewQuotation}
        onClose={() => setViewQuotation(null)}
        portalLabel={portalLabel}
      />

      {/* Modal: Create Quotation */}
      <QuotationFormModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => refetch()}
      />

      {/* Modal: Edit Quotation */}
      <QuotationFormModal
        open={Boolean(editQuotation)}
        quotation={editQuotation}
        onClose={() => setEditQuotation(null)}
        onSuccess={() => refetch()}
      />

      {/* Modal: Send Email */}
      <SendQuotationEmailModal
        open={Boolean(emailQuotation)}
        quotation={emailQuotation}
        onClose={() => setEmailQuotation(null)}
        onSuccess={() => refetch()}
      />

      {/* Modal: Terms & Conditions Master */}
      <TermsAndConditionsModal
        open={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
      />

      {/* Modal: Submit for Approval Confirmation */}
      {submitApprovalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                <Send className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Submit Quotation for Approval?
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Are you sure you want to send this quotation to the assigned signatory for review and formal approval?
                </p>

                <div className="mt-3.5 rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs dark:border-blue-900/30 dark:bg-blue-950/20 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Quotation #:</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {submitApprovalTarget.quotation_no}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Customer:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                      {submitApprovalTarget.customer_name || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Grand Total:</span>
                    <span className="font-bold text-blue-700 dark:text-blue-300">
                      {formatCurrencyINR(submitApprovalTarget.grand_total || 0)}
                    </span>
                  </div>
                  {submitApprovalTarget.signatory_name && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Signatory:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {submitApprovalTarget.signatory_name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setSubmitApprovalTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitForApproval}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                {isSubmitting ? "Submitting..." : "Submit for Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Approve Confirmation */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Approve Quotation?
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  By approving, you authorize this proposal as signatory. The official letterhead PDF and email delivery will be unlocked.
                </p>

                <div className="mt-3.5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs dark:border-emerald-900/30 dark:bg-emerald-950/20 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Quotation #:</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {approveTarget.quotation_no}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Customer:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                      {approveTarget.customer_name || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Grand Total:</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-300">
                      {formatCurrencyINR(approveTarget.grand_total || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setApproveTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={isApproving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                {isApproving ? "Approving..." : "Confirm & Approve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reject Confirmation */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Reject Quotation?
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Rejecting Quotation #{rejectTarget.quotation_no} will notify the creator and mark the proposal as rejected.
                </p>

                <div className="mt-3.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Rejection Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter reason for rejecting this quotation (e.g. margin too low, specs mismatch)..."
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-100"
                    autoFocus
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectionReason("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isRejecting || !rejectionReason.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                {isRejecting ? "Rejecting..." : "Reject Quotation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirmation */}
      {deleteQuotationTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Quotation?</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Are you sure you want to delete this quotation? This action is non-reversible.
                </p>

                <div className="mt-3.5 rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-xs dark:border-rose-900/30 dark:bg-rose-950/20 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Quotation #:</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {deleteQuotationTarget.quotation_no}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Customer:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                      {deleteQuotationTarget.customer_name || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Grand Total:</span>
                    <span className="font-bold text-rose-700 dark:text-rose-300">
                      {formatCurrencyINR(deleteQuotationTarget.grand_total || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteQuotationTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isDeleting ? "Deleting..." : "Delete Quotation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
