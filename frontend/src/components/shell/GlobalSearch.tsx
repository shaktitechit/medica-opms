"use client";

import { Search } from "lucide-react";
import { useId, useState } from "react";

import { toast } from "@/lib/toast";

/** Command-palette style search shell; wire to `/api/...` when you add a search endpoint. */
export function GlobalSearch() {
  const id = useId();
  const [q, setQ] = useState("");

  return (
    <form
      className="relative min-h-10 min-w-0 flex-1 lg:max-w-2xl"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const qTrim = q.trim();
        if (!qTrim.length) {
          toast.message("Enter a term to search.");
          return;
        }
        toast.info("Search isn't wired to an API yet — coming soon.", {
          duration: 5200,
        });
      }}
    >
      <label htmlFor={id} className="sr-only">
        Global search
      </label>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        strokeWidth={2}
        aria-hidden
      />
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search workspace…"
        autoComplete="off"
        className="h-10 w-full min-w-0 rounded-lg border border-slate-200/90 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/22 dark:border-white/10 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500"
      />
    </form>
  );
}
