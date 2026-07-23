"use client";

import Link from "next/link";
import {
  CalendarDays,
  CheckCircle,
  ClipboardList,
  ShieldCheck,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { useGetWorkPlanStatsQuery } from "@/store/api";

type WorkPlannerStatsWidgetsProps = {
  portalHome?: "/admin" | "/super_admin";
};

type StatCard = {
  key: string;
  label: string;
  value: number | string;
  href: string;
  accent: string;
  iconWrap: string;
  iconTone: string;
  Icon: LucideIcon;
};

export default function WorkPlannerStatsWidgets({
  portalHome = "/admin",
}: WorkPlannerStatsWidgetsProps) {
  const { data, isFetching } = useGetWorkPlanStatsQuery({});

  const cards: StatCard[] = [
    {
      key: "today",
      label: "Today's Plans",
      value: data?.today_plans ?? 0,
      href: `${portalHome}/work-planner`,
      accent: "bg-sky-500",
      iconWrap: "bg-sky-50 dark:bg-sky-950/30",
      iconTone: "text-sky-600 dark:text-sky-400",
      Icon: CalendarDays,
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
    {
      key: "avg",
      label: "Average Visits",
      value: data?.average_visits ?? 0,
      href: `${portalHome}/work-planner`,
      accent: "bg-amber-500",
      iconWrap: "bg-amber-50 dark:bg-amber-950/30",
      iconTone: "text-amber-600 dark:text-amber-400",
      Icon: TrendingUp,
    },
  ];

  const trend = data?.monthly_trend ?? [];

  return (
    <div className="space-y-2.5 font-sans w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Work Planner
          </h3>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Daily visit plan pipeline
          </p>
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
            Monthly trend
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
    </div>
  );
}
