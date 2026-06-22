/**
 * @fileoverview Reminders: business rules and mongoose persistence helpers.
 * @module modules/reminders/reminder.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const activityService = require('../activity/activity.service');

async function list(query = {}) {
  const { Reminder } = getModels();
  const filter = { deletedAt: null };

  if (query.order) filter.order = query.order;
  if (query.party) filter.party = query.party;
  if (query.user) filter.user = query.user;
  if (query.status) filter.status = query.status;

  if (query.due_before || query.due_after) {
    filter.next_followup_date = {};
    if (query.due_before) {
      filter.next_followup_date.$lte = new Date(query.due_before);
    }
    if (query.due_after) {
      filter.next_followup_date.$gte = new Date(query.due_after);
    }
  }

  const rows = await Reminder.find(filter)
    .populate('order', 'order_no grand_total payment_status status order_date')
    .populate('party', 'party_name mobile email contact_person contacts')
    .populate('user', 'name email')
    .populate('follow_ups.created_by', 'name email')
    .sort({ next_followup_date: 1, createdAt: -1 })
    .lean();

  return rows.map(toPlain);
}

async function get(id) {
  const { Reminder } = getModels();
  const row = await Reminder.findOne({ _id: id, deletedAt: null })
    .populate('order', 'order_no grand_total payment_status status order_date')
    .populate('party', 'party_name mobile email contact_person contacts')
    .populate('user', 'name email')
    .populate('follow_ups.created_by', 'name email')
    .lean();

  if (!row) {
    throw new ApiError(404, 'Reminder not found');
  }
  return toPlain(row);
}

async function create(body, user) {
  const { Order, Reminder } = getModels();

  const orderDoc = await Order.findById(body.order).lean();
  if (!orderDoc) {
    throw new ApiError(404, 'Order not found');
  }

  const initialFollowUp = {
    followup_date: new Date(body.followup_date),
    remarks: body.remarks.trim(),
    status: body.followup_status || 'pending',
    created_by: user._id,
  };

  const doc = await Reminder.create({
    user: user._id,
    order: body.order,
    party: orderDoc.party || undefined,
    follow_ups: [initialFollowUp],
    next_followup_date: initialFollowUp.followup_date,
    status: body.status || 'active',
    reminder_type: body.reminder_type || 'follow_up',
  });

  // Log activity under the associated Order
  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: body.order,
    action: 'updated',
    message: `Reminder created: ${body.remarks.trim()} (Next follow-up: ${body.followup_date})`,
  });

  return get(doc._id);
}

async function addFollowUp(id, body, user) {
  const { Reminder } = getModels();

  const doc = await Reminder.findOne({ _id: id, deletedAt: null });
  if (!doc) {
    throw new ApiError(404, 'Reminder not found');
  }

  const newFollowUp = {
    followup_date: new Date(body.followup_date),
    remarks: body.remarks.trim(),
    status: body.status || 'pending',
    created_by: user._id,
  };

  doc.follow_ups.push(newFollowUp);
  doc.next_followup_date = newFollowUp.followup_date;

  // Auto-activate if user sets a new follow-up date and status was completed/dismissed
  if (doc.status !== 'active') {
    doc.status = 'active';
  }

  await doc.save();

  // Log activity under the associated Order
  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: doc.order.toString(),
    action: 'updated',
    message: `New follow-up added to reminder: ${body.remarks.trim()} (Scheduled for: ${body.followup_date})`,
  });

  return get(doc._id);
}

async function patch(id, patch, user) {
  const { Reminder } = getModels();
  const doc = await Reminder.findOne({ _id: id, deletedAt: null });
  if (!doc) {
    throw new ApiError(404, 'Reminder not found');
  }

  const PATCHABLE_KEYS = ['status', 'next_followup_date', 'reminder_type'];
  let modified = false;

  for (const key of PATCHABLE_KEYS) {
    if (patch[key] !== undefined) {
      doc.set(key, patch[key]);
      modified = true;
    }
  }

  if (modified) {
    await doc.save();
    
    await activityService.create({
      actor: user._id,
      entity_type: 'order',
      entity_id: doc.order.toString(),
      action: 'updated',
      message: `Reminder updated: status is now ${doc.status}`,
    });
  }

  return get(doc._id);
}

async function remove(id, user) {
  const { Reminder } = getModels();
  const doc = await Reminder.findOne({ _id: id, deletedAt: null });
  if (!doc) {
    throw new ApiError(404, 'Reminder not found');
  }

  await doc.softDelete();

  await activityService.create({
    actor: user._id,
    entity_type: 'order',
    entity_id: doc.order.toString(),
    action: 'updated',
    message: `Reminder was deleted`,
  });

  return { success: true };
}

async function syncFromGoogleSheet(row) {
  const { Reminder, Order } = getModels();
  const mongoose = require('mongoose');

  if (!row || typeof row !== 'object') {
    throw new ApiError(400, 'Invalid row payload');
  }

  const rawId = row._id || row.id || row.reminder_id;
  const isMongoId = rawId && mongoose.Types.ObjectId.isValid(rawId);

  let doc = null;
  if (isMongoId) {
    doc = await Reminder.findOne({ _id: rawId, deletedAt: null });
  }

  // Find order by order_no or ID
  let orderDoc = null;
  if (row.order_no) {
    orderDoc = await Order.findOne({ order_no: String(row.order_no).trim(), deletedAt: null });
  }
  if (!orderDoc && row.order && mongoose.Types.ObjectId.isValid(row.order)) {
    orderDoc = await Order.findById(row.order);
  }

  const reminderType = ['payment', 'remarks', 'follow_up', 'other'].includes(row.reminder_type)
    ? row.reminder_type
    : 'follow_up';
  
  const status = ['active', 'completed', 'dismissed'].includes(row.status)
    ? row.status
    : 'active';

  const remarks = row.remarks ? String(row.remarks).trim() : 'Updated via Sheets';
  const followUpDate = row.followup_date || row.next_followup_date || new Date();

  const payload = {
    reminder_type: reminderType,
    status,
    next_followup_date: new Date(followUpDate)
  };

  if (doc) {
    // Append a follow-up remark if the remarks changed
    const lastFollowUp = doc.follow_ups && doc.follow_ups[doc.follow_ups.length - 1];
    if (!lastFollowUp || lastFollowUp.remarks !== remarks || new Date(lastFollowUp.followup_date).getTime() !== new Date(followUpDate).getTime()) {
      doc.follow_ups.push({
        followup_date: new Date(followUpDate),
        remarks,
        status: status === 'completed' ? 'completed' : 'pending',
        created_by: doc.user
      });
    }
    
    for (const [k, v] of Object.entries(payload)) {
      doc.set(k, v);
    }
    await doc.save();
    return get(doc._id);
  } else {
    if (!orderDoc) {
      throw new ApiError(400, 'Cannot create reminder: Order not found');
    }
    
    const creatorId = orderDoc.created_by;

    const initialFollowUp = {
      followup_date: new Date(followUpDate),
      remarks,
      status: status === 'completed' ? 'completed' : 'pending',
      created_by: creatorId
    };

    const newDoc = await Reminder.create({
      user: creatorId,
      order: orderDoc._id,
      party: orderDoc.party || undefined,
      follow_ups: [initialFollowUp],
      next_followup_date: initialFollowUp.followup_date,
      status,
      reminder_type: reminderType
    });
    return get(newDoc._id);
  }
}

module.exports = {
  list,
  get,
  create,
  addFollowUp,
  patch,
  remove,
  syncFromGoogleSheet,
};
