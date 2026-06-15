/**
 * @fileoverview Order workflow engine backed by OrderWorkflow history.
 */
const mongoose = require('mongoose');
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const rules = require('./workflow.rules');
const activityService = require('../activity/activity.service');
const notificationService = require('../notifications/notification.service');
const flagService = require('../flags/flag.service');
const fulfillmentService = require('../orders/orderFulfillment.service');

const LEGACY_STATUS_TO_WORKFLOW = Object.freeze({
  draft: { lifecycle_status: 'draft', workflow_stage: 'sales', current_action: 'drafted' },
  submitted: { lifecycle_status: 'active', workflow_stage: 'admin_review', current_action: 'submitted' },
  sales_approved: { lifecycle_status: 'active', workflow_stage: 'finance_review', current_action: 'approved' },
  finance_review: { lifecycle_status: 'active', workflow_stage: 'finance_review', current_action: 'review_requested' },
  finance_approved: { lifecycle_status: 'active', workflow_stage: 'dispatch_review', current_action: 'fully_approved' },
  partially_finance_approved: { lifecycle_status: 'active', workflow_stage: 'dispatch_review', current_action: 'partially_finance_approved' },
  fully_finance_approved: { lifecycle_status: 'active', workflow_stage: 'dispatch_review', current_action: 'fully_finance_approved' },
  finance_rejected: { lifecycle_status: 'active', workflow_stage: 'sales', current_action: 'rejected' },
  account_review: { lifecycle_status: 'active', workflow_stage: 'account_review', current_action: 'sent_to_account' },
  partially_account_approved: { lifecycle_status: 'active', workflow_stage: 'dispatch_review', current_action: 'partially_account_approved' },
  fully_account_approved: { lifecycle_status: 'active', workflow_stage: 'dispatch_review', current_action: 'fully_account_approved' },
  account_rejected: { lifecycle_status: 'active', workflow_stage: 'account_review', current_action: 'rejected' },
  dispatch_pending: { lifecycle_status: 'active', workflow_stage: 'dispatch_review', current_action: 'sent_to_dispatch' },
  partial_dispatch_created: {
    lifecycle_status: 'partially_fulfilled',
    workflow_stage: 'dispatch_execution',
    current_action: 'partial_dispatch',
    dispatch_status: 'partial',
  },
  full_dispatch_created: {
    lifecycle_status: 'partially_fulfilled',
    workflow_stage: 'dispatch_execution',
    current_action: 'full_dispatch',
    dispatch_status: 'completed',
  },
  transport_pending: { lifecycle_status: 'partially_fulfilled', workflow_stage: 'dispatch_execution', current_action: 'partially_transported' },
  transport_assigned: { lifecycle_status: 'partially_fulfilled', workflow_stage: 'dispatch_execution', current_action: 'partially_transported' },
  partially_transported: { lifecycle_status: 'partially_fulfilled', workflow_stage: 'dispatch_execution', current_action: 'partially_transported' },
  fully_transported: { lifecycle_status: 'partially_fulfilled', workflow_stage: 'dispatch_execution', current_action: 'fully_transported' },
  in_transit: { lifecycle_status: 'partially_fulfilled', workflow_stage: 'dispatch_execution', current_action: 'in_transit' },
  delivered: {
    lifecycle_status: 'fulfilled',
    workflow_stage: 'completed',
    current_action: 'delivered',
    delivery_status: 'completed',
  },
  cancelled: { lifecycle_status: 'cancelled', workflow_stage: 'cancelled', current_action: 'cancelled' },
  on_hold: { lifecycle_status: 'on_hold', workflow_stage: 'hold', current_action: 'hold' },
});

const ACTION_TO_LEGACY_STATUS = Object.freeze({
  drafted: 'draft',
  submitted: 'submitted',
  approved: 'sales_approved',
  review_requested: 'finance_review',
  fully_approved: 'finance_approved',
  partially_finance_approved: 'partially_finance_approved',
  fully_finance_approved: 'fully_finance_approved',
  sent_to_account: 'account_review',
  partially_account_approved: 'partially_account_approved',
  fully_account_approved: 'fully_account_approved',
  rejected: 'finance_rejected',
  sent_to_dispatch: 'dispatch_pending',
  partial_dispatch: 'partial_dispatch_created',
  full_dispatch: 'full_dispatch_created',
  partially_transported: 'partially_transported',
  fully_transported: 'fully_transported',
  transporter_assigned: 'transport_assigned',
  vehicle_assigned: 'transport_assigned',
  picked_up: 'in_transit',
  in_transit: 'in_transit',
  out_for_delivery: 'in_transit',
  delivered: 'delivered',
  cancelled: 'cancelled',
  hold: 'on_hold',
});

function currentLegacyStatus(order) {
  return order.status || ACTION_TO_LEGACY_STATUS[order.current_action] || order.lifecycle_status || 'draft';
}

function transitionSpec(nextStatus) {
  const spec = LEGACY_STATUS_TO_WORKFLOW[nextStatus] || null;
  if (!spec) throw new ApiError(400, `Unknown workflow status "${nextStatus}"`);
  return spec;
}

function workflowRole(department) {
  return ['sales', 'admin', 'super_admin', 'finance', 'account', 'dispatch'].includes(department) ? (department === 'super_admin' ? 'admin' : department) : 'admin';
}

async function transitionOrderStatus(params) {
  const session = await mongoose.startSession();
  let finalOrder = null;
  let notificationPayload = null;

  try {
    await session.withTransaction(async () => {
      const {
        orderId,
        nextStatus,
        userId,
        remarks,
        rejectionReason,
        ip_address: ipAddress,
        user_agent: userAgent,
        _systemCall,
      } = params;

      const {
        User,
        Order,
        OrderFlag,
        OrderStatusHistory,
        OrderWorkflow,
        OrderDispatch,
        TransportShipment,
      } = getModels();

      const actor = await User.findOne({ _id: userId, is_active: { $ne: false } }).session(session).lean();
      const user = actor ? toPlain(actor) : null;
      if (!user || !user.is_active) throw new ApiError(401, 'Unauthorized');

      const actorDept = rules.normalizeDepartment(user.department);
      if (!actorDept && !_systemCall) {
        throw new ApiError(400, 'Your user record has no usable department; assign department before using workflow transitions.');
      }

      const doc = await Order.findById(orderId).session(session);
      if (!doc) throw new ApiError(404, 'Order not found');

      const fromStatus = currentLegacyStatus(doc);
      if (fromStatus === nextStatus) {
        if (_systemCall) {
          finalOrder = toPlain(doc.toObject());
          return;
        }
        throw new ApiError(400, 'Order is already in this status');
      }

      if (!_systemCall && !rules.isTransitionAllowed(fromStatus, nextStatus)) {
        throw new ApiError(400, `Transition from "${fromStatus}" to "${nextStatus}" is not allowed`);
      }
      if (!_systemCall && !rules.departmentAllowsTransition(actorDept, fromStatus, nextStatus)) {
        throw new ApiError(403, 'Your department cannot perform this transition', {
          department: actorDept,
          order_status: fromStatus,
          next_status: nextStatus,
        });
      }

      if (nextStatus === 'finance_rejected') {
        const reason = rejectionReason ?? remarks;
        if (!reason || !String(reason).trim()) throw new ApiError(400, 'Finance rejection must include rejection_reason');
      }

      const blockingFlags = await OrderFlag.find({
        order: orderId,
        status: 'open',
        blocks_order: true,
      }).session(session).lean();

      for (const flag of blockingFlags) {
        if (rules.flagBlocksTransition(flag.flag_type, nextStatus)) {
          throw new ApiError(409, `Open blocking flag "${flag.flag_type}" prevents this transition`);
        }
      }

      const spec = transitionSpec(nextStatus);
      const previousStage = doc.workflow_stage;
      doc.status = nextStatus;
      doc.lifecycle_status = spec.lifecycle_status;
      doc.workflow_stage = spec.workflow_stage;
      doc.current_action = spec.current_action;
      doc.current_revision = Number(doc.current_revision || 1) + 1;
      doc.updated_by = userId;
      if (spec.dispatch_status) doc.dispatch_status = spec.dispatch_status;
      if (spec.delivery_status) doc.delivery_status = spec.delivery_status;
      if (remarks !== undefined) doc.remarks = remarks;

      if (nextStatus === 'partially_finance_approved' || nextStatus === 'fully_finance_approved') {
        doc.finance_approval_status = nextStatus === 'fully_finance_approved' ? 'full' : 'partial';
        doc.workflow_stage = 'dispatch_review';
        doc.current_action = nextStatus === 'fully_finance_approved' ? 'fully_finance_approved' : 'partially_finance_approved';
      }
      if (nextStatus === 'finance_rejected') {
        doc.finance_approval_status = 'rejected';
      }
      if (nextStatus === 'partially_account_approved' || nextStatus === 'fully_account_approved') {
        doc.account_approval_status = nextStatus === 'fully_account_approved' ? 'full' : 'partial';
        doc.workflow_stage = 'dispatch_review';
        doc.current_action = nextStatus === 'fully_account_approved'
          ? 'fully_account_approved'
          : 'partially_account_approved';
      }
      if (nextStatus === 'account_rejected') {
        doc.account_approval_status = 'rejected';
      }
      if (nextStatus === 'account_review') {
        doc.workflow_stage = 'account_review';
        doc.current_action = 'sent_to_account';
        doc.pending_with_role = 'account';
        doc.current_department = 'account';
      }
      await doc.save({ session });

      if (nextStatus === 'cancelled') {
        await OrderDispatch.updateMany(
          { order: orderId, dispatch_status: { $ne: 'cancelled' }, deletedAt: null },
          { $set: { dispatch_status: 'cancelled' } },
          { session }
        );
      }

      if (nextStatus === 'delivered') {
        await TransportShipment.updateMany(
          { order: orderId, shipment_status: { $nin: ['delivered', 'delivery_failed', 'returned'] }, deletedAt: null },
          { $set: { shipment_status: 'delivered', actual_delivery_date: new Date() } },
          { session }
        );
      } else if (nextStatus === 'in_transit') {
        await TransportShipment.updateMany(
          { order: orderId, shipment_status: { $nin: ['delivered', 'delivery_failed', 'returned', 'in_transit'] }, deletedAt: null },
          { $set: { shipment_status: 'in_transit' } },
          { session }
        );
      }

      await OrderWorkflow.create(
        [
          {
            order: orderId,
            action_by: userId,
            role: workflowRole(actorDept),
            action: spec.current_action,
            from_stage: previousStage,
            to_stage: spec.workflow_stage,
            from_status: fromStatus,
            to_status: nextStatus,
            reason_code: rejectionReason ? 'rejection' : undefined,
            remarks: remarks || '',
            revision_number: doc.current_revision,
            ip_address: ipAddress,
            user_agent: userAgent,
          },
        ],
        { session }
      );

      await OrderStatusHistory.create(
        [
          {
            order: orderId,
            from_status: fromStatus,
            to_status: nextStatus,
            changed_by: userId,
            remarks: remarks || '',
          },
        ],
        { session }
      );

      await activityService.create(
        {
          actor: userId,
          entity_type: 'order',
          entity_id: orderId,
          action: 'status_changed',
          message: `Order moved ${fromStatus} -> ${nextStatus}`,
          old_value: { status: fromStatus },
          new_value: {
            status: nextStatus,
            workflow_stage: spec.workflow_stage,
            lifecycle_status: spec.lifecycle_status,
          },
          ip_address: ipAddress,
          user_agent: userAgent,
        },
        { session }
      );

      const latestOrder = await Order.findById(orderId).session(session).lean();
      finalOrder = latestOrder ? toPlain(latestOrder) : null;
      notificationPayload = {
        order: finalOrder,
        fromStatus,
        nextStatus,
        actorId: userId,
      };
    });

    if (notificationPayload) {
      await notificationService.notifyOrderTransition(notificationPayload);
    }
    await flagService.recomputeOrderFlagAggregates(params.orderId);

    return finalOrder;
  } finally {
    session.endSession();
  }
}

module.exports = {
  transitionOrderStatus,
  currentLegacyStatus,
};