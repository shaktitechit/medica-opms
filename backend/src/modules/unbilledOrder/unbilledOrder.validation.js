/**
 * @fileoverview Unbilled order request validation.
 * @module modules/unbilledOrder/unbilledOrder.validation
 */
const mongoose = require('mongoose');
const { ApiError } = require('../../utils/ApiError');
const {
  UNBILLED_ORDER_STATUS_VALUES,
  normalizeUnbilledOrderStatus,
} = require('./unbilledOrder.constants');

function assertObjectId(value, label) {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
    throw new ApiError(400, `Invalid ${label}`);
  }
}

function assertCreate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  assertObjectId(body.order, 'order');
  if (body.status != null && body.status !== '') {
    const status = String(body.status).trim().toLowerCase();
    if (!UNBILLED_ORDER_STATUS_VALUES.includes(status)) {
      throw new ApiError(400, `status must be one of: ${UNBILLED_ORDER_STATUS_VALUES.join(', ')}`);
    }
  }
}

function assertPatch(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (body.status != null && body.status !== '') {
    normalizeUnbilledOrderStatus(body.status);
    const status = String(body.status).trim().toLowerCase();
    if (!UNBILLED_ORDER_STATUS_VALUES.includes(status)) {
      throw new ApiError(400, `status must be one of: ${UNBILLED_ORDER_STATUS_VALUES.join(', ')}`);
    }
  }
  if (body.replacement_order != null && body.replacement_order !== '') {
    assertObjectId(body.replacement_order, 'replacement_order');
  }
}

module.exports = {
  assertCreate,
  assertPatch,
};
