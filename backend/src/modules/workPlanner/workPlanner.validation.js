/**
 * @fileoverview Work Planner request body validation guards.
 * @module modules/workPlanner/workPlanner.validation
 */
const mongoose = require('mongoose');
const { ApiError } = require('../../utils/ApiError');
const {
  PLAN_STATUSES,
  VISIT_STATUSES,
  VISIT_PARTY_TYPES,
  EXPENSE_CATEGORIES,
  TRAVEL_SUB_CATEGORIES,
  EXPENSE_PAYMENT_MODES,
} = require('./workPlanner.constants');

function assertObjectId(value, field) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${field} ID format`);
  }
}

function assertEmail(value, field = 'contact_email') {
  const email = typeof value === 'string' ? value.trim() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, `${field} must be a valid email`);
  }
}

function assertRequiredContactFields(body) {
  if (!body.party_name || !String(body.party_name).trim()) {
    throw new ApiError(400, 'party_name is required');
  }
  if (!body.contact_person || !String(body.contact_person).trim()) {
    throw new ApiError(400, 'contact_person is required');
  }
  if (!body.contact_number || !String(body.contact_number).trim()) {
    throw new ApiError(400, 'contact_number is required');
  }
  assertEmail(body.contact_email);
}

function normalizePartyType(body) {
  const raw = body?.party_type ? String(body.party_type).trim() : '';
  if (raw && VISIT_PARTY_TYPES.includes(raw)) return raw;
  if (body?.party) return 'existing';
  return '';
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
  const partyType = normalizePartyType(body);
  if (!partyType) {
    throw new ApiError(400, `party_type must be one of: ${VISIT_PARTY_TYPES.join(', ')}`);
  }
  if (partyType === 'existing') {
    if (!body.party) throw new ApiError(400, 'party is required for existing party visits');
    assertObjectId(body.party, 'party');
  } else if (body.party) {
    throw new ApiError(400, 'party must be omitted for new party / new lead visits');
  }
  assertRequiredContactFields(body);
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
  if (body.party_type !== undefined) {
    if (!VISIT_PARTY_TYPES.includes(String(body.party_type))) {
      throw new ApiError(400, `party_type must be one of: ${VISIT_PARTY_TYPES.join(', ')}`);
    }
  }
  const partyType = normalizePartyType(body);
  if (partyType === 'existing' || body.party !== undefined) {
    if (body.party !== undefined && body.party !== null && body.party !== '') {
      assertObjectId(body.party, 'party');
    }
  }
  if (body.party_name !== undefined && !String(body.party_name || '').trim()) {
    throw new ApiError(400, 'party_name is required');
  }
  if (body.contact_person !== undefined && !String(body.contact_person || '').trim()) {
    throw new ApiError(400, 'contact_person is required');
  }
  if (body.contact_number !== undefined && !String(body.contact_number || '').trim()) {
    throw new ApiError(400, 'contact_number is required');
  }
  if (body.contact_email !== undefined) {
    assertEmail(body.contact_email);
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

const COMPLETE_VISIT_YES_NO_FIELDS = [
  'meeting_with_doctor',
  'meeting_with_purchase',
  'meeting_with_finance',
  'meeting_with_engineer',
  'new_product_introduced',
  'order_received',
];

function assertCompleteVisit(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (!body.outcome || typeof body.outcome !== 'string' || !body.outcome.trim()) {
    throw new ApiError(400, 'outcome is required');
  }
  for (const key of COMPLETE_VISIT_YES_NO_FIELDS) {
    if (typeof body[key] !== 'boolean') {
      throw new ApiError(400, `${key} must be true or false`);
    }
  }
}

function assertScheduleNextVisit(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (!body.plan_date) {
    throw new ApiError(400, 'plan_date is required');
  }
  if (isNaN(Date.parse(body.plan_date))) {
    throw new ApiError(400, 'Invalid plan_date format');
  }
}

function assertExpenseCreate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (!body.expense_date) {
    throw new ApiError(400, 'expense_date is required');
  }
  if (isNaN(Date.parse(body.expense_date))) {
    throw new ApiError(400, 'Invalid expense_date format');
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ApiError(400, 'amount must be a non-negative number');
  }
  const category = String(body.category || '').trim();
  if (!EXPENSE_CATEGORIES.includes(category)) {
    throw new ApiError(400, `category must be one of: ${EXPENSE_CATEGORIES.join(', ')}`);
  }
  if (category === 'Travel') {
    const sub = String(body.sub_category || '').trim();
    if (!TRAVEL_SUB_CATEGORIES.includes(sub)) {
      throw new ApiError(
        400,
        `sub_category must be one of: ${TRAVEL_SUB_CATEGORIES.join(', ')} when category is Travel`,
      );
    }
  }
  const mode = String(body.payment_mode || '').trim();
  if (!EXPENSE_PAYMENT_MODES.includes(mode)) {
    throw new ApiError(400, `payment_mode must be one of: ${EXPENSE_PAYMENT_MODES.join(', ')}`);
  }
  if (body.work_plan_visit) {
    assertObjectId(body.work_plan_visit, 'work_plan_visit');
  }
  if (body.bill_date !== undefined && body.bill_date !== null && body.bill_date !== '') {
    if (isNaN(Date.parse(body.bill_date))) {
      throw new ApiError(400, 'Invalid bill_date format');
    }
  }
  if (body.receipt_attachment) {
    assertObjectId(body.receipt_attachment, 'receipt_attachment');
  }
}

function assertExpenseUpdate(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body required');
  }
  if (body.expense_date !== undefined && isNaN(Date.parse(body.expense_date))) {
    throw new ApiError(400, 'Invalid expense_date format');
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ApiError(400, 'amount must be a non-negative number');
    }
  }
  if (body.category !== undefined) {
    const category = String(body.category || '').trim();
    if (!EXPENSE_CATEGORIES.includes(category)) {
      throw new ApiError(400, `category must be one of: ${EXPENSE_CATEGORIES.join(', ')}`);
    }
    if (category === 'Travel') {
      const sub = String(body.sub_category || '').trim();
      if (!TRAVEL_SUB_CATEGORIES.includes(sub)) {
        throw new ApiError(
          400,
          `sub_category must be one of: ${TRAVEL_SUB_CATEGORIES.join(', ')} when category is Travel`,
        );
      }
    }
  }
  if (body.payment_mode !== undefined) {
    const mode = String(body.payment_mode).trim();
    if (!EXPENSE_PAYMENT_MODES.includes(mode)) {
      throw new ApiError(400, `payment_mode must be one of: ${EXPENSE_PAYMENT_MODES.join(', ')}`);
    }
  }
  if (body.work_plan_visit !== undefined && body.work_plan_visit !== null && body.work_plan_visit !== '') {
    assertObjectId(body.work_plan_visit, 'work_plan_visit');
  }
  if (body.bill_date !== undefined && body.bill_date !== null && body.bill_date !== '') {
    if (isNaN(Date.parse(body.bill_date))) {
      throw new ApiError(400, 'Invalid bill_date format');
    }
  }
  if (
    body.receipt_attachment !== undefined &&
    body.receipt_attachment !== null &&
    body.receipt_attachment !== ''
  ) {
    assertObjectId(body.receipt_attachment, 'receipt_attachment');
  }
}

module.exports = {
  assertCreate,
  assertUpdate,
  assertVisitCreate,
  assertVisitUpdate,
  assertReject,
  assertCompleteVisit,
  assertScheduleNextVisit,
  assertExpenseCreate,
  assertExpenseUpdate,
};
