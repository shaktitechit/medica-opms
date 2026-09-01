"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  CheckCircle2,
  FileText,
  Trophy,
  XCircle,
  Package,
  Calendar,
  ArrowUpRight,
  Phone,
  Mail,
  MessageSquare,
  MapPin,
  Tv,
  HelpCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";

import {
  useGetLeadDashboardStatsQuery,
  useGetLeadFollowUpCalendarQuery,
  type LeadFollowUpRecord,
  type LeadFollowUpType,
} from "@/store/api";
import PeriodHeadingCaption from "@/components/portal/shared/dashboard/PeriodHeadingCaption";
import {
  dashboardPeriodToStatsQuery,
  type DashboardPeriodQuery,
} from "@/components/portal/shared/dashboard/periodFilterUtils";
import {
  formatLeadDate,
  formatLeadDateTime,
  FOLLOWUP_TYPE_CONFIG,
  LEAD_STATUS_CONFIG,
} from "./leadUtils";

type LeadManagerStatsWidgetsProps = {
  portalHome: "/sales" | "/admin" | "/super_admin" | string;
  assigned_to?: string;
} & DashboardPeriodQuery;

type StatCard = {
  key: string;
  label: string;
  value: number | string;
  subValue?: string;
  href: string;
  accent: string;
  iconWrap: string;
  iconTone: string;
  Icon: LucideIcon;
};

function FollowUpTypeIcon({ type }: { type: LeadFollowUpType }) {
  switch (type) {
    case "call":
      return <Phone className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />;
    case "meeting":
      return <Users className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />;
    case "email":
      return <Mail className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />;
    case "whatsapp":
      return <MessageSquare className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
    case "visit":
      return <MapPin className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />;
    case "demo":
      return <Tv className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />;
    default:
      return <HelpCircle className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />;
  }
}

export default function LeadManagerStatsWidgets({
  portalHome,
  assigned_to,
  dateFilter,
  customDateFrom,
  customDateTo,
  selectedYears,
  selectedMonths,
}: LeadManagerStatsWidgetsProps) {
  const [showFollowUpsTable, setShowFollowUpsTable] = useState(true);

  const hasPeriod =
    dateFilter != null || selectedYears != null || selectedMonths != null;
  const statsQuery = useMemo(() => {
    const base = dashboardPeriodToStatsQuery({
      dateFilter,
      customDateFrom,
      customDateTo,
      selectedYears,
      selectedMonths,
    });
    if (assigned_to) {
      return { ...base, assigned_to };
    }
    return base;
  }, [dateFilter, customDateFrom, customDateTo, selectedYears, selectedMonths, assigned_to]);

  const { data, isFetching } = useGetLeadDashboardStatsQuery(
    hasPeriod || assigned_to ? statsQuery : undefined
  );

  const todayYmd = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  // Fetch today's follow-up schedule
  const { data: followUpsData = [], isFetching: isFollowUpsFetching } =
    useGetLeadFollowUpCalendarQuery({
      from_date: todayYmd,
      to_date: todayYmd,
    });

  const followUps = useMemo(() => {
    if (!Array.isArray(followUpsData)) return [];
    return followUpsData;
  }, [followUpsData]);

  const isTodayPeriod = !hasPeriod || dateFilter === "today";
  const overdueCount = data?.overdueFollowUps ?? 0;

  const cards: StatCard[] = [
    {
      key: "total",
      label: isTodayPeriod ? "Today's Inquiries" : "Total Leads",
      value: data?.totalLeads ?? 0,
      href: `${portalHome}/leads`,
      accent: "bg-sky-500",
      iconWrap: "bg-sky-50 dark:bg-sky-950/30",
      iconTone: "text-sky-600 dark:text-sky-400",
      Icon: Users,
    },
    {
      key: "new_assigned",
      label: "New & Assigned",
      value: (data?.newLeads ?? 0) + (data?.assignedLeads ?? 0),
      href: `${portalHome}/leads?status=new`,
      accent: "bg-indigo-500",
      iconWrap: "bg-indigo-50 dark:bg-indigo-950/30",
      iconTone: "text-indigo-600 dark:text-indigo-400",
      Icon: UserCheck,
    },
    {
      key: "qualified",
      label: "Qualified Leads",
      value: data?.qualifiedLeads ?? 0,
      href: `${portalHome}/leads?status=qualified`,
      accent: "bg-blue-500",
      iconWrap: "bg-blue-50 dark:bg-blue-950/30",
      iconTone: "text-blue-600 dark:text-blue-400",
      Icon: CheckCircle2,
    },
    {
      key: "quotations",
      label: "Active Deals",
      value: (data?.quotationLeads ?? 0) + (data?.negotiationLeads ?? 0),
      href: `${portalHome}/leads?status=quotation`,
      accent: "bg-amber-500",
      iconWrap: "bg-amber-50 dark:bg-amber-950/30",
      iconTone: "text-amber-600 dark:text-amber-400",
      Icon: FileText,
    },
    {
      key: "won",
      label: "Won / Converted",
      value: (data?.wonLeads ?? 0) + (data?.convertedLeads ?? 0),
      href: `${portalHome}/leads?status=won`,
      accent: "bg-emerald-500",
      iconWrap: "bg-emerald-50 dark:bg-emerald-950/30",
      iconTone: "text-emerald-600 dark:text-emerald-400",
      Icon: Trophy,
    },
    {
      key: "lost",
      label: "Lost Inquiries",
      value: data?.lostLeads ?? 0,
      href: `${portalHome}/leads?status=lost`,
      accent: "bg-rose-500",
      iconWrap: "bg-rose-50 dark:bg-rose-950/30",
      iconTone: "text-rose-600 dark:text-rose-400",
      Icon: XCircle,
    },
    {
      key: "pipeline_qty",
      label: "Pipeline Qty",
      value: (data?.totalPipelineQuantity ?? 0).toLocaleString(),
      subValue: "units / items",
      href: `${portalHome}/leads/reports`,
      accent: "bg-violet-500",
      iconWrap: "bg-violet-50 dark:bg-violet-950/30",
      iconTone: "text-violet-600 dark:text-violet-400",
      Icon: Package,
    },
    {
      key: "followups",
      label: "Today's Follow-ups",
      value: data?.followUpsToday ?? 0,
      subValue: overdueCount > 0 ? `${overdueCount} overdue` : undefined,
      href: `${portalHome}/leads/follow-ups`,
      accent: overdueCount > 0 ? "bg-amber-500" : "bg-teal-500",
      iconWrap: overdueCount > 0 ? "bg-amber-50 dark:bg-amber-950/30" : "bg-teal-50 dark:bg-teal-950/30",
      iconTone: overdueCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-teal-600 dark:text-teal-400",
      Icon: Calendar,
    },
  ];

  return (
    <div className="space-y-4 font-sans w-full">
      {/* Header and Filter Info */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Leads & Inquiries Manager
          </h3>
          {hasPeriod ? (
            <PeriodHeadingCaption
              dateFilter={dateFilter}
              customDateFrom={customDateFrom}
              customDateTo={customDateTo}
              selectedYears={selectedYears ?? []}
              selectedMonths={selectedMonths}
            />
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Pipeline inquiries, follow-ups & conversion performance
            </p>
          )}
        </div>
        <Link
          href={`${portalHome}/leads`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Open Leads Manager
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* 8-Card Stat Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {cards.map(
          ({
            key,
            label,
            value,
            subValue,
            href,
            accent,
            iconWrap,
            iconTone,
            Icon,
          }) => (
            <Link
              key={key}
              href={href}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20"
            >
              <div
                className={`absolute inset-x-0 top-0 h-1 ${accent} transition-opacity group-hover:opacity-100 opacity-80`}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400 line-clamp-1">
                  {label}
                </span>
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconWrap}`}
                >
                  <Icon className={`h-3.5 w-3.5 ${iconTone}`} />
                </div>
              </div>
              <div className="mt-2 flex flex-col">
                <span
                  className={`text-lg font-bold text-slate-900 dark:text-slate-100 ${
                    isFetching ? "opacity-40" : ""
                  }`}
                >
                  {value}
                </span>
                {subValue && (
                  <span
                    className={`text-[10px] font-semibold ${
                      key === "followups" && overdueCount > 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {subValue}
                  </span>
                )}
              </div>
            </Link>
          )
        )}
      </div>

      {/* Today's Follow-up Schedule Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Today&apos;s Follow-up Schedule
                </h4>
                <span className="rounded-full bg-teal-100/80 px-2 py-0.5 text-[10px] font-bold text-teal-800 dark:bg-teal-900/40 dark:text-teal-300">
                  {followUps.length} Scheduled
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Actionable interactions scheduled for today ({new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`${portalHome}/leads/follow-ups`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              <span>Full Agenda</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            <button
              type="button"
              onClick={() => setShowFollowUpsTable((prev) => !prev)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 dark:hover:text-slate-200"
              title={showFollowUpsTable ? "Collapse table" : "Expand table"}
            >
              {showFollowUpsTable ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {showFollowUpsTable && (
          <div className="mt-3 overflow-x-auto">
            {isFollowUpsFetching ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Loading today&apos;s follow-up schedule...
              </div>
            ) : followUps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle className="h-8 w-8 text-emerald-500/60 dark:text-emerald-400/40 mb-1.5" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No follow-ups scheduled for today.
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  All communications are up to date. You can schedule new follow-ups directly from any lead.
                </p>
                <Link
                  href={`${portalHome}/leads`}
                  className="mt-3 inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  View Active Leads
                </Link>
              </div>
            ) : (
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="border-b border-slate-100 bg-slate-50/80 font-bold uppercase text-slate-500 dark:border-white/5 dark:bg-slate-800/40 dark:text-slate-400">
                  <tr>
                    <th className="px-3.5 py-2.5">Time / Type</th>
                    <th className="px-3.5 py-2.5">Lead & Contact</th>
                    <th className="px-3.5 py-2.5">Phone / Email</th>
                    <th className="px-3.5 py-2.5">Executive</th>
                    <th className="px-3.5 py-2.5 min-w-[200px]">Agenda & Objectives</th>
                    <th className="px-3.5 py-2.5 text-center w-28">Status</th>
                    <th className="px-3.5 py-2.5 text-right w-24">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {followUps.map((fu: LeadFollowUpRecord) => {
                    const leadObj =
                      typeof fu.lead === "object" && fu.lead !== null
                        ? fu.lead
                        : null;
                    const leadId = leadObj?._id || (typeof fu.lead === "string" ? fu.lead : "");
                    const leadNo = leadObj?.lead_no || "Lead";
                    const leadName = leadObj?.name || "—";
                    const companyName = leadObj?.company_name;
                    const phone = leadObj?.phone;
                    const email = leadObj?.email;
                    const typeLabel =
                      FOLLOWUP_TYPE_CONFIG[fu.type]?.label || fu.type;
                    const repName =
                      leadObj?.assigned_to?.name ||
                      fu.created_by?.name ||
                      "Unassigned";

                    const isDone = fu.status === "completed";

                    return (
                      <tr
                        key={fu._id || fu.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        {/* Time & Type */}
                        <td className="px-3.5 py-2.5 font-medium">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800">
                              <FollowUpTypeIcon type={fu.type} />
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {typeLabel}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" />
                                {fu.follow_up_time || "Today"}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Lead Info */}
                        <td className="px-3.5 py-2.5">
                          {leadId ? (
                            <Link
                              href={`${portalHome}/leads/${leadId}`}
                              className="font-bold text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                            >
                              {leadName}
                              {companyName && (
                                <span className="font-normal text-slate-500 dark:text-slate-400 ml-1">
                                  ({companyName})
                                </span>
                              )}
                              <div className="text-[10px] font-mono text-blue-600 dark:text-blue-400">
                                #{leadNo}
                              </div>
                            </Link>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>

                        {/* Phone / Email */}
                        <td className="px-3.5 py-2.5 space-y-0.5 text-[11px]">
                          {phone && (
                            <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                              <Phone className="h-3 w-3 text-slate-400" />
                              <span>{phone}</span>
                            </div>
                          )}
                          {email && (
                            <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                              <Mail className="h-3 w-3 text-slate-400" />
                              <span className="truncate max-w-[140px]">{email}</span>
                            </div>
                          )}
                          {!phone && !email && <span className="text-slate-400">—</span>}
                        </td>

                        {/* Executive */}
                        <td className="px-3.5 py-2.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <UserCheck className="h-3 w-3 text-slate-400" />
                            {repName}
                          </span>
                        </td>

                        {/* Agenda / Notes */}
                        <td className="px-3.5 py-2.5">
                          <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">
                            {fu.notes || "Routine lead follow-up & requirement review"}
                          </p>
                          {fu.outcome && (
                            <p className="mt-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              Outcome: {fu.outcome}
                            </p>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-3.5 py-2.5 text-center">
                          {isDone ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" />
                              Done
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                              <Clock className="h-3 w-3" />
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Action */}
                        <td className="px-3.5 py-2.5 text-right">
                          {leadId ? (
                            <Link
                              href={`${portalHome}/leads/${leadId}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              <span>Open</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
