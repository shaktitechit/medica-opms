/**
 * @fileoverview Modal panel to send quotation to client via email with PDF attachment and mark status as sent.
 * @module components/portal/shared/leads/SendQuotationEmailModal
 */
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Mail, X, Send, Building2, Paperclip, Download, FileText, CheckCircle2, Users, UserCheck } from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import {
  useUpdateLeadQuotationMutation,
  useSendEmailMutation,
  useGetCompanyInfoQuery,
  useListUsersQuery,
  type LeadRecord,
  type LeadQuotationRecord,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { formatCurrencyINR } from "./leadUtils";
import LeadQuotationPdfTemplate from "./LeadQuotationPdfTemplate";
import { buildLeadQuotationPdf, type LeadQuotationCompanyInfo } from "./buildLeadQuotationPdf";

type Props = {
  lead: LeadRecord;
  quotation: LeadQuotationRecord;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

function parseCcEmails(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(/[,;]/)) {
    const email = part.trim();
    if (!email || !email.includes("@")) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

export function SendQuotationEmailModal({
  lead,
  quotation,
  open,
  onClose,
  onSuccess,
}: Props) {
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ccSalesUser, setCcSalesUser] = useState(true);
  const [ccSignatory, setCcSignatory] = useState(true);
  const [ccExtra, setCcExtra] = useState("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState<"compose" | "preview">("compose");

  const pdfTemplateRef = useRef<HTMLDivElement | null>(null);

  const [sendEmail, { isLoading: isSendingEmail }] = useSendEmailMutation();
  const [updateQuotation, { isLoading: isUpdatingQuotation }] = useUpdateLeadQuotationMutation();
  const { data: companyData } = useGetCompanyInfoQuery();
  const company = companyData as Record<string, unknown> | undefined;
  const { data: usersData } = useListUsersQuery(undefined, { skip: !open });
  const usersList = (
    Array.isArray(usersData)
      ? usersData
      : (usersData as { items?: unknown[] })?.items || (usersData as { data?: unknown[] })?.data || []
  ) as Array<{ _id: string; name?: string; email?: string; department?: string }>;

  const companyDisplayName =
    (company?.trade_name as string) ||
    (company?.legal_name as string) ||
    quotation?.company_name ||
    "Medica Enterprises";

  const isBusy = isSendingEmail || isUpdatingQuotation || isGeneratingPdf;
  const refNumber = quotation?.ref_no || quotation?.quotation_no || "";

  const salesUser = useMemo(() => {
    const assigned = lead.assigned_to as
      | string
      | { _id?: string; name?: string; email?: string; department?: string }
      | undefined;
    if (!assigned) return null;
    if (typeof assigned === "object") {
      const email = (assigned.email || "").trim();
      const id = assigned._id || "";
      const fromRoster = !email && id ? usersList.find((u) => u._id === id) : null;
      return {
        name: assigned.name || fromRoster?.name || "Assigned sales user",
        email: email || fromRoster?.email || "",
        department: assigned.department || fromRoster?.department || "sales",
      };
    }
    const fromRoster = usersList.find((u) => u._id === assigned);
    return {
      name: fromRoster?.name || "Assigned sales user",
      email: fromRoster?.email || "",
      department: fromRoster?.department || "sales",
    };
  }, [lead.assigned_to, usersList]);

  const signatory = useMemo(() => {
    const email = (quotation?.signatory_email || "").trim();
    const name = (quotation?.signatory_name || "").trim();
    if (!email && !name) return null;
    return {
      name: name || "Signatory",
      email,
      designation: quotation?.signatory_designation || "",
    };
  }, [quotation?.signatory_email, quotation?.signatory_name, quotation?.signatory_designation]);

  const salesUserEmail = (salesUser?.email || "").trim();
  const signatoryEmail = (signatory?.email || "").trim();
  const sameSalesAndSignatory =
    Boolean(salesUserEmail) &&
    Boolean(signatoryEmail) &&
    salesUserEmail.toLowerCase() === signatoryEmail.toLowerCase();

  useEffect(() => {
    if (open && quotation) {
      const initialEmail =
        quotation.email ||
        lead.email ||
        (Array.isArray(lead.contacts) && lead.contacts.find((c) => c.email)?.email) ||
        "";
      setRecipient(initialEmail);
      setCcSalesUser(true);
      setCcSignatory(true);
      setCcExtra("");

      const refNo = quotation.ref_no || quotation.quotation_no;
      const initialSubject = `Quotation ${refNo} - ${quotation.subject || "Medical Equipment Proposal"} | ${companyDisplayName}`;
      setSubject(initialSubject);

      const coName = companyDisplayName;
      const sigName = quotation.signatory_name || "Sales Team";
      const sigDesig = quotation.signatory_designation || "";
      const sigPhone = quotation.signatory_phone || (company?.phone as string) || "";
      const sigEmail = quotation.signatory_email || (company?.email as string) || "";

      const defaultBody = `Dear ${quotation.customer_name || lead.name || "Client"},

Thank you for contacting us regarding your medical equipment requirements.

Please find below our commercial quotation proposal for your review:

Quotation Reference: ${refNo}
Date: ${new Date(quotation.quotation_date || Date.now()).toLocaleDateString("en-IN")}
Grand Total: ${formatCurrencyINR(quotation.grand_total)} (incl. ${formatCurrencyINR(quotation.total_gst)} GST)
Validity: ${quotation.validity_days || 15} Days
${Array.isArray(quotation.terms_and_conditions) && quotation.terms_and_conditions.length > 0 ? `Terms:\n${quotation.terms_and_conditions.map((t) => `• ${t}`).join("\n")}\n` : ""}
The official PDF proposal with complete technical specifications and bank details has been attached to this email.

Please let us know if you need any clarification or revisions. We look forward to partnering with you.

Best regards,
${sigName}
${sigDesig ? `${sigDesig}\n` : ""}${coName}
${sigPhone ? `Phone: ${sigPhone}\n` : ""}${sigEmail ? `Email: ${sigEmail}` : ""}`.trim();

      setBody(defaultBody);
    }
  }, [open, quotation, lead, companyDisplayName, company]);

  if (!open || !quotation) return null;

  const generatePdfBase64 = async (): Promise<string | null> => {
    try {
      const pdf = await buildLeadQuotationPdf({
        quotation,
        company: company as LeadQuotationCompanyInfo,
        portalLabel: "Medica OPMS",
        downloadedBy: "Sales Team",
      });
      const pdfDataUri = pdf.output("datauristring");
      return pdfDataUri.includes(",") ? pdfDataUri.split(",")[1] : pdfDataUri;
    } catch (err) {
      console.error("Vector PDF generation error:", err);
      return null;
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      const pdf = await buildLeadQuotationPdf({
        quotation,
        company: company as LeadQuotationCompanyInfo,
        portalLabel: "Medica OPMS",
        downloadedBy: "Sales Team",
      });
      pdf.save(`Quotation_${refNumber}.pdf`);
      toast.success(`Downloaded Quotation_${refNumber}.pdf`);
    } catch (err) {
      console.error("PDF download error:", err);
      toast.error("Failed to generate PDF download");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recipient.trim()) {
      toast.error("Please enter a recipient email address");
      return;
    }
    if (!subject.trim()) {
      toast.error("Please enter an email subject");
      return;
    }
    if (!body.trim()) {
      toast.error("Please enter the email body content");
      return;
    }

    const recipientKey = recipient.trim().toLowerCase();
    const ccList: string[] = [];
    const pushCc = (email: string) => {
      const trimmed = email.trim();
      if (!trimmed || !trimmed.includes("@")) return;
      const key = trimmed.toLowerCase();
      if (key === recipientKey) return;
      if (ccList.some((e) => e.toLowerCase() === key)) return;
      ccList.push(trimmed);
    };

    if (ccSalesUser && salesUserEmail) pushCc(salesUserEmail);
    if (ccSignatory && signatoryEmail) pushCc(signatoryEmail);
    for (const extra of parseCcEmails(ccExtra)) pushCc(extra);

    const attachments: Array<{ filename: string; content: string; contentType: string }> = [];

    try {
      setIsGeneratingPdf(true);

      // 1. Generate High-Quality PDF from rendered template
      try {
        const base64 = await generatePdfBase64();
        if (base64) {
          attachments.push({
            filename: `Quotation_${refNumber}.pdf`,
            content: base64,
            contentType: "application/pdf",
          });
        } else {
          console.warn("Could not generate PDF base64");
        }
      } catch (pdfErr) {
        console.warn("Client PDF generation warning:", pdfErr);
      }

      setIsGeneratingPdf(false);

      // 2. Generate items rows HTML matching lead_quotation template
      const itemsRows = (quotation.items || [])
        .map(
          (it, idx) => `<tr>
        <td class="text-center">${idx + 1}</td>
        <td><strong>${it.product_name}</strong>${it.description ? `<br><small style="color:#64748b; font-size: 11px;">${it.description}</small>` : ""}</td>
        <td class="text-center">${it.quantity} ${it.unit || "Unit"}</td>
        <td class="text-right">${formatCurrencyINR(it.rate)}</td>
        <td class="text-center">${it.gst_rate}%</td>
        <td class="text-right font-semibold">${formatCurrencyINR(it.line_total)}</td>
      </tr>`
        )
        .join("");

      const subtotalVal = (quotation.grand_total || 0) - (quotation.total_gst || 0);

      // 3. Send Email via template with PDF attachment
      await sendEmail({
        recipient: recipient.trim(),
        subject: subject.trim(),
        body: body.trim(),
        cc: ccList,
        templateName: "lead_quotation",
        templateParams: {
          quotationNo: refNumber,
          customerName: quotation.customer_name || lead.name || "Valued Client",
          companyName: companyDisplayName || (company?.legal_name as string) || quotation.company_name || "Medica Enterprises",
          companyEmail: (company?.email as string) || quotation.company_email || undefined,
          companyPhone: (company?.phone as string) || quotation.company_phone || undefined,
          messageBody: body.trim().replace(/\n/g, "<br>"),
          quotationDate: new Date(quotation.quotation_date || Date.now()).toLocaleDateString("en-IN"),
          validityDays: quotation.validity_days || 15,
          subject: subject.trim(),
          subtotal: formatCurrencyINR(subtotalVal),
          gstAmount: formatCurrencyINR(quotation.total_gst),
          grandTotal: formatCurrencyINR(quotation.grand_total),
          itemsRows,
          signatoryName: quotation.signatory_name || "Sales Team",
          signatoryDesignation: quotation.signatory_designation || "Sales & Commercial Department",
          signatoryPhone: quotation.signatory_phone || (company?.phone as string) || "",
          signatoryEmail: quotation.signatory_email || (company?.email as string) || "",
          year: new Date().getFullYear(),
          attachments,
          cc: ccList,
        },
        attachments,
      }).unwrap();

      // 4. Advance Quotation status to 'sent'
      if (quotation.status === "draft") {
        await updateQuotation({
          quotationId: quotation._id,
          leadId: lead._id,
          body: {
            status: "sent",
          },
        }).unwrap();
      }

      toast.success(
        ccList.length
          ? `Quotation email with PDF sent to ${recipient} (CC: ${ccList.join(", ")})`
          : `Quotation email with PDF attachment sent to ${recipient}! ✉️`
      );
      onClose();
      onSuccess?.();
    } catch (err) {
      setIsGeneratingPdf(false);
      toast.error(mutationRejectedMessage(err) || "Failed to send quotation email");
    }
  };

  return (
    <LargeModalPortal>
      <ModalOverlay onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-6xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all dark:border-white/10 dark:bg-slate-900 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Email Quotation Proposal
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Send quotation #{refNumber} with official PDF attachment directly to the client
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Mobile Tab Switcher */}
              <div className="flex lg:hidden rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab("compose")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                    activeTab === "compose"
                      ? "bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
                  }`}
                >
                  Compose
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("preview")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                    activeTab === "preview"
                      ? "bg-white text-blue-600 shadow-xs dark:bg-slate-700 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
                  }`}
                >
                  Preview PDF
                </button>
              </div>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                title="Download Quotation PDF"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span className="hidden sm:inline">Download PDF</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body Content - Two Column Layout on Desktop */}
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Email Compose Form */}
            <div className={`lg:col-span-6 space-y-4 ${activeTab === "preview" ? "hidden lg:block" : "block"}`}>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Quotation Info Summary Banner */}
                <div className="rounded-xl border border-blue-500/20 bg-blue-50/40 p-3.5 dark:bg-blue-950/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                        <Building2 className="h-3.5 w-3.5 text-blue-600" />
                        {quotation.customer_name || lead.company_name || lead.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Ref: <span className="font-semibold text-blue-700 dark:text-blue-400">{refNumber}</span> • {quotation.items?.length || 0} line items
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-semibold text-slate-500">
                        Quotation Amount
                      </div>
                      <div className="text-sm font-extrabold text-slate-900 dark:text-white font-mono">
                        {formatCurrencyINR(quotation.grand_total)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        (incl. {formatCurrencyINR(quotation.total_gst)} GST)
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recipient Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Recipient Email (<span className="text-rose-500">*</span>)
                  </label>
                  <input
                    type="email"
                    required
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="client@hospital.com, procurement@clinic.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
                  />
                </div>

                {/* CC: sales user + signatory */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-slate-800/40">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    CC
                    <span className="font-normal text-[11px] text-slate-500">
                      Sales user and signatory receive a copy
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label
                      className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 ${
                        salesUserEmail
                          ? "cursor-pointer border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900"
                          : "border-dashed border-slate-200 bg-slate-50/80 opacity-70 dark:border-white/10 dark:bg-slate-900/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-blue-600"
                        checked={ccSalesUser && Boolean(salesUserEmail)}
                        disabled={!salesUserEmail}
                        onChange={(e) => setCcSalesUser(e.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                          <Users className="h-3 w-3 text-blue-600" />
                          Sales user
                          {sameSalesAndSignatory ? (
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800">
                              also signatory
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                          {salesUser
                            ? salesUserEmail
                              ? `${salesUser.name}${salesUser.department ? ` · ${salesUser.department}` : ""} — ${salesUserEmail}`
                              : `${salesUser.name} has no email on file`
                            : "No assigned sales user on this lead"}
                        </span>
                      </span>
                    </label>

                    <label
                      className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 ${
                        signatoryEmail
                          ? "cursor-pointer border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900"
                          : "border-dashed border-slate-200 bg-slate-50/80 opacity-70 dark:border-white/10 dark:bg-slate-900/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-blue-600"
                        checked={ccSignatory && Boolean(signatoryEmail)}
                        disabled={!signatoryEmail}
                        onChange={(e) => setCcSignatory(e.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                          <UserCheck className="h-3 w-3 text-emerald-600" />
                          Signatory
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                          {signatory
                            ? signatoryEmail
                              ? `${signatory.name}${signatory.designation ? ` · ${signatory.designation}` : ""} — ${signatoryEmail}`
                              : `${signatory.name} has no email on file`
                            : "No signatory email on this quotation"}
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="mt-2.5">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Additional CC (optional)
                    </label>
                    <input
                      type="text"
                      value={ccExtra}
                      onChange={(e) => setCcExtra(e.target.value)}
                      placeholder="extra@company.com, manager@company.com"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Subject Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Subject (<span className="text-rose-500">*</span>)
                  </label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Quotation for Medical Equipment..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900"
                  />
                </div>

                {/* Email Body Content */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email Message (<span className="text-rose-500">*</span>)
                  </label>
                  <textarea
                    rows={7}
                    required
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Compose message..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-800 shadow-sm font-mono placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900 leading-relaxed"
                  />
                </div>

                {/* PDF Attachment Notice */}
                <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 p-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                        <span>Quotation_{refNumber}.pdf</span>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                        Official proposal with specs, terms & banking details
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    className="rounded-lg bg-emerald-600/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-600/20 dark:text-emerald-300 cursor-pointer"
                  >
                    Download
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isBusy}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {isGeneratingPdf
                      ? "Compiling PDF..."
                      : isSendingEmail
                      ? "Sending Email..."
                      : "Send Quotation Email"}
                  </button>
                </div>
              </form>
            </div>

            {/* Right: Live PDF Document Preview */}
            <div className={`lg:col-span-6 ${activeTab === "compose" ? "hidden lg:block" : "block"}`}>
              <div className="flex flex-col h-full rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span>Attached Document Preview</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Quotation_{refNumber}.pdf
                  </span>
                </div>

                {/* PDF Viewer Container */}
                <div className="flex-1 overflow-y-auto max-h-[520px] rounded-lg border border-slate-200/80 bg-white p-3 shadow-inner dark:border-slate-800 dark:bg-slate-900">
                  <div ref={pdfTemplateRef} className="origin-top transition-transform">
                    <LeadQuotationPdfTemplate quotation={quotation} portalLabel="Medica OPMS" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}
