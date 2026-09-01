/**
 * @fileoverview Lead Management constants, lifecycle transitions, enums and defaults.
 * @module modules/leads/lead.constants
 */

const LEAD_STATUSES = Object.freeze([
  'new',
  'assigned',
  'contacted',
  'qualified',
  'unqualified',
  'follow_up',
  'quotation',
  'negotiation',
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
  new: ['assigned', 'contacted', 'unqualified', 'lost'],
  assigned: ['contacted', 'qualified', 'unqualified', 'follow_up', 'lost'],
  contacted: ['qualified', 'unqualified', 'follow_up', 'lost'],
  qualified: ['follow_up', 'quotation', 'negotiation', 'won', 'lost', 'converted'],
  unqualified: ['lost'],
  follow_up: ['quotation', 'negotiation', 'won', 'lost'],
  quotation: ['negotiation', 'won', 'lost', 'converted'],
  negotiation: ['won', 'lost', 'converted'],
  won: ['converted'], // Terminal until converted, no lost after won
  lost: [], // Requires admin override to reopen
  converted: [], // Terminal outcome
});

module.exports = {
  LEAD_STATUSES,
  LEAD_PRIORITIES,
  FOLLOWUP_TYPES,
  FOLLOWUP_STATUSES,
  CONVERSION_TYPES,
  ALLOWED_STATUS_TRANSITIONS,
};
