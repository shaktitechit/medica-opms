"use client";

import { useMemo } from "react";
import { DashboardCard } from "@/components/widgets";
import { useGetOrderHistoryQuery, useListUsersQuery } from "@/store/api";
import { resolveUserDisplay } from "@/components/portal/shared/userDisplay";

type RemarksTabProps = {
  orderId: string;
};

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export default function RemarksTab({ orderId }: RemarksTabProps) {
  const historyQ = useGetOrderHistoryQuery(orderId);
  const historyList = useMemo(() => {
    return pickList(historyQ.data) as Record<string, any>[];
  }, [historyQ.data]);

  const usersQ = useListUsersQuery({});
  const users = useMemo(() => {
    return pickList(usersQ.data) as Record<string, any>[];
  }, [usersQ.data]);

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) {
      const id = String(u._id ?? u.id ?? "");
      if (id) map[id] = String(u.username || u.name || id);
    }
    return map;
  }, [users]);

  return (
    <div className="space-y-6">
      <DashboardCard
        title="Timeline History"
        description="Status changes, timestamps, and operator remarks."
      >
        {historyQ.isFetching ? (
          <p className="text-sm text-slate-500">Loading history...</p>
        ) : historyList.length === 0 ? (
          <p className="text-sm text-slate-500">No status transitions recorded.</p>
        ) : (
          <div className="flow-root">
            <ul className="-mb-8">
              {historyList.map((log, logIdx) => (
                <li key={String(log._id || logIdx)}>
                  <div className="relative pb-8">
                    {logIdx !== historyList.length - 1 ? (
                      <span
                        className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-200 dark:bg-white/10"
                        aria-hidden="true"
                      />
                    ) : null}
                    <div className="relative flex space-x-3">
                      <div>
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 ring-8 ring-white dark:bg-blue-900/30 dark:ring-slate-900">
                          <svg
                            className="h-4 w-4 text-blue-600 dark:text-blue-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 dark:text-slate-200">
                          Status transitioned from{" "}
                          <span className="font-semibold capitalize text-slate-600 dark:text-slate-400">
                            {String(log.from_status || "None")}
                          </span>{" "}
                          to{" "}
                          <span className="font-semibold capitalize text-blue-600 dark:text-blue-400">
                            {String(log.to_status)}
                          </span>
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <span>
                            Changed by: {resolveUserDisplay(log.changed_by, userNameById) || "System"}
                          </span>
                          <span>&bull;</span>
                          <span>{formatDate(log.createdAt)}</span>
                        </div>
                        {typeof log.remarks === "string" && log.remarks.trim() ? (
                          <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-300 border border-slate-100 dark:border-white/5">
                            {log.remarks}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
