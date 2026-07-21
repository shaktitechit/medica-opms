/**
 * @fileoverview Order workflow engine backed by OrderWorkflow history.
 * @module modules/workflow/workflow.service
 */
const mongoose = require('mongoose');
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const rules = require('./workflow.rules');
const activityService = require('../activity/activity.service');
const notificationService = require('../notifications/notification.service');
const flagService = require('../flags/flag.service');
const workflowQueue = require('../../queues/workflow.queue');
const {
  WORKFLOW_JOB_TYPES,
  ORDER_STATUS,
  transitionSpec,
  workflowActionLabel,
  deriveOrderPatches,
  currentOrderStatus,
  normalizeOrderStatus,
  normalizeWorkflowStageValue,
} = require('./workflow.constants');
const { ORDER_LIFECYCLE_STATUS, ORDER_WORKFLOW_STAGE, normalizeOrderWorkflowFields } = require('../orders/order.constants');

function workflowRole(department) {
  return ['sales', 'admin', 'super_admin', 'finance', 'account', 'dispatch'].includes(department)
    ? (department === 'super_admin' ? 'admin' : department)
    : 'admin';
}

function currentLegacyStatus(order) {
  return currentOrderStatus(order);
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

      const requestedStatus = String(nextStatus);
      const canonicalStatus = normalizeOrderStatus(requestedStatus);
      const fromStatus = currentOrderStatus(doc);
      const fromCanonical = normalizeOrderStatus(fromStatus);

      if (fromCanonical === canonicalStatus) {
        const isLegacyRefinement = (
          requestedStatus !== String(doc.status || '')
          && ['fully_finance_approved', 'partially_finance_approved', 'fully_account_approved', 'partially_account_approved'].includes(requestedStatus)
        );
        const needsSettlementClose =
          canonicalStatus === ORDER_STATUS.CLOSED
          && (
            !doc.closed_at
            || String(doc.status || '') !== ORDER_STATUS.CLOSED
            || doc.lifecycle_status !== ORDER_LIFECYCLE_STATUS.FULFILLED
            || doc.workflow_stage !== ORDER_WORKFLOW_STAGE.COMPLETED
          );
        if (!isLegacyRefinement && !( _systemCall && needsSettlementClose)) {
          if (_systemCall) {
            normalizeOrderWorkflowFields(doc);
            if (doc.isModified()) {
              await doc.save({ session });
            }
            finalOrder = toPlain(doc.toObject());
            return;
          }
          if (normalizeOrderStatus(doc.status) === canonicalStatus && requestedStatus === String(doc.status || '')) {
            throw new ApiError(400, 'Order is already in this status');
          }
        }
      }

      if (!_systemCall && !rules.isTransitionAllowed(fromCanonical, canonicalStatus)) {
        throw new ApiError(400, `Transition from "${fromStatus}" to "${requestedStatus}" is not allowed`);
      }
      if (!_systemCall && !rules.departmentAllowsTransition(actorDept, fromCanonical, canonicalStatus)) {
        throw new ApiError(403, 'Your department cannot perform this transition', {
          department: actorDept,
          order_status: fromStatus,
          next_status: requestedStatus,
        });
      }

      const lifecycleLockStatuses = new Set([
        ORDER_STATUS.ON_HOLD,
        ORDER_STATUS.CANCELLED,
        ORDER_STATUS.FINANCE_REJECTED,
        ORDER_STATUS.ACCOUNT_REJECTED,
      ]);
      if (!_systemCall && lifecycleLockStatuses.has(canonicalStatus)) {
        const submittedDispatch = await OrderDispatch.findOne({
          order: orderId,
          deletedAt: null,
          dispatch_status: { $in: ['submitted', 'transport_created'] },
        })
          .session(session)
          .select('_id dispatch_status')
          .lean();
        if (submittedDispatch) {
          throw new ApiError(
            409,
            'Cannot hold, cancel, or reject an order after a dispatch batch has been created and submitted',
            {
              dispatch_id: String(submittedDispatch._id),
              dispatch_status: submittedDispatch.dispatch_status,
            },
          );
        }
      }

      if (canonicalStatus === ORDER_STATUS.FINANCE_REJECTED) {
        const reason = rejectionReason ?? remarks;
        if (!reason || !String(reason).trim()) {
          throw new ApiError(400, 'Finance rejection must include rejection_reason');
        }
      }

      const blockingFlags = await OrderFlag.find({
        order: orderId,
        status: 'open',
        blocks_order: true,
      }).session(session).lean();

      for (const flag of blockingFlags) {
        if (rules.flagBlocksTransition(flag.flag_type, canonicalStatus)) {
          throw new ApiError(409, `Open blocking flag "${flag.flag_type}" prevents this transition`);
        }
      }

      const spec = transitionSpec(requestedStatus);
      const previousStage = normalizeWorkflowStageValue(doc.workflow_stage);
      const patches = deriveOrderPatches(requestedStatus, spec.canonicalStatus);

      doc.status = spec.canonicalStatus;
      doc.lifecycle_status = spec.lifecycle_status;
      doc.workflow_stage = spec.workflow_stage;
      doc.current_action = patches.current_action || spec.current_action;
      doc.current_revision = Number(doc.current_revision || 1) + 1;
      doc.updated_by = userId;
      if (spec.dispatch_status) doc.dispatch_status = spec.dispatch_status;
      if (spec.delivery_status) doc.delivery_status = spec.delivery_status;
      if (patches.dispatch_status) doc.dispatch_status = patches.dispatch_status;
      if (patches.finance_approval_status) doc.finance_approval_status = patches.finance_approval_status;
      if (patches.account_approval_status) doc.account_approval_status = patches.account_approval_status;
      if (patches.pending_with_role) doc.pending_with_role = patches.pending_with_role;
      if (patches.current_department) doc.current_department = patches.current_department;
      if (remarks !== undefined) doc.remarks = remarks;

      if (canonicalStatus === ORDER_STATUS.CLOSED) {
        if (!doc.closed_at) doc.closed_at = new Date();
        doc.closed_by = userId;
        doc.is_locked = true;
        if (remarks) {
          doc.closure_remarks = String(remarks).trim();
        }
      }

      await doc.save({ session });

      if (canonicalStatus === ORDER_STATUS.CANCELLED) {
        await OrderDispatch.updateMany(
          { order: orderId, dispatch_status: { $ne: 'cancelled' }, deletedAt: null },
          { $set: { dispatch_status: 'cancelled' } },
          { session },
        );
      }

      if (canonicalStatus === ORDER_STATUS.DELIVERED) {
        await TransportShipment.updateMany(
          { order: orderId, shipment_status: { $nin: ['delivered', 'delivery_failed', 'returned'] }, deletedAt: null },
          { $set: { shipment_status: 'delivered', actual_delivery_date: new Date() } },
          { session },
        );
      } else if (canonicalStatus === ORDER_STATUS.IN_TRANSIT) {
        await TransportShipment.updateMany(
          { order: orderId, shipment_status: { $nin: ['delivered', 'delivery_failed', 'returned', 'in_transit'] }, deletedAt: null },
          { $set: { shipment_status: 'in_transit' } },
          { session },
        );
      }

      await OrderWorkflow.create(
        [
          {
            order: orderId,
            action_by: userId,
            role: workflowRole(actorDept),
            action: workflowActionLabel(requestedStatus, spec),
            from_stage: previousStage,
            to_stage: spec.workflow_stage,
            from_status: fromStatus,
            to_status: spec.canonicalStatus,
            reason_code: rejectionReason ? 'rejection' : undefined,
            remarks: remarks || '',
            revision_number: doc.current_revision,
            ip_address: ipAddress,
            user_agent: userAgent,
            metadata: {
              requested_status: requestedStatus,
              canonical_status: spec.canonicalStatus,
            },
          },
        ],
        { session },
      );

      await OrderStatusHistory.create(
        [
          {
            order: orderId,
            from_status: fromStatus,
            to_status: spec.canonicalStatus,
            changed_by: userId,
            remarks: remarks || '',
          },
        ],
        { session },
      );

      await activityService.create(
        {
          actor: userId,
          entity_type: 'order',
          entity_id: orderId,
          action: 'status_changed',
          message: `Order moved ${fromStatus} -> ${spec.canonicalStatus}`,
          old_value: { status: fromStatus },
          new_value: {
            status: spec.canonicalStatus,
            requested_status: requestedStatus,
            workflow_stage: spec.workflow_stage,
            lifecycle_status: spec.lifecycle_status,
          },
          ip_address: ipAddress,
          user_agent: userAgent,
        },
        { session },
      );

      const latestOrder = await Order.findById(orderId).session(session).lean();
      finalOrder = latestOrder ? toPlain(latestOrder) : null;
      notificationPayload = {
        order: finalOrder,
        fromStatus,
        nextStatus: spec.canonicalStatus,
        actorId: userId,
      };
    });

    if (notificationPayload) {
      await notificationService.notifyOrderTransition(notificationPayload);
    }

    await workflowQueue.enqueuePostTransition({
      orderId: params.orderId,
      fromStatus: notificationPayload?.fromStatus,
      nextStatus: notificationPayload?.nextStatus,
      actorId: params.userId,
    });

    return finalOrder;
  } finally {
    session.endSession();
  }
}

async function processWorkflowJob({ type, payload = {} }) {
  switch (type) {
    case 'submit_transition': {
      const orderId = payload.orderId;
      if (!orderId) throw new Error('submit_transition requires orderId');
      await transitionOrderStatus({
        orderId,
        nextStatus: ORDER_STATUS.SUBMITTED,
        userId: payload.userId,
        remarks: payload.remarks,
        ip_address: payload.ip_address,
        user_agent: payload.user_agent,
      });
      return { orderId };
    }
    case WORKFLOW_JOB_TYPES.RECOMPUTE_FLAG_AGGREGATES: {
      const orderId = payload.orderId;
      if (!orderId) throw new Error('recompute_flag_aggregates requires orderId');
      await flagService.recomputeOrderFlagAggregates(orderId);
      return { orderId };
    }
    case WORKFLOW_JOB_TYPES.POST_TRANSITION: {
      const orderId = payload.orderId;
      if (!orderId) throw new Error('post_transition requires orderId');
      const nextStatus = payload.nextStatus ? String(payload.nextStatus) : '';

      if (nextStatus === ORDER_STATUS.CLOSED || nextStatus === 'closed') {
        const { Order } = getModels();
        const existing = await Order.findById(orderId).lean();
        const alreadyClosed =
          String(existing?.status || '') === ORDER_STATUS.CLOSED || Boolean(existing?.closed_at);
        if (!alreadyClosed) {
          await transitionOrderStatus({
            orderId,
            nextStatus: ORDER_STATUS.CLOSED,
            userId: payload.actorId,
            remarks: payload.remarks || '',
            _systemCall: true,
          });
        }
      }

      await flagService.recomputeOrderFlagAggregates(orderId);
      return {
        orderId,
        fromStatus: payload.fromStatus,
        nextStatus: payload.nextStatus,
        actorId: payload.actorId,
      };
    }
    default:
      throw new Error(`Unknown workflow job type: ${type}`);
  }
}

module.exports = {
  transitionOrderStatus,
  currentLegacyStatus,
  currentOrderStatus,
  processWorkflowJob,
};
