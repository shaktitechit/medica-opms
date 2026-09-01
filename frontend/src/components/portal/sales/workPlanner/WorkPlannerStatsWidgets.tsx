"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  CheckCircle,
  ClipboardList,
  Home,
  IndianRupee,
  MapPin,
  Sun,
  ShieldCheck,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { useGetWorkPlanStatsQuery } from "@/store/api";
import PeriodHeadingCaption from "@/components/portal/shared/dashboard/PeriodHeadingCaption";
import {
  dashboardPeriodToStatsQuery,
  type DashboardPeriodQuery,
} from "@/components/portal/shared/dashboard/periodFilterUtils";

type WorkPlannerStatsWidgetsProps = DashboardPeriodQuery;

type StatCard = {
  key: string;
  label: string;
  value: number | string;
  sub?: string;
  href: string;
  accent: string;
  iconWrap: string;
  iconTone: string;
  Icon: LucideIcon;
};

function formatMoney(n?: number) {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function WorkPlannerStatsWidgets({
  dateFilter,
  customDateFrom,
  customDateTo,
  selectedYears,
  selectedMonths,
}: WorkPlannerStatsWidgetsProps) {
  const portalHome = "/sales" as const;
  const hasPeriod =
    dateFilter != null || selectedYears != null || selectedMonths != null;
  const statsQuery = useMemo(
    () =>
      dashboardPeriodToStatsQuery({
        dateFilter,
        customDateFrom,
        customDateTo,
        selectedYears,
        selectedMonths,
      }),
    [dateFilter, customDateFrom, customDateTo, selectedYears, selectedMonths],
  );
  const { data, isFetching } = useGetWorkPlanStatsQuery(
    hasPeriod ? statsQuery : {},
  );
  const typeCounts = data?.by_plan_type ?? {};
  const isTodayPeriod = !hasPeriod || dateFilter === "today";
  const planCount = isTodayPeriod
    ? (data?.today_plans ?? 0)
    : (data?.total_plans ?? 0);

  const cards: StatCard[] = [
    {
      key: "today",
      label: isTodayPeriod ? "Today's Plans" : "Plans",
      value: planCount,
      sub: `${data?.total_visits ?? 0} visits · ${data?.total_works ?? 0} tasks`,
      href: `${portalHome}/work-planner`,
      accent: "bg-sky-500",
      iconWrap: "bg-sky-50 dark:bg-sky-950/30",
      iconTone: "text-sky-600 dark:text-sky-400",
      Icon: CalendarDays,
    },
    {
      key: "type-visits",
      label: "Visits",
      value: typeCounts.Visits ?? 0,
      href: `${portalHome}/work-planner`,
      accent: "bg-cyan-500",
      iconWrap: "bg-cyan-50 dark:bg-cyan-950/30",
      iconTone: "text-cyan-600 dark:text-cyan-400",
      Icon: MapPin,
    },
    {
      key: "type-leave",
      label: "Leave",
      value: typeCounts.Leave ?? 0,
      href: `${portalHome}/work-planner`,
      accent: "bg-orange-500",
      iconWrap: "bg-orange-50 dark:bg-orange-950/30",
      iconTone: "text-orange-600 dark:text-orange-400",
      Icon: Sun,
    },
    {
      key: "type-wfh",
      label: "Work From Home",
      value: typeCounts["Work From Home"] ?? 0,
      href: `${portalHome}/work-planner`,
      accent: "bg-violet-500",
      iconWrap: "bg-violet-50 dark:bg-violet-950/30",
      iconTone: "text-violet-600 dark:text-violet-400",
      Icon: Home,
    },
    {
      key: "type-wfo",
      label: "Work From Office",
      value: typeCounts["Work From Office"] ?? 0,
      href: `${portalHome}/work-planner`,
      accent: "bg-teal-500",
      iconWrap: "bg-teal-50 dark:bg-teal-950/30",
      iconTone: "text-teal-600 dark:text-teal-400",
      Icon: Building2,
    },
    {
      key: "pending",
      label: "Pending Approval",
      value: data?.pending_approval ?? 0,
      href: `${portalHome}/work-planner?status=submitted`,
      accent: "bg-indigo-500",
      iconWrap: "bg-indigo-50 dark:bg-indigo-950/30",
      iconTone: "text-indigo-600 dark:text-indigo-400",
      Icon: ShieldCheck,
    },
  ];

  const statusCards: StatCard[] = [
    {
      key: "approved",
      label: "Approved",
      value: data?.approved ?? 0,
      href: `${portalHome}/work-planner?status=approved`,
      accent: "bg-emerald-500",
      iconWrap: "bg-emerald-50 dark:bg-emerald-950/30",
      iconTone: "text-emerald-600 dark:text-emerald-400",
      Icon: CheckCircle,
    },
    {
      key: "completed",
      label: "Completed",
      value: data?.completed ?? 0,
      href: `${portalHome}/work-planner?status=completed`,
      accent: "bg-blue-500",
      iconWrap: "bg-blue-50 dark:bg-blue-950/30",
      iconTone: "text-blue-600 dark:text-blue-400",
      Icon: ClipboardList,
    },
    {
      key: "rejected",
      label: "Rejected",
      value: data?.rejected ?? 0,
      href: `${portalHome}/work-planner?status=rejected`,
      accent: "bg-rose-500",
      iconWrap: "bg-rose-50 dark:bg-rose-950/30",
      iconTone: "text-rose-600 dark:text-rose-400",
      Icon: XCircle,
    },
  ];

  const expenseCards: StatCard[] = [
    {
      key: "exp-total",
      label: "Total Expenses",
      value: formatMoney(data?.expense_total),
      href: `${portalHome}/work-planner?view=expenses`,
      accent: "bg-teal-500",
      iconWrap: "bg-teal-50 dark:bg-teal-950/30",
      iconTone: "text-teal-600 dark:text-teal-400",
      Icon: IndianRupee,
    },
    {
      key: "exp-pending",
      label: "Pending Expense Approvals",
      value: data?.expense_pending_approval ?? 0,
      href: `${portalHome}/work-planner?view=expenses&status=submitted`,
      accent: "bg-violet-500",
      iconWrap: "bg-violet-50 dark:bg-violet-950/30",
      iconTone: "text-violet-600 dark:text-violet-400",
      Icon: ShieldCheck,
    },
    {
      key: "exp-approved",
      label: "Approved Expenses",
      value: data?.expense_approved_count ?? 0,
      href: `${portalHome}/work-planner?view=expenses&status=approved`,
      accent: "bg-lime-500",
      iconWrap: "bg-lime-50 dark:bg-lime-950/30",
      iconTone: "text-lime-600 dark:text-lime-400",
      Icon: Wallet,
    },
  ];

  const trend = data?.monthly_trend ?? [];
  const expenseTrend = data?.expense_monthly_trend ?? [];

  return (
    <div className="space-y-2.5 font-sans w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Work Planner
          </h3>
          {hasPeriod ? (
            <PeriodHeadingCaption
              selectedYears={selectedYears ?? []}
              selectedMonths={selectedMonths}
              dateFilter={dateFilter}
              customDateFrom={customDateFrom}
              customDateTo={customDateTo}
            />
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Visits, leave, WFH and office work plans
            </p>
          )}
        </div>
        <Link
          href={`${portalHome}/work-planner`}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          Open module →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 w-full">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className={`group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20 ${
              isFetching ? "opacity-70" : ""
            }`}
          >
            <div className={`absolute inset-x-0 top-0 h-0.5 ${card.accent}`} />
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {card.label}
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                  {card.value}
                </div>
                {card.sub ? (
                  <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                    {card.sub}
                  </div>
                ) : null}
              </div>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.iconWrap}`}
              >
                <card.Icon className={`h-4 w-4 ${card.iconTone}`} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 w-full">
        {statusCards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className={`group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20 ${
              isFetching ? "opacity-70" : ""
            }`}
          >
            <div className={`absolute inset-x-0 top-0 h-0.5 ${card.accent}`} />
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {card.label}
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                  {card.value}
                </div>
              </div>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.iconWrap}`}
              >
                <card.Icon className={`h-4 w-4 ${card.iconTone}`} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 w-full">
        {expenseCards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className={`group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 dark:border-white/10 dark:bg-slate-900 dark:hover:border-white/20 ${
              isFetching ? "opacity-70" : ""
            }`}
          >
            <div className={`absolute inset-x-0 top-0 h-0.5 ${card.accent}`} />
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {card.label}
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                  {card.value}
                </div>
              </div>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.iconWrap}`}
              >
                <card.Icon className={`h-4 w-4 ${card.iconTone}`} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {trend.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Monthly plan trend
          </div>
          <div className="flex flex-wrap gap-2">
            {trend.map((m) => (
              <div
                key={`${m.year}-${m.month}`}
                className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-white/5"
              >
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {m.year}-{String(m.month).padStart(2, "0")}
                </span>
                <span className="ml-2 tabular-nums text-slate-500">{m.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {expenseTrend.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Monthly expense trend (approved)
          </div>
          <div className="flex flex-wrap gap-2">
            {expenseTrend.map((m) => (
              <div
                key={`exp-${m.year}-${m.month}`}
                className="rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs dark:bg-teal-950/30"
              >
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {m.year}-{String(m.month).padStart(2, "0")}
                </span>
                <span className="ml-2 tabular-nums text-teal-700 dark:text-teal-300">
                  {formatMoney(m.amount)}
                </span>
                <span className="ml-1 text-slate-400">({m.count})</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
