"use client";

import { useListActivityQuery } from "@/store/api";

function extractList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (
    raw &&
    typeof raw === "object" &&
    "items" in raw &&
    Array.isArray((raw as { items: unknown }).items)
  ) {
    return (raw as { items: unknown[] }).items;
  }
  if (
    raw &&
    typeof raw === "object" &&
    "data" in raw &&
    Array.isArray((raw as { data: unknown }).data)
  ) {
    return (raw as { data: unknown[] }).data;
  }
  if (
    raw &&
    typeof raw === "object" &&
    "activity" in raw &&
    Array.isArray((raw as { activity: unknown }).activity)
  ) {
    return (raw as { activity: unknown[] }).activity;
  }
  return [];
}

export default function RecentActivity() {
  const { data, isFetching, isError } = useListActivityQuery({});

  const rows = extractList(data);

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
        Recent activity
      </h2>
      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
        `GET /api/activity`
      </p>
      <div className="mt-3 max-h-[min(280px,40vh)] overflow-auto text-xs">
        {isFetching ? (
          <p className="text-slate-500 dark:text-slate-400">Loading…</p>
        ) : null}
        {isError ? (
          <p className="text-rose-600 dark:text-rose-400">
            Could not load activity.
          </p>
        ) : null}
        {!isFetching && !isError && rows.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">Nothing yet.</p>
        ) : null}
        {!isFetching &&
        !isError &&
        rows.length > 0 &&
        typeof rows[0] === "object"
          ? (
              <ul className="space-y-2 font-mono text-[11px] text-slate-700 dark:text-slate-200">
                {rows.slice(0, 14).map((row, idx) => {
                  const obj = row as Record<string, unknown>;
                  const id =
                    (typeof obj.id === "string" && obj.id) ||
                    (typeof obj._id === "string" && obj._id) ||
                    String(idx);
                  const action =
                    (typeof obj.action === "string" && obj.action) ||
                    (typeof obj.kind === "string" && obj.kind) ||
                    "event";
                  return (
                    <li
                      key={id}
                      className="truncate rounded-md bg-slate-50 px-2 py-1 ring-1 ring-slate-200/80 dark:bg-slate-950 dark:ring-white/10"
                      title={JSON.stringify(row)}
                    >
                      {action}
                    </li>
                  );
                })}
              </ul>
            )
          : null}
      </div>
    </section>
  );
}
