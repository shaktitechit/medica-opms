"use client";

import React, { Fragment, useMemo } from "react";
import { UserCheck, IndianRupee, Package, Truck, Wallet, RotateCcw } from "lucide-react";
import { type OrderStatusDimension } from "./orderStatusDimensions";
import type { DepartmentStageBox } from "./orderDepartmentStages";
import { computeDepartmentStageBoxes } from "./orderDepartmentStages";

export function FulfillmentCircleStep({
  id,
  label,
  status,
  completed = 0,
  total = 0,
  icon: Icon,
  size = "default",
}: {
  id?: string;
  label: string;
  status: OrderStatusDimension | undefined;
  completed?: number;
  total?: number;
  icon: React.ComponentType<{ className?: string }>;
  size?: "default" | "sm" | "xs";
}) {
  if (!status) return null;

  const extraSmall = size === "xs";
  const compact = size === "sm" || extraSmall;
  const radius = extraSmall ? 9 : compact ? 11 : 15;
  const strokeWidth = extraSmall ? 1.5 : compact ? 2 : 2.5;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = Math.max(total, 1);
  const isApprovalStep = id && ["admin", "finance", "account"].includes(id.toLowerCase());
  const progressRatio = isApprovalStep
    ? (status.tone === "success" ? 1 : 0)
    : Math.min(1, Math.max(0, completed / safeTotal));
  const dashOffset = circumference * (1 - progressRatio);

  let strokeColor = "stroke-slate-300 dark:stroke-slate-700";
  let textColor = "text-slate-700 dark:text-slate-350";
  let quantityColor = "text-slate-800 dark:text-slate-200";
  let bgColor = "bg-slate-50 dark:bg-slate-900/50";
  let ringColor = "ring-slate-200 dark:ring-white/5";

  if (status.tone === "success") {
    strokeColor = "stroke-emerald-500";
    textColor = "text-emerald-750 dark:text-emerald-400";
    quantityColor = "text-emerald-600 dark:text-emerald-400 font-extrabold";
    bgColor = "bg-emerald-500/5 dark:bg-emerald-950/20";
    ringColor = "ring-emerald-500/20 dark:ring-emerald-500/10";
  } else if (status.tone === "warning") {
    strokeColor = "stroke-amber-500";
    textColor = "text-amber-700 dark:text-amber-455";
    quantityColor = "text-amber-600 dark:text-amber-400 font-extrabold";
    bgColor = "bg-amber-500/5 dark:bg-amber-955/20";
    ringColor = "ring-amber-500/20 dark:ring-amber-500/10";
  } else if (status.tone === "danger") {
    strokeColor = "stroke-rose-500";
    textColor = "text-rose-700 dark:text-rose-455";
    quantityColor = "text-rose-600 dark:text-rose-400 font-extrabold";
    bgColor = "bg-rose-500/5 dark:bg-rose-950/20";
    ringColor = "ring-rose-500/20 dark:ring-rose-500/10";
  } else if (status.tone === "info") {
    strokeColor = "stroke-blue-500";
    textColor = "text-blue-700 dark:text-blue-450";
    quantityColor = "text-blue-600 dark:text-blue-400 font-extrabold";
    bgColor = "bg-blue-500/5 dark:bg-blue-955/20";
    ringColor = "ring-blue-500/20 dark:ring-blue-500/10";
  }

  const tooltipText = useMemo(() => {
    if (isApprovalStep) {
      return `${label}: ${status.label}${status.detail ? ` · ${status.detail}` : ""}`;
    }
    return `${label}: ${status.label} (${completed}/${total} qty${status.detail ? ` · ${status.detail}` : ""})`;
  }, [isApprovalStep, label, status.label, status.detail, completed, total]);

  return (
    <div
      className={`flex flex-col items-center group cursor-help ${
        extraSmall ? "min-w-[34px]" : compact ? "min-w-[44px]" : "min-w-[70px]"
      }`}
      title={tooltipText}
    >
      <div
        className={`relative flex items-center justify-center rounded-full ring-1 ${ringColor} ${bgColor} ${textColor} ${
          extraSmall ? "h-6 w-6" : compact ? "h-7 w-7" : "h-9 w-9"
        }`}
      >
        <svg
          className="absolute inset-0 h-full w-full transform -rotate-90 pointer-events-none"
          viewBox="0 0 36 36"
        >
          <circle
            cx="18"
            cy="18"
            r={radius}
            className="stroke-slate-200 dark:stroke-slate-800"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx="18"
            cy="18"
            r={radius}
            className={`${strokeColor} transition-[stroke-dashoffset] duration-300`}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <Icon
          className={`z-10 ${extraSmall ? "h-2 w-2" : compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5"}`}
        />
      </div>
      <span
        className={`font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center ${
          extraSmall
            ? "mt-0.5 text-[8px] leading-none"
            : compact
              ? "mt-0.5 text-[9px] leading-none"
              : "mt-1 text-[11px]"
        }`}
      >
        {label}
      </span>
      {isApprovalStep ? (
        <span
          className={`font-bold tracking-tight ${
            status.tone === "success"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-slate-600 dark:text-slate-300"
          } ${
            extraSmall
              ? "text-[8px] leading-none"
              : compact
                ? "text-[9px] leading-none"
                : "text-[11px]"
          }`}
        >
          {status.label}
        </span>
      ) : (
        <span
          className={`font-extrabold tracking-tight ${quantityColor} ${
            extraSmall
              ? "text-[9px] leading-none"
              : compact
                ? "text-[10px] leading-none"
                : "text-[12px]"
          }`}
        >
          {completed}/{total}
        </span>
      )}
    </div>
  );
}

export type FulfillmentPipelineStepConfig = {
  id: string;
  label: string;
  status: OrderStatusDimension | undefined;
  completed?: number;
  total?: number;
  icon: React.ComponentType<{ className?: string }>;
};

export const ORDER_FULFILLMENT_PIPELINE_IDS = [
  "admin",
  "finance",
  "account",
  "dispatch",
  "delivery",
  "return",
] as const;

export type OrderFulfillmentPipelineId = (typeof ORDER_FULFILLMENT_PIPELINE_IDS)[number];

export const DEFAULT_ORDER_PIPELINE_ICONS: Record<
  OrderFulfillmentPipelineId,
  React.ComponentType<{ className?: string }>
> = {
  admin: UserCheck,
  finance: IndianRupee,
  account: Wallet,
  dispatch: Package,
  delivery: Truck,
  return: RotateCcw,
};

const DEFAULT_PIPELINE_LABELS: Record<OrderFulfillmentPipelineId, string> = {
  admin: "Admin",
  finance: "Finance",
  account: "Account",
  dispatch: "Dispatch",
  delivery: "Delivery",
  return: "Return",
};

/** Build inline header pipeline steps from department stage boxes. */
export function buildOrderFulfillmentPipelineSteps(
  boxes: DepartmentStageBox[],
  icons: Record<OrderFulfillmentPipelineId, React.ComponentType<{ className?: string }>>,
  options?: {
    labels?: Partial<Record<OrderFulfillmentPipelineId, string>>;
    defaultTotal?: number;
    totalByStep?: Partial<Record<OrderFulfillmentPipelineId, number>>;
  },
): FulfillmentPipelineStepConfig[] {
  const defaultTotal = options?.defaultTotal ?? 0;

  return ORDER_FULFILLMENT_PIPELINE_IDS.map((id) => {
    const box = boxes.find((b) => b.id === id);
    return {
      id,
      label: options?.labels?.[id] ?? DEFAULT_PIPELINE_LABELS[id],
      status: box?.status,
      completed: box?.completedQty,
      total: options?.totalByStep?.[id] ?? box?.totalQty ?? defaultTotal,
      icon: icons[id],
    };
  });
}

function orderedQtyFromOrder(order: Record<string, unknown>): number {
  const orderItems = Array.isArray(order.order_items) ? order.order_items : [];
  return Math.max(
    1,
    orderItems.reduce((acc: number, item) => {
      const line = item as { ordered_quantity?: unknown; quantity?: unknown };
      return acc + (Number(line.ordered_quantity ?? line.quantity) || 0);
    }, 0),
  );
}

/** Pipeline steps for order list rows (no fulfillment snapshot / returns). */
export function buildListOrderFulfillmentPipeline(
  order: Record<string, unknown>,
  options?: {
    defaultTotal?: number;
    totalByStep?: Partial<Record<OrderFulfillmentPipelineId, number>>;
  },
): FulfillmentPipelineStepConfig[] {
  const deptBoxes = computeDepartmentStageBoxes(order, null);
  const defaultTotal = options?.defaultTotal ?? orderedQtyFromOrder(order);
  return buildOrderFulfillmentPipelineSteps(deptBoxes, DEFAULT_ORDER_PIPELINE_ICONS, {
    defaultTotal,
    totalByStep: options?.totalByStep,
  });
}

/** Compact horizontal fulfillment pipeline (Admin → Return) for order detail headers. */
export function OrderFulfillmentPipelineStrip({
  steps,
  size = "sm",
  className = "",
}: {
  steps: FulfillmentPipelineStepConfig[];
  size?: "default" | "sm" | "xs";
  className?: string;
}) {
  const visible = steps.filter((step) => step.status);
  const arrowClass =
    size === "xs"
      ? "px-0 text-[9px] font-bold text-slate-300 dark:text-slate-600"
      : "px-0.5 text-[11px] font-bold text-slate-300 dark:text-slate-600";

  if (visible.length === 0) return null;

  return (
    <div
      className={`flex w-max min-w-full items-center justify-center gap-0 ${
        size === "xs" ? "py-0" : "py-0.5"
      } ${className}`}
      aria-label="Order fulfillment pipeline"
    >
      {visible.map((step, index) => (
        <Fragment key={step.id}>
          {index > 0 ? <span className={arrowClass}>→</span> : null}
          <FulfillmentCircleStep
            id={step.id}
            size={size}
            label={step.label}
            status={step.status}
            completed={step.completed}
            total={step.total}
            icon={step.icon}
          />
        </Fragment>
      ))}
    </div>
  );
}
