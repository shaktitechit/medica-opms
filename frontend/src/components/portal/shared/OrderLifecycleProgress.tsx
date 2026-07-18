"use client";

import { Fragment } from "react";
import {
  ORDER_LIFECYCLE_STEPS,
  computeLifecycle,
  formatOrderStatusLabel,
  type LifecycleVariant,
} from "./orderLifecycle";

const variantBanner: Record<LifecycleVariant, { text: string; className: string } | null> = {
  progress: null,
  cancelled: {
    text: "This order has been cancelled.",
    className:
      "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/35 dark:text-rose-100",
  },
  on_hold: {
    text: "This order is on hold.",
    className:
      "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/35 dark:text-amber-50",
  },
  finance_rejected: {
    text: "Finance rejected — resolve items before progressing.",
    className:
      "border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-900/40 dark:bg-orange-950/35 dark:text-orange-50",
  },
};

export type OrderLifecycleProgressProps = {
  status: string;
  className?: string;
};

function StepCheck() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function OrderLifecycleProgress({ status, className = "" }: OrderLifecycleProgressProps) {
  const { variant, activeIndex } = computeLifecycle(status);
  const banner = variantBanner[variant];
  const delivered = status === "delivered";

  return (
    <div className={`space-y-3 ${className}`}>
      {banner ? (
        <p
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${banner.className}`}
          role="status"
        >
          {banner.text}
        </p>
      ) : null}

      <div>
        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Lifecycle
          </span>
          <span className="text-xs text-slate-600 dark:text-slate-300">
            Now:{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-100">
              {formatOrderStatusLabel(status)}
            </strong>
          </span>
        </div>

        <div
          className="-mx-1 overflow-x-auto pb-2 pt-1 [scrollbar-width:thin]"
          aria-label="Order lifecycle progress"
        >
          <div className="flex min-w-[min(720px,100%)] items-center px-1 sm:min-w-full">
            {ORDER_LIFECYCLE_STEPS.map((step, i) => {
              type DotKind = "done" | "current" | "upcoming" | "reject" | "hold" | "cancel";
              let dot: DotKind = "upcoming";

              if (variant === "cancelled") dot = i <= activeIndex ? "cancel" : "upcoming";
              else if (variant === "finance_rejected" && i === 3) dot = "reject";
              else if (variant === "on_hold" && i === activeIndex) dot = "hold";
              else if (delivered) dot = "done";
              else if (variant === "progress") {
                if (i < activeIndex) dot = "done";
                else if (i === activeIndex) dot = "current";
                else dot = "upcoming";
              }

              let circle =
                "border-slate-200 bg-white text-slate-400 dark:border-white/20 dark:bg-slate-900 dark:text-slate-500";
              let labelClass = "text-slate-500 dark:text-slate-400";

              switch (dot) {
                case "done":
                  circle =
                    "border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 dark:border-emerald-400 dark:bg-emerald-600";
                  labelClass = "text-emerald-900 dark:text-emerald-300";
                  break;
                case "current":
                  circle =
                    "border-sky-500 bg-sky-500 text-white ring-[3px] ring-sky-500/25 dark:border-sky-400 dark:bg-sky-600 dark:ring-sky-400/30";
                  labelClass = "font-semibold text-sky-900 dark:text-sky-300";
                  break;
                case "reject":
                  circle = "border-orange-500 bg-orange-500 text-white dark:bg-orange-600";
                  labelClass = "font-semibold text-orange-950 dark:text-orange-200";
                  break;
                case "hold":
                  circle =
                    "border-amber-400 bg-amber-400 text-amber-950 ring-[3px] ring-amber-400/35 dark:bg-amber-500";
                  labelClass = "font-semibold text-amber-950 dark:text-amber-100";
                  break;
                case "cancel":
                  circle =
                    "border-slate-300 bg-slate-200 text-slate-600 dark:border-white/15 dark:bg-slate-800 dark:text-slate-400";
                  labelClass = "text-slate-600 dark:text-slate-400";
                  break;
                default:
                  break;
              }

              const connectorGreen =
                i > 0 &&
                (delivered ||
                  (variant === "progress" && i <= activeIndex) ||
                  (variant === "finance_rejected" && i <= activeIndex) ||
                  (variant === "on_hold" && i <= activeIndex));

              const gradientIntoFinance =
                variant === "progress" && status === "finance_review" && i === activeIndex;

              return (
                <Fragment key={step.id}>
                  {i > 0 ? (
                    <div
                      className={`mx-0.5 h-0.5 min-w-[8px] flex-1 rounded-full ${
                        connectorGreen
                          ? gradientIntoFinance
                            ? "bg-gradient-to-r from-emerald-400 to-sky-300 dark:from-emerald-500 dark:to-sky-600"
                            : "bg-emerald-400 dark:bg-emerald-500"
                          : "bg-slate-200 dark:bg-white/10"
                      }`}
                      aria-hidden
                    />
                  ) : null}
                  <div className="flex w-[13%] min-w-[52px] max-w-[88px] flex-col items-center">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${circle}`}
                      aria-current={dot === "current" || dot === "hold" ? "step" : undefined}
                    >
                      {dot === "cancel" ? (
                        "–"
                      ) : dot === "reject" ? (
                        "!"
                      ) : dot === "done" ? (
                        <StepCheck />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <p
                      className={`mt-2 max-w-[4.5rem] text-center text-2xs font-semibold leading-snug sm:max-w-[6rem] sm:text-xs ${labelClass}`}
                    >
                      <span className="sm:hidden">{step.shortLabel}</span>
                      <span className="hidden sm:inline">{step.label}</span>
                    </p>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
