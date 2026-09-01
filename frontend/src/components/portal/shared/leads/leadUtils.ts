/**
 * @fileoverview Lead Management utilities: badge formatters, labels, colors, and helpers.
 * @module components/portal/shared/leads/leadUtils
 */
import React from "react";
import {
  type LeadPriority,
  type LeadStatus,
  type LeadFollowUpType,
} from "@/store/api";

export const LEAD_STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  new: {
    label: "New",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
    dot: "bg-blue-500",
  },
  assigned: {
    label: "Assigned",
    bg: "bg-indigo-50 dark:bg-indigo-950/40",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-200 dark:border-indigo-800",
    dot: "bg-indigo-500",
  },
  follow_up: {
    label: "Follow Up",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  quotation: {
    label: "Quotation",
    bg: "bg-purple-50 dark:bg-purple-950/40",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-800",
    dot: "bg-purple-500",
  },
  won: {
    label: "Won",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  lost: {
    label: "Lost",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-800",
    dot: "bg-rose-500",
  },
  converted: {
    label: "Converted",
    bg: "bg-teal-50 dark:bg-teal-950/40",
    text: "text-teal-700 dark:text-teal-300",
    border: "border-teal-200 dark:border-teal-800",
    dot: "bg-teal-500",
  },
};

export const LEAD_PRIORITY_CONFIG: Record<
  LeadPriority,
  { label: string; bg: string; text: string; border: string }
> = {
  low: {
    label: "Low",
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-700",
  },
  medium: {
    label: "Medium",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
  },
  high: {
    label: "High",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
  },
  urgent: {
    label: "Urgent",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-800",
  },
};

export const FOLLOWUP_TYPE_CONFIG: Record<
  LeadFollowUpType,
  { label: string; icon: string }
> = {
  call: { label: "Phone Call", icon: "Phone" },
  meeting: { label: "Meeting", icon: "Users" },
  email: { label: "Email", icon: "Mail" },
  whatsapp: { label: "WhatsApp", icon: "MessageSquare" },
  visit: { label: "Site Visit", icon: "MapPin" },
  demo: { label: "Product Demo", icon: "Tv" },
  other: { label: "Other", icon: "HelpCircle" },
};

export function formatCurrencyINR(amount?: number | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatLeadDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function formatLeadDateTime(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function isFollowUpOverdue(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const target = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return target < startOfToday;
}

export function isFollowUpToday(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const target = new Date(dateStr);
  const now = new Date();
  return (
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate()
  );
}

/**
 * Standard lifecycle transitions allowed for regular sales representatives.
 * Forward progression only: passing one stage disables previous stages.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["assigned", "follow_up", "quotation", "won", "lost", "converted"],
  assigned: ["new", "follow_up", "quotation", "won", "lost", "converted"],
  follow_up: ["assigned", "quotation", "won", "lost", "converted"],
  quotation: ["follow_up", "won", "lost", "converted"],
  won: ["converted"], // No lost option after won
  lost: ["new", "assigned", "follow_up", "quotation"], // Reopening/transitions require admin
  converted: [], // Terminal
};

export type AuthUserLike = {
  _id?: string;
  id?: string;
  department?: string;
  role?: string;
  permissionCodes?: string[];
} | null | undefined;

/**
 * Checks if the user is an administrator or manager for leads.
 */
export function isLeadAdmin(user: AuthUserLike, portalHome: string = ""): boolean {
  if (!user) return false;
  if (user.department === "admin" || user.department === "super_admin") return true;
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (Array.isArray(user.permissionCodes)) {
    if (user.permissionCodes.includes("*") || user.permissionCodes.includes("leads:manage")) {
      return true;
    }
  }
  if (portalHome.startsWith("/admin") || portalHome.startsWith("/super_admin")) {
    return true;
  }
  return false;
}

/**
 * Checks if user can assign / reassign leads to executives.
 */
export function canAssignLead(user: AuthUserLike, portalHome: string = ""): boolean {
  return isLeadAdmin(user, portalHome);
}

/**
 * Checks if user can soft-delete or restore leads.
 */
export function canDeleteLead(user: AuthUserLike, portalHome: string = ""): boolean {
  return isLeadAdmin(user, portalHome);
}

/**
 * Checks if user can configure Lead Masters (Sources, Lost reasons).
 */
export function canManageLeadMasters(user: AuthUserLike, portalHome: string = ""): boolean {
  return isLeadAdmin(user, portalHome);
}

/**
 * Checks if follow-up scheduling is permissible for the given lead status.
 * Follow-up schedule is NOT available once a lead is Won, Lost, or Converted.
 */
export function canScheduleFollowUp(status: LeadStatus | string): boolean {
  return status !== "won" && status !== "lost" && status !== "converted";
}

/**
 * Checks if quotation creation is permissible for the given lead status.
 * Quotations cannot be created once a lead is Won, Lost, or Converted.
 */
export function canCreateQuotation(status: LeadStatus | string): boolean {
  return status !== "won" && status !== "lost" && status !== "converted";
}

/**
 * Checks if user has permission to create, edit, or delete quotations (Admin / Super Admin only).
 * Sales representatives are restricted from drafting, editing, or deleting quotations.
 */
export function canManageQuotations(user: AuthUserLike, portalHome: string = ""): boolean {
  return isLeadAdmin(user, portalHome);
}

/**
 * Admin / super-admin may view and edit commercial pricing on leads.
 * Sales representatives see quantity and requirements only.
 */
export function canViewLeadPricing(user: AuthUserLike, portalHome: string = ""): boolean {
  return isLeadAdmin(user, portalHome);
}

export function leadLineValue(product?: { quantity?: number; target_price?: number } | null): number {
  return Math.max(0, Number(product?.quantity || 0) * Number(product?.target_price || 0));
}

export function leadEstimatedValue(lead?: {
  estimated_value?: number | null;
  products?: Array<{ quantity?: number; target_price?: number }> | null;
} | null): number {
  const direct = Number(lead?.estimated_value || 0);
  if (direct > 0) return direct;
  if (!Array.isArray(lead?.products) || lead.products.length === 0) return 0;
  return lead.products.reduce((sum, p) => sum + leadLineValue(p), 0);
}

const STAGE_ORDER: Record<string, number> = {
  new: 0,
  assigned: 1,
  follow_up: 2,
  quotation: 3,
  won: 4,
  converted: 5,
};

/**
 * Returns the list of selectable statuses.
 */
export function getSelectableStatuses(
  currentStatus: LeadStatus,
  isAdmin: boolean
): { status: LeadStatus; isAllowed: boolean }[] {
  const modalStatuses: LeadStatus[] = [
    "new",
    "assigned",
    "follow_up",
    "quotation",
    "won",
    "lost",
    "converted",
  ];

  const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  const currentIdx = STAGE_ORDER[currentStatus];

  return modalStatuses.map((st) => {
    if (st === currentStatus) {
      return { status: st, isAllowed: false }; // Current status already set
    }

    if (isAdmin) {
      // In admin override mode, don't allow 'lost' if already 'won' or 'converted'
      if ((currentStatus === "won" || currentStatus === "converted") && st === "lost") {
        return { status: st, isAllowed: false };
      }
      return { status: st, isAllowed: true };
    }

    // After won or converted, lost option is disallowed
    if ((currentStatus === "won" || currentStatus === "converted") && st === "lost") {
      return { status: st, isAllowed: false };
    }

    // Check if target is a previous/passed stage in the linear pipeline
    const targetIdx = STAGE_ORDER[st];
    if (currentIdx !== undefined && targetIdx !== undefined && targetIdx < currentIdx) {
      return { status: st, isAllowed: false };
    }

    // Check if transition is allowed
    const isAllowed = allowedNext.includes(st);

    return {
      status: st,
      isAllowed,
    };
  });
}

