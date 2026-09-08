/**
 * @fileoverview Lead Details Page with key metrics, action toolbar, tabs, qualification editor, follow-ups, attachments, and timeline.
 * @module components/portal/shared/leads/LeadDetailPage
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import {
  ArrowLeft,
  Pencil,
  UserCheck,
  Activity,
  CalendarPlus,
  CheckCircle,
  AlertTriangle,
  FileText,
  FilePlus,
  Paperclip,
  Clock,
  Building2,
  Phone,
  Mail,
  MapPin,
  Package,
  Layers,
  ExternalLink,
  Copy,
  Plus,
  Download,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  Send,
  ShoppingCart,
  RotateCcw,
  Trophy,
  Calendar,
  Check,
  X,
  Lock,
} from "lucide-react";
import {
  useGetLeadQuery,
  useChangeLeadStatusMutation,
  useListAttachmentsQuery,
  useCreateAttachmentMutation,
  useDeleteAttachmentMutation,
  useListLeadFollowUpsQuery,
  useListLeadQuotationsQuery,
  useUpdateLeadQuotationMutation,
  useDeleteLeadQuotationMutation,
  useSubmitLeadQuotationForApprovalMutation,
  useApproveLeadQuotationMutation,
  useRejectLeadQuotationMutation,
  type LeadRecord,
  type LeadFollowUpRecord,
  type LeadQuotationRecord,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { FilePreviewModal } from "@/components/portal/shared/FilePreviewModal";
import {
  isAssignedSignatory,
  canViewQuotationPdf,
  canEmailQuotation,
  canEditQuotation,
  canSubmitForApproval,
  isDraftVisible,
} from "../quotations/quotationUtils";
import {
  formatCurrencyINR,
  formatLeadDate,
  formatLeadDateTime,
  formatLeadAssignees,
  isFollowUpOverdue,
  isFollowUpToday,
  isLeadAdmin,
  canAssignLead,
  canCreateQuotation,
  canManageQuotations,
  canViewLeadPricing,
  leadLineValue,
  leadEstimatedValue,
  LEAD_STATUS_CONFIG,
  LEAD_PRIORITY_CONFIG,
  FOLLOWUP_TYPE_CONFIG,
} from "./leadUtils";
import { AssignLeadModal } from "./AssignLeadModal";
import { MarkWonModal } from "./MarkWonModal";
import { MarkLostModal } from "./MarkLostModal";
import { ConvertLeadModal } from "./ConvertLeadModal";
import { FollowUpModal } from "./FollowUpModal";
import { CompleteFollowUpModal } from "./CompleteFollowUpModal";
import { QuotationFormModal } from "./QuotationFormModal";
import { QuotationViewModal } from "./QuotationViewModal";
import { SendQuotationEmailModal } from "./SendQuotationEmailModal";
import { LeadTimelineTab } from "./LeadTimelineTab";

type Props = {
  leadId: string;
  portalHome?: string;
};

export function LeadDetailPage({ leadId, portalHome = "/admin" }: Props) {
  const router = useRouter();
  const authUser = useAppSelector((state) => state.auth.user);
  const isAdmin = isLeadAdmin(authUser, portalHome);
  const showPricing = canViewLeadPricing(authUser, portalHome);

  const [activeTab, setActiveTab] = useState<
    "overview" | "products" | "followups" | "orders" | "attachments" | "timeline"
  >("overview");

  // Modals state
  const [assignOpen, setAssignOpen] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertQuotationId, setConvertQuotationId] = useState<string | undefined>();
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [completingFollowUp, setCompletingFollowUp] = useState<LeadFollowUpRecord | null>(null);

  // Quotation modals state
  const [createQuotationOpen, setCreateQuotationOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<LeadQuotationRecord | null>(null);
  const [viewingQuotation, setViewingQuotation] = useState<LeadQuotationRecord | null>(null);
  const [emailingQuotation, setEmailingQuotation] = useState<LeadQuotationRecord | null>(null);

  // File upload / preview state
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string; mime: string } | null>(null);
  const [uploadRemarks, setUploadRemarks] = useState<string>("");

  const { data: lead, isLoading, isFetching, refetch } = useGetLeadQuery(leadId);
  const { data: rawAttachments, refetch: refetchAttachments } = useListAttachmentsQuery({
    entity_type: "lead",
    entity_id: leadId,
  });

  const attachments = (
    Array.isArray(rawAttachments)
      ? rawAttachments
      : (rawAttachments as { items?: unknown[] })?.items || []
  ) as Array<{
    _id: string;
    original_name: string;
    mime_type?: string;
    size?: number;
    url?: string;
    createdAt?: string;
    uploaded_by?: { name?: string };
  }>;

  const { data: followUps, refetch: refetchFollowUps } = useListLeadFollowUpsQuery(leadId);
  const { data: quotations, refetch: refetchQuotations } = useListLeadQuotationsQuery(leadId);

  const [createAttachment, { isLoading: uploading }] = useCreateAttachmentMutation();
  const [deleteAttachment] = useDeleteAttachmentMutation();
  const [deleteLeadQuotation, { isLoading: isDeletingQuotation }] = useDeleteLeadQuotationMutation();
  const [updateLeadQuotation, { isLoading: isUpdatingQuotation }] = useUpdateLeadQuotationMutation();
  const [submitLeadQuotationForApproval, { isLoading: isSubmittingQuotation }] = useSubmitLeadQuotationForApprovalMutation();
  const [approveLeadQuotation, { isLoading: isApprovingQuotation }] = useApproveLeadQuotationMutation();
  const [rejectLeadQuotation, { isLoading: isRejectingQuotation }] = useRejectLeadQuotationMutation();
  const [changeStatus, { isLoading: isChangingStatus }] = useChangeLeadStatusMutation();

  const handleQuotationStatusChange = async (quotationId: string, newStatus: string) => {
    if (lead?.status === "converted" || lead?.conversion?.order_id) {
      toast.error("Quotation status cannot be changed after the lead is converted");
      return;
    }
    try {
      await updateLeadQuotation({
        quotationId,
        leadId,
        body: { status: newStatus as any },
      }).unwrap();
      toast.success(`Quotation marked as ${newStatus.toUpperCase()}`);
      refetchQuotations();
      refetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err) || "Failed to update quotation status");
    }
  };

  const handleSubmitLeadQuotationForApproval = async (quotationId: string, qNo: string) => {
    try {
      await submitLeadQuotationForApproval({ quotationId, leadId }).unwrap();
      toast.success(`Quotation ${qNo} submitted for signatory approval`);
      refetchQuotations();
      refetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err) || "Failed to submit quotation for approval");
    }
  };

  const handleApproveLeadQuotation = async (quotationId: string, qNo: string) => {
    try {
      await approveLeadQuotation({ quotationId, leadId }).unwrap();
      toast.success(`Quotation ${qNo} approved successfully`);
      refetchQuotations();
      refetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err) || "Failed to approve quotation");
    }
  };

  const handleRejectLeadQuotation = async (quotationId: string, qNo: string) => {
    const reason = window.prompt(`Reason for rejecting quotation ${qNo}:`);
    if (reason === null) return;
    try {
      await rejectLeadQuotation({ quotationId, leadId, rejection_reason: reason || "Rejected by signatory" }).unwrap();
      toast.success(`Quotation ${qNo} rejected`);
      refetchQuotations();
      refetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err) || "Failed to reject quotation");
    }
  };

  if (isLoading || !lead) {
    return (
      <div className="flex h-96 items-center justify-center text-xs text-slate-500">
        Loading lead details...
      </div>
    );
  }

  const statusCfg = LEAD_STATUS_CONFIG[lead.status];
  const priorityCfg = LEAD_PRIORITY_CONFIG[lead.priority];

  const isWon = lead.status === "won";
  const isLost = lead.status === "lost";
  const isConverted = lead.status === "converted";
  const hasConvertedOrder = Boolean(lead.conversion?.order_id);
  const quotationLocked = isConverted || hasConvertedOrder;
  const isClosed = isWon || isLost || isConverted;

  const handleCopyLeadNo = () => {
    navigator.clipboard.writeText(lead.lead_no);
    toast.success(`Copied ${lead.lead_no} to clipboard`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("entity_type", "lead");
    formData.append("entity_id", lead._id);
    if (uploadRemarks.trim()) {
      formData.append("remarks", uploadRemarks.trim());
    }

    try {
      await createAttachment(formData).unwrap();
      toast.success("Attachment uploaded successfully");
      setUploadRemarks("");
      refetchAttachments();
      if (e.target) e.target.value = "";
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    try {
      await deleteAttachment(attId).unwrap();
      toast.success("Attachment removed");
      refetchAttachments();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  return (
    <div className="relative min-h-screen space-y-6 pb-20">
      <PortalBusyOverlay active={isFetching || uploading} />

      {/* Main Header Banner */}
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 p-4 sm:p-5 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`${portalHome}/leads`}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-white/5"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                    #{lead.lead_no}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLeadNo}
                    title="Copy Lead Number"
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {lead.name}
                  </h1>
                </div>
                {lead.company_name && (
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {lead.company_name} {lead.industry ? `• ${lead.industry}` : ""}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* Status */}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusCfg?.bg} ${statusCfg?.text} ${statusCfg?.border}`}
              >
                <span className={`h-2 w-2 rounded-full ${statusCfg?.dot}`} />
                {statusCfg?.label || lead.status}
              </span>

              {/* Priority */}
              <span
                className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-semibold ${priorityCfg?.bg} ${priorityCfg?.text} ${priorityCfg?.border}`}
              >
                Priority: {priorityCfg?.label || lead.priority}
              </span>

              {/* Source */}
              <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Source: {lead.source}
              </span>

              {/* Assigned (multi-dept) */}
              <span className="inline-flex max-w-md items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200">
                <UserCheck className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="truncate">{formatLeadAssignees(lead)}</span>
              </span>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {!isClosed && (
              <Link
                href={`${portalHome}/leads/${lead._id}/edit`}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
              >
                <Pencil className="h-3.5 w-3.5 text-slate-500" />
                Edit
              </Link>
            )}

            {!isClosed && (
              <button
                type="button"
                onClick={() => setFollowUpOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300"
              >
                <CalendarPlus className="h-3.5 w-3.5 text-amber-600" />
                Follow-up
              </button>
            )}

            {!isClosed && (
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
              >
                <UserCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                Assign
              </button>
            )}

            {canManageQuotations(authUser, portalHome) && canCreateQuotation(lead.status) && (
              <button
                type="button"
                onClick={() => setCreateQuotationOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 shadow-sm transition hover:bg-purple-100 dark:border-purple-900/40 dark:bg-purple-950/40 dark:text-purple-300 cursor-pointer"
              >
                <FilePlus className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                Create Quotation
              </button>
            )}

            {!isWon && !isLost && !isConverted && (
              <button
                type="button"
                onClick={() => setWonOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 cursor-pointer"
              >
                <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                Mark Won
              </button>
            )}

            {isAdmin && !isLost && !isConverted && (
              <button
                type="button"
                onClick={() => setConvertOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Convert
              </button>
            )}

            {!isWon && !isLost && !isConverted && (
              <button
                type="button"
                onClick={() => setLostOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                Mark Lost
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Visual Lead Lifecycle Pipeline Tracker */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3.5 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Lead Lifecycle Pipeline
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">Current Stage:</span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusCfg?.bg} ${statusCfg?.text} ${statusCfg?.border}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusCfg?.dot}`} />
              {statusCfg?.label || lead.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Step 1: New */}
          <div className={`relative flex items-center gap-3 rounded-xl border p-3 transition-all ${
            lead.status === "new"
              ? "border-blue-500/40 bg-blue-50/50 shadow-sm ring-1 ring-blue-500/20 dark:bg-blue-950/30"
              : "border-slate-200/80 bg-slate-50/40 dark:border-white/10 dark:bg-slate-800/40"
          }`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
              lead.status === "new"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            }`}>
              {lead.status === "new" ? "1" : "✓"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                1. New Intake
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {formatLeadDate(lead.createdAt) || "Lead Created"}
              </div>
            </div>
          </div>

          {/* Step 2: Assigned */}
          {(() => {
            const hasAssigned =
              Boolean(
                lead.assigned_to ||
                  lead.assigned_sales ||
                  lead.assigned_admin ||
                  lead.assigned_finance
              ) ||
              ["assigned", "follow_up", "quotation", "won", "converted"].includes(lead.status);
            const isCurrent = lead.status === "assigned";
            const assigneeLabel = formatLeadAssignees(lead);
            return (
              <div className={`relative flex items-center gap-3 rounded-xl border p-3 transition-all ${
                isCurrent
                  ? "border-indigo-500/40 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500/20 dark:bg-indigo-950/30"
                  : hasAssigned
                  ? "border-slate-200/80 bg-slate-50/40 dark:border-white/10 dark:bg-slate-800/40"
                  : "border-slate-200/40 bg-slate-50/20 opacity-60 dark:border-white/5 dark:bg-slate-800/20"
              }`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  isCurrent
                    ? "bg-indigo-600 text-white shadow-sm"
                    : hasAssigned
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}>
                  {isCurrent ? "2" : hasAssigned ? "✓" : "2"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    2. Assigned
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {assigneeLabel !== "Unassigned"
                      ? assigneeLabel
                      : lead.assigned_at
                        ? formatLeadDate(lead.assigned_at)
                        : "Assign executive"}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Step 3: Follow Up */}
          {(() => {
            const hasFollowUp = (followUps && followUps.length > 0) || ["follow_up", "quotation", "won", "converted"].includes(lead.status);
            const isCurrent = lead.status === "follow_up";
            return (
              <div className={`relative flex items-center gap-3 rounded-xl border p-3 transition-all ${
                isCurrent
                  ? "border-amber-500/40 bg-amber-50/50 shadow-sm ring-1 ring-amber-500/20 dark:bg-amber-950/30"
                  : hasFollowUp
                  ? "border-slate-200/80 bg-slate-50/40 dark:border-white/10 dark:bg-slate-800/40"
                  : "border-slate-200/40 bg-slate-50/20 opacity-60 dark:border-white/5 dark:bg-slate-800/20"
              }`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  isCurrent
                    ? "bg-amber-600 text-white shadow-sm"
                    : hasFollowUp
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}>
                  {isCurrent ? "3" : hasFollowUp ? "✓" : "3"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    3. Follow Up
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {followUps && followUps.length > 0
                      ? `${followUps.length} touchpoint${followUps.length > 1 ? "s" : ""}`
                      : "Schedule follow-up"}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Step 4: Quotation */}
          {(() => {
            const hasQuotations = (quotations && quotations.length > 0) || ["quotation", "won", "converted"].includes(lead.status);
            const isCurrent = lead.status === "quotation";
            return (
              <div className={`relative flex items-center gap-3 rounded-xl border p-3 transition-all ${
                isCurrent
                  ? "border-purple-500/40 bg-purple-50/50 shadow-sm ring-1 ring-purple-500/20 dark:bg-purple-950/30"
                  : hasQuotations
                  ? "border-slate-200/80 bg-slate-50/40 dark:border-white/10 dark:bg-slate-800/40"
                  : "border-slate-200/40 bg-slate-50/20 opacity-60 dark:border-white/5 dark:bg-slate-800/20"
              }`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  isCurrent
                    ? "bg-purple-600 text-white shadow-sm"
                    : hasQuotations
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}>
                  {isCurrent ? "4" : hasQuotations ? "✓" : "4"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    4. Quotation
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {quotations && quotations.length > 0
                      ? `${quotations.length} proposal${quotations.length > 1 ? "s" : ""}`
                      : "Draft proposal"}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Step 5: Outcome (Won / Converted / Lost / In Progress) */}
          {(() => {
            if (isWon) {
              return (
                <div className="relative flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-50/50 p-3 shadow-sm ring-1 ring-emerald-500/20 dark:bg-emerald-950/30">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                    <Trophy className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      5. Deal Won 🎉
                    </div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 truncate">
                      Ready to convert
                    </div>
                  </div>
                </div>
              );
            }
            if (isConverted) {
              return (
                <div className="relative flex items-center gap-3 rounded-xl border border-teal-500/40 bg-teal-50/50 p-3 shadow-sm ring-1 ring-teal-500/20 dark:bg-teal-950/30">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-teal-900 dark:text-teal-200">
                      5. Converted
                    </div>
                    <div className="text-[11px] text-teal-700 dark:text-teal-400 truncate">
                      Party & Order created
                    </div>
                  </div>
                </div>
              );
            }
            if (isLost) {
              return (
                <div className="relative flex items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-50/50 p-3 shadow-sm ring-1 ring-rose-500/20 dark:bg-rose-950/30">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-white shadow-sm">
                    <XCircle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-rose-900 dark:text-rose-200">
                      5. Closed (Lost)
                    </div>
                    <div className="text-[11px] text-rose-700 dark:text-rose-400 truncate">
                      {lead.lost_info?.lost_reason || "Deal cancelled"}
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div className="relative flex items-center gap-3 rounded-xl border border-slate-200/40 bg-slate-50/20 p-3 opacity-60 dark:border-white/5 dark:bg-slate-800/20">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  5
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    5. Decision
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Pending Won / Lost
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex overflow-x-auto border-b border-slate-200 dark:border-white/10">
        {[
          { id: "overview", label: "Overview & Contacts" },
          { id: "products", label: `Requirements (${lead.products?.length || 0})` },
          { id: "followups", label: `Follow-ups (${followUps?.length || 0})` },
          {
            id: "orders",
            label: `Quotations (${quotations?.length || 0})`,
          },
          { id: "attachments", label: `Attachments (${attachments?.length || 0})` },
          { id: "timeline", label: "Timeline & Activity" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`whitespace-nowrap px-4 py-2.5 text-xs font-bold transition-all border-b-2 ${
                isActive
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* Contact & Company Details */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-white/10">
                Contact & Company Information
              </h3>
              <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Contact Name</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {lead.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Company / Organization</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {lead.company_name || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Phone / Mobile</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {lead.phone || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Email Address</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {lead.email || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Industry Sector</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {lead.industry || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Designation</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {lead.designation || "—"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Additional Contacts */}
            {lead.contacts && lead.contacts.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/10">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Additional Contact Persons ({lead.contacts.length})
                  </h3>
                  {!isClosed && (
                    <Link
                      href={`${portalHome}/leads/${lead._id}/edit`}
                      className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Manage Contacts
                    </Link>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {lead.contacts.map((c, i) => (
                    <div
                      key={c._id || i}
                      className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 dark:border-white/5 dark:bg-slate-800/40"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {c.name}
                        </span>
                        {c.designation && (
                          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                            {c.designation}
                          </span>
                        )}
                      </div>
                      {c.department && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Dept: {c.department}
                        </p>
                      )}
                      <div className="mt-2.5 space-y-1.5 text-xs">
                        {c.phone && (
                          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                            <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                            <a href={`tel:${c.phone}`} className="hover:text-blue-600">
                              {c.phone}
                            </a>
                          </div>
                        )}
                        {c.email && (
                          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                            <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                            <a href={`mailto:${c.email}`} className="hover:text-blue-600 truncate">
                              {c.email}
                            </a>
                          </div>
                        )}
                        {c.alternate_phone && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px]">
                            <span>Alt: {c.alternate_phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Requirement Details & Product Line Items */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/10">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Requirement Details & Products
                </h3>
                {!isClosed && (
                  <Link
                    href={`${portalHome}/leads/${lead._id}/edit`}
                    className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Edit Requirements
                  </Link>
                )}
              </div>

              {lead.requirement && (
                <div className="mt-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Requirement Description:
                  </span>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {lead.requirement}
                  </p>
                </div>
              )}

              {/* Products Table in Overview */}
              <div className="mt-4">
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Required Products ({lead.products?.length || 0})
                  </span>
                </div>
                {!lead.products || lead.products.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2 italic">
                    No specific catalog product line items added.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-white/5">
                    <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                      <thead className="border-b border-slate-100 bg-slate-50 font-bold uppercase text-slate-500 dark:border-white/5 dark:bg-slate-800/40 dark:text-slate-400">
                        <tr>
                          <th className="px-3.5 py-2.5">Product Name</th>
                          <th className="px-3.5 py-2.5">Catalog SKU</th>
                          <th className="px-3.5 py-2.5 text-center">Required Quantity</th>
                          {showPricing && (
                            <>
                              <th className="px-3.5 py-2.5 text-right">Target Price</th>
                              <th className="px-3.5 py-2.5 text-right">Line Total</th>
                            </>
                          )}
                          <th className="px-3.5 py-2.5">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {lead.products.map((p, idx) => {
                          const catalog = typeof p.product === "object" ? p.product : null;
                          return (
                            <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                              <td className="px-3.5 py-2.5 font-semibold text-slate-900 dark:text-white">
                                {p.product_name}
                              </td>
                              <td className="px-3.5 py-2.5 text-slate-500 font-mono text-[11px]">
                                {catalog?.sku || "—"}
                              </td>
                              <td className="px-3.5 py-2.5 text-center font-bold text-slate-900 dark:text-white">
                                {p.quantity} {p.unit || "pcs"}
                              </td>
                              {showPricing && (
                                <>
                                  <td className="px-3.5 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-200">
                                    {Number(p.target_price || 0) > 0
                                      ? formatCurrencyINR(p.target_price)
                                      : "—"}
                                  </td>
                                  <td className="px-3.5 py-2.5 text-right font-bold text-slate-900 dark:text-white">
                                    {leadLineValue(p) > 0 ? formatCurrencyINR(leadLineValue(p)) : "—"}
                                  </td>
                                </>
                              )}
                              <td className="px-3.5 py-2.5 text-slate-500">
                                {p.remarks || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {lead.notes && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-white/10">
                  Internal Notes
                </h3>
                <p className="mt-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {lead.notes}
                </p>
              </div>
            )}
          </div>

          {/* Right Sidebar: Key Commercials & Location */}
          <div className="space-y-6">
            {/* Commercials Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-white/10">
                Deal Metrics
              </h3>
              <dl className="mt-4 space-y-3 text-xs">
                {showPricing && (
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Estimated Value</dt>
                    <dd className="font-bold text-slate-900 dark:text-white mt-0.5 text-sm">
                      {formatCurrencyINR(leadEstimatedValue(lead))}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Expected Closing Date</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {formatLeadDate(lead.expected_closing_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Next Follow-up Due</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {formatLeadDateTime(lead.next_follow_up_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">Last Contacted</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {formatLeadDateTime(lead.last_contacted_at)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Location Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3 dark:border-white/10">
                Location
              </h3>
              <div className="mt-3 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                {lead.billing_address?.address_line_1 && (
                  <div>{lead.billing_address.address_line_1}</div>
                )}
                {lead.billing_address?.address_line_2 && (
                  <div>{lead.billing_address.address_line_2}</div>
                )}
                <div>
                  {[
                    lead.billing_address?.city,
                    lead.billing_address?.state,
                    lead.billing_address?.pincode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </div>
                <div className="font-medium text-slate-500">
                  {lead.billing_address?.country || "India"}
                </div>
              </div>
            </div>

            {/* Lost or Converted Info Card */}
            {lead.status === "lost" && lead.lost_info && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 dark:border-rose-900/40 dark:bg-rose-950/30">
                <h4 className="text-xs font-bold uppercase text-rose-800 dark:text-rose-300">
                  Lost Deal Reason
                </h4>
                <div className="mt-2 text-xs font-semibold text-rose-900 dark:text-rose-200">
                  {lead.lost_info.lost_reason}
                </div>
                {lead.lost_info.lost_remarks && (
                  <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                    {lead.lost_info.lost_remarks}
                  </p>
                )}
              </div>
            )}

            {lead.status === "converted" && lead.conversion && (
              <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-5 dark:border-teal-900/40 dark:bg-teal-950/30">
                <h4 className="text-xs font-bold uppercase text-teal-800 dark:text-teal-300">
                  Conversion Details
                </h4>
                <div className="mt-2 text-xs font-semibold text-teal-900 dark:text-teal-200">
                  Type: {lead.conversion.conversion_type}
                </div>
                <div className="mt-1 text-xs text-teal-700 dark:text-teal-300">
                  Converted on: {formatLeadDate(lead.conversion.converted_at)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Products */}
      {activeTab === "products" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Product Requirements & Line Items
            </h3>
            {!isClosed && (
              <Link
                href={`${portalHome}/leads/${lead._id}/edit`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
              >
                <Pencil className="h-3.5 w-3.5" />
                Manage Items
              </Link>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="border-b border-slate-100 bg-slate-50 font-bold uppercase text-slate-500 dark:border-white/5 dark:bg-slate-800/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3">Catalog SKU</th>
                  <th className="px-4 py-3 text-center">Required Quantity</th>
                  {showPricing && (
                    <>
                      <th className="px-4 py-3 text-right">Target Price</th>
                      <th className="px-4 py-3 text-right">Line Total</th>
                    </>
                  )}
                  <th className="px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {!lead.products || lead.products.length === 0 ? (
                  <tr>
                    <td colSpan={showPricing ? 6 : 4} className="py-8 text-center text-slate-400">
                      No specific product line items added.
                    </td>
                  </tr>
                ) : (
                  lead.products.map((p, idx) => {
                    const catalog = typeof p.product === "object" ? p.product : null;
                    return (
                      <tr key={idx}>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                          {p.product_name}
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono">
                          {catalog?.sku || "—"}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-900 dark:text-white">
                          {p.quantity} {p.unit || "pcs"}
                        </td>
                        {showPricing && (
                          <>
                            <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                              {Number(p.target_price || 0) > 0
                                ? formatCurrencyINR(p.target_price)
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                              {leadLineValue(p) > 0 ? formatCurrencyINR(leadLineValue(p)) : "—"}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-slate-500">
                          {p.remarks || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Follow-ups */}
      {activeTab === "followups" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Follow-up Activities & History
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Log outcomes and schedule recurring client touchpoints
              </p>
            </div>
            {!isClosed && (
              <button
                type="button"
                onClick={() => setFollowUpOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-500"
              >
                <CalendarPlus className="h-4 w-4" />
                Schedule Follow-up
              </button>
            )}
          </div>

          <div className="mt-5 space-y-3">
            {!followUps || followUps.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No follow-ups recorded yet. Click &apos;Schedule Follow-up&apos; above.
              </div>
            ) : (
              followUps.map((fu) => {
                const typeCfg = FOLLOWUP_TYPE_CONFIG[fu.type];
                const isCompleted = fu.status === "completed";
                return (
                  <div
                    key={fu._id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-white/5 dark:bg-slate-800/40"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          {typeCfg?.label || fu.type}
                        </span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {formatLeadDate(fu.follow_up_date)} {fu.follow_up_time ? `@ ${fu.follow_up_time}` : ""}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            isCompleted
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                          }`}
                        >
                          {fu.status}
                        </span>
                      </div>

                      {fu.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          <strong className="text-slate-700 dark:text-slate-200">Agenda:</strong> {fu.notes}
                        </p>
                      )}

                      {fu.outcome && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-300">
                          <strong>Outcome:</strong> {fu.outcome}
                        </p>
                      )}
                    </div>

                    {!isCompleted && !isClosed && (
                      <button
                        type="button"
                        onClick={() => setCompletingFollowUp(fu)}
                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 whitespace-nowrap"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Record Outcome
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Quotations & Orders */}
      {activeTab === "orders" && (
        <div className="space-y-6">
          {/* Quotations Section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-white/10">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  Quotation Proposals ({quotations?.length || 0})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Generate, print, and track official Medica Enterprises letterhead quotations
                </p>
              </div>

              {canManageQuotations(authUser, portalHome) && (
                canCreateQuotation(lead.status) ? (
                  <button
                    type="button"
                    onClick={() => setCreateQuotationOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    Create Quotation
                  </button>
                ) : (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-400 dark:border-white/5 dark:bg-slate-800/40 dark:text-slate-500"
                    title={`Quotations cannot be drafted for ${lead.status} leads`}
                  >
                    Quotations locked ({lead.status})
                  </span>
                )
              )}
            </div>

            <div className="mt-5 space-y-3.5">
              {!quotations || quotations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center dark:border-white/10">
                  <FileText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    No quotations generated for this lead yet.
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {canManageQuotations(authUser, portalHome)
                      ? canCreateQuotation(lead.status)
                        ? "Click 'Create Quotation' above to draft an official proposal."
                        : `Quotations cannot be generated for leads in '${lead.status}' status.`
                      : "Official quotation proposals can only be generated by administrators."}
                  </p>
                  {canManageQuotations(authUser, portalHome) && canCreateQuotation(lead.status) && (
                    <button
                      type="button"
                      onClick={() => setCreateQuotationOpen(true)}
                      className="mt-3 inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create First Quotation
                    </button>
                  )}
                </div>
              ) : (
                quotations
                  .filter((q) => isDraftVisible(authUser, q as unknown as any))
                  .map((q) => {
                  const isSignatory = isAssignedSignatory(authUser, q);
                  const canViewPdf = canViewQuotationPdf(authUser, q);
                  const canEmail = canEmailQuotation(q);
                  const canEdit = canEditQuotation(authUser, q);
                  const isPending = q.approval_status === "pending_approval" || q.status === "pending_approval";
                  const isApproved = q.approval_status === "approved" || q.status === "approved";
                  const canSubmit = canSubmitForApproval(authUser, q as unknown as any);

                  return (
                    <div
                      key={q._id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 transition-all hover:border-blue-300 dark:border-white/5 dark:bg-slate-800/40 dark:hover:border-blue-800"
                    >
                      {/* Top Row: Ref No, Subject, Status Badge, and Process Stepper */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-extrabold text-blue-700 dark:text-blue-400">
                            {q.ref_no || q.quotation_no}
                          </span>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">
                            {q.subject || "Medical Equipment Quotation"}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1 ${
                              isPending
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300/60"
                                : isApproved
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/60"
                                : q.status === "accepted"
                                ? "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-300/60"
                                : q.status === "sent"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300/60"
                                : q.status === "rejected"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300/60"
                                : "bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300"
                            }`}
                          >
                            {isPending && <Clock className="h-3 w-3" />}
                            {isPending ? "Pending Approval" : isApproved ? "Approved" : q.status}
                          </span>
                        </div>

                        {/* Process Stage Stepper */}
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${q.status ? "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200 font-bold" : ""}`}>
                            1. Draft
                          </span>
                          <span>→</span>
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${isPending ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold animate-pulse" : isApproved || ["sent", "accepted", "rejected"].includes(q.status) ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold" : "opacity-60"}`}>
                            2. Approval {isApproved ? "✓" : ""}
                          </span>
                          <span>→</span>
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${["sent", "accepted", "rejected"].includes(q.status) ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-bold" : "opacity-60"}`}>
                            3. Sent
                          </span>
                          <span>→</span>
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${q.status === "accepted" ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 font-bold" : q.status === "rejected" ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-bold" : "opacity-60"}`}>
                            4. Decision {q.status === "accepted" ? "✓" : q.status === "rejected" ? "✗" : ""}
                          </span>
                        </div>
                      </div>

                      {/* Middle Row: Quotation Specs & Signatory Info */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>
                            Date: <strong>{formatLeadDate(q.quotation_date)}</strong>
                          </span>
                          {q.validity_days && (
                            <span>
                              Validity: <strong>{q.validity_days} Days</strong>
                            </span>
                          )}
                          <span>
                            Items: <strong>{q.items?.length || 0}</strong>
                          </span>
                          <span>
                            Signatory: <strong>{q.signatory_name || "Signatory"}</strong>
                          </span>
                        </div>

                        <div className="text-xs text-slate-700 dark:text-slate-300">
                          Grand Total: <strong className="text-sm font-extrabold text-slate-900 dark:text-white">{formatCurrencyINR(q.grand_total)}</strong>
                          <span className="text-[11px] text-slate-400 ml-1.5">(incl. {formatCurrencyINR(q.total_gst)} GST)</span>
                        </div>
                      </div>

                      {/* Bottom Row: Process Actions Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Signatory Approval Buttons */}
                          {isPending && isSignatory && (
                            <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 p-1 rounded-xl border border-amber-200/80 dark:border-amber-900/40">
                              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 px-1">
                                Signatory Action:
                              </span>
                              <button
                                type="button"
                                disabled={isApprovingQuotation || isRejectingQuotation}
                                onClick={() => handleApproveLeadQuotation(q._id, q.ref_no || q.quotation_no)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" /> Approve
                              </button>
                              <button
                                type="button"
                                disabled={isApprovingQuotation || isRejectingQuotation}
                                onClick={() => handleRejectLeadQuotation(q._id, q.ref_no || q.quotation_no)}
                                className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300 cursor-pointer disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" /> Reject
                              </button>
                            </div>
                          )}

                          {canManageQuotations(authUser, portalHome) && (
                            <>
                              {/* Process Action Buttons */}
                              {canSubmit && (
                                <button
                                  type="button"
                                  disabled={isSubmittingQuotation}
                                  onClick={() => handleSubmitLeadQuotationForApproval(q._id, q.ref_no || q.quotation_no)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer disabled:opacity-50"
                                  title="Submit quotation for signatory approval"
                                >
                                  <Send className="h-3.5 w-3.5" />
                                  Send for Approval
                                </button>
                              )}

                              {q.status === "approved" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!canEmail) {
                                      toast.warning("Quotation must be approved by assigned signatory before sending email.");
                                      return;
                                    }
                                    setEmailingQuotation(q);
                                  }}
                                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition cursor-pointer ${
                                    canEmail
                                      ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                                      : "bg-slate-400 hover:bg-slate-500 opacity-60"
                                  }`}
                                  title={canEmail ? "Email quotation directly to client" : "Email workflow locked until assigned signatory approves"}
                                >
                                  {canEmail ? <Mail className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                  Email Quotation
                                </button>
                              )}

                              {q.status === "sent" && (
                                <>
                                  <button
                                    type="button"
                                    disabled={isUpdatingQuotation || quotationLocked}
                                    onClick={() => handleQuotationStatusChange(q._id, "accepted")}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400 cursor-pointer"
                                    title={quotationLocked ? "Quotation status is locked after conversion" : "Customer accepted this proposal"}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Accept Proposal
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isUpdatingQuotation || quotationLocked}
                                    onClick={() => handleQuotationStatusChange(q._id, "rejected")}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 shadow-xs hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/40 dark:bg-slate-800 dark:text-rose-400 cursor-pointer"
                                    title={quotationLocked ? "Quotation status is locked after conversion" : "Customer rejected this proposal"}
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    Reject
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!canEmail) {
                                        if (q.status === "accepted" || q.status === "rejected" || q.status === "expired") {
                                          toast.warning(`Email cannot be sent because this quotation is ${q.status}.`);
                                        } else {
                                          toast.warning("Quotation must be approved by assigned signatory before sending email.");
                                        }
                                        return;
                                      }
                                      setEmailingQuotation(q);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                                    title="Resend email to client"
                                  >
                                    <Mail className="h-3.5 w-3.5 text-slate-500" />
                                    Resend Email
                                  </button>
                                </>
                              )}

                              {q.status === "accepted" && (
                                <button
                                  type="button"
                                  disabled={quotationLocked}
                                  onClick={() => {
                                    if (quotationLocked) return;
                                    setConvertQuotationId(q._id);
                                    setConvertOpen(true);
                                  }}
                                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold shadow-xs transition ${
                                    quotationLocked
                                      ? "cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500"
                                      : "cursor-pointer bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400"
                                  }`}
                                  title={
                                    quotationLocked
                                      ? "This lead is already converted to an order"
                                      : "Convert accepted proposal to formal customer order"
                                  }
                                >
                                  <ShoppingCart className="h-3.5 w-3.5" />
                                  {quotationLocked ? "Order Converted" : "Convert to Order"}
                                </button>
                              )}

                              {q.status === "rejected" && (
                                <button
                                  type="button"
                                  disabled={isUpdatingQuotation || quotationLocked}
                                  onClick={() => handleQuotationStatusChange(q._id, "draft")}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                                  title={quotationLocked ? "Quotation status is locked after conversion" : "Reopen quotation as draft for revisions"}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  Reopen as Draft
                                </button>
                              )}

                              {/* Direct Status Selector */}
                              <select
                                value={q.status}
                                disabled={isUpdatingQuotation || quotationLocked}
                                onChange={(e) => handleQuotationStatusChange(q._id, e.target.value)}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                                title={quotationLocked ? "Quotation status is locked after conversion" : "Change quotation workflow stage"}
                              >
                                <option value="pending_approval">Status: Pending Approval</option>
                                <option value="approved">Status: Approved</option>
                                <option value="draft">Status: Draft</option>
                                <option value="sent">Status: Sent</option>
                                <option value="accepted">Status: Accepted</option>
                                <option value="rejected">Status: Rejected</option>
                                <option value="expired">Status: Expired</option>
                              </select>
                            </>
                          )}
                        </div>

                        {/* Tool Actions: View, Edit, Delete */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (!canViewPdf) {
                                toast.warning("PDF preview is locked for non-signatories until approved.");
                                return;
                              }
                              setViewingQuotation(q);
                            }}
                            className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm transition cursor-pointer ${
                              canViewPdf
                                ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                                : "bg-amber-500 text-white hover:bg-amber-600"
                            }`}
                            title={canViewPdf ? "View Letterhead Preview & Print" : "PDF view restricted until assigned signatory approves"}
                          >
                            {canViewPdf ? <Eye className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                            {canViewPdf ? "View / Print" : "PDF Locked"}
                          </button>

                          {canManageQuotations(authUser, portalHome) && !quotationLocked && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!canEdit) {
                                    toast.warning("Approved quotations can only be edited by the assigned signatory.");
                                    return;
                                  }
                                  setEditingQuotation(q);
                                }}
                                className={`rounded-xl border border-slate-200 bg-white p-1.5 transition cursor-pointer dark:border-white/10 dark:bg-slate-800 ${
                                  canEdit
                                    ? "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                                    : "text-slate-300 dark:text-slate-600 opacity-50"
                                }`}
                                title={canEdit ? "Edit Quotation" : "Only the assigned signatory can edit approved quotations"}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                disabled={isDeletingQuotation}
                                onClick={async () => {
                                  if (!window.confirm(`Delete quotation ${q.ref_no || q.quotation_no}?`)) return;
                                  try {
                                    await deleteLeadQuotation({ quotationId: q._id, leadId }).unwrap();
                                    toast.success("Quotation deleted successfully");
                                    refetchQuotations();
                                    refetch();
                                  } catch (err) {
                                    toast.error(mutationRejectedMessage(err) || "Failed to delete quotation");
                                  }
                                }}
                                className="rounded-xl border border-slate-200 bg-white p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:bg-slate-800 dark:hover:bg-rose-950/40 cursor-pointer disabled:opacity-50"
                                title="Delete Quotation"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Converted Orders Section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-4 dark:border-white/10">
              Linked Converted Orders
            </h3>

            <div className="mt-4">
              {lead.conversion?.order_id ? (
                <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-900/40 dark:bg-teal-950/30">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                      Converted Order
                    </span>
                    <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                      Order #{typeof lead.conversion.order_id === "object" ? lead.conversion.order_id.order_no : lead.conversion.order_id}
                    </div>
                    {typeof lead.conversion.order_id === "object" && (
                      <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        Grand Total: {formatCurrencyINR(lead.conversion.order_id.grand_total)} • Status: {lead.conversion.order_id.status}
                      </div>
                    )}
                  </div>

                  <Link
                    href={`${portalHome}/order/${typeof lead.conversion.order_id === "object" ? lead.conversion.order_id._id : lead.conversion.order_id}`}
                    className="inline-flex items-center gap-1 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-500"
                  >
                    View Order
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No orders converted from this lead yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Attachments */}
      {activeTab === "attachments" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Attachments & Documents
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Visiting cards, tender RFQs, specification sheets, customer emails
              </p>
            </div>

            <label className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 cursor-pointer dark:bg-blue-500 dark:hover:bg-blue-400">
              <Plus className="h-4 w-4" />
              Upload Document
              <input
                type="file"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          <div className="mt-5 space-y-3">
            {!attachments || attachments.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No attachments uploaded yet.
              </div>
            ) : (
              attachments.map((att) => (
                <div
                  key={att._id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-white/5 dark:bg-slate-800/40"
                >
                  <div className="flex items-center gap-3">
                    <Paperclip className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {att.original_name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {Math.round((att.size || 0) / 1024)} KB • Uploaded by {att.uploaded_by?.name || "User"} on {formatLeadDate(att.createdAt)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {att.url && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewDoc({
                            url: att.url || "",
                            name: att.original_name,
                            mime: att.mime_type || "application/octet-stream",
                          })
                        }
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
                        title="Preview File"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(att._id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 7: Timeline */}
      {activeTab === "timeline" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-4 dark:border-white/10">
            Chronological Activity Stream
          </h3>
          <div className="mt-6">
            <LeadTimelineTab leadId={lead._id} />
          </div>
        </div>
      )}

      {/* Modals */}
      {assignOpen && (
        <AssignLeadModal
          lead={lead}
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          onSuccess={() => refetch()}
        />
      )}

      {wonOpen && (
        <MarkWonModal
          lead={lead}
          open={wonOpen}
          onClose={() => setWonOpen(false)}
          onSuccess={() => refetch()}
        />
      )}

      {lostOpen && (
        <MarkLostModal
          lead={lead}
          open={lostOpen}
          onClose={() => setLostOpen(false)}
          onSuccess={() => refetch()}
        />
      )}

      {isAdmin && convertOpen && (
        <ConvertLeadModal
          lead={lead}
          open={convertOpen}
          initialQuotationId={convertQuotationId}
          onClose={() => {
            setConvertOpen(false);
            setConvertQuotationId(undefined);
          }}
          onSuccess={() => refetch()}
        />
      )}

      {followUpOpen && (
        <FollowUpModal
          lead={lead}
          open={followUpOpen}
          onClose={() => setFollowUpOpen(false)}
          onSuccess={() => {
            refetch();
            refetchFollowUps();
          }}
        />
      )}

      {completingFollowUp && (
        <CompleteFollowUpModal
          followUp={completingFollowUp}
          open={Boolean(completingFollowUp)}
          onClose={() => setCompletingFollowUp(null)}
          onSuccess={() => {
            refetch();
            refetchFollowUps();
          }}
        />
      )}

      {previewDoc && (
        <FilePreviewModal
          doc={previewDoc}
          blobUrl={previewDoc.url}
          loading={false}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {createQuotationOpen && (
        <QuotationFormModal
          lead={lead}
          open={createQuotationOpen}
          onClose={() => setCreateQuotationOpen(false)}
          onSuccess={(newQ) => {
            refetchQuotations();
            refetch();
            setViewingQuotation(newQ);
          }}
        />
      )}

      {editingQuotation && (
        <QuotationFormModal
          lead={lead}
          quotation={editingQuotation}
          open={Boolean(editingQuotation)}
          onClose={() => setEditingQuotation(null)}
          onSuccess={(updatedQ) => {
            refetchQuotations();
            refetch();
            setViewingQuotation(updatedQ);
          }}
        />
      )}

      {viewingQuotation && (
        <QuotationViewModal
          quotation={viewingQuotation}
          open={Boolean(viewingQuotation)}
          onClose={() => setViewingQuotation(null)}
          portalLabel={portalHome === "/admin" ? "Admin Portal" : "Sales Portal"}
        />
      )}

      {emailingQuotation && (
        <SendQuotationEmailModal
          lead={lead}
          quotation={emailingQuotation}
          open={Boolean(emailingQuotation)}
          onClose={() => setEmailingQuotation(null)}
          onSuccess={() => {
            refetchQuotations();
            refetch();
          }}
        />
      )}
    </div>
  );
}
