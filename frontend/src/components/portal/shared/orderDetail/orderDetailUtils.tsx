"use client";

import type { ReactNode } from "react";

export const DEPARTMENT_LABELS: Record<string, string> = {
  sales: "Sales",
  finance: "Finance",
  dispatch: "Dispatch",
  admin: "Admin",
  account: "Account",
};

export function pickList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as Record<string, unknown>[];
    if (Array.isArray(o.data)) return o.data as Record<string, unknown>[];
  }
  return [];
}

export function formatDate(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export function formatDateShort(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function detailRefId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return "";
}

export function renderPriorityBadge(priority: string): ReactNode {
  const p = String(priority || "normal").toLowerCase();
  if (p === "urgent") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-700/10 dark:bg-rose-955/30 dark:text-rose-455/90 dark:ring-rose-500/25">
        Urgent
      </span>
    );
  }
  if (p === "high") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-700/10 dark:bg-amber-955/30 dark:text-amber-455/90 dark:ring-amber-500/20">
        High
      </span>
    );
  }
  if (p === "normal") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-955/30 dark:text-blue-455/90 dark:ring-blue-500/20">
        Normal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-slate-700 ring-1 ring-inset ring-slate-500/10 dark:bg-white/5 dark:text-slate-400 dark:ring-white/10">
      Low
    </span>
  );
}

const DISPATCH_VISIBLE_DEPARTMENTS = new Set(["account", "finance", "dispatch"]);

function normalizeAttachmentDepartment(dept: string | undefined): string | undefined {
  if (!dept) return undefined;
  if (dept === "transport") return "dispatch";
  if (dept === "collection") return "finance";
  return dept;
}

function attachmentEntityId(att: unknown): string {
  if (!att || typeof att !== "object") return "";
  const row = att as Record<string, unknown>;
  const entityId = row.entity_id;
  if (entityId != null && typeof entityId === "object") {
    const ref = entityId as Record<string, unknown>;
    return String(ref._id ?? ref.id ?? "");
  }
  return String(entityId ?? "");
}

export function pickOrderAttachments(raw: unknown, orderId: string): Record<string, unknown>[] {
  if (!orderId) return [];
  return pickList(raw).filter((att) => attachmentEntityId(att) === String(orderId));
}

export function filterAttachmentsByVisibility(
  attachments: Record<string, unknown>[],
  visibility: "all" | "dispatch_filtered",
): Record<string, unknown>[] {
  if (visibility === "all") return attachments;
  return attachments.filter((att) => {
    const uploadedBy = att.uploaded_by as { department?: string } | undefined;
    const dept = normalizeAttachmentDepartment(uploadedBy?.department);
    return Boolean(dept && DISPATCH_VISIBLE_DEPARTMENTS.has(dept));
  });
}

export function countDispatchVisibleAttachments(attachments: unknown[]): number {
  return filterAttachmentsByVisibility(
    attachments as Record<string, unknown>[],
    "dispatch_filtered",
  ).length;
}

export const TAB_LABELS: Record<string, string> = {
  approvals: "Approvals",
  dispatches: "Dispatches",
  transports: "Transports",
  deliveries: "Deliveries",
  returns: "Returns",
  due_sheet: "Due Sheet",
  flags: "Flags",
  attachments: "Attachments",
  reminders: "Reminders",
  communication: "Communication",
};

export const MOBILE_TAB_SHORT_LABELS: Record<string, string> = {
  approvals: "Approvals",
  dispatches: "Dispatch",
  transports: "Transport",
  deliveries: "Delivery",
  returns: "Return",
  due_sheet: "Due",
  flags: "Flags",
  attachments: "Files",
  reminders: "Reminders",
  communication: "Chat",
};
