"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  CalendarClock,
  Clock,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  MessageSquare,
  MapPin,
  Tv,
  HelpCircle,
  Search,
  Filter,
  Plus,
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  ChevronRight,
  UserCheck,
  Building2,
  Check,
  ListFilter,
  LayoutList,
  Table as TableIcon,
  Users,
} from "lucide-react";

import {
  useGetLeadFollowUpCalendarQuery,
  useListUsersQuery,
  type LeadFollowUpRecord,
  type LeadFollowUpType,
  type LeadFollowUpStatus,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import {
  FOLLOWUP_TYPE_CONFIG,
  formatLeadDate,
  formatLeadDateTime,
} from "./leadUtils";
import { CompleteFollowUpModal } from "./CompleteFollowUpModal";

type Props = {
  portalHome?: string;
};

type DateFilterPreset = "all" | "today" | "tomorrow" | "this_week" | "overdue" | "custom";

function FollowUpTypeBadge({ type }: { type: LeadFollowUpType }) {
  const cfg = FOLLOWUP_TYPE_CONFIG[type] || { label: type, icon: "HelpCircle" };
  const getIcon = () => {
    switch (type) {
      case "call":
        return <Phone className="h-3.5 w-3.5" />;
      case "meeting":
        return <Users className="h-3.5 w-3.5" />;
      case "email":
        return <Mail className="h-3.5 w-3.5" />;
      case "whatsapp":
        return <MessageSquare className="h-3.5 w-3.5" />;
      case "visit":
        return <MapPin className="h-3.5 w-3.5" />;
      case "demo":
        return <Tv className="h-3.5 w-3.5" />;
      default:
        return <HelpCircle className="h-3.5 w-3.5" />;
    }
  };

  const getStyle = () => {
    switch (type) {
      case "call":
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800";
      case "meeting":
        return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800";
      case "email":
        return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800";
      case "whatsapp":
        return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
      case "visit":
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
      case "demo":
        return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${getStyle()}`}
    >
      {getIcon()}
      <span>{cfg.label}</span>
    </span>
  );
}

export function LeadFollowUpsPage({ portalHome = "/admin" }: Props) {
  const currentUser = useAppSelector((state) => state.auth.user);
  const isAdminOrSuper =
    currentUser?.role === "admin" ||
    currentUser?.role === "super_admin" ||
    portalHome.includes("admin");

  const [datePreset, setDatePreset] = useState<DateFilterPreset>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignedFilter, setAssignedFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [viewMode, setViewMode] = useState<"agenda" | "table">("agenda");

  const [completeTarget, setCompleteTarget] = useState<LeadFollowUpRecord | null>(null);

  const { data: usersData } = useListUsersQuery(undefined, {
    skip: !isAdminOrSuper,
  });

  // Calculate Date bounds for query if needed
  const dateQueryParams = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const toYmd = (d: Date) => d.toISOString().split("T")[0];

    if (datePreset === "today") {
      const todayStr = toYmd(startOfToday);
      return { from_date: todayStr, to_date: todayStr };
    }
    if (datePreset === "tomorrow") {
      const tomorrow = new Date(startOfToday);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomStr = toYmd(tomorrow);
      return { from_date: tomStr, to_date: tomStr };
    }
    if (datePreset === "this_week") {
      const day = startOfToday.getDay(); // 0 is Sunday
      const diff = startOfToday.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(startOfToday);
      monday.setDate(diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from_date: toYmd(monday), to_date: toYmd(sunday) };
    }
    if (datePreset === "custom" && (customFrom || customTo)) {
      return {
        from_date: customFrom || undefined,
        to_date: customTo || undefined,
      };
    }
    return undefined;
  }, [datePreset, customFrom, customTo]);

  const {
    data: followUps = [],
    isFetching,
    refetch,
  } = useGetLeadFollowUpCalendarQuery(dateQueryParams);

  const todayStr = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split("T")[0];
  }, []);

  // Filter follow-ups on the client for instant search & multi-field matching
  const filteredFollowUps = useMemo(() => {
    return followUps.filter((fu) => {
      const leadObj = typeof fu.lead === "object" && fu.lead !== null ? fu.lead : null;
      const leadNo = leadObj?.lead_no || "";
      const leadName = leadObj?.name || "";
      const companyName = leadObj?.company_name || "";
      const phone = leadObj?.phone || "";
      const email = leadObj?.email || "";
      const notes = fu.notes || "";
      const outcome = fu.outcome || "";
      const fuDate = fu.follow_up_date ? fu.follow_up_date.split("T")[0] : "";
      const isDone = fu.status === "completed";
      const isOverdue = !isDone && fuDate < todayStr;

      // Status filter
      if (statusFilter === "pending" && isDone) return false;
      if (statusFilter === "completed" && !isDone) return false;
      if (statusFilter === "overdue" && !isOverdue) return false;

      // Type filter
      if (typeFilter !== "all" && fu.type !== typeFilter) return false;

      // Overdue preset filter
      if (datePreset === "overdue" && !isOverdue) return false;

      // Assignee filter
      if (assignedFilter !== "all") {
        const assignedId = leadObj?.assigned_to?._id || "";
        const createdById = fu.created_by?._id || "";
        if (assignedId !== assignedFilter && createdById !== assignedFilter) {
          return false;
        }
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matches =
          leadNo.toLowerCase().includes(q) ||
          leadName.toLowerCase().includes(q) ||
          companyName.toLowerCase().includes(q) ||
          phone.toLowerCase().includes(q) ||
          email.toLowerCase().includes(q) ||
          notes.toLowerCase().includes(q) ||
          outcome.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [followUps, statusFilter, typeFilter, datePreset, assignedFilter, search, todayStr]);

  // Summary counts
  const summary = useMemo(() => {
    let pending = 0;
    let overdue = 0;
    let completed = 0;
    let todayCount = 0;

    for (const fu of followUps) {
      const fuDate = fu.follow_up_date ? fu.follow_up_date.split("T")[0] : "";
      const isDone = fu.status === "completed";
      if (isDone) {
        completed++;
      } else {
        pending++;
        if (fuDate < todayStr) overdue++;
        if (fuDate === todayStr) todayCount++;
      }
    }

    const total = followUps.length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, pending, overdue, completed, todayCount, rate };
  }, [followUps, todayStr]);

  // Groupings for Agenda View
  const groupedAgenda = useMemo(() => {
    const overdueList: LeadFollowUpRecord[] = [];
    const todayList: LeadFollowUpRecord[] = [];
    const upcomingList: LeadFollowUpRecord[] = [];
    const completedList: LeadFollowUpRecord[] = [];

    for (const fu of filteredFollowUps) {
      const fuDate = fu.follow_up_date ? fu.follow_up_date.split("T")[0] : "";
      const isDone = fu.status === "completed";

      if (isDone) {
        completedList.push(fu);
      } else if (fuDate < todayStr) {
        overdueList.push(fu);
      } else if (fuDate === todayStr) {
        todayList.push(fu);
      } else {
        upcomingList.push(fu);
      }
    }

    // Sort overdue asc, today asc by time, upcoming asc, completed desc
    return {
      overdue: overdueList,
      today: todayList,
      upcoming: upcomingList,
      completed: completedList,
    };
  }, [filteredFollowUps, todayStr]);

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* ── HEADER ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href={`${portalHome}/leads`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Leads Directory</span>
            </Link>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              Follow-up Agenda
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Lead Follow-up Planner
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Schedule, manage customer interactions, and record sales meeting outcomes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`${portalHome}/leads/reports`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
            <span>Reports & Analytics</span>
          </Link>
          <Link
            href={`${portalHome}/leads/create`}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create New Lead</span>
          </Link>
        </div>
      </div>

      {/* ── KPI METRICS STRIP ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Scheduled
            </span>
            <CalendarClock className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
            {summary.total}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">All registered interactions</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Due Today
            </span>
            <Clock className="h-4 w-4 text-teal-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-teal-600 dark:text-teal-400">
            {summary.todayCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Target for today</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Overdue
            </span>
            <AlertCircle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-rose-600 dark:text-rose-400">
            {summary.overdue}
          </div>
          <div className="mt-1 text-[11px] text-rose-500 font-semibold">
            {summary.overdue > 0 ? "Requires urgent attention" : "No overdue items"}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Completed
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {summary.completed}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Recorded outcomes</div>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Execution Rate
            </span>
            <Check className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-indigo-600 dark:text-indigo-400">
            {summary.rate}%
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Completion efficacy</div>
        </div>
      </div>

      {/* ── FILTER & CONTROL BAR ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-4">
        {/* Date presets row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All Follow-ups" },
              { id: "today", label: "Today" },
              { id: "tomorrow", label: "Tomorrow" },
              { id: "this_week", label: "This Week" },
              { id: "overdue", label: "Overdue Only" },
              { id: "custom", label: "Custom Range" },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setDatePreset(preset.id as DateFilterPreset)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  datePreset === preset.id
                    ? "bg-blue-600 text-white shadow-sm dark:bg-blue-500"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setViewMode("agenda")}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                viewMode === "agenda"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              <span>Agenda</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                viewMode === "table"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>

        {/* Custom date range inputs */}
        {datePreset === "custom" && (
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-white/5">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Custom Date:</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            />
          </div>
        )}

        {/* Secondary filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search lead, company, phone, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3.5 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-800/50 dark:text-white dark:focus:bg-slate-800"
            />
          </div>

          {/* Channel Type filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-800/50 dark:text-white dark:focus:bg-slate-800"
            >
              <option value="all">All Interaction Channels</option>
              <option value="call">Phone Call</option>
              <option value="meeting">Meeting</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="demo">Product Demo</option>
              <option value="visit">Site Visit</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Status filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-800/50 dark:text-white dark:focus:bg-slate-800"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Sales rep filter (for Admin / Super Admin) */}
          {isAdminOrSuper ? (
            <div>
              <select
                value={assignedFilter}
                onChange={(e) => setAssignedFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-slate-800/50 dark:text-white dark:focus:bg-slate-800"
              >
                <option value="all">All Executives</option>
                {Array.isArray(usersData) &&
                  usersData.map((u: any) => (
                    <option key={u._id || u.id} value={u._id || u.id}>
                      {u.name} ({u.department || u.role})
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center text-xs text-slate-500 font-semibold px-2">
              Viewing your scheduled interactions
            </div>
          )}
        </div>
      </div>

      {/* ── CONTENT AREA ── */}
      {isFetching ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarClock className="h-8 w-8 animate-pulse text-blue-500 mb-2" />
          <p className="text-xs font-semibold text-slate-500">Loading follow-up schedule...</p>
        </div>
      ) : filteredFollowUps.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-sm dark:border-white/10 dark:bg-slate-900">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500/60 dark:text-emerald-400/40 mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-white">
            No follow-ups match your current filters
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Try adjusting your search criteria or schedule a new follow-up directly from any active lead.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setDatePreset("all");
                setStatusFilter("all");
                setTypeFilter("all");
                setSearch("");
                setAssignedFilter("all");
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
            >
              Reset Filters
            </button>
            <Link
              href={`${portalHome}/leads`}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500"
            >
              View Leads Directory
            </Link>
          </div>
        </div>
      ) : viewMode === "agenda" ? (
        /* ── AGENDA VIEW (GROUPED CARDS) ── */
        <div className="space-y-8">
          {/* 1. OVERDUE SECTION */}
          {groupedAgenda.overdue.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500 animate-ping" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Overdue Follow-ups ({groupedAgenda.overdue.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {groupedAgenda.overdue.map((fu) => (
                  <FollowUpCard
                    key={fu._id || fu.id}
                    followUp={fu}
                    portalHome={portalHome}
                    onComplete={() => setCompleteTarget(fu)}
                    isOverdue
                  />
                ))}
              </div>
            </div>
          )}

          {/* 2. TODAY SECTION */}
          {groupedAgenda.today.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-teal-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                  Today&apos;s Schedule ({groupedAgenda.today.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {groupedAgenda.today.map((fu) => (
                  <FollowUpCard
                    key={fu._id || fu.id}
                    followUp={fu}
                    portalHome={portalHome}
                    onComplete={() => setCompleteTarget(fu)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 3. UPCOMING SECTION */}
          {groupedAgenda.upcoming.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-blue-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Upcoming Follow-ups ({groupedAgenda.upcoming.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {groupedAgenda.upcoming.map((fu) => (
                  <FollowUpCard
                    key={fu._id || fu.id}
                    followUp={fu}
                    portalHome={portalHome}
                    onComplete={() => setCompleteTarget(fu)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── TABLE VIEW ── */
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="border-b border-slate-100 bg-slate-50/80 font-bold uppercase text-slate-500 dark:border-white/5 dark:bg-slate-800/40 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Lead & Organization</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Executive</th>
                  <th className="px-4 py-3 min-w-[200px]">Agenda / Notes</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredFollowUps.map((fu) => {
                  const leadObj = typeof fu.lead === "object" && fu.lead !== null ? fu.lead : null;
                  const leadId = leadObj?._id || (typeof fu.lead === "string" ? fu.lead : "");
                  const leadNo = leadObj?.lead_no || "Lead";
                  const leadName = leadObj?.name || "—";
                  const companyName = leadObj?.company_name;
                  const phone = leadObj?.phone;
                  const email = leadObj?.email;
                  const repName = leadObj?.assigned_to?.name || fu.created_by?.name || "Unassigned";
                  const isDone = fu.status === "completed";
                  const fuDate = fu.follow_up_date ? fu.follow_up_date.split("T")[0] : "";
                  const isOverdue = !isDone && fuDate < todayStr;

                  return (
                    <tr
                      key={fu._id || fu.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Date & Time */}
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {formatLeadDate(fu.follow_up_date)}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {fu.follow_up_time || "All day"}
                        </div>
                      </td>

                      {/* Channel Badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <FollowUpTypeBadge type={fu.type} />
                      </td>

                      {/* Lead info */}
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-[11px] whitespace-nowrap">
                        {phone && (
                          <div className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                            <Phone className="h-3 w-3 text-slate-400" />
                            <span>{phone}</span>
                          </div>
                        )}
                        {email && (
                          <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                            <Mail className="h-3 w-3 text-slate-400" />
                            <span className="truncate max-w-[130px]">{email}</span>
                          </div>
                        )}
                        {!phone && !email && <span className="text-slate-400">—</span>}
                      </td>

                      {/* Rep */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          <UserCheck className="h-3 w-3 text-slate-400" />
                          {repName}
                        </span>
                      </td>

                      {/* Notes / Outcome */}
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">
                          {fu.notes || "Routine follow-up touchpoint"}
                        </p>
                        {fu.outcome && (
                          <p className="mt-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            Outcome: {fu.outcome}
                          </p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Completed
                          </span>
                        ) : isOverdue ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                            <AlertCircle className="h-3 w-3" />
                            Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                            <Clock className="h-3 w-3" />
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isDone && (
                            <button
                              type="button"
                              onClick={() => setCompleteTarget(fu)}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500"
                            >
                              Complete
                            </button>
                          )}
                          {leadId && (
                            <Link
                              href={`${portalHome}/leads/${leadId}`}
                              className="rounded-lg border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                              title="Open Lead"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: RECORD OUTCOME & COMPLETE ── */}
      {completeTarget && (
        <CompleteFollowUpModal
          followUp={completeTarget}
          open={!!completeTarget}
          onClose={() => setCompleteTarget(null)}
          onSuccess={() => {
            setCompleteTarget(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

/** Individual Interactive Follow-up Card for Agenda View */
function FollowUpCard({
  followUp,
  portalHome,
  onComplete,
  isOverdue = false,
}: {
  followUp: LeadFollowUpRecord;
  portalHome: string;
  onComplete: () => void;
  isOverdue?: boolean;
}) {
  const leadObj = typeof followUp.lead === "object" && followUp.lead !== null ? followUp.lead : null;
  const leadId = leadObj?._id || (typeof followUp.lead === "string" ? followUp.lead : "");
  const leadNo = leadObj?.lead_no || "Lead";
  const leadName = leadObj?.name || "—";
  const companyName = leadObj?.company_name;
  const phone = leadObj?.phone;
  const email = leadObj?.email;
  const repName = leadObj?.assigned_to?.name || followUp.created_by?.name || "Unassigned";
  const isDone = followUp.status === "completed";

  return (
    <div
      className={`relative flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md dark:bg-slate-900 ${
        isOverdue
          ? "border-rose-200 dark:border-rose-900/50 bg-rose-50/20"
          : isDone
          ? "border-slate-200/80 dark:border-white/10 opacity-80 hover:opacity-100"
          : "border-slate-200/80 dark:border-white/10"
      }`}
    >
      <div className="space-y-3">
        {/* Top bar: Type + Date/Time + Status */}
        <div className="flex items-center justify-between gap-2">
          <FollowUpTypeBadge type={followUp.type} />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Clock className="h-3 w-3 text-slate-400" />
              <span>{formatLeadDate(followUp.follow_up_date)}</span>
              {followUp.follow_up_time && (
                <span className="text-slate-400 font-normal">· {followUp.follow_up_time}</span>
              )}
            </div>
            {isDone ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Done
              </span>
            ) : isOverdue ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                <AlertCircle className="h-2.5 w-2.5" />
                Overdue
              </span>
            ) : null}
          </div>
        </div>

        {/* Middle: Lead & Organization Info */}
        <div>
          {leadId ? (
            <Link
              href={`${portalHome}/leads/${leadId}`}
              className="group/link flex items-start justify-between gap-2"
            >
              <div>
                <h4 className="text-sm font-bold text-slate-900 group-hover/link:text-blue-600 dark:text-white dark:group-hover/link:text-blue-400">
                  {leadName}
                </h4>
                {companyName && (
                  <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Building2 className="h-3 w-3 text-slate-400" />
                    <span>{companyName}</span>
                  </div>
                )}
              </div>
              <span className="shrink-0 font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">
                #{leadNo}
              </span>
            </Link>
          ) : (
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{leadName}</h4>
          )}
        </div>

        {/* Contact links */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex items-center gap-1 font-semibold text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
            >
              <Phone className="h-3 w-3 text-slate-400" />
              <span>{phone}</span>
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="flex items-center gap-1 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
            >
              <Mail className="h-3 w-3 text-slate-400" />
              <span className="truncate max-w-[160px]">{email}</span>
            </a>
          )}
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <UserCheck className="h-3 w-3" />
            <span>{repName}</span>
          </div>
        </div>

        {/* Notes & recorded outcome */}
        <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60 text-xs">
          <p className="text-slate-700 dark:text-slate-300 line-clamp-2">
            <span className="font-semibold text-slate-500 dark:text-slate-400">Agenda: </span>
            {followUp.notes || "Follow-up discussion and customer requirement analysis"}
          </p>
          {followUp.outcome && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-200/60 dark:border-white/5 text-[11px] text-emerald-700 dark:text-emerald-300">
              <span className="font-bold">Outcome: </span>
              {followUp.outcome}
            </div>
          )}
        </div>
      </div>

      {/* Footer action bar */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10">
        {leadId ? (
          <Link
            href={`${portalHome}/leads/${leadId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
          >
            <span>View Lead Profile</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <div />
        )}

        {!isDone ? (
          <button
            type="button"
            onClick={onComplete}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 transition"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Complete & Record Outcome</span>
          </button>
        ) : (
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <Check className="h-3 w-3" />
            Completed at {formatLeadDateTime(followUp.completed_at || followUp.updatedAt)}
          </span>
        )}
      </div>
    </div>
  );
}
