/**
 * @fileoverview Lead Timeline Tab: displays unified chronological activity history.
 * @module components/portal/shared/leads/LeadTimelineTab
 */
"use client";

import React from "react";
import {
  Clock,
  UserCheck,
  CheckCircle,
  AlertTriangle,
  FileText,
  MessageSquare,
  Activity,
  UserPlus,
} from "lucide-react";
import { useGetLeadTimelineQuery, type LeadTimelineEntry } from "@/store/api";
import { formatLeadDateTime } from "./leadUtils";

type Props = {
  leadId: string;
};

export function LeadTimelineTab({ leadId }: Props) {
  const { data: timeline, isLoading, isFetching } = useGetLeadTimelineQuery(leadId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-xs text-slate-500">
        Loading timeline events...
      </div>
    );
  }

  if (!timeline || timeline.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center dark:border-white/10">
        <Clock className="mx-auto h-8 w-8 text-slate-400" />
        <h4 className="mt-3 text-sm font-bold text-slate-800 dark:text-white">
          No Timeline Events Yet
        </h4>
        <p className="mt-1 text-xs text-slate-500">
          Activities, follow-ups, and status updates will appear here chronologically.
        </p>
      </div>
    );
  }

  const getEventIcon = (entry: LeadTimelineEntry) => {
    switch (entry.action) {
      case "created":
        return <UserPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case "assigned":
      case "reassigned":
        return <UserCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case "status_changed":
        return <Activity className="h-4 w-4 text-purple-600 dark:text-purple-400" />;
      case "qualified":
        return <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
      case "lost":
        return <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />;
      case "converted":
        return <CheckCircle className="h-4 w-4 text-teal-600 dark:text-teal-400" />;
      case "file_attached":
        return <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
      case "followup_scheduled":
      case "followup_completed":
        return <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />;
      default:
        return <Clock className="h-4 w-4 text-slate-500" />;
    }
  };

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
      {timeline.map((entry) => (
        <div key={entry._id} className="relative group">
          <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white ring-4 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
            {getEventIcon(entry)}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 dark:border-white/10 dark:bg-slate-900/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {entry.action.replace(/_/g, " ")}
              </span>
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {formatLeadDateTime(entry.timestamp)}
              </span>
            </div>

            <p className="mt-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
              {entry.message}
            </p>

            {entry.actor && (
              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                By <span className="font-semibold text-slate-700 dark:text-slate-300">{entry.actor.name}</span>
                {entry.actor.department ? ` (${entry.actor.department})` : ""}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
