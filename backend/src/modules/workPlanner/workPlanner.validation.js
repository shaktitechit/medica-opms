/**
 * @fileoverview Work Planner request body validation guards.
 * @module modules/workPlanner/workPlanner.validation
 */
const mongoose = require('mongoose');
const { ApiError } = require('../../utils/ApiError');
const { PLAN_STATUSES, VISIT_STATUSES } = require('./workPlanner.constants');

function assertObjectId(value, field) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${field} ID format`);
  }
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
  if (body.sales_user) {
    assertObjectId(body.sales_user, 'sales_user');
  }
  if (body.status && !PLAN_STATUSES.includes(body.status)) {
    throw new ApiError(400, `status must be one of: ${PLAN_STATUSES.join(', ')}`);
  }
}

function assertUpdate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (body.plan_date !== undefined && isNaN(Date.parse(body.plan_date))) {
    throw new ApiError(400, 'Invalid plan_date format');
  }
  if (body.status !== undefined && !PLAN_STATUSES.includes(body.status)) {
    throw new ApiError(400, `status must be one of: ${PLAN_STATUSES.join(', ')}`);
  }
}

function assertVisitCreate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (!body.party) {
    throw new ApiError(400, 'party is required');
  }
  assertObjectId(body.party, 'party');
  if (body.sequence !== undefined) {
    const seq = Number(body.sequence);
    if (!Number.isInteger(seq) || seq < 1) {
      throw new ApiError(400, 'sequence must be a positive integer');
    }
  }
  if (body.planned_start_time && isNaN(Date.parse(body.planned_start_time))) {
    throw new ApiError(400, 'Invalid planned_start_time format');
  }
  if (body.planned_end_time && isNaN(Date.parse(body.planned_end_time))) {
    throw new ApiError(400, 'Invalid planned_end_time format');
  }
  if (body.status && !VISIT_STATUSES.includes(body.status)) {
    throw new ApiError(400, `status must be one of: ${VISIT_STATUSES.join(', ')}`);
  }
}

function assertVisitUpdate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (body.party !== undefined) {
    assertObjectId(body.party, 'party');
  }
  if (body.sequence !== undefined) {
    const seq = Number(body.sequence);
    if (!Number.isInteger(seq) || seq < 1) {
      throw new ApiError(400, 'sequence must be a positive integer');
    }
  }
  if (body.planned_start_time !== undefined && body.planned_start_time !== null) {
    if (isNaN(Date.parse(body.planned_start_time))) {
      throw new ApiError(400, 'Invalid planned_start_time format');
    }
  }
  if (body.planned_end_time !== undefined && body.planned_end_time !== null) {
    if (isNaN(Date.parse(body.planned_end_time))) {
      throw new ApiError(400, 'Invalid planned_end_time format');
    }
  }
  if (body.status !== undefined && !VISIT_STATUSES.includes(body.status)) {
    throw new ApiError(400, `status must be one of: ${VISIT_STATUSES.join(', ')}`);
  }
}

function assertReject(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (!body.rejection_reason || typeof body.rejection_reason !== 'string' || !body.rejection_reason.trim()) {
    throw new ApiError(400, 'rejection_reason is required');
  }
}

function assertCompleteVisit(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (!body.outcome || typeof body.outcome !== 'string' || !body.outcome.trim()) {
    throw new ApiError(400, 'outcome is required');
  }
  if (body.next_followup_date !== undefined && body.next_followup_date !== null) {
    if (isNaN(Date.parse(body.next_followup_date))) {
      throw new ApiError(400, 'Invalid next_followup_date format');
    }
  }
}

module.exports = {
  assertCreate,
  assertUpdate,
  assertVisitCreate,
  assertVisitUpdate,
  assertReject,
  assertCompleteVisit,
};
