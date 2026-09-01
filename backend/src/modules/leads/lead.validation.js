/**
 * @fileoverview Lead validation guards.
 * @module modules/leads/lead.validation
 */
const mongoose = require('mongoose');
const { ApiError } = require('../../utils/ApiError');
const {
  LEAD_STATUSES,
  LEAD_PRIORITIES,
  FOLLOWUP_TYPES,
  CONVERSION_TYPES,
} = require('./lead.constants');

function assertObjectId(value, fieldName = 'id') {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${fieldName} format`);
  }
}

function assertCreate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }
  if (!body.name || !String(body.name).trim()) {
    throw new ApiError(400, 'Lead contact name is required');
  }
  if (!body.phone && !body.email) {
    throw new ApiError(400, 'Either phone or email is required');
  }
  if (body.email && typeof body.email === 'string') {
    const trimmed = body.email.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new ApiError(400, 'Invalid email format');
    }
  }
  if (!body.source || !String(body.source).trim()) {
    throw new ApiError(400, 'Lead source is required');
  }
  if (body.priority && !LEAD_PRIORITIES.includes(body.priority)) {
    throw new ApiError(400, `Invalid priority. Must be one of: ${LEAD_PRIORITIES.join(', ')}`);
  }
  if (body.status && !LEAD_STATUSES.includes(body.status)) {
    throw new ApiError(400, `Invalid status. Must be one of: ${LEAD_STATUSES.join(', ')}`);
  }
  if (body.assigned_to) {
    assertObjectId(body.assigned_to, 'assigned_to');
  }
  if (body.party_id) {
    assertObjectId(body.party_id, 'party_id');
  }
}

function assertUpdate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }
  if (body.email && typeof body.email === 'string') {
    const trimmed = body.email.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new ApiError(400, 'Invalid email format');
    }
  }
  if (body.priority && !LEAD_PRIORITIES.includes(body.priority)) {
    throw new ApiError(400, `Invalid priority. Must be one of: ${LEAD_PRIORITIES.join(', ')}`);
  }
  if (body.assigned_to) {
    assertObjectId(body.assigned_to, 'assigned_to');
  }
  if (body.party_id) {
    assertObjectId(body.party_id, 'party_id');
  }
}

function assertAssign(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }
  if (!body.assigned_to) {
    throw new ApiError(400, 'assigned_to user ID is required');
  }
  assertObjectId(body.assigned_to, 'assigned_to');
}

function assertStatusChange(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }
  if (!body.status || !LEAD_STATUSES.includes(body.status)) {
    throw new ApiError(400, `Valid status is required. Options: ${LEAD_STATUSES.join(', ')}`);
  }
}

function assertMarkLost(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }
  if (!body.lost_reason || !String(body.lost_reason).trim()) {
    throw new ApiError(400, 'lost_reason is required when marking lead as lost');
  }
}

function assertQualify(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }
}

function assertConvert(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }
  const type = body.conversion_type || 'existing_customer';
  if (!CONVERSION_TYPES.includes(type)) {
    throw new ApiError(400, `Invalid conversion_type. Options: ${CONVERSION_TYPES.join(', ')}`);
  }
  if (type === 'existing_customer' && !body.party_id) {
    throw new ApiError(400, 'party_id is required when converting to existing customer');
  }
}

function assertFollowUpCreate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }
  if (!body.follow_up_date) {
    throw new ApiError(400, 'follow_up_date is required');
  }
  if (isNaN(Date.parse(body.follow_up_date))) {
    throw new ApiError(400, 'Invalid follow_up_date format');
  }
  if (body.type && !FOLLOWUP_TYPES.includes(body.type)) {
    throw new ApiError(400, `Invalid follow_up type. Options: ${FOLLOWUP_TYPES.join(', ')}`);
  }
}

function assertFollowUpComplete(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'Request body is required');
  }
  if (!body.outcome || !String(body.outcome).trim()) {
    throw new ApiError(400, 'Follow-up outcome is required to complete');
  }
}

module.exports = {
  assertObjectId,
  assertCreate,
  assertUpdate,
  assertAssign,
  assertStatusChange,
  assertMarkLost,
  assertQualify,
  assertConvert,
  assertFollowUpCreate,
  assertFollowUpComplete,
};
