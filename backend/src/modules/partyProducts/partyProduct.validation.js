/**
 * @fileoverview Party Product and Rates: request body validation.
 * @module modules/partyProducts/partyProduct.validation
 */
const { ApiError } = require('../../utils/ApiError');
const mongoose = require('mongoose');

const RATE_TYPES = new Set(['SR', 'SSR', 'CR']);
const RATE_STATUSES = new Set(['draft', 'active', 'expired', 'cancelled']);

function assertCreate(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');

  // Validate Mapping
  if (!body.party) throw new ApiError(400, 'party (ObjectId) is required');
  if (!mongoose.Types.ObjectId.isValid(body.party)) {
    throw new ApiError(400, 'Invalid party ObjectId');
  }

  if (!body.product) throw new ApiError(400, 'product (ObjectId) is required');
  if (!mongoose.Types.ObjectId.isValid(body.product)) {
    throw new ApiError(400, 'Invalid product ObjectId');
  }

  if (body.priority !== undefined && body.priority !== null && body.priority !== '') {
    const p = Number(body.priority);
    if (!Number.isFinite(p)) throw new ApiError(400, 'mapping priority must be a number');
  }

  // Validate Rates Array if provided
  if (body.rates !== undefined) {
    if (!Array.isArray(body.rates)) {
      throw new ApiError(400, 'rates must be an array');
    }

    for (let i = 0; i < body.rates.length; i++) {
      const rateObj = body.rates[i];
      assertRateFields(rateObj, `rates[${i}]`);
    }
  }
}

function assertCreateRate(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');

  if (!body.mapping) throw new ApiError(400, 'mapping (ObjectId) is required');
  if (!mongoose.Types.ObjectId.isValid(body.mapping)) {
    throw new ApiError(400, 'Invalid mapping ObjectId');
  }

  if (!body.party) throw new ApiError(400, 'party (ObjectId) is required');
  if (!mongoose.Types.ObjectId.isValid(body.party)) {
    throw new ApiError(400, 'Invalid party ObjectId');
  }

  if (!body.product) throw new ApiError(400, 'product (ObjectId) is required');
  if (!mongoose.Types.ObjectId.isValid(body.product)) {
    throw new ApiError(400, 'Invalid product ObjectId');
  }

  assertRateFields(body);
}

function assertRateFields(rateObj, prefix = 'Rate') {
  if (!rateObj || typeof rateObj !== 'object') {
    throw new ApiError(400, `${prefix} body is required`);
  }

  // rate_type
  if (!rateObj.rate_type) throw new ApiError(400, `${prefix} rate_type is required`);
  if (!RATE_TYPES.has(rateObj.rate_type)) {
    throw new ApiError(400, `Invalid ${prefix} rate_type. Must be SR, SSR, or CR`);
  }

  // rate
  if (rateObj.rate === undefined || rateObj.rate === null || rateObj.rate === '') {
    throw new ApiError(400, `${prefix} rate is required`);
  }
  const r = Number(rateObj.rate);
  if (!Number.isFinite(r) || r < 0) {
    throw new ApiError(400, `${prefix} rate must be a non-negative number`);
  }

  // validity_start
  if (!rateObj.validity_start) throw new ApiError(400, `${prefix} validity_start is required`);
  const dStart = new Date(rateObj.validity_start);
  if (isNaN(dStart.getTime())) {
    throw new ApiError(400, `Invalid ${prefix} validity_start date format`);
  }

  // validity_end
  if (!rateObj.validity_end) throw new ApiError(400, `${prefix} validity_end is required`);
  const dEnd = new Date(rateObj.validity_end);
  if (isNaN(dEnd.getTime())) {
    throw new ApiError(400, `Invalid ${prefix} validity_end date format`);
  }

  if (dStart >= dEnd) {
    throw new ApiError(400, `${prefix} validity_start must be before validity_end`);
  }

  // priority
  if (rateObj.priority !== undefined && rateObj.priority !== null && rateObj.priority !== '') {
    const p = Number(rateObj.priority);
    if (!Number.isFinite(p)) throw new ApiError(400, `${prefix} priority must be a number`);
  }

  // min_qty
  if (rateObj.min_qty !== undefined && rateObj.min_qty !== null && rateObj.min_qty !== '') {
    const mq = Number(rateObj.min_qty);
    if (!Number.isFinite(mq) || mq < 1) throw new ApiError(400, `${prefix} min_qty must be >= 1`);
  }

  // max_qty
  if (rateObj.max_qty !== undefined && rateObj.max_qty !== null && rateObj.max_qty !== '') {
    const mq = Number(rateObj.max_qty);
    if (!Number.isFinite(mq)) throw new ApiError(400, `${prefix} max_qty must be a number`);
  }

  // status
  if (rateObj.status !== undefined && rateObj.status !== null) {
    if (!RATE_STATUSES.has(rateObj.status)) {
      throw new ApiError(400, `Invalid ${prefix} status`);
    }
  }
}

module.exports = {
  assertCreate,
  assertCreateRate,
  RATE_TYPES,
  RATE_STATUSES,
};
