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
  Calendar,
} from "lucide-react";
import {
  useGetLeadQuery,
  useQualifyLeadMutation,
  useListAttachmentsQuery,
  useCreateAttachmentMutation,
  useDeleteAttachmentMutation,
  useListLeadFollowUpsQuery,
  type LeadRecord,
  type LeadFollowUpRecord,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { FilePreviewModal } from "@/components/portal/shared/FilePreviewModal";
import {
  formatCurrencyINR,
  formatLeadDate,
  formatLeadDateTime,
  isFollowUpOverdue,
  isFollowUpToday,
  isLeadAdmin,
  canAssignLead,
  LEAD_STATUS_CONFIG,
  LEAD_PRIORITY_CONFIG,
  FOLLOWUP_TYPE_CONFIG,
} from "./leadUtils";
import { AssignLeadModal } from "./AssignLeadModal";
import { ChangeLeadStatusModal } from "./ChangeLeadStatusModal";
import { MarkLostModal } from "./MarkLostModal";
import { ConvertLeadModal } from "./ConvertLeadModal";
import { FollowUpModal } from "./FollowUpModal";
import { CompleteFollowUpModal } from "./CompleteFollowUpModal";
import { LeadTimelineTab } from "./LeadTimelineTab";

type Props = {
  leadId: string;
  portalHome?: string;
};

export function LeadDetailPage({ leadId, portalHome = "/admin" }: Props) {
  const router = useRouter();
  const authUser = useAppSelector((state) => state.auth.user);
  const isAdmin = isLeadAdmin(authUser, portalHome);

  const [activeTab, setActiveTab] = useState<
    "overview" | "products" | "qualification" | "followups" | "orders" | "attachments" | "timeline"
  >("overview");

  // Modals state
  const [assignOpen, setAssignOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [completingFollowUp, setCompletingFollowUp] = useState<LeadFollowUpRecord | null>(null);

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

  const [qualifyLead, { isLoading: qualifying }] = useQualifyLeadMutation();
  const [createAttachment, { isLoading: uploading }] = useCreateAttachmentMutation();
  const [deleteAttachment] = useDeleteAttachmentMutation();

  // Qualification form state
  const [reqConfirmed, setReqConfirmed] = useState(false);
  const [budgetAvail, setBudgetAvail] = useState(false);
  const [decisionMaker, setDecisionMaker] = useState(false);
  const [timelineStr, setTimelineStr] = useState("");
  const [competitionStr, setCompetitionStr] = useState("");
  const [qualNotes, setQualNotes] = useState("");

  // Sync qualification form when lead loads
  React.useEffect(() => {
    if (lead?.qualification) {
      setReqConfirmed(Boolean(lead.qualification.requirement_confirmed));
      setBudgetAvail(Boolean(lead.qualification.budget_available));
      setDecisionMaker(Boolean(lead.qualification.decision_maker_known));
      setTimelineStr(lead.qualification.purchase_timeline || "");
      setCompetitionStr(lead.qualification.competition || "");
      setQualNotes(lead.qualification.qualification_notes || "");
    }
  }, [lead]);

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
  const isClosed = isWon || isLost || isConverted;

  const handleCopyLeadNo = () => {
    navigator.clipboard.writeText(lead.lead_no);
    toast.success(`Copied ${lead.lead_no} to clipboard`);
  };

  const handleSaveQualification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isClosed) return;
    try {
      await qualifyLead({
        id: lead._id,
        qualification: {
          requirement_confirmed: reqConfirmed,
          budget_available: budgetAvail,
          decision_maker_known: decisionMaker,
          purchase_timeline: timelineStr.trim() || undefined,
          competition: competitionStr.trim() || undefined,
          qualification_notes: qualNotes.trim() || undefined,
        },
      }).unwrap();
      toast.success("Qualification details saved");
      refetch();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
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
      <PortalBusyOverlay active={isFetching || qualifying || uploading} />

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

              {/* Assigned Executive */}
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200">
                <UserCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                {lead.assigned_to ? lead.assigned_to.name : "Unassigned"}
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

            {isAdmin && !isClosed && (
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
              >
                <UserCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                Assign
              </button>
            )}

            {!isClosed && (
              <button
                type="button"
                onClick={() => setStatusOpen(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-800 shadow-sm transition hover:bg-purple-100 dark:border-purple-900/40 dark:bg-purple-950/40 dark:text-purple-300"
              >
                <Activity className="h-3.5 w-3.5 text-purple-600" />
                Status
              </button>
            )}

            {!isLost && !isConverted && (
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

      {/* Tabs Navigation */}
      <div className="flex overflow-x-auto border-b border-slate-200 dark:border-white/10">
        {[
          { id: "overview", label: "Overview & Contacts" },
          { id: "products", label: `Requirements (${lead.products?.length || 0})` },
          { id: "qualification", label: "Qualification" },
          { id: "followups", label: `Follow-ups (${followUps?.length || 0})` },
          {
            id: "orders",
            label: lead.conversion?.order_id ? "Converted Order" : "Quotations / Orders",
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
                  <th className="px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {!lead.products || lead.products.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
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

      {/* Tab 3: Qualification */}
      {activeTab === "qualification" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4 dark:border-white/10">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Lead Qualification Checklist & Criteria
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Confirm purchase readiness and key deal parameters before creating quotations
              </p>
            </div>
            {isClosed && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300">
                Qualification Locked ({statusCfg?.label || lead.status})
              </span>
            )}
          </div>

          <form onSubmit={handleSaveQualification} className="mt-5 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className={`flex items-center gap-3 rounded-xl border p-4 transition-all ${
                isClosed
                  ? "border-slate-100 bg-slate-50/40 opacity-70 cursor-not-allowed dark:border-white/5 dark:bg-slate-800/20"
                  : "border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-slate-800/40 cursor-pointer"
              }`}>
                <input
                  type="checkbox"
                  disabled={isClosed}
                  checked={reqConfirmed}
                  onChange={(e) => setReqConfirmed(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Requirement Confirmed
                  </div>
                  <div className="text-[11px] text-slate-500">Specs and qty validated</div>
                </div>
              </label>

              <label className={`flex items-center gap-3 rounded-xl border p-4 transition-all ${
                isClosed
                  ? "border-slate-100 bg-slate-50/40 opacity-70 cursor-not-allowed dark:border-white/5 dark:bg-slate-800/20"
                  : "border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-slate-800/40 cursor-pointer"
              }`}>
                <input
                  type="checkbox"
                  disabled={isClosed}
                  checked={budgetAvail}
                  onChange={(e) => setBudgetAvail(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Budget Available
                  </div>
                  <div className="text-[11px] text-slate-500">Funds allocated/approved</div>
                </div>
              </label>

              <label className={`flex items-center gap-3 rounded-xl border p-4 transition-all ${
                isClosed
                  ? "border-slate-100 bg-slate-50/40 opacity-70 cursor-not-allowed dark:border-white/5 dark:bg-slate-800/20"
                  : "border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-slate-800/40 cursor-pointer"
              }`}>
                <input
                  type="checkbox"
                  disabled={isClosed}
                  checked={decisionMaker}
                  onChange={(e) => setDecisionMaker(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Decision Maker Identified
                  </div>
                  <div className="text-[11px] text-slate-500">Direct contact established</div>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Purchase Timeline
                </label>
                <input
                  type="text"
                  disabled={isClosed}
                  value={timelineStr}
                  onChange={(e) => setTimelineStr(e.target.value)}
                  placeholder="Immediate, Within 30 days, Next quarter..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Competitors in Consideration
                </label>
                <input
                  type="text"
                  disabled={isClosed}
                  value={competitionStr}
                  onChange={(e) => setCompetitionStr(e.target.value)}
                  placeholder="Competitor A, Brand B..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Qualification Assessment Notes
              </label>
              <textarea
                rows={3}
                disabled={isClosed}
                value={qualNotes}
                onChange={(e) => setQualNotes(e.target.value)}
                placeholder="Key technical prerequisites, payment conditions, or procurement roadmap..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
              />
            </div>

            {!isClosed && (
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={qualifying}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  {qualifying ? "Saving..." : "Save Qualification"}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Tab 4: Follow-ups */}
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
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-4 dark:border-white/10">
            Linked Quotations & Converted Orders
          </h3>

          <div className="mt-4 space-y-4">
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
              <div className="py-12 text-center text-xs text-slate-400">
                No orders linked yet. Convert this lead using the &apos;Convert&apos; button above to create an Order.
              </div>
            )}
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

      {statusOpen && (
        <ChangeLeadStatusModal
          lead={lead}
          isAdmin={isAdmin}
          open={statusOpen}
          onClose={() => setStatusOpen(false)}
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

      {convertOpen && (
        <ConvertLeadModal
          lead={lead}
          open={convertOpen}
          onClose={() => setConvertOpen(false)}
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
    </div>
  );
}
