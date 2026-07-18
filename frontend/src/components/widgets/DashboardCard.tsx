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
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted">
            {description}
          </p>
        ) : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
