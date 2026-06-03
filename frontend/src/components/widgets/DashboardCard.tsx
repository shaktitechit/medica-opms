import type { ReactNode } from "react";

type DashboardCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export default function DashboardCard({
  title,
  description,
  children,
}: DashboardCardProps) {
  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            {description}
          </p>
        ) : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
