/**
 * List orders that have a current due sheet uploaded but OrderApproval
 * is still pending (admin / finance / account).
 *
 * Usage (from repo root or backend/):
 *   node backend/scripts/check-due-sheet-pending-approval.js
 *   node scripts/check-due-sheet-pending-approval.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { connect } = require('../src/config/db');
const { getModels } = require('../src/data/mongoRegistry');

function pendingStage(approval) {
  if (!approval) return 'no_approval_doc';
  if (approval.rejected_by || approval.rejection_reason) return 'rejected';
  if (!approval.is_admin_approved) return 'admin';
  if (!approval.is_finance_approved) return 'finance';
  if (!approval.is_account_approved) return 'account';
  return null;
}

connect()
  .then(async () => {
    const { Order, OrderDueSheet, OrderApproval } = getModels();

    const dueSheetOrderIds = await OrderDueSheet.distinct('order', {
      is_current: true,
      status: 'active',
      deletedAt: null,
    });

    const flagTrueOrderIds = await OrderApproval.distinct('order', {
      is_due_sheet_uploaded: true,
      deletedAt: null,
    });

    const uploadedIds = [
      ...new Set([
        ...dueSheetOrderIds.map(String),
        ...flagTrueOrderIds.map(String),
      ]),
    ];

    console.log(`Due sheets (current/active): ${dueSheetOrderIds.length}`);
    console.log(`Approvals with is_due_sheet_uploaded=true: ${flagTrueOrderIds.length}`);
    console.log(`Union uploaded order ids: ${uploadedIds.length}`);

    // Sync gap: physical due sheet exists but approval flag still false
    const sheetOnly = dueSheetOrderIds
      .map(String)
      .filter((id) => !flagTrueOrderIds.map(String).includes(id));

    if (sheetOnly.length) {
      console.log(
        `\n=== SYNC GAP: due sheet exists, is_due_sheet_uploaded still false (${sheetOnly.length}) ===`,
      );
      const gapApprovals = await OrderApproval.find({
        order: { $in: sheetOnly },
        deletedAt: null,
      })
        .select(
          'order approval_no is_due_sheet_uploaded is_admin_approved is_finance_approved is_account_approved',
        )
        .lean();
      const orders = await Order.find({ _id: { $in: sheetOnly }, deletedAt: null })
        .select('order_no status workflow_stage')
        .lean();
      const orderById = new Map(orders.map((o) => [String(o._id), o]));
      for (const a of gapApprovals) {
        const o = orderById.get(String(a.order));
        console.log({
          order_id: String(a.order),
          order_no: o?.order_no,
          status: o?.status,
          workflow_stage: o?.workflow_stage,
          approval_no: a.approval_no,
          is_due_sheet_uploaded: a.is_due_sheet_uploaded,
          pending: pendingStage(a),
        });
      }
      const withSheetNoApproval = sheetOnly.filter(
        (id) => !gapApprovals.some((a) => String(a.order) === id),
      );
      if (withSheetNoApproval.length) {
        console.log(
          `\nDue sheet present but no OrderApproval doc (${withSheetNoApproval.length}):`,
          withSheetNoApproval,
        );
      }
    } else {
      console.log('\nNo sync gap: every current due sheet has is_due_sheet_uploaded=true.');
    }

    // Uploaded + still pending any approval stage
    const approvals = await OrderApproval.find({
      order: { $in: uploadedIds },
      deletedAt: null,
      $or: [
        { is_admin_approved: false },
        { is_finance_approved: false },
        { is_account_approved: false },
      ],
    })
      .select(
        'order approval_no is_due_sheet_uploaded is_admin_approved is_finance_approved is_account_approved rejection_reason rejected_by',
      )
      .lean();

    const pending = approvals
      .map((a) => ({ ...a, pending: pendingStage(a) }))
      .filter((a) => a.pending && a.pending !== 'rejected');

    const orderIds = [...new Set(pending.map((a) => String(a.order)))];
    const orders = await Order.find({ _id: { $in: orderIds }, deletedAt: null })
      .select('order_no status workflow_stage admin_approval_status finance_approval_status')
      .lean();
    const orderById = new Map(orders.map((o) => [String(o._id), o]));

    const byStage = { admin: [], finance: [], account: [] };
    for (const a of pending) {
      const o = orderById.get(String(a.order));
      const row = {
        order_id: String(a.order),
        order_no: o?.order_no,
        status: o?.status,
        workflow_stage: o?.workflow_stage,
        approval_no: a.approval_no,
        is_due_sheet_uploaded: a.is_due_sheet_uploaded,
        pending: a.pending,
      };
      byStage[a.pending]?.push(row);
    }

    console.log(`\n=== UPLOADED DUE SHEET + STILL PENDING APPROVAL (${pending.length} approval docs / ${orderIds.length} orders) ===`);
    for (const stage of ['admin', 'finance', 'account']) {
      console.log(`\n-- pending ${stage}: ${byStage[stage].length}`);
      for (const row of byStage[stage].slice(0, 50)) {
        console.log(row);
      }
      if (byStage[stage].length > 50) {
        console.log(`... and ${byStage[stage].length - 50} more`);
      }
    }

    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
