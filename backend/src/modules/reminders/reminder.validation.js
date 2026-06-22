/**
 * @fileoverview Reminders: request body validation guards.
 * @module modules/reminders/reminder.validation
 */
const { ApiError } = require('../../utils/ApiError');
const mongoose = require('mongoose');

const REMINDER_TYPES = new Set(['payment', 'remarks', 'follow_up', 'other']);
const FOLLOWUP_STATUSES = new Set(['pending', 'completed', 'cancelled']);

function assertCreate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }

  if (!body.order) {
    throw new ApiError(400, 'order is required');
  }
  if (!mongoose.Types.ObjectId.isValid(body.order)) {
    throw new ApiError(400, 'Invalid order ID format');
  }

  if (!body.remarks || typeof body.remarks !== 'string' || !body.remarks.trim()) {
    throw new ApiError(400, 'remarks are required and must be a non-empty string');
  }

  if (!body.followup_date) {
    throw new ApiError(400, 'followup_date is required');
  }
  if (isNaN(Date.parse(body.followup_date))) {
    throw new ApiError(400, 'Invalid followup_date format');
  }

  if (body.reminder_type && !REMINDER_TYPES.has(body.reminder_type)) {
    throw new ApiError(400, `reminder_type must be one of: ${Array.from(REMINDER_TYPES).join(', ')}`);
  }
}

function assertAddFollowUp(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }

  if (!body.remarks || typeof body.remarks !== 'string' || !body.remarks.trim()) {
    throw new ApiError(400, 'remarks are required and must be a non-empty string');
  }

  if (!body.followup_date) {
    throw new ApiError(400, 'followup_date is required');
  }
  if (isNaN(Date.parse(body.followup_date))) {
    throw new ApiError(400, 'Invalid followup_date format');
  }

  if (body.status && !FOLLOWUP_STATUSES.has(body.status)) {
    throw new ApiError(400, `status must be one of: ${Array.from(FOLLOWUP_STATUSES).join(', ')}`);
  }
}

module.exports = { assertCreate, assertAddFollowUp };
