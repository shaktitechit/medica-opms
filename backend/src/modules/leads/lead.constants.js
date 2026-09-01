/**
 * @fileoverview Lead Management constants, lifecycle transitions, enums and defaults.
 * @module modules/leads/lead.constants
 */

const LEAD_STATUSES = Object.freeze([
  'new',
  'assigned',
  'follow_up',
  'quotation',
  'won',
  'lost',
  'converted',
]);

const LEAD_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);

const FOLLOWUP_TYPES = Object.freeze([
  'call',
  'meeting',
  'email',
  'whatsapp',
  'visit',
  'demo',
  'other',
]);

const FOLLOWUP_STATUSES = Object.freeze([
  'pending',
  'completed',
  'cancelled',
  'rescheduled',
]);

const CONVERSION_TYPES = Object.freeze([
  'existing_customer',
  'new_customer',
  'quotation',
  'order',
]);

/**
 * Valid lifecycle transitions for standard sales workflows.
 * Admin and super_admin may override these transitions.
 */
const ALLOWED_STATUS_TRANSITIONS = Object.freeze({
  new: ['assigned', 'follow_up', 'quotation', 'won', 'lost', 'converted'],
  assigned: ['new', 'follow_up', 'quotation', 'won', 'lost', 'converted'],
  follow_up: ['assigned', 'quotation', 'won', 'lost', 'converted'],
  quotation: ['follow_up', 'won', 'lost', 'converted'],
  won: ['converted'], // Terminal until converted, no lost after won
  lost: ['new', 'assigned', 'follow_up', 'quotation'], // Requires admin override to reopen
  converted: [], // Final terminal state
});

module.exports = {
  LEAD_STATUSES,
  LEAD_PRIORITIES,
  FOLLOWUP_TYPES,
  FOLLOWUP_STATUSES,
  CONVERSION_TYPES,
  ALLOWED_STATUS_TRANSITIONS,
};
