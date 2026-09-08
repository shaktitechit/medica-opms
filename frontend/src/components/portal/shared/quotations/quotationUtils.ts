/**
 * @fileoverview Utility functions for Quotations module.
 * @module components/portal/shared/quotations/quotationUtils
 */

export function formatCurrencyINR(amount: number): string {
  if (amount == null || isNaN(amount)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function canCreateQuotation(leadStatus?: string): boolean {
  if (!leadStatus) return true;
  return leadStatus !== "lost";
}

export function canManageQuotations(user?: { department?: string; permissionCodes?: string[] } | null): boolean {
  if (!user) return false;
  const codes = new Set(user.permissionCodes || []);
  return (
    codes.has("*") ||
    codes.has("leads:manage") ||
    codes.has("quotations:manage") ||
    user.department === "admin" ||
    user.department === "super_admin" ||
    user.department === "finance"
  );
}

export type QuotationUserRef = {
  _id?: string;
  email?: string;
  department?: string;
  name?: string;
};

export type QuotationLike = {
  _id?: string;
  status?: string;
  approval_status?: string;
  signatory_user?: string | QuotationUserRef | null;
  signatory_email?: string;
  signatory_name?: string;
};

export function isAssignedSignatory(
  user?: QuotationUserRef | null,
  quotation?: QuotationLike | null
): boolean {
  if (!user || !quotation) return false;
  if (user.department === "super_admin") return true;

  const sigUserId =
    typeof quotation.signatory_user === "object" && quotation.signatory_user !== null
      ? quotation.signatory_user._id
      : (quotation.signatory_user as string);

  if (sigUserId && user._id && String(sigUserId) === String(user._id)) {
    return true;
  }

  if (
    quotation.signatory_email &&
    user.email &&
    quotation.signatory_email.toLowerCase().trim() === user.email.toLowerCase().trim()
  ) {
    return true;
  }

  return false;
}

export function isQuotationApproved(quotation?: QuotationLike | null): boolean {
  if (!quotation) return false;
  return (
    quotation.approval_status === "approved" ||
    quotation.status === "approved" ||
    quotation.status === "sent" ||
    quotation.status === "accepted"
  );
}

export function canViewQuotationPdf(
  user?: QuotationUserRef | null,
  quotation?: QuotationLike | null
): boolean {
  if (!quotation) return false;
  if (isQuotationApproved(quotation)) return true;
  return isAssignedSignatory(user, quotation);
}

export function canEmailQuotation(quotation?: QuotationLike | null): boolean {
  if (!quotation) return false;
  if (
    quotation.status === "accepted" ||
    quotation.status === "rejected" ||
    quotation.status === "expired" ||
    quotation.status === "draft" ||
    quotation.status === "pending_approval"
  ) {
    return false;
  }
  return isQuotationApproved(quotation);
}

export function canEditQuotation(
  user?: QuotationUserRef | null,
  quotation?: QuotationLike | null
): boolean {
  if (!user || !quotation) return false;
  if (!isQuotationApproved(quotation)) {
    return canManageQuotations(user as { department?: string; permissionCodes?: string[] });
  }
  return isAssignedSignatory(user, quotation);
}

export function isQuotationCreator(
  user?: QuotationUserRef | null,
  quotation?: (QuotationLike & { created_by?: string | QuotationUserRef | null }) | null
): boolean {
  if (!user || !quotation || !quotation.created_by) return false;

  const creatorId =
    typeof quotation.created_by === "object" && quotation.created_by !== null
      ? quotation.created_by._id
      : (quotation.created_by as string);

  if (creatorId && user._id && String(creatorId) === String(user._id)) {
    return true;
  }

  const creatorEmail =
    typeof quotation.created_by === "object" && quotation.created_by !== null
      ? quotation.created_by.email
      : undefined;

  if (creatorEmail && user.email && creatorEmail.toLowerCase().trim() === user.email.toLowerCase().trim()) {
    return true;
  }

  return false;
}

export function isQuotationVisible(
  user?: QuotationUserRef | null,
  quotation?: (QuotationLike & { created_by?: string | QuotationUserRef | null }) | null
): boolean {
  if (!user || !quotation) return false;

  const isCreator = isQuotationCreator(user, quotation);

  if (user.department === "super_admin") {
    if (quotation.status === "draft") {
      return isCreator;
    }
    return true;
  }

  // Admin, Finance, and Sales: Must be Creator OR Assigned Signatory
  if (quotation.status === "draft") {
    return isCreator;
  }

  const isSignatory = isAssignedSignatory(user, quotation);
  return isCreator || isSignatory;
}

export function canSubmitForApproval(
  user?: QuotationUserRef | null,
  quotation?: (QuotationLike & { created_by?: string | QuotationUserRef | null }) | null
): boolean {
  if (!quotation) return false;
  if (quotation.status !== "draft") return false;
  return isQuotationCreator(user, quotation);
}

export function isDraftVisible(
  user?: QuotationUserRef | null,
  quotation?: (QuotationLike & { created_by?: string | QuotationUserRef | null }) | null
): boolean {
  return isQuotationVisible(user, quotation);
}
