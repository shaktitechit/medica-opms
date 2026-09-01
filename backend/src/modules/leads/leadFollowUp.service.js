/**
 * @fileoverview Lead Follow-up Management service: scheduling, recording outcomes and alerts.
 * @module modules/leads/leadFollowUp.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const activityService = require('../activity/activity.service');
const notificationService = require('../notifications/notification.service');
const { isLeadManager } = require('./lead.service');

/**
 * Schedule a new follow-up for a lead.
 */
async function createForLead(leadId, body, user) {
  const { Lead, LeadFollowUp } = getModels();
  const lead = await Lead.findOne({ _id: leadId, deletedAt: null });
  if (!lead) throw new ApiError(404, 'Lead not found');

  if (!isLeadManager(user)) {
    const assignedId = lead.assigned_to ? String(lead.assigned_to) : null;
    const createdById = lead.created_by ? String(lead.created_by) : null;
    if (assignedId && assignedId !== String(user._id) && createdById !== String(user._id)) {
      throw new ApiError(403, 'You do not have permission to schedule follow-ups for this lead');
    }
  }

  const followUpDate = new Date(body.follow_up_date);

  const doc = await LeadFollowUp.create({
    lead: leadId,
    follow_up_date: followUpDate,
    follow_up_time: body.follow_up_time ? String(body.follow_up_time).trim() : '',
    type: body.type || 'call',
    notes: body.notes ? String(body.notes).trim() : '',
    status: 'pending',
    created_by: user._id,
    updated_by: user._id,
  });

  // Update lead's next follow-up pointer & last activity
  lead.next_follow_up_at = followUpDate;
  lead.last_activity_at = new Date();
  if (lead.status === 'new' || lead.status === 'assigned') {
    lead.status = 'follow_up';
  }
  await lead.save();

  const plain = toPlain(doc.toObject());

  await activityService.create({
    actor: user._id,
    entity_type: 'lead',
    entity_id: lead._id,
    action: 'created',
    message: `Follow-up scheduled (${body.type || 'call'}) for ${followUpDate.toLocaleDateString()}`,
    new_value: plain,
  });

  // Notify assignee if scheduled by someone else (e.g. manager)
  if (lead.assigned_to && String(lead.assigned_to) !== String(user._id)) {
    await notificationService.createForUser(lead.assigned_to, {
      title: 'Follow-up Scheduled',
      message: `A ${body.type || 'call'} follow-up was scheduled for Lead #${lead.lead_no} on ${followUpDate.toLocaleDateString()}`,
      type: 'info',
      module: 'lead',
      entity_type: 'lead',
      entity_id: lead._id,
    });
  }

  return plain;
}

/**
 * List all follow-ups for a single lead.
 */
async function listForLead(leadId) {
  const { LeadFollowUp } = getModels();
  const rows = await LeadFollowUp.find({ lead: leadId, deletedAt: null })
    .populate('created_by', 'name email')
    .populate('completed_by', 'name email')
    .sort({ follow_up_date: -1 })
    .lean();
  return rows.map(toPlain);
}

/**
 * Complete a follow-up, record outcome, and optionally schedule the next one.
 */
async function complete(followUpId, body, user) {
  const { Lead, LeadFollowUp } = getModels();
  const fu = await LeadFollowUp.findOne({ _id: followUpId, deletedAt: null });
  if (!fu) throw new ApiError(404, 'Follow-up not found');

  const lead = await Lead.findOne({ _id: fu.lead, deletedAt: null });
  if (!lead) throw new ApiError(404, 'Associated lead not found');

  if (!isLeadManager(user)) {
    const assignedId = lead.assigned_to ? String(lead.assigned_to) : null;
    const createdById = lead.created_by ? String(lead.created_by) : null;
    if (assignedId && assignedId !== String(user._id) && createdById !== String(user._id)) {
      throw new ApiError(403, 'You do not have permission to complete follow-ups for this lead');
    }
  }

  fu.status = 'completed';
  fu.outcome = String(body.outcome).trim();
  fu.completed_at = new Date();
  fu.completed_by = user._id;
  fu.updated_by = user._id;

  let nextFu = null;
  if (body.next_follow_up_date) {
    const nextDate = new Date(body.next_follow_up_date);
    fu.next_follow_up_date = nextDate;

    // Create the next scheduled follow-up
    nextFu = await LeadFollowUp.create({
      lead: lead._id,
      follow_up_date: nextDate,
      follow_up_time: body.next_follow_up_time || '',
      type: body.next_type || fu.type,
      notes: body.next_notes || '',
      status: 'pending',
      created_by: user._id,
      updated_by: user._id,
    });

    lead.next_follow_up_at = nextDate;
  } else {
    // Check if there are other pending follow-ups
    const nextPending = await LeadFollowUp.findOne({
      lead: lead._id,
      status: 'pending',
      deletedAt: null,
      _id: { $ne: fu._id },
    }).sort({ follow_up_date: 1 });

    lead.next_follow_up_at = nextPending ? nextPending.follow_up_date : null;
  }

  if (lead.status === 'new' || lead.status === 'assigned') {
    lead.status = 'follow_up';
  }
  lead.last_contacted_at = new Date();
  lead.last_activity_at = new Date();
  await lead.save();
  await fu.save();

  const plain = toPlain(fu.toObject());

  await activityService.create({
    actor: user._id,
    entity_type: 'lead',
    entity_id: lead._id,
    action: 'status_changed',
    message: `Follow-up completed: ${body.outcome}`,
    new_value: plain,
  });

  return {
    completed: plain,
    next: nextFu ? toPlain(nextFu.toObject()) : null,
  };
}

/**
 * Get follow-up list for calendar/agenda view.
 */
async function getCalendar(query = {}, user) {
  const { LeadFollowUp } = getModels();
  const q = { deletedAt: null };

  if (query.from_date || query.to_date) {
    q.follow_up_date = {};
    if (query.from_date) {
      const from = new Date(query.from_date);
      from.setHours(0, 0, 0, 0);
      q.follow_up_date.$gte = from;
    }
    if (query.to_date) {
      const to = new Date(query.to_date);
      to.setHours(23, 59, 59, 999);
      q.follow_up_date.$lte = to;
    }
  }

  if (query.status && query.status !== 'all') {
    q.status = query.status;
  }

  const rows = await LeadFollowUp.find(q)
    .populate({
      path: 'lead',
      select: 'lead_no name company_name phone email status priority assigned_to',
      populate: { path: 'assigned_to', select: 'name email' },
    })
    .populate('created_by', 'name email')
    .populate('completed_by', 'name email')
    .sort({ follow_up_date: 1 })
    .lean();

  // If user is sales, filter to leads assigned to them or created by them
  if (!isLeadManager(user)) {
    const userStr = String(user._id);
    return rows
      .filter((r) => {
        const assignedId = r.lead?.assigned_to?._id ? String(r.lead.assigned_to._id) : '';
        const createdById = r.created_by?._id ? String(r.created_by._id) : '';
        return assignedId === userStr || createdById === userStr;
      })
      .map(toPlain);
  }

  return rows.map(toPlain);
}

module.exports = {
  createForLead,
  listForLead,
  complete,
  getCalendar,
};
