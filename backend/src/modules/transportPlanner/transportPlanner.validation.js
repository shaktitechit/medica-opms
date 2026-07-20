/**
 * @fileoverview Transport Planner request body validation guards.
 * @module modules/transportPlanner/transportPlanner.validation
 */
const mongoose = require('mongoose');
const { ApiError } = require('../../utils/ApiError');
const { PLAN_STATUSES, PLAN_ORDER_STATUSES } = require('./transportPlanner.constants');

function assertObjectId(value, field) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${field} ID format`);
  }
}

/**
 * Normalize plan line payloads to `{ order_id, dispatch_id }[]`.
 * Accepts `items`, or legacy `order_ids` paired with `dispatch_ids`.
 */
function normalizePlanItems(body) {
  if (Array.isArray(body.items) && body.items.length > 0) {
    return body.items.map((item, i) => {
      if (!item || typeof item !== 'object') {
        throw new ApiError(400, `items[${i}] must be an object`);
      }
      const orderId = item.order_id || item.order;
      const dispatchId = item.dispatch_id || item.dispatch;
      if (!orderId) throw new ApiError(400, `items[${i}].order_id is required`);
      if (!dispatchId) throw new ApiError(400, `items[${i}].dispatch_id is required`);
      assertObjectId(orderId, `items[${i}].order_id`);
      assertObjectId(dispatchId, `items[${i}].dispatch_id`);
      return { order_id: String(orderId), dispatch_id: String(dispatchId) };
    });
  }

  if (Array.isArray(body.order_ids) && Array.isArray(body.dispatch_ids)) {
    if (body.order_ids.length !== body.dispatch_ids.length) {
      throw new ApiError(400, 'order_ids and dispatch_ids must be the same length');
    }
    return body.order_ids.map((orderId, i) => {
      assertObjectId(orderId, `order_ids[${i}]`);
      assertObjectId(body.dispatch_ids[i], `dispatch_ids[${i}]`);
      return { order_id: String(orderId), dispatch_id: String(body.dispatch_ids[i]) };
    });
  }

  return null;
}

function assertCreate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (!body.plan_date) {
    throw new ApiError(400, 'plan_date is required');
  }
  if (isNaN(Date.parse(body.plan_date))) {
    throw new ApiError(400, 'Invalid plan_date format');
  }
  if (!body.transport_agent) {
    throw new ApiError(400, 'transport_agent is required');
  }
  assertObjectId(body.transport_agent, 'transport_agent');
  if (body.status && !PLAN_STATUSES.includes(body.status)) {
    throw new ApiError(400, `status must be one of: ${PLAN_STATUSES.join(', ')}`);
  }
  const items = normalizePlanItems(body);
  if (items) body.items = items;
}

function assertUpdate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (body.plan_date !== undefined && isNaN(Date.parse(body.plan_date))) {
    throw new ApiError(400, 'Invalid plan_date format');
  }
  if (body.transport_agent !== undefined) {
    assertObjectId(body.transport_agent, 'transport_agent');
  }
  if (body.status !== undefined && !PLAN_STATUSES.includes(body.status)) {
    throw new ApiError(400, `status must be one of: ${PLAN_STATUSES.join(', ')}`);
  }
}

function assertAddOrders(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  const items = normalizePlanItems(body);
  if (!items || items.length === 0) {
    throw new ApiError(
      400,
      'items is required — each entry needs order_id and dispatch_id (partial OrderDispatch)'
    );
  }
  body.items = items;
}

function assertDispatchDetails(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (body.dispatch !== undefined && body.dispatch !== null) {
    assertObjectId(body.dispatch, 'dispatch');
  }
  if (body.dispatch_date !== undefined && body.dispatch_date !== null) {
    if (isNaN(Date.parse(body.dispatch_date))) {
      throw new ApiError(400, 'Invalid dispatch_date format');
    }
  }
  if (body.packages !== undefined && body.packages !== null) {
    const n = Number(body.packages);
    if (!Number.isFinite(n) || n < 0) {
      throw new ApiError(400, 'packages must be a non-negative number');
    }
  }
  if (body.weight !== undefined && body.weight !== null) {
    const n = Number(body.weight);
    if (!Number.isFinite(n) || n < 0) {
      throw new ApiError(400, 'weight must be a non-negative number');
    }
  }
  if (body.status !== undefined && !PLAN_ORDER_STATUSES.includes(body.status)) {
    throw new ApiError(400, `status must be one of: ${PLAN_ORDER_STATUSES.join(', ')}`);
  }
}

function assertCancel(body) {
  if (body && body.cancellation_reason !== undefined && typeof body.cancellation_reason !== 'string') {
    throw new ApiError(400, 'cancellation_reason must be a string');
  }
}

module.exports = {
  assertObjectId,
  assertCreate,
  assertUpdate,
  assertAddOrders,
  assertDispatchDetails,
  assertCancel,
  normalizePlanItems,
};
