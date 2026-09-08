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

export function canManageQuotations(
  user?: { department?: string; role?: string; permissionCodes?: string[] } | null
): boolean {
  if (!user) return false;
  const dept = user.department || "";
  const role = user.role || "";
  return (
    dept === "admin" ||
    dept === "super_admin" ||
    dept === "finance" ||
    role === "admin" ||
    role === "super_admin" ||
    role === "finance"
  );
}

export function canCreateQuotation(
  leadStatusOrUser?: string | { department?: string; role?: string } | null,
  leadStatus?: string
): boolean {
  if (typeof leadStatusOrUser === "string") {
    return leadStatusOrUser !== "lost";
  }
  if (!leadStatusOrUser) return false;
  if (!canManageQuotations(leadStatusOrUser)) return false;
  if (leadStatus && leadStatus === "lost") return false;
  return true;
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
