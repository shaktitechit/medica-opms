/**
 * @fileoverview Modal showing detailed Product and Requirements wise expansion for a Sales Executive.
 * @module components/portal/shared/leads/ExecutiveLeadDetailsModal
 */
"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  X,
  Package,
  FileText,
  Search,
  ExternalLink,
  RefreshCw,
  Building2,
  Calendar,
  Phone,
  CheckCircle2,
  AlertTriangle,
  User,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
} from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import {
  useListLeadsQuery,
  type LeadRecord,
  type LeadSalesPerformance,
  type LeadStatus,
} from "@/store/api";
import {
  formatLeadDate,
  isFollowUpOverdue,
  isFollowUpToday,
  LEAD_STATUS_CONFIG,
  LEAD_PRIORITY_CONFIG,
} from "./leadUtils";

export type ExecutiveLeadDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  executive: LeadSalesPerformance | null;
  portalHome?: string;
};

type AggregatedProduct = {
  productName: string;
  totalQuantity: number;
  pipelineQuantity: number;
  wonQuantity: number;
  lostQuantity: number;
  leadCount: number;
  leads: Array<{
    _id: string;
    lead_no: string;
    name: string;
    company_name?: string;
    status: LeadStatus;
    quantity: number;
    unit?: string;
  }>;
};

export function ExecutiveLeadDetailsModal({
  open,
  onClose,
  executive,
  portalHome = "/admin",
}: ExecutiveLeadDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<"products" | "leads">("products");
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedLeads, setExpandedLeads] = useState<Record<string, boolean>>({});

  const { data: leadsData, isLoading, isFetching, refetch } = useListLeadsQuery(
    {
      assigned_to: executive?.user_id,
      paginate: "false",
    },
    { skip: !open || !executive?.user_id }
  );

  const rawLeads: LeadRecord[] = useMemo(() => {
    if (!leadsData) return [];
    if (Array.isArray(leadsData)) return leadsData;
    if (Array.isArray((leadsData as any).items)) return (leadsData as any).items;
    if (Array.isArray((leadsData as any).data)) return (leadsData as any).data;
    return [];
  }, [leadsData]);

  // Toggle accordion expand
  const toggleExpand = (id: string) => {
    setExpandedLeads((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    let result = [...rawLeads];

    if (statusFilter !== "all") {
      if (statusFilter === "pipeline") {
        result = result.filter((l) =>
          ["new", "assigned", "contacted", "qualified", "follow_up", "quotation", "negotiation"].includes(
            l.status
          )
        );
      } else if (statusFilter === "won") {
        result = result.filter((l) => ["won", "converted"].includes(l.status));
      } else if (statusFilter === "lost") {
        result = result.filter((l) => ["lost", "unqualified"].includes(l.status));
      } else {
        result = result.filter((l) => l.status === statusFilter);
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((l) => {
        const matchLead =
          l.lead_no?.toLowerCase().includes(q) ||
          l.name?.toLowerCase().includes(q) ||
          l.company_name?.toLowerCase().includes(q) ||
          l.requirement?.toLowerCase().includes(q) ||
          l.notes?.toLowerCase().includes(q);

        const matchProduct = Array.isArray(l.products)
          ? l.products.some((p) => p.product_name?.toLowerCase().includes(q))
          : false;

        return matchLead || matchProduct;
      });
    }

    return result;
  }, [rawLeads, statusFilter, search]);

  // Aggregate Product Breakdown
  const aggregatedProducts = useMemo(() => {
    const map = new Map<string, AggregatedProduct>();

    filteredLeads.forEach((lead) => {
      const isWon = ["won", "converted"].includes(lead.status);
      const isLost = ["lost", "unqualified"].includes(lead.status);
      const isPipeline = !isWon && !isLost;

      if (Array.isArray(lead.products) && lead.products.length > 0) {
        lead.products.forEach((p) => {
          const rawName = p.product_name?.trim() || "Unspecified Product";
          const qty = Number(p.quantity) || 0;

          if (!map.has(rawName)) {
            map.set(rawName, {
              productName: rawName,
              totalQuantity: 0,
              pipelineQuantity: 0,
              wonQuantity: 0,
              lostQuantity: 0,
              leadCount: 0,
              leads: [],
            });
          }

          const entry = map.get(rawName)!;
          entry.totalQuantity += qty;
          if (isWon) entry.wonQuantity += qty;
          else if (isLost) entry.lostQuantity += qty;
          else if (isPipeline) entry.pipelineQuantity += qty;

          entry.leadCount += 1;
          entry.leads.push({
            _id: lead._id,
            lead_no: lead.lead_no,
            name: lead.name,
            company_name: lead.company_name,
            status: lead.status,
            quantity: qty,
            unit: p.unit,
          });
        });
      } else if (lead.requirement && lead.requirement.trim()) {
        // Generic requirement line
        const rawName = `Requirement Note: ${lead.requirement.trim().slice(0, 45)}...`;
        if (!map.has(rawName)) {
          map.set(rawName, {
            productName: rawName,
            totalQuantity: 0,
            pipelineQuantity: 0,
            wonQuantity: 0,
            lostQuantity: 0,
            leadCount: 0,
            leads: [],
          });
        }
        const entry = map.get(rawName)!;
        entry.leadCount += 1;
        entry.leads.push({
          _id: lead._id,
          lead_no: lead.lead_no,
          name: lead.name,
          company_name: lead.company_name,
          status: lead.status,
          quantity: 0,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [filteredLeads]);

  // Overall KPIs
  const totalQtySum = useMemo(() => {
    return aggregatedProducts.reduce((sum, p) => sum + p.totalQuantity, 0);
  }, [aggregatedProducts]);

  const pipelineQtySum = useMemo(() => {
    return aggregatedProducts.reduce((sum, p) => sum + p.pipelineQuantity, 0);
  }, [aggregatedProducts]);

  const wonQtySum = useMemo(() => {
    return aggregatedProducts.reduce((sum, p) => sum + p.wonQuantity, 0);
  }, [aggregatedProducts]);

  if (!open || !executive) return null;

  return (
    <LargeModalPortal>
      <ModalOverlay onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="relative flex flex-col w-full max-w-5xl max-h-[92vh] rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-white/10 dark:bg-slate-900 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-blue-600/5 via-indigo-600/5 to-transparent px-6 py-4 shrink-0 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white font-bold shadow-md shadow-blue-600/20">
                <User className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {executive.name}
                  </h2>
                  <span className="rounded-md bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                    Sales Executive
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {executive.email} • Detailed Product Demands & Requirements Breakdown
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Metric Summary Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-4 border-b border-slate-200 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Total Leads Assigned
              </div>
              <div className="mt-0.5 text-xl font-black text-slate-900 dark:text-white">
                {rawLeads.length}
              </div>
              <div className="text-[10px] text-slate-400">
                {executive.conversion_rate}% Conversion Rate
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Distinct Products Inquired
              </div>
              <div className="mt-0.5 text-xl font-black text-blue-600 dark:text-blue-400">
                {aggregatedProducts.length}
              </div>
              <div className="text-[10px] text-slate-400">Catalog items demanded</div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Active Pipeline Qty
              </div>
              <div className="mt-0.5 text-xl font-black text-indigo-600 dark:text-indigo-400">
                {pipelineQtySum.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400">In negotiations & quotes</div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-800/80">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Won / Closed Qty
              </div>
              <div className="mt-0.5 text-xl font-black text-emerald-600 dark:text-emerald-400">
                {wonQtySum.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400">Successfully converted units</div>
            </div>
          </div>

          {/* Search, Filter and Tabs Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
            {/* View Switcher */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab("products")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeTab === "products"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                Product Breakdown ({aggregatedProducts.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("leads")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeTab === "leads"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Requirements by Lead ({filteredLeads.length})
              </button>
            </div>

            {/* Search & Filter */}
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product, lead, requirement..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="all">All Stages</option>
                <option value="pipeline">Active Pipeline</option>
                <option value="won">Won / Converted</option>
                <option value="lost">Lost / Unqualified</option>
              </select>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex h-60 items-center justify-center text-slate-400">
                <RefreshCw className="mr-2 h-5 w-5 animate-spin text-blue-500" />
                Loading executive product requirements...
              </div>
            ) : activeTab === "products" ? (
              /* TAB 1: Product Breakdown Table */
              aggregatedProducts.length === 0 ? (
                <div className="flex h-60 flex-col items-center justify-center text-slate-400">
                  <Package className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="font-semibold">No product inquiries recorded for this representative</p>
                  <p className="text-xs text-slate-500">Products attached to leads will appear here</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 shadow-xs dark:border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400 text-[11px]">
                      <tr>
                        <th className="px-4 py-3">Product Name</th>
                        <th className="px-4 py-3 text-center">Inquiries</th>
                        <th className="px-4 py-3 text-center text-indigo-600 dark:text-indigo-400">
                          Pipeline Qty
                        </th>
                        <th className="px-4 py-3 text-center text-emerald-600 dark:text-emerald-400">
                          Won Qty
                        </th>
                        <th className="px-4 py-3 text-center text-rose-600 dark:text-rose-400">
                          Lost Qty
                        </th>
                        <th className="px-4 py-3 text-center">Total Demanded Qty</th>
                        <th className="px-4 py-3">Associated Leads</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {aggregatedProducts.map((p, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                        >
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                                <Package className="h-3.5 w-3.5" />
                              </span>
                              <span className="truncate max-w-xs">{p.productName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-slate-700 dark:text-slate-300">
                            {p.leadCount}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-indigo-600 dark:text-indigo-400">
                            {p.pipelineQuantity.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                            {p.wonQuantity.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-rose-600 dark:text-rose-400">
                            {p.lostQuantity.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-center font-black text-slate-900 dark:text-white">
                            {p.totalQuantity.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 max-w-sm">
                              {p.leads.slice(0, 3).map((l, lIdx) => (
                                <Link
                                  key={lIdx}
                                  href={`${portalHome}/leads/${l._id}`}
                                  target="_blank"
                                  className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40"
                                >
                                  <span>{l.company_name || l.name}</span>
                                  <span className="text-blue-600 dark:text-blue-400">({l.quantity})</span>
                                </Link>
                              ))}
                              {p.leads.length > 3 && (
                                <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                                  +{p.leads.length - 3} more
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              /* TAB 2: Requirements by Lead Accordion */
              filteredLeads.length === 0 ? (
                <div className="flex h-60 flex-col items-center justify-center text-slate-400">
                  <FileText className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="font-semibold">No lead inquiries match the filter</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLeads.map((lead) => {
                    const isExpanded = Boolean(expandedLeads[lead._id]);
                    const statusCfg = LEAD_STATUS_CONFIG[lead.status];
                    const priorityCfg = LEAD_PRIORITY_CONFIG[lead.priority];
                    const isOverdue = isFollowUpOverdue(lead.next_follow_up_at);
                    const isToday = isFollowUpToday(lead.next_follow_up_at);

                    return (
                      <div
                        key={lead._id}
                        className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                      >
                        {/* Header Row */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => toggleExpand(lead._id)}
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>

                            <div>
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`${portalHome}/leads/${lead._id}`}
                                  target="_blank"
                                  className="font-bold text-blue-600 hover:underline dark:text-blue-400 text-xs"
                                >
                                  {lead.lead_no}
                                </Link>
                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                <span className="font-bold text-slate-900 dark:text-white text-xs">
                                  {lead.name}
                                </span>
                                {lead.company_name && (
                                  <span className="text-slate-500 text-xs">
                                    ({lead.company_name})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                {lead.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" /> {lead.phone}
                                  </span>
                                )}
                                {lead.billing_address?.city && (
                                  <span>• {lead.billing_address.city}</span>
                                )}
                                <span>• Created: {formatLeadDate(lead.createdAt)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                statusCfg?.bg || "bg-slate-100"
                              } ${statusCfg?.text || "text-slate-800"}`}
                            >
                              {statusCfg?.label || lead.status}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                priorityCfg?.bg || "bg-slate-100"
                              } ${priorityCfg?.text || "text-slate-800"}`}
                            >
                              {priorityCfg?.label || lead.priority}
                            </span>

                            <Link
                              href={`${portalHome}/leads/${lead._id}`}
                              target="_blank"
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                              title="Open lead details"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </div>

                        {/* Always visible: Products Strip */}
                        {Array.isArray(lead.products) && lead.products.length > 0 && (
                          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800/60">
                            <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                              <Package className="h-3 w-3 text-blue-500" /> Products Demanded:
                            </span>
                            {lead.products.map((p, pIdx) => (
                              <span
                                key={pIdx}
                                className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                              >
                                <span>{p.product_name}</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                  - {p.quantity} {p.unit || "pcs"}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Expandable Section: Requirement Notes, Follow-up, Lost info */}
                        {isExpanded && (
                          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800 text-xs animate-in fade-in-50">
                            {lead.requirement && (
                              <div className="rounded-lg bg-blue-50/50 p-2.5 dark:bg-blue-950/20 text-slate-700 dark:text-slate-300 border border-blue-100 dark:border-blue-900/30">
                                <span className="font-bold text-blue-700 dark:text-blue-300 block mb-1">
                                  Specific Requirements / Scope:
                                </span>
                                {lead.requirement}
                              </div>
                            )}

                            {lead.notes && (
                              <div className="text-slate-600 dark:text-slate-400 text-xs">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  Notes:
                                </span>{" "}
                                {lead.notes}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                              {lead.next_follow_up_at && (
                                <div className="flex items-center gap-1 font-semibold">
                                  <Calendar className="h-3.5 w-3.5 text-amber-500" />
                                  <span>Next Follow-up: {formatLeadDate(lead.next_follow_up_at)}</span>
                                  {isOverdue && (
                                    <span className="text-rose-600 dark:text-rose-400 font-bold">
                                      (Overdue)
                                    </span>
                                  )}
                                  {isToday && (
                                    <span className="text-amber-600 dark:text-amber-400 font-bold">
                                      (Today)
                                    </span>
                                  )}
                                </div>
                              )}

                              {lead.lost_info?.lost_reason && (
                                <div className="text-rose-600 dark:text-rose-400 font-semibold">
                                  Lost Reason: {lead.lost_info.lost_reason}{" "}
                                  {lead.lost_info.lost_remarks ? `(${lead.lost_info.lost_remarks})` : ""}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/90 px-6 py-3 dark:border-slate-800 dark:bg-slate-900/90">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Showing {activeTab === "products" ? `${aggregatedProducts.length} aggregated products` : `${filteredLeads.length} leads`}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      </ModalOverlay>
    </LargeModalPortal>
  );
}
