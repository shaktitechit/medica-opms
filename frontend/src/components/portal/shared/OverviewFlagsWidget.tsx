"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Flag, ExternalLink, X } from "lucide-react";
import { useListFlagsQuery, useListOrdersQuery } from "@/store/api";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import {
  largeModalBackdropClass,
  largeModalPanelClass,
} from "@/components/portal/shared/modalLayout";

export interface OverviewFlagsWidgetProps {
  currentDepartment: "sales" | "finance" | "account" | "dispatch" | "admin";
  /** `panel` = full-width card (default). `headerButton` = compact trigger that opens flags in a modal. */
  variant?: "panel" | "headerButton";
}

const departmentTitles: Record<string, string> = {
  sales: "Active Sales Alerts",
  finance: "Clearance Flags & Alerts",
  dispatch: "Active Dispatch Alerts",
  account: "Active Account Alerts",
  admin: "System Alerts & Flags",
};

const departmentButtonColors: Record<string, string> = {
  sales: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-955/40 dark:text-blue-455 dark:border-blue-900/50 dark:hover:bg-blue-900/40",
  finance: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-955/40 dark:text-emerald-455 dark:border-emerald-900/50 dark:hover:bg-emerald-900/40",
  dispatch: "bg-amber-50 text-amber-705 border-amber-200 hover:bg-amber-100 dark:bg-amber-955/40 dark:text-amber-455 dark:border-amber-900/50 dark:hover:bg-amber-900/40",
  account: "bg-blue-50 text-blue-755 border-blue-200 hover:bg-blue-100 dark:bg-blue-955/40 dark:text-blue-455 dark:border-blue-900/50 dark:hover:bg-blue-900/40",
  admin: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-955/40 dark:text-blue-455 dark:border-blue-900/50 dark:hover:bg-blue-900/40",
};

function getSeverityBadgeClass(severity?: string): string {
  const s = (severity || "").toLowerCase();
  if (s === "critical") {
    return "bg-red-100 text-red-800 ring-1 ring-red-650/20 dark:bg-red-955/40 dark:text-red-455";
  }
  if (s === "high") {
    return "bg-rose-100 text-rose-855 ring-1 ring-rose-600/15 dark:bg-rose-955/35 dark:text-rose-455";
  }
  if (s === "medium") {
    return "bg-amber-100 text-amber-855 ring-1 ring-amber-600/15 dark:bg-amber-955/30 dark:text-amber-455";
  }
  return "bg-blue-100 text-blue-855 ring-1 ring-blue-600/15 dark:bg-blue-955/30 dark:text-blue-455";
}

function formatStatusLabel(status?: string): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractFlags(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
    if (Array.isArray(o.flags)) return o.flags as Record<string, unknown>[];
  }
  return [];
}

function FlagsList({
  currentDepartment,
  relevantFlags,
  orderNoById,
  isFlagsFetching,
  isFlagsError,
}: {
  currentDepartment: OverviewFlagsWidgetProps["currentDepartment"];
  relevantFlags: Record<string, unknown>[];
  orderNoById: Map<string, string>;
  isFlagsFetching: boolean;
  isFlagsError: boolean;
}) {
  if (isFlagsFetching) {
    return (
      <p className="text-xs text-slate-550 dark:text-slate-400 py-2">
        Loading alerts…
      </p>
    );
  }

  if (isFlagsError) {
    return (
      <p className="text-xs text-rose-655 dark:text-rose-400 py-2">
        Could not load alerts list.
      </p>
    );
  }

  if (relevantFlags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <p className="text-xs text-slate-550 dark:text-slate-400">
          No active blockages reported in your queue.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3.5">
      {relevantFlags.map((flag, index) => {
        const flagId = flag._id ?? flag.id ?? String(index);
        const orderId = String(flag.order || "");
        const orderNo = orderNoById.get(orderId) || `ID: ${orderId.slice(0, 8)}`;
        const urlPath = `/${currentDepartment}/order/${orderId}`;

        return (
          <li
            key={String(flagId)}
            className="rounded-lg border border-slate-150 bg-slate-50/50 p-3 transition hover:bg-slate-50 dark:border-white/5 dark:bg-slate-955/50 dark:hover:bg-slate-950"
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider capitalize ${getSeverityBadgeClass(
                  String(flag.severity ?? ""),
                )}`}
              >
                {String(flag.severity || "medium")}
              </span>
              <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500 font-semibold">
                {formatStatusLabel(String(flag.flag_type ?? ""))}
              </span>
            </div>

            <h4 className="mt-2 text-xs font-bold text-slate-900 dark:text-slate-100 font-sans">
              {String(flag.title ?? "")}
            </h4>

            {flag.description ? (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
                {String(flag.description)}
              </p>
            ) : null}

            <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-150/60 pt-2.5 text-[10px] dark:border-white/5 font-sans">
              <div className="flex items-center justify-between">
                <span className="text-slate-455">Order Ref:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {orderNo}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-455">Action:</span>
                <Link
                  href={urlPath}
                  className={`group inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase transition ${departmentButtonColors[currentDepartment] || "bg-slate-100 text-slate-800 hover:bg-slate-150"}`}
                >
                  <span>View</span>
                  <ExternalLink className="h-2.5 w-2.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function OverviewFlagsWidget({
  currentDepartment,
  variant = "panel",
}: OverviewFlagsWidgetProps) {
  const [showModal, setShowModal] = useState(false);

  const {
    data: flagsData,
    isFetching: isFlagsFetching,
    isError: isFlagsError,
  } = useListFlagsQuery({});

  const { data: ordersData } = useListOrdersQuery({});

  const orders = useMemo(
    () => pickOrders(ordersData) as Record<string, unknown>[],
    [ordersData],
  );

  const orderNoById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
      const ref = String(o.order_no ?? o.order_number ?? "");
      if (id && ref) map.set(id, ref);
    }
    return map;
  }, [orders]);

  const relevantFlags = useMemo(() => {
    const allFlags = extractFlags(flagsData);
    return allFlags.filter((f) => {
      if (!f || typeof f !== "object") return false;
      if (f.status !== "open" && f.status !== "in_progress") return false;
      return f.department === currentDepartment;
    });
  }, [flagsData, currentDepartment]);

  const title = departmentTitles[currentDepartment] || "Active Alerts & Flags";
  const flagCount = relevantFlags.length;

  const listProps = {
    currentDepartment,
    relevantFlags,
    orderNoById,
    isFlagsFetching,
    isFlagsError,
  };

  if (variant === "headerButton") {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40 cursor-pointer"
        >
          <Flag className="h-4 w-4" />
          <span className="hidden sm:inline">{title}</span>
          <span className="sm:hidden">Alerts</span>
          <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white dark:bg-rose-500">
            {isFlagsFetching ? "…" : flagCount}
          </span>
        </button>

        {showModal && (
          <div className={largeModalBackdropClass}>
            <div className={`${largeModalPanelClass} max-w-2xl h-[min(90vh,720px)]`}>
              <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <Flag className="h-5 w-5 text-rose-500" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {title}
                  </h3>
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-955/30 dark:text-rose-400">
                    {flagCount}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-250 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-5">
                <FlagsList {...listProps} />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 font-sans">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-rose-500" />
          <h3 className="font-bold text-slate-900 dark:text-slate-100 font-sans">
            {title}
          </h3>
        </div>
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-955/30 dark:text-rose-400">
          {flagCount}
        </span>
      </div>

      <div className="mt-4 max-h-[min(380px,50vh)] overflow-auto">
        <FlagsList {...listProps} />
      </div>
    </section>
  );
}
