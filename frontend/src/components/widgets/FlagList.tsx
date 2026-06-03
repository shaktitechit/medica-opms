"use client";

import { useListFlagsQuery } from "@/store/api";

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
    "flags" in raw &&
    Array.isArray((raw as { flags: unknown }).flags)
  ) {
    return (raw as { flags: unknown[] }).flags;
  }
  return [];
}

export default function FlagList() {
  const { data, isFetching, isError, error } = useListFlagsQuery({});

  const rows = extractList(data);

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
        Flags
      </h2>
      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
        `GET /api/flags`
      </p>
      <div className="mt-3 max-h-[min(280px,40vh)] overflow-auto text-xs">
        {isFetching ? (
          <p className="text-slate-500 dark:text-slate-400">Loading…</p>
        ) : null}
        {isError ? (
          <p className="text-rose-600 dark:text-rose-400">
            {JSON.stringify(error)}
          </p>
        ) : null}
        {!isFetching && !isError && rows.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">No open flags.</p>
        ) : null}
        {!isFetching &&
        !isError &&
        rows.length > 0 &&
        typeof rows[0] === "object"
          ? (
              <ul className="space-y-2">
                {rows.slice(0, 12).map((row, idx) => {
                  const obj = row as Record<string, unknown>;
                  const id =
                    (typeof obj.id === "string" && obj.id) ||
                    (typeof obj._id === "string" && obj._id) ||
                    String(idx);
                  const label =
                    (typeof obj.message === "string" && obj.message) ||
                    (typeof obj.reason === "string" && obj.reason) ||
                    (typeof obj.status === "string" && obj.status) ||
                    "Flag";
                  return (
                    <li
                      key={id}
                      className="rounded-md bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200/80 dark:bg-slate-950 dark:ring-white/10"
                    >
                      <span className="font-mono text-[10px] text-slate-400">
                        {id}
                      </span>
                      <p className="text-slate-800 dark:text-slate-100">{label}</p>
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
