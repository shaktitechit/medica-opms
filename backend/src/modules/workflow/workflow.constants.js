/**
 * @fileoverview Workflow enums, legacy normalization, and transition specs.
 * Aligned with models/Order.js and models/OrderWorkflow.js
 * @module modules/workflow/workflow.constants
 */

const { ApiError } = require('../../utils/ApiError');
const {
  ORDER_STATUS,
  ORDER_WORKFLOW_STAGE,
  ORDER_LIFECYCLE_STATUS,
  APPROVAL_STATUS,
  normalizeWorkflowStage,
} = require('../orders/order.constants');

const WORKFLOW_JOB_TYPES = Object.freeze({
  RECOMPUTE_FLAG_AGGREGATES: 'recompute_flag_aggregates',
  POST_TRANSITION: 'post_transition',
});

/** Map legacy queue statuses to canonical ORDER_STATUS. */
const LEGACY_STATUS_ALIASES = Object.freeze({
  partially_finance_approved: ORDER_STATUS.FINANCE_APPROVED,
  fully_finance_approved: ORDER_STATUS.FINANCE_APPROVED,
  partially_account_approved: ORDER_STATUS.ACCOUNT_APPROVED,
  fully_account_approved: ORDER_STATUS.ACCOUNT_APPROVED,
  dispatch_pending: ORDER_STATUS.DISPATCH,
  partial_dispatch_created: ORDER_STATUS.DISPATCH,
  full_dispatch_created: ORDER_STATUS.DISPATCH,
  transport_pending: ORDER_STATUS.IN_TRANSIT,
  transport_assigned: ORDER_STATUS.IN_TRANSIT,
  partially_transported: ORDER_STATUS.IN_TRANSIT,
  fully_transported: ORDER_STATUS.IN_TRANSIT,
  hold: ORDER_STATUS.ON_HOLD,
});

const STATUS_TO_WORKFLOW = Object.freeze({
  [ORDER_STATUS.DRAFT]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.DRAFT,
    workflow_stage: ORDER_WORKFLOW_STAGE.SALES,
    current_action: 'drafted',
  },
  [ORDER_STATUS.SUBMITTED]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.ACTIVE,
    workflow_stage: ORDER_WORKFLOW_STAGE.ADMIN_REVIEW,
    current_action: 'submitted',
  },
  [ORDER_STATUS.SALES_APPROVED]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.ACTIVE,
    workflow_stage: ORDER_WORKFLOW_STAGE.FINANCE_REVIEW,
    current_action: 'sales_approved',
  },
  [ORDER_STATUS.FINANCE_REVIEW]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.ACTIVE,
    workflow_stage: ORDER_WORKFLOW_STAGE.FINANCE_REVIEW,
    current_action: 'finance_review',
  },
  [ORDER_STATUS.FINANCE_APPROVED]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.ACTIVE,
    workflow_stage: ORDER_WORKFLOW_STAGE.DISPATCH,
    current_action: 'finance_approved',
  },
  [ORDER_STATUS.FINANCE_REJECTED]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.ACTIVE,
    workflow_stage: ORDER_WORKFLOW_STAGE.SALES,
    current_action: 'finance_rejected',
  },
  [ORDER_STATUS.ACCOUNT_REVIEW]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.ACTIVE,
    workflow_stage: ORDER_WORKFLOW_STAGE.ACCOUNT_REVIEW,
    current_action: 'account_review',
  },
  [ORDER_STATUS.ACCOUNT_APPROVED]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.ACTIVE,
    workflow_stage: ORDER_WORKFLOW_STAGE.DISPATCH,
    current_action: 'account_approved',
  },
  [ORDER_STATUS.ACCOUNT_REJECTED]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.ACTIVE,
    workflow_stage: ORDER_WORKFLOW_STAGE.ACCOUNT_REVIEW,
    current_action: 'account_rejected',
  },
  [ORDER_STATUS.DISPATCH]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.PARTIALLY_FULFILLED,
    workflow_stage: ORDER_WORKFLOW_STAGE.DISPATCH,
    current_action: 'dispatch',
  },
  [ORDER_STATUS.IN_TRANSIT]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.PARTIALLY_FULFILLED,
    workflow_stage: ORDER_WORKFLOW_STAGE.DISPATCH,
    current_action: 'in_transit',
  },
  [ORDER_STATUS.DELIVERED]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.FULFILLED,
    workflow_stage: ORDER_WORKFLOW_STAGE.COMPLETED,
    current_action: 'delivered',
    delivery_status: 'completed',
  },
  [ORDER_STATUS.CLOSED]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.FULFILLED,
    workflow_stage: ORDER_WORKFLOW_STAGE.COMPLETED,
    current_action: 'closed',
    delivery_status: 'completed',
    dispatch_status: 'completed',
  },
  [ORDER_STATUS.CANCELLED]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.CANCELLED,
    workflow_stage: ORDER_WORKFLOW_STAGE.CANCELLED,
    current_action: 'cancelled',
  },
  [ORDER_STATUS.ON_HOLD]: {
    lifecycle_status: ORDER_LIFECYCLE_STATUS.ON_HOLD,
    workflow_stage: ORDER_WORKFLOW_STAGE.ON_HOLD,
    current_action: 'on_hold',
  },
});

function normalizeOrderStatus(status) {
  const raw = String(status || ORDER_STATUS.DRAFT);
  return LEGACY_STATUS_ALIASES[raw] || raw;
}

function transitionSpec(nextStatus) {
  const requestedStatus = String(nextStatus || '');
  const canonicalStatus = normalizeOrderStatus(requestedStatus);
  const spec = STATUS_TO_WORKFLOW[canonicalStatus];
  if (!spec) {
    throw new ApiError(400, `Unknown workflow status "${nextStatus}"`);
  }
  return {
    ...spec,
    canonicalStatus,
    requestedStatus,
  };
}

function workflowActionLabel(requestedStatus, spec) {
  const raw = String(requestedStatus || spec.current_action);
  if (LEGACY_STATUS_ALIASES[raw]) return raw;
  return spec.current_action;
}

function deriveOrderPatches(requestedStatus, canonicalStatus) {
  const patches = {};

  if (canonicalStatus === ORDER_STATUS.FINANCE_APPROVED) {
    if (requestedStatus === 'partially_finance_approved') {
      patches.finance_approval_status = APPROVAL_STATUS.PARTIAL;
      patches.current_action = 'finance_partial';
    } else {
      patches.finance_approval_status = APPROVAL_STATUS.APPROVED;
      patches.current_action = requestedStatus === 'fully_finance_approved'
        ? 'fully_finance_approved'
        : 'finance_approved';
    }
  }

  if (canonicalStatus === ORDER_STATUS.FINANCE_REJECTED) {
    patches.finance_approval_status = APPROVAL_STATUS.REJECTED;
  }

  if (canonicalStatus === ORDER_STATUS.ACCOUNT_APPROVED) {
    if (requestedStatus === 'partially_account_approved') {
      patches.account_approval_status = APPROVAL_STATUS.PARTIAL;
      patches.current_action = 'account_partial';
    } else {
      patches.account_approval_status = APPROVAL_STATUS.APPROVED;
      patches.current_action = requestedStatus === 'fully_account_approved'
        ? 'fully_account_approved'
        : 'account_approved';
    }
  }

  if (canonicalStatus === ORDER_STATUS.ACCOUNT_REJECTED) {
    patches.account_approval_status = APPROVAL_STATUS.REJECTED;
  }

  if (canonicalStatus === ORDER_STATUS.ACCOUNT_REVIEW) {
    patches.pending_with_role = 'account';
    patches.current_department = 'account';
  }

  if (canonicalStatus === ORDER_STATUS.DISPATCH) {
    if (['partial_dispatch_created', 'full_dispatch_created'].includes(requestedStatus)) {
      patches.dispatch_status = requestedStatus === 'full_dispatch_created' ? 'completed' : 'partial';
      patches.current_action = requestedStatus === 'full_dispatch_created' ? 'full_dispatch' : 'partial_dispatch';
    }
  }

  return patches;
}

function currentOrderStatus(order) {
  return normalizeOrderStatus(
    order?.status || order?.lifecycle_status || ORDER_STATUS.DRAFT,
  );
}

function normalizeWorkflowStageValue(stage) {
  return normalizeWorkflowStage(stage);
}

module.exports = {
  WORKFLOW_JOB_TYPES,
  LEGACY_STATUS_ALIASES,
  STATUS_TO_WORKFLOW,
  ORDER_STATUS,
  ORDER_WORKFLOW_STAGE,
  normalizeOrderStatus,
  transitionSpec,
  workflowActionLabel,
  deriveOrderPatches,
  currentOrderStatus,
  normalizeWorkflowStageValue,
};
