/**
 * @fileoverview Order department assignee persistence (multiple users per department per order).
 * @module modules/orders/orderAssignee.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const {
  DEPARTMENTS,
  DEPARTMENT_TO_ORDER_FIELD,
  PATCH_KEY_TO_DEPARTMENT,
  ASSIGNED_USER_ORDER_FIELDS,
  normalizeDepartment,
  normalizeUserId,
  getAssignedUserIdFromOrder,
  getAssigneeMapFromOrder,
  pickAssigneePatch,
  assigneePopulate,
  buildAssignedUserVisibilityOr,
  canUserBypassAssigneeVisibility,
  dedupeAssigneeEntries,
  dedupeAssigneeRows,
  primaryAssigneeIdByDepartment,
} = require('./orderAssignee.util');

function buildUpsertOp(orderId, department, assigneeId, assignedBy, assignedAt, remarks = '') {
  return {
    updateOne: {
      filter: { order: orderId, department, assignee: assigneeId },
      update: {
        $set: {
          assigned_by: assignedBy || undefined,
          assigned_at: assignedAt,
          remarks,
        },
        $setOnInsert: { order: orderId, department, assignee: assigneeId },
      },
      upsert: true,
    },
  };
}

async function fetchAssigneeRows(filter, { populate = true } = {}) {
  let query = getModels().OrderAssignee.find(filter)
    .sort({ department: 1, assigned_at: -1 });
  if (populate) query = assigneePopulate(query);
  const rows = await query.lean();
  return dedupeAssigneeRows(rows);
}

async function listByOrder(orderId, { populate = true } = {}) {
  return (await fetchAssigneeRows({ order: orderId }, { populate })).map(toPlain);
}

async function listByOrderAndDepartment(orderId, department, { populate = true } = {}) {
  const dept = normalizeDepartment(department);
  if (!dept) throw new ApiError(400, 'Invalid assignee department');
  return (await fetchAssigneeRows({ order: orderId, department: dept }, { populate })).map(toPlain);
}

async function getOrderIdsWhereUserIsAssignee(userId) {
  const id = normalizeUserId(userId);
  if (!id) return [];
  return getModels().OrderAssignee.distinct('order', { assignee: id });
}

/** Build visibility $or (denormalized fields + OrderAssignee), single assignee lookup. */
async function buildAssigneeVisibilityOr(user) {
  if (canUserBypassAssigneeVisibility(user)) return null;
  const userId = normalizeUserId(user?._id);
  if (!userId) return null;

  const or = buildAssignedUserVisibilityOr(userId);
  const orderIds = await getOrderIdsWhereUserIsAssignee(userId);
  if (orderIds.length) or.push({ _id: { $in: orderIds } });
  return or;
}

async function applyAssigneeVisibilityFilter(query, user) {
  const or = await buildAssigneeVisibilityOr(user);
  if (or) query.$or = or;
}

async function appendAssigneeVisibilityAnd(andConditions, user) {
  const or = await buildAssigneeVisibilityOr(user);
  if (or) andConditions.push({ $or: or });
}

/**
 * Resolve primary assignee for a department: denormalized order field first,
 * then most recently assigned OrderAssignee row.
 */
async function resolveAssigneeUserId(orderOrId, department) {
  const dept = normalizeDepartment(department);
  if (!dept) return null;

  if (typeof orderOrId === 'object' && orderOrId) {
    const fromOrder = getAssignedUserIdFromOrder(orderOrId, dept);
    if (fromOrder) return fromOrder;
  }

  const orderId = typeof orderOrId === 'object' && orderOrId?._id
    ? String(orderOrId._id)
    : String(orderOrId || '');

  if (!orderId) return null;

  const row = await getModels().OrderAssignee.findOne({ order: orderId, department: dept })
    .sort({ assigned_at: -1 })
    .select('assignee')
    .lean();
  const fromRow = normalizeUserId(row?.assignee);
  if (fromRow) return fromRow;

  if (typeof orderOrId !== 'object' || !orderOrId) {
    const field = DEPARTMENT_TO_ORDER_FIELD[dept];
    const order = await getModels().Order.findById(orderId).select(field).lean();
    return getAssignedUserIdFromOrder(order, dept);
  }

  return null;
}

async function getByOrderAndDepartment(orderId, department, { orderFallback = null } = {}) {
  const dept = normalizeDepartment(department);
  if (!dept) throw new ApiError(400, 'Invalid assignee department');

  const rows = await listByOrderAndDepartment(orderId, dept);
  if (rows.length) return rows[0];

  const fromFallback = orderFallback
    ? getAssignedUserIdFromOrder(orderFallback, dept)
    : null;
  if (fromFallback) {
    return {
      order: String(orderId),
      department: dept,
      assignee: fromFallback,
      source: 'order_denormalized',
    };
  }

  const field = DEPARTMENT_TO_ORDER_FIELD[dept];
  const order = await getModels().Order.findById(orderId).select(field).lean();
  const assigneeId = getAssignedUserIdFromOrder(order, dept);
  if (!assigneeId) return null;

  return {
    order: String(orderId),
    department: dept,
    assignee: assigneeId,
    source: 'order_denormalized',
  };
}

/** Return department → primary assignee id for an order. */
async function getAssigneeMapByOrder(orderOrId) {
  const orderId = typeof orderOrId === 'object' && orderOrId?._id
    ? String(orderOrId._id)
    : String(orderOrId || '');

  const map = typeof orderOrId === 'object' && orderOrId
    ? getAssigneeMapFromOrder(orderOrId)
    : {};

  if (!orderId) return map;

  const rows = await getModels().OrderAssignee.find({ order: orderId })
    .select('department assignee assigned_at')
    .sort({ assigned_at: -1 })
    .lean();

  for (const [dept, id] of Object.entries(primaryAssigneeIdByDepartment(rows))) {
    if (!map[dept]) map[dept] = id;
  }

  const missing = DEPARTMENTS.filter((dept) => !map[dept]);
  if (!missing.length) return map;

  const orderDoc = typeof orderOrId === 'object' && orderOrId
    ? orderOrId
    : await getModels().Order.findById(orderId)
      .select(ASSIGNED_USER_ORDER_FIELDS.join(' '))
      .lean();

  if (orderDoc) {
    for (const dept of missing) {
      const id = getAssignedUserIdFromOrder(orderDoc, dept);
      if (id) map[dept] = id;
    }
  }

  return map;
}

/**
 * Add a department assignee without removing existing assignees for that department.
 */
async function addAssignee({
  orderId,
  department,
  assigneeId,
  assignedBy,
  remarks,
  syncOrder = false,
  orderDoc = null,
  populate = false,
}) {
  const dept = normalizeDepartment(department);
  if (!dept) throw new ApiError(400, 'Invalid assignee department');

  const userId = normalizeUserId(assigneeId);
  if (!userId) throw new ApiError(400, 'assigneeId is required');

  const { Order, OrderAssignee } = getModels();
  const field = DEPARTMENT_TO_ORDER_FIELD[dept];
  const assignedAt = new Date();

  const updated = await OrderAssignee.findOneAndUpdate(
    { order: orderId, department: dept, assignee: userId },
    {
      $set: {
        assigned_by: assignedBy || undefined,
        assigned_at: assignedAt,
        remarks: remarks || '',
      },
      $setOnInsert: { order: orderId, department: dept, assignee: userId },
    },
    { new: true, upsert: true, runValidators: true, lean: true },
  );

  if (syncOrder) {
    const order = orderDoc || await Order.findById(orderId).select(field);
    if (order) {
      order.set(field, userId);
      await order.save();
    }
  }

  if (!updated) return null;
  if (!populate) return toPlain(updated);

  const row = await assigneePopulate(OrderAssignee.findById(updated._id)).lean();
  return row ? toPlain(row) : null;
}

/**
 * Set or clear the primary assignee for a department on PATCH/create flows.
 * Does not remove other assignees for the department when setting a user.
 */
async function upsertAssignee(params) {
  const dept = normalizeDepartment(params.department);
  if (!dept) throw new ApiError(400, 'Invalid assignee department');

  const userId = normalizeUserId(params.assigneeId);
  const { Order, OrderAssignee } = getModels();
  const field = DEPARTMENT_TO_ORDER_FIELD[dept];

  if (!userId) {
    await OrderAssignee.deleteMany({ order: params.orderId, department: dept });
    if (params.syncOrder !== false) {
      const order = params.orderDoc || await Order.findById(params.orderId);
      if (order) {
        order.set(field, undefined);
        await order.save();
      }
    }
    return null;
  }

  return addAssignee({ ...params, department: dept, assigneeId: userId });
}

async function bulkUpsertAssignees(orderId, entries, assignedBy, { syncOrder = false } = {}) {
  const deduped = dedupeAssigneeEntries(entries);
  if (!deduped.length) return 0;

  const { Order, OrderAssignee } = getModels();
  const assignedAt = new Date();
  const ops = deduped.map(({ department, assigneeId, remarks }) =>
    buildUpsertOp(orderId, department, assigneeId, assignedBy, assignedAt, remarks || ''),
  );

  await OrderAssignee.bulkWrite(ops, { ordered: false });

  if (syncOrder) {
    const order = await Order.findById(orderId);
    if (order) {
      for (const { department, assigneeId } of deduped) {
        order.set(DEPARTMENT_TO_ORDER_FIELD[department], assigneeId);
      }
      await order.save();
    }
  }

  return deduped.length;
}

/** Batch seed assignees for many orders (migration / backfill). */
async function bulkSeedFromOrders(orders, assignedByFallback, { batchSize = 500 } = {}) {
  const allOps = [];
  const assignedAt = new Date();

  for (const order of orders || []) {
    const orderId = String(order._id);
    const assignedBy = order.created_by || assignedByFallback;
    const entries = dedupeAssigneeEntries(
      DEPARTMENTS.map((department) => ({
        department,
        assigneeId: getAssignedUserIdFromOrder(order, department),
      })).filter((entry) => entry.assigneeId),
    );

    for (const { department, assigneeId } of entries) {
      allOps.push(buildUpsertOp(orderId, department, assigneeId, assignedBy, assignedAt));
    }
  }

  if (!allOps.length) return { orders: 0, rows: 0 };

  const { OrderAssignee } = getModels();
  for (let i = 0; i < allOps.length; i += batchSize) {
    await OrderAssignee.bulkWrite(allOps.slice(i, i + batchSize), { ordered: false });
  }

  return { orders: orders.length, rows: allOps.length };
}

/** Sync OrderAssignee rows from order create / patch payload. */
async function syncFromOrderPatch(orderId, patch, assignedBy) {
  const assigneePatch = pickAssigneePatch(patch);
  const toUpsert = [];
  const toClear = [];

  for (const [key, assigneeId] of Object.entries(assigneePatch)) {
    const department = PATCH_KEY_TO_DEPARTMENT[key];
    const userId = normalizeUserId(assigneeId);
    if (userId) toUpsert.push({ department, assigneeId: userId });
    else toClear.push(department);
  }

  if (toClear.length) {
    await getModels().OrderAssignee.deleteMany({
      order: orderId,
      department: { $in: toClear },
    });
  }

  if (toUpsert.length) {
    await bulkUpsertAssignees(orderId, toUpsert, assignedBy, { syncOrder: false });
  }
}

/** Seed assignees when a new order is created. */
async function seedFromOrderCreate(order, assignedBy) {
  const orderId = String(order._id);
  const entries = DEPARTMENTS.map((department) => ({
    department,
    assigneeId: getAssignedUserIdFromOrder(order, department),
  })).filter((entry) => entry.assigneeId);

  if (!entries.length) return 0;
  return bulkUpsertAssignees(orderId, entries, assignedBy, { syncOrder: false });
}

module.exports = {
  DEPARTMENTS,
  DEPARTMENT_TO_ORDER_FIELD,
  PATCH_KEY_TO_DEPARTMENT,
  listByOrder,
  listByOrderAndDepartment,
  getOrderIdsWhereUserIsAssignee,
  buildAssigneeVisibilityOr,
  applyAssigneeVisibilityFilter,
  appendAssigneeVisibilityAnd,
  resolveAssigneeUserId,
  getByOrderAndDepartment,
  getAssigneeMapByOrder,
  addAssignee,
  upsertAssignee,
  bulkUpsertAssignees,
  bulkSeedFromOrders,
  syncFromOrderPatch,
  seedFromOrderCreate,
};
