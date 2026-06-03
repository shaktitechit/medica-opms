/**
 * @fileoverview Flags: business rules and mongoose persistence helpers.
 * @module modules/flags/flag.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const activityService = require('../activity/activity.service');

const SEVERITY_RANK = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

async function recomputeOrderFlagAggregates(orderId, session = null) {
  const { Order, OrderFlag } = getModels();

  const query = OrderFlag.find({ order: orderId });
  if (session) query.session(session);
  const flags = await query.lean();

  const open = flags.filter((f) => f.status === 'open');
  const blockingOpen = open.filter((f) => f.blocks_order);

  let highest = 'none';
  for (const f of open) {
    const s = f.severity || 'medium';
    if (SEVERITY_RANK[s] > SEVERITY_RANK[highest]) highest = s;
  }

  const updateOptions = {};
  if (session) updateOptions.session = session;

  await Order.updateOne(
    { _id: orderId },
    {
      has_open_flags: blockingOpen.length > 0,
      open_flag_count: open.length,
      highest_flag_severity: highest,
    },
    updateOptions
  );

  const getQuery = Order.findById(orderId);
  if (session) getQuery.session(session);
  const row = await getQuery.lean();
  return row ? toPlain(row) : null;
}

async function list({ order } = {}) {
  const q = {};
  if (order) q.order = order;
  const rows = await getModels().OrderFlag.find(q).sort({ createdAt: -1 }).lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().OrderFlag.findById(id).lean();
  if (!row) throw new ApiError(404, 'Flag not found');
  return toPlain(row);
}

async function create(body, user) {
  const { Order, OrderFlag } = getModels();
  const exists = await Order.exists({ _id: body.order });
  if (!exists) throw new ApiError(404, 'Order not found');

  const doc = await OrderFlag.create({
    order: body.order,
    flag_type: body.flag_type,
    severity: body.severity || 'medium',
    title: body.title,
    description: body.description || '',
    blocks_order: Boolean(body.blocks_order),
    status: 'open',
    department: body.department || user.department,
    raised_by: user._id,
    assigned_to: body.assigned_to || undefined,
    due_date: body.due_date || undefined,
  });
  await recomputeOrderFlagAggregates(body.order);
  await activityService.create({
    actor: user._id,
    entity_type: 'flag',
    entity_id: doc._id.toString(),
    action: 'flagged',
    message: `Flag ${body.flag_type} raised`,
  });
  return toPlain(doc.toObject());
}

async function patch(id, patch, user) {
  const row = await get(id);
  const next = { ...row, ...patch };
  if (next.status === 'resolved' || next.status === 'dismissed') {
    next.resolved_by = user._id;
    next.resolved_at = new Date();
    if (!next.resolution_note && patch.status) {
      next.resolution_note = patch.resolution_note || '';
    }
  }

  const updated = await getModels().OrderFlag.findByIdAndUpdate(id, next, { new: true }).lean();
  await recomputeOrderFlagAggregates(row.order);
  return toPlain(updated);
}

module.exports = {
  recomputeOrderFlagAggregates,
  list,
  get,
  create,
  patch,
};
