import type { ReactNode } from "react";

type DashboardCardProps = {
  title: string;
  description?: string;
  /** Optional header action (e.g. primary button). */
  action?: ReactNode;
  children: ReactNode;
};

export default function DashboardCard({
  title,
  description,
  action,
  children,
}: DashboardCardProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
