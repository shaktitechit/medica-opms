"use client";

import {
  dimensionToneClass,
  type OrderStatusDimension,
} from "./orderStatusDimensions";

type Props = {
  dimension: OrderStatusDimension | null | undefined;
  className?: string;
};

/** Single dimension column for order list tables. */
export function OrderStatusDimensionCell({ dimension, className = "" }: Props) {
  if (!dimension) {
    return (
      <td className={`px-4 py-3 align-top text-slate-400 ${className}`}>—</td>
    );
  }

  const title = dimension.detail
    ? `${dimension.label} — ${dimension.detail}`
    : dimension.label;

  return (
    <td className={`px-4 py-3 align-top ${className}`}>
      <span
        className={`inline-flex max-w-[11rem] truncate rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ${dimensionToneClass(dimension.tone)}`}
        title={title}
      >
        {dimension.label}
      </span>
      {dimension.detail ? (
        <p
          className="mt-0.5 max-w-[11rem] truncate text-2xs text-slate-500 dark:text-slate-400"
          title={dimension.detail}
        >
          {dimension.detail}
        </p>
      ) : null}
    </td>
  );
}
