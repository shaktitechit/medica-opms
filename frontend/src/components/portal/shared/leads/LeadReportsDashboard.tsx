/**
 * @fileoverview Lead Analytics & Reports Dashboard: Funnel, Rep Performance, Source ROI and Pipeline Value.
 * @module components/portal/shared/leads/LeadReportsDashboard
 */
"use client";

import Link from "next/link";
import React, { useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Users,
  CheckCircle2,
  AlertCircle,
  PhoneCall,
  DollarSign,
  Layers,
  Filter,
  RefreshCw,
  Eye,
} from "lucide-react";
import {
  useGetLeadDashboardStatsQuery,
  useGetLeadSalesFunnelQuery,
  useGetLeadSalesPerformanceQuery,
  useGetLeadSourcePerformanceQuery,
  useListUsersQuery,
  type LeadSalesPerformance,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { formatCurrencyINR, isLeadAdmin, canViewLeadPricing } from "./leadUtils";
import { ExecutiveLeadDetailsModal } from "./ExecutiveLeadDetailsModal";

type Props = {
  portalHome?: string;
};

export function LeadReportsDashboard({ portalHome = "/admin" }: Props) {
  const authUser = useAppSelector((state) => state.auth.user);
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [detailsExecutive, setDetailsExecutive] = useState<LeadSalesPerformance | null>(null);

  const isAdmin = isLeadAdmin(authUser, portalHome);
  const isSales = !isAdmin;
  const showPricing = canViewLeadPricing(authUser, portalHome);

  const authUserId = authUser?._id
    ? String(authUser._id)
    : authUser?.id
    ? String(authUser.id)
    : undefined;

  const { data: usersData } = useListUsersQuery(undefined, { skip: isSales });
  const users = Array.isArray(usersData)
    ? usersData
    : (usersData as { data?: Array<{ _id: string; name: string; department?: string }> })?.data || [];
  const salesUsers = users.filter((u) => u.department === "sales");

  const queryParam = isSales
    ? (authUserId ? { assigned_to: authUserId } : undefined)
    : (selectedUser !== "all" ? { assigned_to: selectedUser } : undefined);

  const {
    data: stats,
    isLoading: loadingStats,
    refetch: refetchStats,
  } = useGetLeadDashboardStatsQuery(queryParam);
  const {
    data: funnel,
    isLoading: loadingFunnel,
    refetch: refetchFunnel,
  } = useGetLeadSalesFunnelQuery(queryParam);
  const {
    data: salesPerf,
    isLoading: loadingPerf,
    refetch: refetchPerf,
  } = useGetLeadSalesPerformanceQuery(queryParam, { skip: isSales });
  const {
    data: sourcePerf,
    isLoading: loadingSource,
    refetch: refetchSource,
  } = useGetLeadSourcePerformanceQuery();

  const handleRefreshAll = () => {
    refetchStats();
    refetchFunnel();
    if (!isSales) refetchPerf();
    refetchSource();
  };

  return (
    <div className="relative min-h-screen space-y-6 pb-20">
      {/* Header Banner */}
      <div className="relative shrink-0 overflow-hidden rounded-xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 px-4 py-2.5 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`${portalHome}/leads`}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                {isSales ? "My Lead Funnel & Performance Analytics" : "Lead Funnel & Performance Analytics"}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isSales
                  ? "Personal pipeline conversion metrics and lead source performance"
                  : "Pipeline conversion metrics, marketing channel ROI, and sales rep scorecards"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {isAdmin && (
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="all">All Sales Executives</option>
                {salesUsers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={handleRefreshAll}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Leads</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {stats?.totalLeads ?? 0}
          </div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 shadow-sm dark:border-blue-900/30 dark:bg-blue-950/20">
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-300">New Leads</div>
          <div className="mt-2 text-2xl font-bold text-blue-900 dark:text-blue-100">
            {stats?.newLeads ?? 0}
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-sm dark:border-indigo-900/30 dark:bg-indigo-950/20">
          <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Assigned Leads</div>
          <div className="mt-2 text-2xl font-bold text-indigo-900 dark:text-indigo-100">
            {stats?.assignedLeads ?? 0}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 shadow-sm dark:border-amber-900/30 dark:bg-amber-950/20">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">Today&apos;s Follow-ups</div>
          <div className="mt-2 text-2xl font-bold text-amber-900 dark:text-amber-100">
            {stats?.followUpsToday ?? 0}
          </div>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 shadow-sm dark:border-rose-900/30 dark:bg-rose-950/20">
          <div className="text-xs font-semibold text-rose-700 dark:text-rose-300">Overdue Follow-ups</div>
          <div className="mt-2 text-2xl font-bold text-rose-900 dark:text-rose-100">
            {stats?.overdueFollowUps ?? 0}
          </div>
        </div>

        <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 shadow-sm dark:border-teal-900/30 dark:bg-teal-950/20">
          <div className="text-xs font-semibold text-teal-700 dark:text-teal-300">Won / Converted</div>
          <div className="mt-2 text-2xl font-bold text-teal-900 dark:text-teal-100">
            {(stats?.wonLeads ?? 0) + (stats?.convertedLeads ?? 0)}
          </div>
        </div>
      </div>

      {/* Pipeline Quantity & Value Banners */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-500/10 to-indigo-600/5 p-5 dark:border-indigo-900/40 dark:bg-indigo-950/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              <TrendingUp className="h-4 w-4" />
              Active Pipeline Quantity
            </div>
            <span className="rounded-lg bg-indigo-100/80 px-2 py-0.5 text-xs font-bold text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
              {showPricing ? formatCurrencyINR(stats?.totalPipelineValue) : `${(stats?.totalPipelineQuantity ?? 0).toLocaleString()} units`}
            </span>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
            {(stats?.totalPipelineQuantity ?? 0).toLocaleString()}{" "}
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Qty / Items
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Cumulative required item quantity across active pipeline leads
            {showPricing ? ` (Estimated Value: ${formatCurrencyINR(stats?.totalPipelineValue)})` : ""}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              Total Won / Converted Quantity
            </div>
            <span className="rounded-lg bg-emerald-100/80 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
              {showPricing ? formatCurrencyINR(stats?.totalWonValue) : `${(stats?.totalWonQuantity ?? 0).toLocaleString()} units`}
            </span>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
            {(stats?.totalWonQuantity ?? 0).toLocaleString()}{" "}
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Qty / Items
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Total product item quantity successfully closed and converted into OPMS customer orders
            {showPricing ? ` (Won Revenue: ${formatCurrencyINR(stats?.totalWonValue)})` : ""}
          </p>
        </div>
      </div>

      {/* Sales Funnel Visualizer */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-100 pb-4 dark:border-white/10">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Sales Lead Funnel
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Stage-by-stage progression from lead capture to final commercial outcome
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {funnel?.stages?.map((stage, idx) => {
            const widthPct = Math.max(12, stage.percentage || 0);
            return (
              <div key={stage.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {idx + 1}. {stage.label} ({stage.count} Leads)
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {(stage.quantity ?? 0).toLocaleString()} Units / Qty
                    </span>
                    {showPricing && (
                      <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                        {formatCurrencyINR(stage.estimated_value)}
                      </span>
                    )}
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {stage.percentage}%
                    </span>
                  </div>
                </div>

                <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${widthPct}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sales Performance: Personal Summary for Sales Reps */}
      {isSales && stats && (
        <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30 p-6 shadow-sm dark:border-blue-500/10 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
          <div className="border-b border-slate-100 pb-4 dark:border-white/10">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              My Sales Performance & Metrics
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Personal conversion yield, active pipeline velocity, and follow-up track record
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/80">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Conversion Rate</div>
              <div className="mt-1 text-2xl font-black text-blue-600 dark:text-blue-400">
                {stats.totalLeads > 0
                  ? Math.round(((stats.wonLeads + stats.convertedLeads) / stats.totalLeads) * 100)
                  : 0}
                %
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {stats.wonLeads + stats.convertedLeads} won out of {stats.totalLeads} assigned
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/80">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Won Value</div>
              <div className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {formatCurrencyINR(stats.totalWonValue)}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Total revenue from closed-won leads
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/80">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Active Pipeline Value</div>
              <div className="mt-1 text-2xl font-black text-indigo-600 dark:text-indigo-400">
                {formatCurrencyINR(stats.totalPipelineValue)}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                In negotiations & quotations
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/80">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Follow-ups Discipline</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                  {stats.followUpsToday} Today
                </span>
              </div>
              <p className={`mt-1 text-[11px] font-semibold ${stats.overdueFollowUps > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400"}`}>
                {stats.overdueFollowUps > 0 ? `${stats.overdueFollowUps} Overdue follow-up(s)` : "All follow-ups on track"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sales Performance by Rep (Managers and Admins Only) */}
      {!isSales && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="border-b border-slate-100 pb-4 dark:border-white/10">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Sales Executive Performance Leaderboard
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Conversion efficiency, pipeline velocity, and follow-up discipline per representative
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="border-b border-slate-100 bg-slate-50/80 font-bold uppercase text-slate-500 dark:border-white/5 dark:bg-slate-800/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Sales Executive</th>
                  <th className="px-4 py-3 text-center">Total Leads</th>
                  <th className="px-4 py-3 text-center">Qualified</th>
                  <th className="px-4 py-3 text-center">Won</th>
                  <th className="px-4 py-3 text-center">Lost</th>
                  <th className="px-4 py-3 text-center">Conv. Rate</th>
                  <th className="px-4 py-3 text-center">Pipeline Qty</th>
                  {showPricing && <th className="px-4 py-3 text-right">Pipeline Value</th>}
                  <th className="px-4 py-3 text-center">Won Qty</th>
                  {showPricing && <th className="px-4 py-3 text-right">Won Value</th>}
                  <th className="px-4 py-3 text-center">Lost Qty</th>
                  <th className="px-4 py-3 text-center">Follow-ups Done</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {!salesPerf || salesPerf.length === 0 ? (
                  <tr>
                    <td colSpan={showPricing ? 13 : 11} className="py-8 text-center text-slate-400">
                      No sales executive performance data available.
                    </td>
                  </tr>
                ) : (
                  salesPerf.map((sp) => (
                    <tr key={sp.user_id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        {sp.name}
                        <div className="text-[11px] text-slate-400 font-normal">{sp.email}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold">{sp.total_leads}</td>
                      <td className="px-4 py-3 text-center text-blue-600 dark:text-blue-400 font-semibold">
                        {sp.qualified_leads}
                      </td>
                      <td className="px-4 py-3 text-center text-emerald-600 dark:text-emerald-400 font-semibold">
                        {sp.won_leads}
                      </td>
                      <td className="px-4 py-3 text-center text-rose-600 dark:text-rose-400 font-semibold">
                        {sp.lost_leads}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-slate-900 dark:text-white">
                        {sp.conversion_rate}%
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-indigo-600 dark:text-indigo-400">
                        {(sp.pipeline_qty ?? sp.pipeline_quantity ?? 0).toLocaleString()}
                      </td>
                      {showPricing && (
                        <td className="px-4 py-3 text-right font-semibold text-indigo-700 dark:text-indigo-300">
                          {formatCurrencyINR(sp.pipeline_value)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                        {(sp.won_qty ?? sp.won_quantity ?? 0).toLocaleString()}
                      </td>
                      {showPricing && (
                        <td className="px-4 py-3 text-right font-bold text-emerald-700 dark:text-emerald-300">
                          {formatCurrencyINR(sp.won_value)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center font-semibold text-rose-600 dark:text-rose-400">
                        {(sp.lost_qty ?? sp.lost_quantity ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                        {sp.completed_followups}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setDetailsExecutive(sp)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition border border-blue-200 dark:border-blue-800"
                        >
                          <Eye className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Source Performance & ROI */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-100 pb-4 dark:border-white/10">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Lead Source Channel Breakdown
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Evaluate inbound and marketing channels to measure customer acquisition yield
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="border-b border-slate-100 bg-slate-50/80 font-bold uppercase text-slate-500 dark:border-white/5 dark:bg-slate-800/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Lead Source Channel</th>
                <th className="px-4 py-3 text-center">Total Inquiries</th>
                <th className="px-4 py-3 text-center">Qualified</th>
                <th className="px-4 py-3 text-center">Won Deals</th>
                <th className="px-4 py-3 text-center">Lost Deals</th>
                <th className="px-4 py-3 text-center">Conversion %</th>
                <th className="px-4 py-3 text-center">Pipeline Qty</th>
                {showPricing && <th className="px-4 py-3 text-right">Pipeline Value</th>}
                <th className="px-4 py-3 text-center">Won Qty</th>
                {showPricing && <th className="px-4 py-3 text-right">Won Value</th>}
                <th className="px-4 py-3 text-center">Lost Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {!sourcePerf || sourcePerf.length === 0 ? (
                <tr>
                  <td colSpan={showPricing ? 11 : 9} className="py-8 text-center text-slate-400">
                    No lead source performance data available.
                  </td>
                </tr>
              ) : (
                sourcePerf.map((src) => (
                  <tr key={src.source} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {src.source}
                    </td>
                    <td className="px-4 py-3 text-center font-bold">{src.total_leads}</td>
                    <td className="px-4 py-3 text-center text-blue-600 dark:text-blue-400 font-semibold">
                      {src.qualified_leads}
                    </td>
                    <td className="px-4 py-3 text-center text-emerald-600 dark:text-emerald-400 font-semibold">
                      {src.won_leads}
                    </td>
                    <td className="px-4 py-3 text-center text-rose-600 dark:text-rose-400 font-semibold">
                      {src.lost_leads}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-900 dark:text-white">
                      {src.conversion_rate}%
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-indigo-600 dark:text-indigo-400">
                      {(src.pipeline_qty ?? src.pipeline_quantity ?? 0).toLocaleString()}
                    </td>
                    {showPricing && (
                      <td className="px-4 py-3 text-right font-semibold text-indigo-700 dark:text-indigo-300">
                        {formatCurrencyINR(src.pipeline_value)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                      {(src.won_qty ?? src.won_quantity ?? 0).toLocaleString()}
                    </td>
                    {showPricing && (
                      <td className="px-4 py-3 text-right font-bold text-emerald-700 dark:text-emerald-300">
                        {formatCurrencyINR(src.won_value)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-center font-semibold text-rose-600 dark:text-rose-400">
                      {(src.lost_qty ?? src.lost_quantity ?? 0).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailsExecutive && (
        <ExecutiveLeadDetailsModal
          open={Boolean(detailsExecutive)}
          onClose={() => setDetailsExecutive(null)}
          executive={detailsExecutive}
          portalHome={portalHome}
        />
      )}
    </div>
  );
}
