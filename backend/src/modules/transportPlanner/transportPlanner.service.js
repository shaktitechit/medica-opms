/**
 * @fileoverview Transport Planner: business rules and mongoose persistence.
 * @module modules/transportPlanner/transportPlanner.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const activityService = require('../activity/activity.service');
const notificationService = require('../notifications/notification.service');
const {
  ACTIVE_PLAN_STATUSES,
  ACTIVE_PLAN_ORDER_STATUSES,
  EDITABLE_PLAN_STATUSES,
  TERMINAL_PLAN_STATUSES,
  startOfDay,
  endOfDay,
  isAdminDept,
  canPlan,
  canExecute,
} = require('./transportPlanner.constants');

function userId(user) {
  return user?._id || user?.id;
}

function sameId(a, b) {
  return String(a) === String(b);
}

async function logActivity(user, planId, action, message, extra = {}) {
  await activityService.create({
    actor: userId(user),
    entity_type: 'transport_plan',
    entity_id: planId,
    action,
    message,
    ...extra,
  });
}

async function notifyDepartmentUsers(department, payload) {
  const { User } = getModels();
  const users = await User.find({
    department,
    is_active: { $ne: false },
  })
    .select('_id')
    .lean();
  await Promise.all(
    users.map((u) =>
      notificationService.createForUser(u._id, {
        ...payload,
        module: payload.module || 'transport',
      })
    )
  );
}

async function loadPlanOrThrow(id) {
  const { TransportPlan } = getModels();
  const plan = await TransportPlan.findOne({ _id: id, deletedAt: null })
    .populate('transport_agent', 'agent_code agent_name agent_type mobile email gst_no status')
    .populate('created_by', 'name email department')
    .populate('updated_by', 'name email department')
    .lean();
  if (!plan) throw new ApiError(404, 'Transport plan not found');
  return plan;
}

async function loadPlanOrders(planId) {
  const { TransportPlanOrder, TransportShipment } = getModels();
  const rows = await TransportPlanOrder.find({ transport_plan: planId, deletedAt: null })
    .populate({
      path: 'order',
      select:
        'order_no order_date status workflow_stage lifecycle_status current_action priority grand_total dispatch_status assigned_sales_user party expected_delivery_date',
      populate: [
        { path: 'party', select: 'party_name mobile billing_address shipping_address' },
        { path: 'assigned_sales_user', select: 'name email' },
      ],
    })
    .populate('party', 'party_name mobile billing_address shipping_address')
    .populate({
      path: 'dispatch',
      select:
        'dispatch_no dispatch_status bill_number billing_date warehouse_location warehouse dispatch_items packed_at dispatched_at remarks',
      populate: { path: 'dispatch_items.product', select: 'product_name sku hsn_code' },
    })
    .sort({ createdAt: 1 })
    .lean();

  const dispatchIds = rows
    .map((r) => r.dispatch?._id || r.dispatch)
    .filter(Boolean);

  const shipments =
    dispatchIds.length === 0
      ? []
      : await TransportShipment.find({
          dispatch: { $in: dispatchIds },
          deletedAt: null,
        })
          .populate('transport_agent', 'agent_code agent_name agent_type mobile email status')
          .sort({ createdAt: -1 })
          .lean();

  const transportByDispatch = new Map();
  for (const shipment of shipments) {
    const key = String(shipment.dispatch);
    const status = String(shipment.shipment_status || '');
    const existing = transportByDispatch.get(key);
    if (!existing) {
      transportByDispatch.set(key, shipment);
      continue;
    }
    // Prefer non-returned active shipments
    if (existing.shipment_status === 'returned' && status !== 'returned') {
      transportByDispatch.set(key, shipment);
    }
  }

  return rows.map((r) => {
    const plain = toPlain(r);
    const dispatchKey = String(r.dispatch?._id || r.dispatch || '');
    const transport = transportByDispatch.get(dispatchKey);
    return {
      ...plain,
      transport: transport ? toPlain(transport) : null,
    };
  });
}

function summarizeOrders(planOrders) {
  const active = planOrders.filter((r) => r.status !== 'cancelled');
  return {
    total_orders: active.length,
    total_packages: active.reduce((s, r) => s + (Number(r.packages) || 0), 0),
    total_weight: active.reduce((s, r) => s + (Number(r.weight) || 0), 0),
    total_invoice_value: active.reduce((s, r) => {
      const order = r.order && typeof r.order === 'object' ? r.order : null;
      return s + (Number(order?.grand_total) || 0);
    }, 0),
  };
}

async function getWithOrders(id) {
  const plan = await loadPlanOrThrow(id);
  const orders = await loadPlanOrders(id);
  return { ...toPlain(plan), orders, summary: summarizeOrders(orders) };
}

function assertEditable(plan) {
  if (TERMINAL_PLAN_STATUSES.includes(plan.status)) {
    throw new ApiError(400, `Cannot modify a transport plan in status "${plan.status}"`);
  }
  if (!EDITABLE_PLAN_STATUSES.includes(plan.status)) {
    throw new ApiError(400, `Cannot edit a transport plan in status "${plan.status}"`);
  }
}

function assertCanPlan(user) {
  if (!canPlan(user)) {
    throw new ApiError(403, 'Only Accounts or Admin can manage transport plans');
  }
}

function assertCanExecute(user) {
  if (!canExecute(user)) {
    throw new ApiError(403, 'Only Dispatch or Admin can update dispatch execution');
  }
}

async function ensureTransportAgentActive(agentId) {
  const { TransportAgent } = getModels();
  const agent = await TransportAgent.findOne({ _id: agentId, deletedAt: null }).lean();
  if (!agent) throw new ApiError(404, 'Transport agent not found');
  if (agent.status === 'inactive' || agent.status === 'blacklisted' || agent.is_active === false) {
    throw new ApiError(400, 'Transport agent is not active');
  }
  return agent;
}

async function getAssignedDispatchIds({ excludePlanId } = {}) {
  const { TransportPlanOrder, TransportPlan } = getModels();
  const lines = await TransportPlanOrder.find({
    deletedAt: null,
    status: { $in: ACTIVE_PLAN_ORDER_STATUSES },
    dispatch: { $ne: null },
  })
    .select('dispatch transport_plan')
    .lean();

  if (lines.length === 0) return [];

  const planIds = [...new Set(lines.map((l) => String(l.transport_plan)))];
  const activePlans = await TransportPlan.find({
    _id: { $in: planIds },
    deletedAt: null,
    status: { $in: ACTIVE_PLAN_STATUSES },
  })
    .select('_id')
    .lean();
  const activePlanSet = new Set(activePlans.map((p) => String(p._id)));

  const assigned = [];
  for (const line of lines) {
    if (excludePlanId && sameId(line.transport_plan, excludePlanId)) continue;
    if (activePlanSet.has(String(line.transport_plan)) && line.dispatch) {
      assigned.push(line.dispatch);
    }
  }
  return assigned;
}

/**
 * Validate order+dispatch pairs for transport planning (partial open-order system).
 * @param {Array<{ order_id: string, dispatch_id: string }>} items
 */
async function assertDispatchItemsEligible(items, { excludePlanId } = {}) {
  const { Order, OrderDispatch, TransportPlanOrder, TransportPlan } = getModels();

  const dispatchIds = items.map((i) => i.dispatch_id);
  if (new Set(dispatchIds).size !== dispatchIds.length) {
    throw new ApiError(400, 'Duplicate dispatches are not allowed in one plan');
  }

  const dispatches = await OrderDispatch.find({
    _id: { $in: dispatchIds },
    deletedAt: null,
  }).lean();
  if (dispatches.length !== dispatchIds.length) {
    throw new ApiError(404, 'One or more order dispatches were not found');
  }

  const orderIds = [...new Set(items.map((i) => i.order_id))];
  const orders = await Order.find({ _id: { $in: orderIds }, deletedAt: null }).lean();
  if (orders.length !== orderIds.length) {
    throw new ApiError(404, 'One or more orders were not found');
  }
  const orderMap = new Map(orders.map((o) => [String(o._id), o]));
  const dispatchMap = new Map(dispatches.map((d) => [String(d._id), d]));

  for (const item of items) {
    const order = orderMap.get(String(item.order_id));
    const dispatch = dispatchMap.get(String(item.dispatch_id));
    if (!order || !dispatch) {
      throw new ApiError(404, 'Order or dispatch not found');
    }
    if (!sameId(dispatch.order, order._id)) {
      throw new ApiError(
        400,
        `Dispatch ${dispatch.dispatch_no} does not belong to order ${order.order_no}`
      );
    }
    if (dispatch.dispatch_status === 'cancelled') {
      throw new ApiError(400, `Dispatch ${dispatch.dispatch_no} is cancelled`);
    }
    if (dispatch.dispatch_status === 'draft') {
      throw new ApiError(
        400,
        `Dispatch ${dispatch.dispatch_no} is still a draft — submit it before transport planning`
      );
    }
    if (dispatch.dispatch_status === 'transport_created') {
      throw new ApiError(
        400,
        `Dispatch ${dispatch.dispatch_no} already has transport created`
      );
    }
    if (dispatch.dispatch_status !== 'submitted') {
      throw new ApiError(
        400,
        `Dispatch ${dispatch.dispatch_no} must be submitted before adding to a transport plan (status: ${dispatch.dispatch_status})`
      );
    }
    if (
      order.lifecycle_status === 'cancelled' ||
      order.status === 'cancelled' ||
      order.current_action === 'cancelled' ||
      order.workflow_stage === 'cancelled'
    ) {
      throw new ApiError(400, `Order ${order.order_no} is cancelled and cannot be added`);
    }
    if (order.status === 'closed' || order.closed_at || order.lifecycle_status === 'fulfilled') {
      throw new ApiError(400, `Order ${order.order_no} is closed/completed`);
    }
  }

  const activeLines = await TransportPlanOrder.find({
    dispatch: { $in: dispatchIds },
    deletedAt: null,
    status: { $in: ACTIVE_PLAN_ORDER_STATUSES },
  }).lean();

  for (const line of activeLines) {
    if (excludePlanId && sameId(line.transport_plan, excludePlanId)) continue;
    const parent = await TransportPlan.findOne({
      _id: line.transport_plan,
      deletedAt: null,
      status: { $in: ACTIVE_PLAN_STATUSES },
    }).lean();
    if (parent) {
      const dispatch = dispatchMap.get(String(line.dispatch));
      throw new ApiError(
        400,
        `Dispatch ${dispatch?.dispatch_no || line.dispatch} is already on another active transport plan`
      );
    }
  }

  return { orders, dispatches, orderMap, dispatchMap };
}

async function maybePromoteToPlanned(planId, user) {
  // Plans are created as planned; kept for backward-compatible draft records.
  const { TransportPlan, TransportPlanOrder } = getModels();
  const plan = await TransportPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan || plan.status !== 'draft') return;
  if (!plan.plan_date || !plan.transport_agent) return;
  const count = await TransportPlanOrder.countDocuments({
    transport_plan: planId,
    deletedAt: null,
    status: { $ne: 'cancelled' },
  });
  if (count < 1) return;
  plan.status = 'planned';
  plan.updated_by = userId(user);
  await plan.save();
}

async function maybeAdvancePlanStatus(planId, user) {
  const { TransportPlan, TransportPlanOrder } = getModels();
  const plan = await TransportPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan || !['submitted', 'in_transit'].includes(plan.status)) return;

  const lines = await TransportPlanOrder.find({
    transport_plan: planId,
    deletedAt: null,
    status: { $ne: 'cancelled' },
  }).lean();
  if (lines.length === 0) return;

  const allDelivered = lines.every((l) => l.status === 'delivered');
  const anyDispatched = lines.some((l) => ['dispatched', 'delivered'].includes(l.status));

  if (allDelivered) {
    plan.status = 'completed';
    plan.completed_at = new Date();
    plan.updated_by = userId(user);
    await plan.save();
    await logActivity(user, planId, 'status_changed', 'Transport plan marked completed');
    await notifyDepartmentUsers('account', {
      title: 'Transport plan completed',
      message: 'A transport plan has been fully delivered.',
      type: 'success',
      module: 'transport',
      entity_type: 'transport_plan',
      entity_id: planId,
    });
    return;
  }

  if (anyDispatched && plan.status === 'submitted') {
    plan.status = 'in_transit';
    plan.updated_by = userId(user);
    await plan.save();
    await logActivity(user, planId, 'status_changed', 'Transport plan moved to in transit');
  }
}

async function list(query = {}, user) {
  const { TransportPlan, TransportPlanOrder } = getModels();
  const filter = { deletedAt: null };

  if (query.status) filter.status = query.status;
  if (query.transport_agent) filter.transport_agent = query.transport_agent;

  if (query.date) {
    filter.plan_date = {
      $gte: startOfDay(query.date),
      $lte: endOfDay(query.date),
    };
  } else if (query.from || query.to) {
    filter.plan_date = {};
    if (query.from) filter.plan_date.$gte = startOfDay(query.from);
    if (query.to) filter.plan_date.$lte = endOfDay(query.to);
  }

  if (query.search) {
    const q = String(query.search).trim();
    if (q) {
      const { TransportAgent } = getModels();
      const agents = await TransportAgent.find({
        deletedAt: null,
        $or: [
          { agent_name: { $regex: q, $options: 'i' } },
          { agent_code: { $regex: q, $options: 'i' } },
        ],
      })
        .select('_id')
        .lean();
      filter.$or = [{ transport_agent: { $in: agents.map((a) => a._id) } }];
    }
  }

  const limit = Math.min(parseInt(query.limit, 10) || 50, 200);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    TransportPlan.countDocuments(filter),
    TransportPlan.find(filter)
      .populate('transport_agent', 'agent_code agent_name agent_type mobile status')
      .populate('created_by', 'name email department')
      .sort({ plan_date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const planIds = rows.map((r) => r._id);
  const orderAgg = await TransportPlanOrder.aggregate([
    { $match: { transport_plan: { $in: planIds }, deletedAt: null, status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: '$transport_plan',
        order_count: { $sum: 1 },
        total_packages: { $sum: { $ifNull: ['$packages', 0] } },
        total_weight: { $sum: { $ifNull: ['$weight', 0] } },
      },
    },
  ]);
  const aggMap = new Map(orderAgg.map((c) => [String(c._id), c]));

  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 0,
    data: rows.map((r) => {
      const agg = aggMap.get(String(r._id)) || {};
      return {
        ...toPlain(r),
        order_count: agg.order_count || 0,
        total_packages: agg.total_packages || 0,
        total_weight: agg.total_weight || 0,
      };
    }),
  };
}

async function get(id, _user) {
  return getWithOrders(id);
}

async function create(body, user) {
  assertCanPlan(user);
  await ensureTransportAgentActive(body.transport_agent);

  const { TransportPlan, TransportPlanOrder } = getModels();
  const planDate = startOfDay(body.plan_date);

  const doc = await TransportPlan.create({
    plan_date: planDate,
    transport_agent: body.transport_agent,
    status: 'planned',
    remarks: body.remarks || undefined,
    created_by: userId(user),
    updated_by: userId(user),
  });

  if (Array.isArray(body.items) && body.items.length > 0) {
    const { orderMap, dispatchMap } = await assertDispatchItemsEligible(body.items, {
      excludePlanId: doc._id,
    });
    await TransportPlanOrder.insertMany(
      body.items.map((item) => {
        const order = orderMap.get(String(item.order_id));
        const dispatch = dispatchMap.get(String(item.dispatch_id));
        return {
          transport_plan: doc._id,
          order: order._id,
          party: order.party || undefined,
          customer: order.customer || undefined,
          dispatch: dispatch._id,
          invoice_number: dispatch.bill_number || undefined,
          status: 'pending',
        };
      })
    );
    await maybePromoteToPlanned(doc._id, user);
  }

  await logActivity(user, doc._id, 'created', 'Transport plan created');
  return getWithOrders(doc._id);
}

async function update(id, body, user) {
  assertCanPlan(user);
  const { TransportPlan } = getModels();
  const plan = await TransportPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Transport plan not found');
  assertEditable(plan);

  if (body.transport_agent !== undefined) {
    await ensureTransportAgentActive(body.transport_agent);
    plan.transport_agent = body.transport_agent;
  }
  if (body.plan_date !== undefined) {
    plan.plan_date = startOfDay(body.plan_date);
  }
  if (body.remarks !== undefined) {
    plan.remarks = body.remarks;
  }

  plan.updated_by = userId(user);
  await plan.save();
  await maybePromoteToPlanned(id, user);
  await logActivity(user, id, 'updated', 'Transport plan updated');
  return getWithOrders(id);
}

async function remove(id, user) {
  assertCanPlan(user);
  const { TransportPlan, TransportPlanOrder } = getModels();
  const plan = await TransportPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Transport plan not found');
  if (plan.status === 'completed') {
    throw new ApiError(400, 'Completed transport plans cannot be deleted');
  }
  if (!EDITABLE_PLAN_STATUSES.includes(plan.status) && plan.status !== 'cancelled') {
    throw new ApiError(400, `Cannot delete a transport plan in status "${plan.status}"`);
  }

  const now = new Date();
  plan.deletedAt = now;
  plan.updated_by = userId(user);
  await plan.save();
  await TransportPlanOrder.updateMany(
    { transport_plan: id, deletedAt: null },
    { $set: { deletedAt: now, status: 'cancelled' } }
  );
  await logActivity(user, id, 'deleted', 'Transport plan deleted');
  return { id: String(id), deleted: true };
}

async function submit(id, user) {
  assertCanPlan(user);
  const { TransportPlan, TransportPlanOrder } = getModels();
  const plan = await TransportPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Transport plan not found');
  if (!EDITABLE_PLAN_STATUSES.includes(plan.status)) {
    throw new ApiError(400, `Cannot submit a transport plan in status "${plan.status}"`);
  }
  if (!plan.transport_agent) {
    throw new ApiError(400, 'Transport agent is required before submit');
  }
  if (!plan.plan_date) {
    throw new ApiError(400, 'Dispatch date is required before submit');
  }

  const orderCount = await TransportPlanOrder.countDocuments({
    transport_plan: id,
    deletedAt: null,
    status: { $ne: 'cancelled' },
  });
  if (orderCount < 1) {
    throw new ApiError(400, 'Add at least one order before submitting');
  }

  plan.status = 'submitted';
  plan.submitted_at = new Date();
  plan.updated_by = userId(user);
  await plan.save();

  await logActivity(user, id, 'submitted', 'Transport plan submitted to Dispatch');
  await notifyDepartmentUsers('dispatch', {
    title: 'Transport plan submitted',
    message: `A transport plan for ${startOfDay(plan.plan_date).toISOString().slice(0, 10)} is ready for dispatch execution.`,
    type: 'info',
    module: 'transport',
    entity_type: 'transport_plan',
    entity_id: id,
  });

  return getWithOrders(id);
}

async function complete(id, user) {
  assertCanExecute(user);
  const { TransportPlan, TransportPlanOrder } = getModels();
  const plan = await TransportPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Transport plan not found');
  if (!['submitted', 'in_transit'].includes(plan.status)) {
    throw new ApiError(400, `Cannot complete a transport plan in status "${plan.status}"`);
  }

  const openCount = await TransportPlanOrder.countDocuments({
    transport_plan: id,
    deletedAt: null,
    status: { $nin: ['delivered', 'cancelled'] },
  });
  if (openCount > 0) {
    throw new ApiError(400, 'All plan orders must be delivered (or cancelled) before completing');
  }

  plan.status = 'completed';
  plan.completed_at = new Date();
  plan.updated_by = userId(user);
  await plan.save();

  await logActivity(user, id, 'status_changed', 'Transport plan completed');
  await notifyDepartmentUsers('account', {
    title: 'Transport plan completed',
    message: 'Dispatch has marked a transport plan as completed.',
    type: 'success',
    module: 'transport',
    entity_type: 'transport_plan',
    entity_id: id,
  });

  return getWithOrders(id);
}

async function cancel(id, body, user) {
  if (!isAdminDept(user) && !canPlan(user)) {
    throw new ApiError(403, 'Only Accounts or Admin can cancel transport plans');
  }
  const { TransportPlan, TransportPlanOrder } = getModels();
  const plan = await TransportPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Transport plan not found');
  if (plan.status === 'completed') {
    throw new ApiError(400, 'Completed transport plans cannot be cancelled');
  }
  if (plan.status === 'cancelled') {
    throw new ApiError(400, 'Transport plan is already cancelled');
  }

  plan.status = 'cancelled';
  plan.cancelled_at = new Date();
  plan.cancellation_reason = body?.cancellation_reason || undefined;
  plan.updated_by = userId(user);
  await plan.save();

  await TransportPlanOrder.updateMany(
    { transport_plan: id, deletedAt: null, status: { $in: ACTIVE_PLAN_ORDER_STATUSES } },
    { $set: { status: 'cancelled' } }
  );

  await logActivity(user, id, 'cancelled', 'Transport plan cancelled', {
    new_value: { reason: plan.cancellation_reason },
  });
  await notifyDepartmentUsers('admin', {
    title: 'Transport plan cancelled',
    message: plan.cancellation_reason
      ? `A transport plan was cancelled: ${plan.cancellation_reason}`
      : 'A transport plan was cancelled.',
    type: 'warning',
    module: 'transport',
    entity_type: 'transport_plan',
    entity_id: id,
  });

  return getWithOrders(id);
}

async function addOrders(planId, body, user) {
  assertCanPlan(user);
  const { TransportPlan, TransportPlanOrder } = getModels();
  const plan = await TransportPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Transport plan not found');
  assertEditable(plan);

  const { orderMap, dispatchMap } = await assertDispatchItemsEligible(body.items, {
    excludePlanId: planId,
  });

  const dispatchIds = body.items.map((i) => i.dispatch_id);
  const existing = await TransportPlanOrder.find({
    transport_plan: planId,
    dispatch: { $in: dispatchIds },
    deletedAt: null,
  }).lean();
  if (existing.length > 0) {
    throw new ApiError(400, 'One or more dispatches are already on this plan');
  }

  await TransportPlanOrder.insertMany(
    body.items.map((item) => {
      const order = orderMap.get(String(item.order_id));
      const dispatch = dispatchMap.get(String(item.dispatch_id));
      return {
        transport_plan: planId,
        order: order._id,
        party: order.party || undefined,
        customer: order.customer || undefined,
        dispatch: dispatch._id,
        invoice_number: dispatch.bill_number || undefined,
        status: 'pending',
      };
    })
  );

  plan.updated_by = userId(user);
  await plan.save();
  await maybePromoteToPlanned(planId, user);
  await logActivity(
    user,
    planId,
    'updated',
    `Added ${body.items.length} dispatch batch(es) to transport plan`,
    {
      new_value: {
        items: body.items,
      },
    }
  );

  return getWithOrders(planId);
}

async function removeOrder(planId, planOrderId, user) {
  assertCanPlan(user);
  const { TransportPlan, TransportPlanOrder } = getModels();
  const plan = await TransportPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Transport plan not found');
  assertEditable(plan);

  const line = await TransportPlanOrder.findOne({
    _id: planOrderId,
    transport_plan: planId,
    deletedAt: null,
  });
  if (!line) throw new ApiError(404, 'Plan order not found');

  line.deletedAt = new Date();
  line.status = 'cancelled';
  await line.save();

  plan.updated_by = userId(user);
  await plan.save();
  await logActivity(user, planId, 'updated', 'Order removed from transport plan', {
    old_value: { plan_order_id: String(planOrderId), order_id: String(line.order) },
  });

  return getWithOrders(planId);
}

/**
 * Cancel a plan line before transport is created (submitted / in-transit plans).
 */
async function cancelPlanOrder(planId, planOrderId, user) {
  if (!canPlan(user) && !canExecute(user)) {
    throw new ApiError(403, 'Not allowed to cancel plan order lines');
  }

  const { TransportPlan, TransportPlanOrder, TransportShipment } = getModels();
  const plan = await TransportPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Transport plan not found');
  if (TERMINAL_PLAN_STATUSES.includes(plan.status)) {
    throw new ApiError(400, `Cannot cancel lines on a ${plan.status} plan`);
  }

  const line = await TransportPlanOrder.findOne({
    _id: planOrderId,
    transport_plan: planId,
    deletedAt: null,
  });
  if (!line) throw new ApiError(404, 'Plan order not found');
  if (line.status === 'cancelled') {
    return getWithOrders(planId);
  }
  if (line.status === 'delivered') {
    throw new ApiError(400, 'Cannot cancel a delivered plan order');
  }

  const hasTransport = await TransportShipment.exists({
    dispatch: line.dispatch,
    deletedAt: null,
    shipment_status: { $ne: 'returned' },
  });
  if (hasTransport) {
    throw new ApiError(400, 'Cannot cancel a plan order after transport is created');
  }

  line.status = 'cancelled';
  await line.save();

  plan.updated_by = userId(user);
  await plan.save();
  await logActivity(user, planId, 'updated', 'Plan order cancelled before transport', {
    old_value: { plan_order_id: String(planOrderId), order_id: String(line.order) },
  });

  return getWithOrders(planId);
}

async function updateDispatchDetails(planId, planOrderId, body, user) {
  assertCanExecute(user);
  const { TransportPlan, TransportPlanOrder } = getModels();
  const plan = await TransportPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Transport plan not found');
  if (!['submitted', 'in_transit'].includes(plan.status)) {
    throw new ApiError(400, 'Dispatch details can only be updated on submitted or in-transit plans');
  }

  const line = await TransportPlanOrder.findOne({
    _id: planOrderId,
    transport_plan: planId,
    deletedAt: null,
  });
  if (!line) throw new ApiError(404, 'Plan order not found');
  if (line.status === 'cancelled') {
    throw new ApiError(400, 'Cannot update a cancelled plan order');
  }

  if (body.lr_number !== undefined) line.lr_number = body.lr_number;
  if (body.invoice_number !== undefined) line.invoice_number = body.invoice_number;
  if (body.packages !== undefined) line.packages = Number(body.packages);
  if (body.weight !== undefined) line.weight = Number(body.weight);
  if (body.dispatch !== undefined) line.dispatch = body.dispatch;
  if (body.dispatch_date !== undefined) {
    line.dispatch_date = body.dispatch_date ? new Date(body.dispatch_date) : null;
  }

  await line.save();
  plan.updated_by = userId(user);
  await plan.save();
  await logActivity(user, planId, 'updated', 'Dispatch details updated on plan order');

  return getWithOrders(planId);
}

async function generateLr(planId, planOrderId, user) {
  assertCanExecute(user);
  const { TransportPlan, TransportPlanOrder } = getModels();
  const plan = await TransportPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Transport plan not found');
  if (!['submitted', 'in_transit'].includes(plan.status)) {
    throw new ApiError(400, 'LR can only be generated on submitted or in-transit plans');
  }

  const line = await TransportPlanOrder.findOne({
    _id: planOrderId,
    transport_plan: planId,
    deletedAt: null,
  });
  if (!line) throw new ApiError(404, 'Plan order not found');
  if (line.status === 'cancelled') {
    throw new ApiError(400, 'Cannot generate LR for a cancelled plan order');
  }
  if (line.lr_number) {
    throw new ApiError(400, 'LR number already exists for this plan order');
  }

  const stamp = new Date();
  const y = stamp.getUTCFullYear();
  const m = String(stamp.getUTCMonth() + 1).padStart(2, '0');
  const d = String(stamp.getUTCDate()).padStart(2, '0');
  const suffix = String(line._id).slice(-6).toUpperCase();
  line.lr_number = `LR-${y}${m}${d}-${suffix}`;
  await line.save();

  plan.updated_by = userId(user);
  await plan.save();
  await logActivity(user, planId, 'generated', `LR generated: ${line.lr_number}`);

  return getWithOrders(planId);
}

async function setPlanOrderStatus(planId, planOrderId, nextStatus, user, activityMessage) {
  assertCanExecute(user);
  const { TransportPlan, TransportPlanOrder } = getModels();
  const plan = await TransportPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Transport plan not found');
  if (!['submitted', 'in_transit'].includes(plan.status)) {
    throw new ApiError(400, `Cannot update order status on a plan in status "${plan.status}"`);
  }

  const line = await TransportPlanOrder.findOne({
    _id: planOrderId,
    transport_plan: planId,
    deletedAt: null,
  });
  if (!line) throw new ApiError(404, 'Plan order not found');
  if (line.status === 'cancelled') {
    throw new ApiError(400, 'Cannot update a cancelled plan order');
  }

  const transitions = {
    packed: ['pending'],
    dispatched: ['pending', 'packed'],
    delivered: ['dispatched'],
  };
  const allowedFrom = transitions[nextStatus] || [];
  if (!allowedFrom.includes(line.status)) {
    throw new ApiError(400, `Cannot mark "${nextStatus}" from status "${line.status}"`);
  }

  if (nextStatus === 'dispatched') {
    if (!line.lr_number) {
      throw new ApiError(400, 'Generate LR number before marking dispatched');
    }
    line.dispatch_date = line.dispatch_date || new Date();
  }

  line.status = nextStatus;
  await line.save();

  plan.updated_by = userId(user);
  await plan.save();
  await logActivity(user, planId, 'status_changed', activityMessage);
  await maybeAdvancePlanStatus(planId, user);

  return getWithOrders(planId);
}

async function markPacked(planId, planOrderId, user) {
  return setPlanOrderStatus(planId, planOrderId, 'packed', user, 'Plan order marked packed');
}

async function markDispatched(planId, planOrderId, user) {
  return setPlanOrderStatus(planId, planOrderId, 'dispatched', user, 'Plan order marked dispatched');
}

async function markDelivered(planId, planOrderId, user) {
  return setPlanOrderStatus(planId, planOrderId, 'delivered', user, 'Plan order marked delivered');
}

/**
 * Orders that have at least one OrderDispatch in `submitted` status
 * (created + submitted, transport not created yet) and not already on an active plan.
 */
async function listEligibleOrders(query = {}, _user) {
  const { Order, OrderDispatch, TransportShipment } = getModels();

  const assignedDispatchIds = await getAssignedDispatchIds();

  // Dispatches that already have a TransportShipment record
  const shippedDispatchIds = await TransportShipment.distinct('dispatch', {
    deletedAt: null,
  });

  const excludeDispatchIds = [
    ...assignedDispatchIds.map(String),
    ...shippedDispatchIds.map(String),
  ];
  const excludeObjectIds = [...new Set(excludeDispatchIds)].filter(Boolean);

  const availableDispatchFilter = {
    deletedAt: null,
    dispatch_status: 'submitted',
    ...(excludeObjectIds.length ? { _id: { $nin: excludeObjectIds } } : {}),
  };

  if (query.search) {
    const q = String(query.search).trim();
    if (q) {
      availableDispatchFilter.$or = [
        { bill_number: { $regex: q, $options: 'i' } },
        { dispatch_no: { $regex: q, $options: 'i' } },
      ];
    }
  }

  const availableDispatches = await OrderDispatch.find(availableDispatchFilter)
    .select(
      'order dispatch_no dispatch_status bill_number billing_date dispatch_items packed_at dispatched_at createdAt'
    )
    .sort({ createdAt: -1 })
    .lean();

  const orderIdsFromDispatches = [
    ...new Set(availableDispatches.map((d) => String(d.order))),
  ];

  if (orderIdsFromDispatches.length === 0) {
    return { total: 0, page: 1, limit: 50, pages: 0, data: [] };
  }

  const filter = {
    deletedAt: null,
    _id: { $in: orderIdsFromDispatches },
    lifecycle_status: { $ne: 'cancelled' },
    status: { $nin: ['cancelled', 'closed'] },
  };

  if (query.party) filter.party = query.party;
  if (query.customer) filter.customer = query.customer;
  if (query.priority && query.priority !== 'all') {
    filter.priority = String(query.priority).toLowerCase();
  }
  if (query.from || query.to) {
    filter.order_date = {};
    if (query.from) filter.order_date.$gte = startOfDay(query.from);
    if (query.to) filter.order_date.$lte = endOfDay(query.to);
  }

  if (query.search) {
    const q = String(query.search).trim();
    if (q) {
      const { Party, User } = getModels();
      const [parties, salesUsers] = await Promise.all([
        Party.find({
          deletedAt: null,
          $or: [
            { party_name: { $regex: q, $options: 'i' } },
            { 'billing_address.city': { $regex: q, $options: 'i' } },
            { 'shipping_address.city': { $regex: q, $options: 'i' } },
          ],
        })
          .select('_id')
          .lean(),
        User.find({
          department: 'sales',
          is_active: { $ne: false },
          $or: [{ name: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }],
        })
          .select('_id')
          .lean(),
      ]);

      filter.$or = [
        { order_no: { $regex: q, $options: 'i' } },
        { party: { $in: parties.map((p) => p._id) } },
        { assigned_sales_user: { $in: salesUsers.map((u) => u._id) } },
        // Keep orders whose dispatch_no / bill matched above
        { _id: { $in: orderIdsFromDispatches } },
      ];
    }
  }

  if (query.area) {
    const area = String(query.area).trim();
    const { Party } = getModels();
    const parties = await Party.find({
      deletedAt: null,
      $or: [
        { 'billing_address.city': { $regex: area, $options: 'i' } },
        { 'billing_address.district': { $regex: area, $options: 'i' } },
        { 'shipping_address.city': { $regex: area, $options: 'i' } },
        { 'shipping_address.district': { $regex: area, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();
    filter.party = { $in: parties.map((p) => p._id) };
  }

  const limit = Math.min(parseInt(query.limit, 10) || 50, 200);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter)
      .populate('party', 'party_name mobile billing_address shipping_address')
      .populate('assigned_sales_user', 'name email')
      .sort({ priority: -1, order_date: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const dispatchesByOrder = new Map();
  for (const d of availableDispatches) {
    const key = String(d.order);
    if (!dispatchesByOrder.has(key)) dispatchesByOrder.set(key, []);
    const qty = Array.isArray(d.dispatch_items)
      ? d.dispatch_items.reduce((s, it) => s + (Number(it.dispatched_quantity) || 0), 0)
      : 0;
    dispatchesByOrder.get(key).push({
      ...toPlain(d),
      dispatched_quantity_total: qty,
    });
  }

  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 0,
    data: rows
      .map((r) => {
        const available = dispatchesByOrder.get(String(r._id)) || [];
        if (available.length === 0) return null;
        const party = r.party && typeof r.party === 'object' ? r.party : null;
        const city =
          party?.shipping_address?.city ||
          party?.billing_address?.city ||
          null;
        return {
          ...toPlain(r),
          city,
          invoice_value: r.grand_total || 0,
          available_dispatches: available,
          available_dispatch_count: available.length,
        };
      })
      .filter(Boolean),
  };
}

async function stats(query = {}, _user) {
  const { TransportPlan, TransportPlanOrder } = getModels();
  const filter = { deletedAt: null };

  if (query.from || query.to) {
    filter.plan_date = {};
    if (query.from) filter.plan_date.$gte = startOfDay(query.from);
    if (query.to) filter.plan_date.$lte = endOfDay(query.to);
  }

  const today = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const [
    todayPlans,
    pendingDispatch,
    inTransit,
    completed,
    cancelled,
    statusGroups,
    orderAgg,
    monthlyTrend,
    agentPerf,
  ] = await Promise.all([
    TransportPlan.countDocuments({ ...filter, plan_date: { $gte: today, $lte: todayEnd } }),
    TransportPlan.countDocuments({ ...filter, status: 'submitted' }),
    TransportPlan.countDocuments({ ...filter, status: 'in_transit' }),
    TransportPlan.countDocuments({ ...filter, status: 'completed' }),
    TransportPlan.countDocuments({ ...filter, status: 'cancelled' }),
    TransportPlan.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    TransportPlanOrder.aggregate([
      {
        $lookup: {
          from: 'transportplans',
          localField: 'transport_plan',
          foreignField: '_id',
          as: 'plan',
        },
      },
      { $unwind: '$plan' },
      {
        $match: {
          deletedAt: null,
          status: { $ne: 'cancelled' },
          'plan.deletedAt': null,
          ...(filter.plan_date ? { 'plan.plan_date': filter.plan_date } : {}),
        },
      },
      {
        $lookup: {
          from: 'orders',
          localField: 'order',
          foreignField: '_id',
          as: 'ord',
        },
      },
      { $unwind: { path: '$ord', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          total_orders: { $sum: 1 },
          total_packages: { $sum: { $ifNull: ['$packages', 0] } },
          total_weight: { $sum: { $ifNull: ['$weight', 0] } },
          total_invoice_value: { $sum: { $ifNull: ['$ord.grand_total', 0] } },
        },
      },
    ]),
    TransportPlan.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            year: { $year: '$plan_date' },
            month: { $month: '$plan_date' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 },
    ]),
    TransportPlan.aggregate([
      { $match: { ...filter, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: '$transport_agent',
          plans: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
        },
      },
      { $sort: { plans: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const totals = orderAgg[0] || {
    total_orders: 0,
    total_packages: 0,
    total_weight: 0,
    total_invoice_value: 0,
  };

  const agentIds = agentPerf.map((a) => a._id).filter(Boolean);
  const { TransportAgent } = getModels();
  const agents = await TransportAgent.find({ _id: { $in: agentIds } })
    .select('agent_name agent_code')
    .lean();
  const agentMap = new Map(agents.map((a) => [String(a._id), a]));

  return {
    today_plans: todayPlans,
    pending_dispatch: pendingDispatch,
    in_transit: inTransit,
    completed,
    cancelled,
    total_orders: totals.total_orders,
    total_packages: totals.total_packages,
    total_weight: totals.total_weight,
    total_invoice_value: totals.total_invoice_value,
    by_status: Object.fromEntries(statusGroups.map((g) => [g._id, g.count])),
    monthly_trend: monthlyTrend.map((r) => ({
      year: r._id.year,
      month: r._id.month,
      count: r.count,
    })),
    agent_performance: agentPerf.map((a) => ({
      transport_agent: a._id,
      agent_name: agentMap.get(String(a._id))?.agent_name || null,
      agent_code: agentMap.get(String(a._id))?.agent_code || null,
      plans: a.plans,
      completed: a.completed,
    })),
  };
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  submit,
  complete,
  cancel,
  addOrders,
  removeOrder,
  cancelPlanOrder,
  updateDispatchDetails,
  generateLr,
  markPacked,
  markDispatched,
  markDelivered,
  listEligibleOrders,
  stats,
};
