"use client";

export type OrderDetailTabSpec = {
  id: string;
  name: string;
  count?: number;
  /** Use warning styling for badge (e.g. flags) */
  dangerBadge?: boolean;
};

export type OrderDetailTabsNavProps = {
  tabs: OrderDetailTabSpec[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
};

export function OrderDetailTabsNav({
  tabs,
  activeId,
  onChange,
  ariaLabel = "Order sections",
}: OrderDetailTabsNavProps) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-1.5 dark:border-white/10 dark:bg-white/[0.04]">
      <nav className="-mx-0.5 flex gap-1 overflow-x-auto scrollbar-none pb-0.5" aria-label={ariaLabel}>
        {tabs.map((t) => {
          const selected = activeId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`relative shrink-0 rounded-lg px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${
                selected
                  ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/90 dark:bg-slate-800 dark:text-blue-400 dark:ring-white/10"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-slate-100"
              }`}
            >
              <span>{t.name}</span>
              {t.count !== undefined && t.count > 0 ? (
                <span
                  className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    t.dangerBadge
                      ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                      : "bg-slate-200/90 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
