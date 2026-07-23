"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  List,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";

import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import {
  useListUsersQuery,
  useListWorkPlansQuery,
  type WorkPlanRecord,
  type WorkPlanStatus,
} from "@/store/api";
import {
  formatPlanDate,
  planIdOf,
  salesUserLabel
} from "./workPlanUtils";

type Props = {
  portalHome?: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const STATUS_DOT: Record<WorkPlanStatus, string> = {
  draft: "bg-slate-400",
  submitted: "bg-indigo-500",
  approved: "bg-emerald-500",
  rejected: "bg-rose-500",
  completed: "bg-blue-500",
};

const STATUS_CHIP: Record<WorkPlanStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300",
  submitted: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  rejected: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  completed: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function planDayKey(planDate: unknown): string {
  if (!planDate) return "";
  const d = new Date(String(planDate));
  if (isNaN(d.getTime())) return "";
  return toYmd(d);
}

function buildMonthCells(month: Date) {
  const first = startOfMonth(month);
  const startPad = first.getDay();
  const daysInMonth = endOfMonth(month).getDate();
  const cells: Array<{ date: Date | null; ymd: string | null }> = [];

  for (let i = 0; i < startPad; i += 1) {
    cells.push({ date: null, ymd: null });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    cells.push({ date, ymd: toYmd(date) });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, ymd: null });
  }
  return cells;
}

export default function AdminWorkPlanCalendarPage({
  portalHome = "/admin",
}: Props) {
  const router = useRouter();
  const base = portalHome;
  const isAdmin = true;

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [salesUserFilter, setSalesUserFilter] = useState("");
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);

  const from = toYmd(startOfMonth(cursor));
  const to = toYmd(endOfMonth(cursor));

  const queryArgs = useMemo(() => {
    const q: Record<string, string | number | undefined> = {
      from,
      to,
      page: 1,
      limit: 200,
    };
    if (isAdmin && salesUserFilter) q.sales_user = salesUserFilter;
    return q;
  }, [from, to, isAdmin, salesUserFilter]);

  const { data, isLoading, isFetching, refetch } = useListWorkPlansQuery(queryArgs);
  const usersQ = useListUsersQuery(isAdmin ? { department: "sales" } : undefined, {
    skip: !isAdmin,
  });

  const plans = data?.data ?? [];

  const plansByDay = useMemo(() => {
    const map = new Map<string, WorkPlanRecord[]>();
    for (const plan of plans) {
      const key = planDayKey(plan.plan_date);
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(plan);
      map.set(key, list);
    }
    return map;
  }, [plans]);

  const cells = useMemo(() => buildMonthCells(cursor), [cursor]);
  const todayYmd = toYmd(new Date());

  const selectedPlans = selectedYmd ? plansByDay.get(selectedYmd) || [] : [];

  const salesUsers = useMemo(() => {
    const raw = usersQ.data;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
      return (raw as { data: unknown[] }).data;
    }
    return [];
  }, [usersQ.data]);

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedYmd) {
          setSelectedYmd(null);
          return;
        }
        router.push(`${base}/work-planner`);
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [base, router, selectedYmd]);

  function goPrev() {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    setSelectedYmd(null);
  }

  function goNext() {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    setSelectedYmd(null);
  }

  function goToday() {
    setCursor(startOfMonth(new Date()));
    setSelectedYmd(todayYmd);
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-50 dark:bg-slate-950">
      <PortalBusyOverlay active={isLoading || isFetching} message="Loading calendar…" />

      {/* Top bar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`${base}/work-planner`)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
            title="Exit calendar (Esc)"
          >
            <X className="h-3.5 w-3.5" />
            Close
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-50">
              Work Plan Calendar
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Full-screen month view · Esc to exit
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <select
              value={salesUserFilter}
              onChange={(e) => setSalesUserFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-slate-950 dark:text-slate-100"
              aria-label="Sales executive"
            >
              <option value="">All sales executives</option>
              {(salesUsers as Array<{ _id?: string; id?: string; name?: string }>).map(
                (u) => {
                  const id = String(u._id || u.id || "");
                  return (
                    <option key={id} value={id}>
                      {u.name || id}
                    </option>
                  );
                }
              )}
            </select>
          ) : null}

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-white/15 dark:bg-slate-950">
            <button
              type="button"
              onClick={goPrev}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="min-w-[140px] px-2 py-1 text-center text-sm font-semibold text-slate-900 dark:text-slate-50"
            >
              {monthLabel}
            </button>
            <button
              type="button"
              onClick={goNext}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium dark:border-white/15"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Link
            href={`${base}/work-planner`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium dark:border-white/15"
          >
            <List className="h-3.5 w-3.5" />
            List
          </Link>
          <Link
            href={`${base}/work-planner/new`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New plan
          </Link>
        </div>
      </header>

      {/* Legend */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-[11px] dark:border-white/10 dark:bg-slate-900">
        {(
          [
            ["draft", "Draft"],
            ["submitted", "Pending"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
            ["completed", "Completed"],
          ] as const
        ).map(([status, label]) => (
          <span key={status} className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
            {label}
          </span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex min-h-0 flex-1 flex-col gap-0 p-3 sm:p-4 lg:flex-row lg:gap-3">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="grid shrink-0 grid-cols-7 border-b border-slate-100 dark:border-white/10">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-[repeat(auto-fit,minmax(0,1fr))] auto-rows-fr">
            {cells.map((cell, idx) => {
              if (!cell.date || !cell.ymd) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="border-b border-r border-slate-100 bg-slate-50/60 dark:border-white/5 dark:bg-slate-950/40"
                  />
                );
              }
              const dayPlans = plansByDay.get(cell.ymd) || [];
              const isToday = cell.ymd === todayYmd;
              const isSelected = cell.ymd === selectedYmd;
              return (
                <button
                  key={cell.ymd}
                  type="button"
                  onClick={() => setSelectedYmd(cell.ymd)}
                  className={`flex min-h-[88px] flex-col items-stretch gap-1 border-b border-r border-slate-100 p-1.5 text-left transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.03] sm:min-h-[110px] ${
                    isSelected
                      ? "bg-blue-50/80 ring-2 ring-inset ring-blue-500/40 dark:bg-blue-950/20"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        isToday
                          ? "bg-blue-600 text-white"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>
                    {dayPlans.length > 0 ? (
                      <span className="text-[10px] font-medium tabular-nums text-slate-400">
                        {dayPlans.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                    {dayPlans.slice(0, 3).map((plan) => {
                      const status = (plan.status || "draft") as WorkPlanStatus;
                      return (
                        <div
                          key={planIdOf(plan)}
                          className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${STATUS_CHIP[status]}`}
                          title={`${salesUserLabel(plan.sales_user)} · ${status} · ${plan.visit_count ?? 0} visits`}
                        >
                          <span
                            className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`}
                          />
                          {isAdmin
                            ? salesUserLabel(plan.sales_user)
                            : `${plan.visit_count ?? 0} visit${(plan.visit_count ?? 0) === 1 ? "" : "s"}`}
                        </div>
                      );
                    })}
                    {dayPlans.length > 3 ? (
                      <span className="text-[10px] text-slate-400">
                        +{dayPlans.length - 3} more
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Day panel */}
        <aside
          className={`mt-3 flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 lg:mt-0 lg:w-80 ${
            selectedYmd ? "" : "hidden lg:flex"
          }`}
        >
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {selectedYmd
                  ? formatPlanDate(`${selectedYmd}T00:00:00`)
                  : "Select a day"}
              </h2>
              {selectedYmd ? (
                <button
                  type="button"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 lg:hidden"
                  onClick={() => setSelectedYmd(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!selectedYmd ? (
              <p className="text-xs text-slate-500">
                Click a date to view or create work plans.
              </p>
            ) : selectedPlans.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">No work plan on this day.</p>
                <Link
                  href={`${base}/work-planner/new?plan_date=${selectedYmd}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create plan for {formatPlanDate(`${selectedYmd}T00:00:00`)}
                </Link>
              </div>
            ) : (
              <ul className="space-y-2">
                {selectedPlans.map((plan) => {
                  const id = planIdOf(plan);
                  const status = (plan.status || "draft") as WorkPlanStatus;
                  return (
                    <li
                      key={id}
                      className="rounded-lg border border-slate-200 p-3 dark:border-white/10"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-50">
                            {salesUserLabel(plan.sales_user)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {plan.visit_count ?? 0} visits
                            {plan.remarks ? ` · ${plan.remarks}` : ""}
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[status]}`}
                        >
                          {status}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Link
                          href={`${base}/work-planner/${id}`}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium hover:bg-slate-50 dark:border-white/15 dark:hover:bg-white/5"
                        >
                          Open
                        </Link>
                        {status === "draft" || status === "rejected" ? (
                          <Link
                            href={`${base}/work-planner/${id}/edit`}
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium hover:bg-slate-50 dark:border-white/15 dark:hover:bg-white/5"
                          >
                            Edit
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
                <li>
                  <Link
                    href={`${base}/work-planner/new`}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New plan
                  </Link>
                </li>
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
