"use client";

import { OrderLifecycleProgress } from "./OrderLifecycleProgress";
import { computeLifecycle, formatOrderStatusLabel } from "./orderLifecycle";

export type OrderDetailPageHeaderProps = {
  portalLabel: string;
  orderNo: string;
  status: string;
  /** e.g. customer name — shown under the title */
  subtitle?: string;
  onBack: () => void;
  backLabel?: string;
};

function statusPillClass(status: string): string {
  const { variant } = computeLifecycle(status);
  if (variant === "cancelled") {
    return "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200";
  }
  if (variant === "on_hold") {
    return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
  }
  if (variant === "finance_rejected") {
    return "bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200";
  }
  if (status === "delivered") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200";
  }
  return "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200";
}

export function OrderDetailPageHeader({
  portalLabel,
  orderNo,
  status,
  subtitle,
  onBack,
  backLabel = "Back",
}: OrderDetailPageHeaderProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/80 to-slate-100/60 shadow-sm dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
      <div className="border-b border-slate-200/80 bg-white/40 px-5 py-5 backdrop-blur-sm dark:border-white/5 dark:bg-slate-900/40 sm:px-8 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-900 px-2 py-0.5 text-2xs font-bold uppercase tracking-widest text-white dark:bg-white dark:text-slate-900">
                {portalLabel}
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Order</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
                {orderNo}
              </h1>
              {status ? (
                <span
                  className={`inline-flex max-w-[min(100%,16rem)] items-center truncate rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusPillClass(status)}`}
                >
                  {formatOrderStatusLabel(status)}
                </span>
              ) : null}
            </div>
            {subtitle ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">{subtitle}</p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Refer to your order number for support — internal IDs stay hidden from this view.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-slate-200/95 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/15 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              {backLabel}
            </button>
          </div>
        </div>
      </div>
      <div className="px-5 pb-5 pt-4 sm:px-8 sm:pb-6 sm:pt-5">
        <OrderLifecycleProgress status={status} />
      </div>
    </div>
  );
}
