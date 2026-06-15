export function idFromRef(ref: unknown): string {
  if (typeof ref === "string") return ref.trim();
  if (ref && typeof ref === "object" && "_id" in ref) {
    return String((ref as { _id: unknown })._id ?? "").trim();
  }
  if (ref && typeof ref === "object" && "id" in ref) {
    return String((ref as { id: unknown }).id ?? "").trim();
  }
  return "";
}

export function filterAccountApprovalsForUser(
  approvals: Record<string, unknown>[],
  currentUserId: string,
): Record<string, unknown>[] {
  return approvals.filter((app) => {
    const assigneeId = idFromRef(app.assigned_account_user);
    return (
      assigneeId &&
      assigneeId === currentUserId &&
      Boolean(app.is_finance_approved) &&
      Boolean(app.is_account_approved)
    );
  });
}

export function getReleaseDispatches(
  dispatches: Record<string, unknown>[],
  approvalId: string,
): Record<string, unknown>[] {
  return dispatches.filter((disp) => {
    const statusValue = String(disp.dispatch_status ?? disp.status ?? "partially_dispatched");
    if (statusValue === "cancelled") return false;

    const dispApproval = disp.finance_approval;
    const dispApprovalId =
      typeof dispApproval === "object" && dispApproval !== null
        ? idFromRef(
            (dispApproval as Record<string, unknown>)._id ??
              (dispApproval as Record<string, unknown>).id,
          )
        : idFromRef(dispApproval);

    return dispApprovalId === approvalId;
  });
}

export function computeReleaseDispatchedByLine(
  dispatches: Record<string, unknown>[],
  approvalId: string,
): Record<string, number> {
  const map: Record<string, number> = {};
  getReleaseDispatches(dispatches, approvalId).forEach((disp) => {
    const rawItems = Array.isArray(disp.dispatch_items)
      ? disp.dispatch_items
      : (disp.items as Record<string, unknown>[]) || [];
    rawItems.forEach((item) => {
      const lineId = idFromRef(item.order_item_id);
      const qty = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);
      map[lineId] = (map[lineId] || 0) + qty;
    });
  });
  return map;
}

export type ReleaseDispatchSummary = {
  hasDispatches: boolean;
  remainingTotal: number;
  canContinueDispatch: boolean;
  canResolveRelease: boolean;
};

export function summarizeReleaseDispatchState(
  approval: Record<string, unknown> | null,
  dispatches: Record<string, unknown>[],
): ReleaseDispatchSummary {
  if (!approval) {
    return {
      hasDispatches: false,
      remainingTotal: 0,
      canContinueDispatch: false,
      canResolveRelease: false,
    };
  }

  const approvalId = idFromRef(approval._id ?? approval.id);
  const items = Array.isArray(approval.approval_items)
    ? (approval.approval_items as Record<string, unknown>[])
    : [];
  const dispatchedByLine = computeReleaseDispatchedByLine(dispatches, approvalId);
  const releaseDispatches = getReleaseDispatches(dispatches, approvalId);
  const hasDispatches = releaseDispatches.length > 0;

  let remainingTotal = 0;
  let hasRemaining = false;

  for (const item of items) {
    const approved = Number(item.approved_quantity || 0);
    if (approved <= 0) continue;
    const lineId = idFromRef(item.order_item_id);
    const dispatched = dispatchedByLine[lineId] || 0;
    const remaining = Math.max(0, approved - dispatched);
    remainingTotal += remaining;
    if (remaining > 0) hasRemaining = true;
  }

  const fullyDispatched =
    items.filter((ai) => Number(ai.approved_quantity || 0) > 0).length > 0 &&
    !hasRemaining;

  return {
    hasDispatches,
    remainingTotal,
    canContinueDispatch: hasRemaining && !fullyDispatched,
    canResolveRelease: hasDispatches && hasRemaining,
  };
}

export function listDispatchableAccountApprovals(
  accountApprovals: Record<string, unknown>[],
  dispatches: Record<string, unknown>[],
): Record<string, unknown>[] {
  return accountApprovals.filter((app) => {
    const items = Array.isArray(app.approval_items) ? app.approval_items : [];
    if (items.length === 0) return false;

    const appId = idFromRef(app._id ?? app.id);
    const releaseDispatches = dispatches.filter((disp) => {
      const statusValue = String(disp.dispatch_status ?? disp.status ?? "partially_dispatched");
      if (statusValue === "cancelled") return false;

      const dispApproval = disp.finance_approval;
      const dispApprovalId =
        typeof dispApproval === "object" && dispApproval !== null
          ? idFromRef(
              (dispApproval as Record<string, unknown>)._id ??
                (dispApproval as Record<string, unknown>).id,
            )
          : idFromRef(dispApproval);

      return dispApprovalId === appId;
    });

    const dispatchedByLine: Record<string, number> = {};
    releaseDispatches.forEach((disp) => {
      const rawItems = Array.isArray(disp.dispatch_items)
        ? disp.dispatch_items
        : (disp.items as Record<string, unknown>[]) || [];
      rawItems.forEach((item) => {
        const lineId = idFromRef(item.order_item_id);
        const qty = Number(item.dispatched_quantity ?? item.dispatch_quantity ?? 0);
        dispatchedByLine[lineId] = (dispatchedByLine[lineId] || 0) + qty;
      });
    });

    const linesWithApproval = items.filter(
      (ai) => Number((ai as Record<string, unknown>).approved_quantity || 0) > 0,
    );
    if (linesWithApproval.length === 0) return false;

    const fullyDispatched = linesWithApproval.every((ai) => {
      const row = ai as Record<string, unknown>;
      const approvedQty = Number(row.approved_quantity || 0);
      const lineId = idFromRef(row.order_item_id);
      return (dispatchedByLine[lineId] || 0) >= approvedQty;
    });

    return !fullyDispatched;
  });
}

export function isDispatchBatchSentToDispatch(
  dispatch: Record<string, unknown>,
): boolean {
  return Boolean(idFromRef(dispatch.dispatch_assignee_user));
}

export function resolveDispatchReleaseId(dispatch: Record<string, unknown>): string {
  const approvalRef = dispatch.finance_approval;
  if (typeof approvalRef === "object" && approvalRef !== null) {
    return idFromRef(
      (approvalRef as Record<string, unknown>)._id ??
        (approvalRef as Record<string, unknown>).id,
    );
  }
  return idFromRef(approvalRef);
}

export type AccountDispatchReleaseGroup = {
  releaseId: string;
  releaseNo: string;
  approval: Record<string, unknown> | null;
  dispatches: Record<string, unknown>[];
};

export function groupAccountDispatchesByRelease(
  dispatches: Record<string, unknown>[],
  accountApprovals: Record<string, unknown>[] = [],
): AccountDispatchReleaseGroup[] {
  const approvalById = new Map<string, Record<string, unknown>>();
  for (const app of accountApprovals) {
    const appId = idFromRef(app._id ?? app.id);
    if (appId) approvalById.set(appId, app);
  }

  const groups = new Map<string, AccountDispatchReleaseGroup>();

  for (const disp of dispatches) {
    const releaseId = resolveDispatchReleaseId(disp) || "__unlinked__";
    const approval =
      releaseId === "__unlinked__"
        ? null
        : (approvalById.get(releaseId) ??
          (typeof disp.finance_approval === "object" && disp.finance_approval !== null
            ? (disp.finance_approval as Record<string, unknown>)
            : null));

    const releaseNo = approval
      ? String(approval.approval_no ?? releaseId)
      : releaseId === "__unlinked__"
        ? "Unlinked release"
        : releaseId;

    const existing = groups.get(releaseId);
    if (existing) {
      existing.dispatches.push(disp);
      continue;
    }

    groups.set(releaseId, {
      releaseId,
      releaseNo,
      approval,
      dispatches: [disp],
    });
  }

  return Array.from(groups.values()).sort((a, b) => {
    const aTime = Date.parse(String(a.approval?.account_approved_at ?? a.approval?.createdAt ?? ""));
    const bTime = Date.parse(String(b.approval?.account_approved_at ?? b.approval?.createdAt ?? ""));
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }
    return a.releaseNo.localeCompare(b.releaseNo);
  });
}
