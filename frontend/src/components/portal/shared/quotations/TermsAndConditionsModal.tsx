/**
 * @fileoverview Terms & Conditions Management Modal & Details View.
 * Displays Terms & Conditions list, line items, details preview, and creation/editing controls.
 * @module components/portal/shared/quotations/TermsAndConditionsModal
 */
"use client";

import React, { useState, useMemo } from "react";
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  X,
  Star,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Search,
  RotateCcw,
  SlidersHorizontal,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  useListTermsAndConditionsQuery,
  useCreateTermsAndConditionsMutation,
  useUpdateTermsAndConditionsMutation,
  useDeleteTermsAndConditionsMutation,
  useAddTermsTextMutation,
  useUpdateTermsTextMutation,
  useDeleteTermsTextMutation,
  type TermsAndConditionsRecord,
  type TermsTextRecord,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { LargeModalPortal } from "../LargeModalPortal";
import { ModalOverlay } from "../ModalOverlay";
import { RichTextEditor } from "./RichTextEditor";
import { RichTextDisplay } from "./RichTextDisplay";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FormState = {
  _id?: string;
  title: string;
  code: string;
  type: "quotation" | "order" | "invoice" | "general";
  description: string;
  is_default: boolean;
  is_active: boolean;
  terms_text: Array<{ _id?: string; text: string; sequence: number; is_active: boolean }>;
};

const INITIAL_FORM: FormState = {
  title: "",
  code: "",
  type: "quotation",
  description: "",
  is_default: false,
  is_active: true,
  terms_text: [
    { text: "Validity: 15 days from the date of issuance.", sequence: 1, is_active: true },
    { text: "Payment Terms: 70% advance, 30% prior to dispatch.", sequence: 2, is_active: true },
  ],
};

export function TermsAndConditionsModal({ open, onClose }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form / Edit state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);

  // Single line item inline creation state for quick add
  const [quickLineText, setQuickLineText] = useState<Record<string, string>>({});

  // RTK Query hooks
  const { data: rawData, isLoading, isFetching, refetch } = useListTermsAndConditionsQuery(
    {
      search: searchTerm || undefined,
      type: typeFilter !== "all" ? typeFilter : undefined,
    },
    { skip: !open }
  );

  const [createTerms, { isLoading: isCreating }] = useCreateTermsAndConditionsMutation();
  const [updateTerms, { isLoading: isUpdating }] = useUpdateTermsAndConditionsMutation();
  const [deleteTerms] = useDeleteTermsAndConditionsMutation();
  const [addTermsText] = useAddTermsTextMutation();
  const [updateTermsText] = useUpdateTermsTextMutation();
  const [deleteTermsText] = useDeleteTermsTextMutation();

  const termsList: TermsAndConditionsRecord[] = useMemo(() => {
    if (!rawData) return [];
    if (Array.isArray(rawData.terms_and_conditions)) {
      return rawData.terms_and_conditions;
    }
    return [];
  }, [rawData]);

  if (!open) return null;

  const handleOpenCreate = () => {
    setFormData({
      title: "",
      code: "",
      type: "quotation",
      description: "",
      is_default: false,
      is_active: true,
      terms_text: [
        { text: "Prices quoted are valid for 15 days from date of submission.", sequence: 1, is_active: true },
        { text: "Taxes and statutory levies extra as applicable.", sequence: 2, is_active: true },
        { text: "Standard warranty applies as per manufacturer guidelines.", sequence: 3, is_active: true },
      ],
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: TermsAndConditionsRecord) => {
    setFormData({
      _id: item._id,
      title: item.title || "",
      code: item.code || "",
      type: item.type || "quotation",
      description: item.description || "",
      is_default: Boolean(item.is_default),
      is_active: Boolean(item.is_active),
      terms_text: (item.terms_text || []).map((t, idx) => ({
        _id: t._id,
        text: t.text,
        sequence: t.sequence || idx + 1,
        is_active: t.is_active !== undefined ? t.is_active : true,
      })),
    });
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      await deleteTerms(id).unwrap();
      toast.success(`Terms "${title}" deleted`);
      refetch();
    } catch {
      toast.error("Failed to delete terms and conditions");
    }
  };

  const handleToggleDefault = async (item: TermsAndConditionsRecord) => {
    try {
      await updateTerms({
        id: item._id,
        body: { is_default: !item.is_default, type: item.type },
      }).unwrap();
      toast.success(`Updated default status for "${item.title}"`);
      refetch();
    } catch {
      toast.error("Failed to update default status");
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }

    const payload = {
      title: formData.title.trim(),
      code: formData.code.trim() || undefined,
      type: formData.type,
      description: formData.description.trim() || undefined,
      is_default: formData.is_default,
      is_active: formData.is_active,
      terms_text: formData.terms_text
        .filter((t) => t.text.trim())
        .map((t, idx) => ({
          text: t.text.trim(),
          sequence: idx + 1,
          is_active: t.is_active,
        })),
    };

    try {
      if (formData._id) {
        await updateTerms({ id: formData._id, body: payload }).unwrap();
        toast.success(`Terms "${formData.title}" updated successfully`);
      } else {
        await createTerms(payload).unwrap();
        toast.success(`Terms "${formData.title}" created successfully`);
      }
      setIsFormOpen(false);
      refetch();
    } catch {
      toast.error("Failed to save Terms & Conditions");
    }
  };

  // Quick inline add text line to an existing Terms record
  const handleQuickAddLine = async (termsId: string) => {
    const text = (quickLineText[termsId] || "").trim();
    if (!text) return;
    try {
      await addTermsText({
        termsAndConditionsId: termsId,
        body: { text },
      }).unwrap();
      toast.success("Condition line added");
      setQuickLineText((prev) => ({ ...prev, [termsId]: "" }));
      refetch();
    } catch {
      toast.error("Failed to add condition line");
    }
  };

  // Delete line item
  const handleDeleteTextLine = async (textId: string) => {
    try {
      await deleteTermsText(textId).unwrap();
      toast.success("Condition line deleted");
      refetch();
    } catch {
      toast.error("Failed to delete condition line");
    }
  };

  return (
    <LargeModalPortal>
      <ModalOverlay className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-slate-900 p-0" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="relative flex flex-col w-full h-full bg-white p-4 sm:p-6 dark:bg-slate-900 overflow-hidden"
        >
          {/* Top Header Bar */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Terms &amp; Conditions Master
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    {termsList.length} Sets
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Manage commercial terms, legal conditions, and default text templates for Quotations and Orders
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Add Terms Set
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Search & Type Filter Bar */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search terms by title, code, or description..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2 text-xs text-slate-900 shadow-xs focus:border-blue-500 focus:bg-white focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
                Type:
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white cursor-pointer"
              >
                <option value="all">All Document Types</option>
                <option value="quotation">Quotation Terms</option>
                <option value="order">Order Terms</option>
                <option value="invoice">Invoice Terms</option>
                <option value="general">General Terms</option>
              </select>
            </div>
          </div>

          {/* Scrollable Terms Sets List */}
          <div className="mt-4 flex-1 overflow-y-auto pr-1 space-y-4">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading terms &amp; conditions master data...</div>
            ) : termsList.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl p-6 dark:border-white/10">
                No Terms &amp; Conditions sets found. Click &apos;+ Add Terms Set&apos; above to create your first standard conditions set.
              </div>
            ) : (
              termsList.map((item) => {
                const isExpanded = expandedId === item._id;
                const textCount = item.terms_text?.length || 0;

                return (
                  <div
                    key={item._id}
                    className={`rounded-2xl border transition-all ${
                      item.is_default
                        ? "border-blue-300 bg-blue-50/30 dark:border-blue-900/60 dark:bg-blue-950/20"
                        : "border-slate-200 bg-white dark:border-white/10 dark:bg-slate-800/40"
                    }`}
                  >
                    {/* Header Item Card */}
                    <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : item._id)}
                          className="mt-0.5 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>

                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {item.title}
                            </h3>

                            {item.is_default && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                Default {item.type}
                              </span>
                            )}

                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                              {item.type}
                            </span>

                            {item.code && (
                              <span className="font-mono text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 px-1.5 py-0.5 rounded-md dark:bg-blue-950/60">
                                #{item.code}
                              </span>
                            )}
                          </div>

                          {item.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                              {item.description}
                            </p>
                          )}

                          <div className="text-[11px] text-slate-400 flex items-center gap-3">
                            <span>
                              Contains <strong>{textCount}</strong> condition line{textCount !== 1 ? "s" : ""}
                            </span>
                            <span>•</span>
                            <span className={item.is_active ? "text-emerald-600 font-semibold" : "text-slate-400"}>
                              {item.is_active ? "Active" : "Disabled"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleToggleDefault(item)}
                          className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                            item.is_default
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                          title="Toggle default for this document type"
                        >
                          <Star className={`h-3.5 w-3.5 ${item.is_default ? "fill-amber-500 text-amber-500" : "text-slate-400"}`} />
                          {item.is_default ? "Default" : "Set Default"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : item._id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          <Layers className="h-3.5 w-3.5 text-blue-600" />
                          {isExpanded ? "Hide Lines" : "View Lines"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                          title="Edit terms and conditions set"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(item._id, item.title)}
                          className="rounded-xl p-2 text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 cursor-pointer"
                          title="Delete set"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded TermsText Lines Details View */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-900/60 rounded-b-2xl">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                            Condition Lines ({textCount})
                          </h4>
                          <span className="text-[11px] text-slate-500">
                            Printed in numerical order on proposal letterhead
                          </span>
                        </div>

                        {textCount === 0 ? (
                          <div className="py-4 text-center text-xs text-slate-400">
                            No condition lines configured. Add a line below.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {item.terms_text.map((textLine, idx) => (
                              <div
                                key={textLine._id || idx}
                                className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs dark:border-white/10 dark:bg-slate-800"
                              >
                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300 mt-0.5">
                                    {textLine.sequence || idx + 1}
                                  </span>
                                  <RichTextDisplay content={textLine.text} className="flex-1" />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => textLine._id && handleDeleteTextLine(textLine._id)}
                                  className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 p-1 cursor-pointer shrink-0"
                                  title="Delete line"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Inline quick add line */}
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            type="text"
                            value={quickLineText[item._id] || ""}
                            onChange={(e) =>
                              setQuickLineText((prev) => ({ ...prev, [item._id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleQuickAddLine(item._id);
                              }
                            }}
                            placeholder="Add a new condition line item..."
                            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleQuickAddLine(item._id)}
                            className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Line
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Form / Edit Modal Overlay */}
          {isFormOpen && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-xs">
              <div className="relative flex flex-col w-full max-w-2xl max-h-[90vh] rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900 overflow-hidden">
                {/* Form Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-white/10">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    {formData._id ? "Edit Terms & Conditions Set" : "Create Terms & Conditions Set"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Scrollable Form Body */}
                <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Title / Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                        placeholder="e.g. Standard Quotation Terms 2026"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Document Type
                      </label>
                      <select
                        value={formData.type}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            type: e.target.value as FormState["type"],
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="quotation">Quotation</option>
                        <option value="order">Sales Order</option>
                        <option value="invoice">Invoice</option>
                        <option value="general">General</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Code (optional)
                      </label>
                      <input
                        type="text"
                        value={formData.code}
                        onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value.toLowerCase() }))}
                        placeholder="e.g. quot_std_v1"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Internal notes or description..."
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="flex items-center gap-6 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-slate-800/40">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_default}
                        onChange={(e) => setFormData((p) => ({ ...p, is_default: e.target.checked }))}
                        className="h-4 w-4 rounded-xs border-slate-300 accent-blue-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                        Set as Default for {formData.type}
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
                        className="h-4 w-4 rounded-xs border-slate-300 accent-blue-600 cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Active Status
                      </span>
                    </label>
                  </div>

                  {/* Multiple TermsText Lines Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Layers className="h-4 w-4 text-blue-600" />
                        Condition Lines ({formData.terms_text.length})
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((p) => ({
                            ...p,
                            terms_text: [
                              ...p.terms_text,
                              { text: "", sequence: p.terms_text.length + 1, is_active: true },
                            ],
                          }))
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Condition Line
                      </button>
                    </div>

                    <div className="space-y-2">
                      {formData.terms_text.map((line, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 dark:border-white/10 dark:bg-slate-800/40"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300 mt-1">
                            {idx + 1}
                          </span>
                          <div className="flex-1">
                            <RichTextEditor
                              value={line.text}
                              onChange={(html) =>
                                setFormData((p) => ({
                                  ...p,
                                  terms_text: p.terms_text.map((x, i) =>
                                    i === idx ? { ...x, text: html } : x
                                  ),
                                }))
                              }
                              placeholder={`Condition Line ${idx + 1}...`}
                              minHeight="55px"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((p) => ({
                                ...p,
                                terms_text: p.terms_text.filter((_, i) => i !== idx),
                              }))
                            }
                            className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 cursor-pointer mt-1"
                            title="Remove Line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Submit Footer */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreating || isUpdating}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer"
                    >
                      {isCreating || isUpdating ? "Saving..." : formData._id ? "Update Terms Set" : "Create Terms Set"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}
