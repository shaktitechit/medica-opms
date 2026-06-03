import React from "react";
import { DashboardCard } from "@/components/widgets";
import { resolveUserDisplay } from "@/components/portal/shared/userDisplay";

interface RemarksTabProps {
  historyList: any[];
  isFetching: boolean;
  formatDate: (v: unknown) => string;
  userNameById: Record<string, string>;
}

export function RemarksTab({
  historyList,
  isFetching,
  formatDate,
  userNameById,
}: RemarksTabProps) {
  return (
    <DashboardCard
      title="Remarks & Timeline"
      description="Status changes, timestamps, and operator remarks."
    >
      {isFetching ? (
        <p className="text-sm text-slate-500">Loading history...</p>
      ) : historyList.length === 0 ? (
        <p className="text-sm text-slate-500">No status transitions recorded.</p>
      ) : (
        <div className="flow-root">
          <ul className="-mb-8">
            {historyList.map((log: any, logIdx: number) => (
              <li key={String(log._id || logIdx)}>
                <div className="relative pb-8">
                  {logIdx !== historyList.length - 1 && (
                    <span
                      className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-200 dark:bg-white/10"
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative flex space-x-3">
                    <div>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-8 ring-white dark:bg-blue-900/30 dark:text-blue-400 dark:ring-slate-900">
                        ⚡
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                      <div>
                        <p className="text-sm text-slate-800 dark:text-slate-200">
                          Transition from{' '}
                          <span className="font-semibold text-slate-900 dark:text-white capitalize">
                            {String(log.from_status || 'None').replace('_', ' ')}
                          </span>{' '} to{' '}
                          <span className="font-semibold text-slate-900 dark:text-white capitalize">
                            {String(log.to_status || 'None').replace('_', ' ')}
                          </span>
                        </p>
                        {typeof log.remarks === 'string' && log.remarks.trim() && (
                          <p className="mt-1 text-sm italic text-slate-600 dark:text-slate-400">
                            “{log.remarks}”
                          </p>
                        )}
                      </div>
                      <div className="text-right text-xs whitespace-nowrap text-slate-500 font-mono">
                        <span>{resolveUserDisplay(log.changed_by, userNameById) || 'System'}</span>
                        <span className="block mt-0.5">{formatDate(log.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardCard>
  );
}
