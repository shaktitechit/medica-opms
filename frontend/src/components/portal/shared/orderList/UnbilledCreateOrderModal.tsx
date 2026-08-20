"use client";

import { useCallback } from "react";
import AdminCreateOrderPage, {
  type StaffCreateOrderLinePrefill,
  type StaffCreateOrderPortalHome,
} from "@/components/portal/admin/AdminCreateOrderPage";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import {
  useListUnbilledOrdersQuery,
  usePatchUnbilledOrderMutation,
  useListOrderApprovalsQuery,
  useCreateOrderApprovalMutation,
  usePatchOrderApprovalMutation,
  useListOrderDueSheetsQuery,
  useCreateOrderDueSheetMutation,
} from "@/store/api";

export type CreateOrderTarget = {
  unbilledId: string;
  orderId?: string;
  orderNo: string;
  partyId: string;
  salesUserId: string;
  linePrefills: StaffCreateOrderLinePrefill[];
};

export type UnbilledCreateOrderModalProps = {
  createTarget: CreateOrderTarget | null;
  onClose: () => void;
  portalBasePath: string;
};

export function resolveCreateOrderPortal(
  portalBasePath: string,
): StaffCreateOrderPortalHome {
  if (
    portalBasePath === "/account" ||
    portalBasePath === "/finance" ||
    portalBasePath === "/super_admin"
  ) {
    return portalBasePath;
  }
  return "/admin";
}

export function UnbilledCreateOrderModal({
  createTarget,
  onClose,
  portalBasePath,
}: UnbilledCreateOrderModalProps) {
  const referralOrderId = createTarget?.orderId;

  const unbilledQ = useListUnbilledOrdersQuery(
    { status: "open" },
    { skip: !createTarget },
  );

  const referralApprovalsQ = useListOrderApprovalsQuery(
    { order: referralOrderId! },
    { skip: !createTarget || !referralOrderId },
  );

  const referralDueSheetsQ = useListOrderDueSheetsQuery(
    { order: referralOrderId! },
    { skip: !createTarget || !referralOrderId },
  );

  const [patchUnbilledOrder] = usePatchUnbilledOrderMutation();
  const [createOrderApproval] = useCreateOrderApprovalMutation();
  const [patchOrderApproval] = usePatchOrderApprovalMutation();
  const [createOrderDueSheet] = useCreateOrderDueSheetMutation();

  const createOrderPortal = resolveCreateOrderPortal(portalBasePath);

  const handleCreated = useCallback(
    async (info: { orderId: string; orderNo: string }) => {
      const source = createTarget;
      onClose();

      const newOrderId = info.orderId;

      // Copy approvals from referral order if existing
      if (referralOrderId && newOrderId && referralApprovalsQ.data) {
        const rawApprovals = Array.isArray(referralApprovalsQ.data)
          ? referralApprovalsQ.data
          : [];
        const referralApproval = (rawApprovals[0] || null) as Record<
          string,
          unknown
        > | null;

        if (referralApproval) {
          try {
            // Copy Admin, Finance, & Account approvals by creating approval and patching exact approver users and timestamps
            const approvalRes = (await createOrderApproval({
              order: newOrderId,
              approve_immediately: true,
              approve_finance_only: false,
              replace_snapshot: true,
              approval_notes:
                (referralApproval.approval_notes as string) ||
                `Copied approvals from referral order ${
                  source?.orderNo || referralOrderId
                }`,
              is_due_sheet_uploaded: Boolean(
                referralApproval.is_due_sheet_uploaded,
              ),
              credit_limit_checked: Boolean(
                referralApproval.credit_limit_checked,
              ),
              outstanding_checked: Boolean(
                referralApproval.outstanding_checked,
              ),
              risk_level:
                (referralApproval.risk_level as string) || "low",
            }).unwrap()) as Record<string, unknown> | null;

            const createdApprovalId = String(
              approvalRes?._id ?? approvalRes?.id ?? "",
            );

            if (createdApprovalId) {
              const patchPayload: Record<string, unknown> = {};

              if (referralApproval.remarks) {
                patchPayload.remarks = referralApproval.remarks;
              }

              // Copy admin approver & timestamp if present
              if (referralApproval.admin_approved_by) {
                patchPayload.admin_approved_by =
                  typeof referralApproval.admin_approved_by === "object"
                    ? (referralApproval.admin_approved_by as any)._id
                    : referralApproval.admin_approved_by;
              }
              if (referralApproval.admin_approved_at) {
                patchPayload.admin_approved_at =
                  referralApproval.admin_approved_at;
              }

              // Copy finance approval flag, approver & timestamp if present
              if (referralApproval.is_finance_approved != null) {
                patchPayload.is_finance_approved = Boolean(
                  referralApproval.is_finance_approved,
                );
              }
              if (referralApproval.finance_approved_by) {
                patchPayload.finance_approved_by =
                  typeof referralApproval.finance_approved_by === "object"
                    ? (referralApproval.finance_approved_by as any)._id
                    : referralApproval.finance_approved_by;
              }
              if (referralApproval.finance_approved_at) {
                patchPayload.finance_approved_at =
                  referralApproval.finance_approved_at;
              }

              // Copy account approval flag, approver & timestamp if present
              if (referralApproval.is_account_approved != null) {
                patchPayload.is_account_approved = Boolean(
                  referralApproval.is_account_approved,
                );
              }
              if (referralApproval.account_approved_by) {
                patchPayload.account_approved_by =
                  typeof referralApproval.account_approved_by === "object"
                    ? (referralApproval.account_approved_by as any)._id
                    : referralApproval.account_approved_by;
              }
              if (referralApproval.account_approved_at) {
                patchPayload.account_approved_at =
                  referralApproval.account_approved_at;
              }

              // Copy overall approved_by & approved_at if present
              if (referralApproval.approved_by) {
                patchPayload.approved_by =
                  typeof referralApproval.approved_by === "object"
                    ? (referralApproval.approved_by as any)._id
                    : referralApproval.approved_by;
              }
              if (referralApproval.approved_at) {
                patchPayload.approved_at = referralApproval.approved_at;
              }

              if (Object.keys(patchPayload).length > 0) {
                await patchOrderApproval({
                  id: createdApprovalId,
                  patch: patchPayload,
                }).unwrap();
              }
            }

            // Copy Due Sheet approval if referral order had due sheet uploaded or active
            if (referralApproval.is_due_sheet_uploaded) {
              const rawDueSheets = Array.isArray(referralDueSheetsQ.data)
                ? referralDueSheetsQ.data
                : [];
              const referralDueSheet = (rawDueSheets[0] || null) as Record<
                string,
                unknown
              > | null;

              const docId = referralDueSheet?.document
                ? typeof referralDueSheet.document === "object"
                  ? String((referralDueSheet.document as any)._id ?? (referralDueSheet.document as any).id ?? "")
                  : String(referralDueSheet.document)
                : undefined;

              const remarks = referralDueSheet?.remarks
                ? String(referralDueSheet.remarks)
                : undefined;

              await createOrderDueSheet({
                order: newOrderId,
                ...(docId ? { document: docId } : {}),
                ...(remarks ? { remarks } : {}),
              }).unwrap();
            }

            toast.success(
              `Copied referral order approvals (Admin, Due Sheet, Finance, Account) to new order ${
                info.orderNo || newOrderId
              }.`,
            );
          } catch (approvalErr) {
            toast.error(
              mutationRejectedMessage(approvalErr) ||
                "New order created, but failed to copy referral order approvals.",
            );
          }
        }
      }

      // Resolve unbilled tracking row
      if (source?.unbilledId && newOrderId) {
        try {
          await patchUnbilledOrder({
            id: source.unbilledId,
            patch: {
              status: "resolved",
              replacement_order: newOrderId,
              remarks: `Resolved by creating replacement order ${
                info.orderNo || newOrderId
              } from unbilled ${source.orderNo}`,
            },
          }).unwrap();
          toast.success(
            `Unbilled order ${source.orderNo} resolved against new order ${
              info.orderNo || newOrderId
            }`,
          );
        } catch (rejected) {
          toast.error(
            mutationRejectedMessage(rejected) ||
              "New order created, but failed to resolve the unbilled tracking row.",
          );
        }
      }

      void unbilledQ.refetch();
    },
    [
      createTarget,
      referralOrderId,
      referralApprovalsQ.data,
      referralDueSheetsQ.data,
      onClose,
      createOrderApproval,
      patchOrderApproval,
      createOrderDueSheet,
      patchUnbilledOrder,
      unbilledQ,
    ],
  );

  return (
    <AdminCreateOrderPage
      asModal
      isOpen={Boolean(createTarget)}
      onClose={onClose}
      onCreated={handleCreated}
      portalHome={createOrderPortal}
      initialPartyId={createTarget?.partyId || ""}
      initialAssignedSalesUserId={createTarget?.salesUserId || ""}
      initialLinePrefills={createTarget?.linePrefills}
      modalSubtitle={
        createTarget
          ? `From unbilled order ${createTarget.orderNo} — party, sales rep, remaining items prefilled, and approvals copied.`
          : undefined
      }
    />
  );
}
