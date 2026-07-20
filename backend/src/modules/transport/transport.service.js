/**
 * @fileoverview Transport shipment helpers backed by TransportShipment.
 * @module modules/transport/transport.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const fulfillmentService = require('../orders/orderFulfillment.service');
const orderQueue = require('../../queues/order.queue');
const {
  ORDER_STATUS,
  ORDER_WORKFLOW_STAGE,
  ORDER_LIFECYCLE_STATUS,
} = require('../orders/order.constants');

const TR_NF = 'Transport shipment not found';

function generateShipmentNo() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SHP-${ts}-${rand}`;
}

function normalizeShipmentStatus(value, fallback = 'created') {
  const allowed = new Set([
    'created',
    'transporter_assigned',
    'vehicle_assigned',
    'pickup_pending',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'delivery_failed',
    'returned',
  ]);
  return allowed.has(value) ? value : fallback;
}

function workflowActionForShipmentStatus(status) {
  return (
    {
      created: 'partially_transported',
      transporter_assigned: 'transporter_assigned',
      vehicle_assigned: 'vehicle_assigned',
      pickup_pending: 'partially_transported',
      picked_up: 'picked_up',
      in_transit: 'in_transit',
      out_for_delivery: 'out_for_delivery',
      delivered: 'delivered',
      delivery_failed: 'delivery_failed',
      returned: 'returned',
    }[status] || 'partially_transported'
  );
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function list({
  order,
  dispatch,
  transport_agent,
  shipment_status,
  vehicle_number,
  vehicle_no,
  driver_mobile,
  driver_phone,
  driver_name,
} = {}) {
  const q = { deletedAt: null };
  if (order) q.order = order;
  if (dispatch) q.dispatch = dispatch;
  if (transport_agent) q.transport_agent = transport_agent;
  if (shipment_status) q.shipment_status = shipment_status;
  const veh = String(vehicle_number || vehicle_no || '').trim();
  if (veh) {
    q.vehicle_number = new RegExp(`^${escapeRegex(veh)}$`, 'i');
  }
  const mobile = String(driver_mobile || driver_phone || '').trim();
  const name = String(driver_name || '').trim();
  if (mobile || name) {
    const driverClauses = [];
    if (mobile) {
      driverClauses.push({
        driver_mobile: new RegExp(`^${escapeRegex(mobile)}$`, 'i'),
      });
    }
    if (name) {
      driverClauses.push({
        driver_name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      });
    }
    if (driverClauses.length === 1) {
      Object.assign(q, driverClauses[0]);
    } else {
      q.$or = driverClauses;
    }
  }
  const rows = await getModels()
    .TransportShipment.find(q)
    .populate({
      path: 'order',
      select: 'order_no party customer',
      populate: [
        { path: 'party', select: 'party_name' },
        { path: 'customer', select: 'party_name' },
      ],
    })
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().TransportShipment.findById(id).lean();
  if (!row) throw new ApiError(404, TR_NF);
  return toPlain(row);
}

async function recalculateOrderShipmentState(orderId, user) {
  const { Order, TransportShipment } = getModels();
  const fulfillmentState = await fulfillmentService.recalculateFromExecutions(orderId, user);
  const orderDoc = await Order.findById(orderId);
  if (!orderDoc) return null;

  const shipments = await TransportShipment.find({
    order: orderId,
    deletedAt: null,
    shipment_status: { $nin: ['delivery_failed', 'returned'] },
  }).lean();

  if (shipments.length === 0) {
    if (orderDoc.dispatch_status === 'completed') {
      orderDoc.status = ORDER_STATUS.DISPATCH;
      orderDoc.current_action = 'full_dispatch';
    } else if (orderDoc.dispatch_status === 'partial') {
      orderDoc.status = ORDER_STATUS.DISPATCH;
      orderDoc.current_action = 'partial_dispatch';
    } else if (Number(orderDoc.order_items?.reduce((s, l) => s + Number(l.approved_quantity || 0), 0) || 0) > 0) {
      orderDoc.status = ORDER_STATUS.DISPATCH;
      orderDoc.current_action = 'sent_to_dispatch';
    }
  } else if (shipments.every((shipment) => shipment.shipment_status === 'delivered')) {
    orderDoc.delivery_status = fulfillmentState.fullyDelivered ? 'completed' : 'partial';
    if (fulfillmentState.fullyDelivered && orderDoc.status !== ORDER_STATUS.CLOSED && !orderDoc.closed_at) {
      orderDoc.lifecycle_status = ORDER_LIFECYCLE_STATUS.FULFILLED;
      orderDoc.workflow_stage = ORDER_WORKFLOW_STAGE.COMPLETED;
      orderDoc.current_action = 'delivered';
    } else if (
      orderDoc.status !== ORDER_STATUS.CLOSED &&
      !orderDoc.closed_at &&
      ![ORDER_LIFECYCLE_STATUS.CANCELLED, ORDER_LIFECYCLE_STATUS.ON_HOLD].includes(orderDoc.lifecycle_status)
    ) {
      orderDoc.lifecycle_status = ORDER_LIFECYCLE_STATUS.PARTIALLY_FULFILLED;
      orderDoc.workflow_stage = ORDER_WORKFLOW_STAGE.DISPATCH;
      orderDoc.current_action = 'delivered';
    }
    orderDoc.status = orderDoc.status === ORDER_STATUS.CLOSED || orderDoc.closed_at
      ? ORDER_STATUS.CLOSED
      : ORDER_STATUS.DELIVERED;
  } else {
    orderDoc.delivery_status = fulfillmentState.fullyDelivered ? 'completed' : 'partial';
    orderDoc.workflow_stage = ORDER_WORKFLOW_STAGE.DISPATCH;
    if (shipments.some((shipment) => ['in_transit', 'out_for_delivery', 'picked_up'].includes(shipment.shipment_status))) {
      orderDoc.current_action = shipments.some((s) => s.shipment_status === 'out_for_delivery')
        ? 'out_for_delivery'
        : 'in_transit';
      orderDoc.status = ORDER_STATUS.IN_TRANSIT;
    } else if (shipments.some((s) => ['transporter_assigned', 'vehicle_assigned'].includes(s.shipment_status))) {
      orderDoc.current_action = 'transporter_assigned';
      orderDoc.status = ORDER_STATUS.IN_TRANSIT;
    } else {
      const { OrderDispatch } = getModels();
      const dispatches = await OrderDispatch.find({
        order: orderId,
        deletedAt: null,
        dispatch_status: { $ne: 'cancelled' },
      }).lean();

      const shippedDispatchIds = new Set(shipments.map((s) => String(s.dispatch)));
      const allDispatchesShipped =
        dispatches.length > 0 && dispatches.every((d) => shippedDispatchIds.has(String(d._id)));

      if (allDispatchesShipped) {
        orderDoc.current_action = 'fully_transported';
        orderDoc.status = ORDER_STATUS.IN_TRANSIT;
      } else {
        orderDoc.current_action = 'partially_transported';
        orderDoc.status = ORDER_STATUS.IN_TRANSIT;
      }
    }
  }

  orderDoc.updated_by = user._id;
  await orderDoc.save();

  const allShipmentsDelivered =
    shipments.length > 0 && shipments.every((s) => s.shipment_status === 'delivered');

  if (
    fulfillmentState.fullyDelivered &&
    allShipmentsDelivered &&
    orderDoc.status !== ORDER_STATUS.CLOSED &&
    !orderDoc.closed_at &&
    String(orderDoc.lifecycle_status || '') !== ORDER_LIFECYCLE_STATUS.CANCELLED
  ) {
    const orderService = require('../orders/order.service');
    try {
      return await orderService.closeAfterFullDelivery(
        orderId,
        { remarks: 'Closed after full delivery' },
        user,
      );
    } catch (err) {
      if (err.statusCode !== 400) throw err;
    }
  }

  return toPlain(orderDoc.toObject());
}

function workflowRoleForUser(user) {
  return user?.department === 'admin' ? 'admin' : 'dispatch';
}

async function enqueuePostTransportJobs(orderId, userId, extras = {}) {
  const oid = String(orderId);
  await orderQueue.enqueue({
    type: 'post_transport_shipment',
    payload: {
      orderId: oid,
      userId: userId ? String(userId) : undefined,
      ...extras,
    },
  });
}

async function processPostTransportShipmentJob(payload = {}) {
  const orderId = payload.orderId;
  if (!orderId) throw new Error('post_transport_shipment requires orderId');
  if (!payload.userId) throw new Error('post_transport_shipment requires userId');

  const { Order, User } = getModels();
  const orderBefore = await Order.findById(orderId).lean();
  if (!orderBefore) return { orderId, skipped: true };

  const actor = await User.findById(payload.userId).lean();
  if (!actor) throw new Error(`post_transport_shipment user not found: ${payload.userId}`);
  const user = toPlain(actor);

  const orderState = await recalculateOrderShipmentState(orderId, user);
  if (!orderState) return { orderId, skipped: true };

  const action =
    payload.workflowActionOverride
    || (payload.shipmentStatus
      ? workflowActionForShipmentStatus(payload.shipmentStatus)
      : null)
    || orderState.current_action
    || 'partially_transported';

  await getModels().OrderWorkflow.create({
    order: orderId,
    action_by: payload.userId,
    role: workflowRoleForUser(user),
    action,
    from_stage: orderBefore.workflow_stage,
    to_stage: orderState.workflow_stage || ORDER_WORKFLOW_STAGE.DISPATCH,
    from_status: orderBefore.status,
    to_status: orderState.status || ORDER_STATUS.IN_TRANSIT,
    remarks: payload.remarks || '',
    revision_number: orderState.current_revision || orderBefore.current_revision || 1,
    metadata: payload.metadata || undefined,
  });

  return {
    orderId,
    status: orderState.status,
    current_action: orderState.current_action,
  };
}

async function syncTransportPlanLineFromShipment(shipment, user, { event = 'created' } = {}) {
  const { OrderDispatch, TransportPlan, TransportPlanOrder } = getModels();
  const dispatchId = shipment?.dispatch;
  if (!dispatchId) return null;

  if (event === 'created') {
    await OrderDispatch.updateOne(
      { _id: dispatchId, deletedAt: null, dispatch_status: { $ne: 'cancelled' } },
      {
        $set: {
          dispatch_status: 'transport_created',
          dispatched_by: user?._id || user?.id || undefined,
          dispatched_at: shipment.dispatch_date || new Date(),
        },
      }
    );
  }

  const line = await TransportPlanOrder.findOne({
    dispatch: dispatchId,
    deletedAt: null,
    status: { $in: ['pending', 'packed', 'dispatched', 'delivered'] },
  });
  if (!line) return null;

  const dispatch = await OrderDispatch.findById(dispatchId)
    .select('bill_number')
    .lean();

  if (event === 'created') {
    const packed = Number(shipment.packed_boxes);
    const open = Number(shipment.open_boxes);
    const packages =
      Number.isFinite(packed) || Number.isFinite(open)
        ? (Number.isFinite(packed) ? packed : 0) + (Number.isFinite(open) ? open : 0)
        : undefined;

    if (shipment.lr_number) line.lr_number = shipment.lr_number;
    if (dispatch?.bill_number) line.invoice_number = dispatch.bill_number;
    if (packages !== undefined) line.packages = packages;
    if (shipment.weight !== undefined && shipment.weight !== null) {
      line.weight = Number(shipment.weight);
    }
    if (shipment.dispatch_date) line.dispatch_date = new Date(shipment.dispatch_date);
    else if (!line.dispatch_date) line.dispatch_date = new Date();
    line.status = 'dispatched';
  }

  if (event === 'delivered' || shipment.shipment_status === 'delivered') {
    line.status = 'delivered';
  }

  // Keep LR / weight in sync if later patched on the shipment
  if (event === 'updated') {
    if (shipment.lr_number) line.lr_number = shipment.lr_number;
    if (shipment.weight !== undefined && shipment.weight !== null) {
      line.weight = Number(shipment.weight);
    }
    const packed = Number(shipment.packed_boxes);
    const open = Number(shipment.open_boxes);
    if (Number.isFinite(packed) || Number.isFinite(open)) {
      line.packages =
        (Number.isFinite(packed) ? packed : 0) + (Number.isFinite(open) ? open : 0);
    }
  }

  await line.save();

  const plan = await TransportPlan.findOne({ _id: line.transport_plan, deletedAt: null });
  if (plan) {
    if (line.status === 'dispatched' && plan.status === 'submitted') {
      plan.status = 'in_transit';
      plan.updated_by = user?._id || user?.id || undefined;
      await plan.save();
    } else if (line.status === 'delivered') {
      const openLines = await TransportPlanOrder.countDocuments({
        transport_plan: plan._id,
        deletedAt: null,
        status: { $nin: ['cancelled', 'delivered'] },
      });
      if (openLines === 0 && !['completed', 'cancelled'].includes(plan.status)) {
        plan.status = 'completed';
        plan.completed_at = new Date();
        plan.updated_by = user?._id || user?.id || undefined;
        await plan.save();
      } else if (plan.status === 'submitted') {
        plan.status = 'in_transit';
        plan.updated_by = user?._id || user?.id || undefined;
        await plan.save();
      }
    }
  }

  return line;
}

async function create(body, user) {
  const { Order, OrderDispatch, TransportShipment } = getModels();
  const order = await Order.findById(body.order).lean();
  if (!order) throw new ApiError(404, 'Order not found');

  const dispatchExists = await OrderDispatch.exists({ _id: body.dispatch, order: body.order });
  if (!dispatchExists) throw new ApiError(404, 'Order dispatch not found');

  const doc = await TransportShipment.create({
    shipment_no: body.shipment_no || generateShipmentNo(),
    order: body.order,
    dispatch: body.dispatch,
    transport_agent: body.transport_agent || undefined,
    transporter: body.transporter || undefined,
    shipment_status: normalizeShipmentStatus(body.shipment_status || body.status),
    transporter_type: body.transporter_type || 'internal',
    transporter_name: body.transporter_name || '',
    transporter_phone: body.transporter_phone || '',
    source_location: body.source_location || '',
    destination_location: body.destination_location || '',
    route_details: body.route_details || '',
    vehicle_number: body.vehicle_number || body.vehicle_no || '',
    driver_name: body.driver_name || '',
    driver_mobile: body.driver_mobile || body.driver_phone || '',
    lr_number: body.lr_number || '',
    tracking_number: body.tracking_number || '',
    eway_bill_no: body.eway_bill_no || '',
    dispatch_date: body.dispatch_date ? new Date(body.dispatch_date) : undefined,
    pickup_date: body.pickup_date ? new Date(body.pickup_date) : undefined,
    expected_delivery_date: body.expected_delivery_date ? new Date(body.expected_delivery_date) : undefined,
    actual_delivery_date: body.actual_delivery_date ? new Date(body.actual_delivery_date) : undefined,
    delivery_proof_url: body.delivery_proof_url || body.proof_of_delivery || '',
    remarks: (() => {
      const formattedTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const text = body.remarks ? body.remarks.trim() : 'Shipment initialized';
      return `[${formattedTimestamp}] [CREATED]: ${text}`;
    })(),
    weight: body.weight !== undefined ? Number(body.weight) : undefined,
    weight_unit: body.weight_unit || 'Kg',
    packed_boxes: body.packed_boxes !== undefined ? Number(body.packed_boxes) : undefined,
    open_boxes: body.open_boxes !== undefined ? Number(body.open_boxes) : undefined,
    total_quantity: body.total_quantity !== undefined ? Number(body.total_quantity) : undefined,
    created_by: user._id,
  });

  await syncTransportPlanLineFromShipment(doc, user, { event: 'created' });

  await enqueuePostTransportJobs(body.order, user._id, {
    remarks: body.remarks || `Shipment ${doc.shipment_no} created`,
    shipmentNo: doc.shipment_no,
    shipmentStatus: doc.shipment_status,
    metadata: {
      transport_shipment_id: String(doc._id),
      event: 'created',
    },
  });

  await activityService.create({
    actor: user._id,
    entity_type: 'transport',
    entity_id: doc._id.toString(),
    action: 'created',
    message: `Transport shipment ${doc.shipment_no} arranged for order ${order.order_no}`,
  });

  return toPlain(doc.toObject());
}

async function patch(id, patchBody, user) {
  const { TransportShipment, OrderFlag } = getModels();
  const doc = await TransportShipment.findById(id);
  if (!doc) throw new ApiError(404, TR_NF);

  const patch = patchBody || {};
  const prevStatus = doc.shipment_status;
  if (patch.shipment_status || patch.status) {
    doc.shipment_status = normalizeShipmentStatus(patch.shipment_status || patch.status, doc.shipment_status);
  }
  for (const field of [
    'transport_agent',
    'transporter',
    'transporter_type',
    'transporter_name',
    'transporter_phone',
    'source_location',
    'destination_location',
    'route_details',
    'vehicle_number',
    'driver_name',
    'driver_mobile',
    'lr_number',
    'tracking_number',
    'eway_bill_no',
    'delivery_proof_url',
    'weight',
    'weight_unit',
    'packed_boxes',
    'open_boxes',
    'total_quantity',
  ]) {
    if (patch[field] !== undefined) doc[field] = patch[field] || undefined;
  }

  // Update remarks history on status change, or update/set remarks field normally
  const isStatusChanged = (patch.shipment_status || patch.status) && doc.shipment_status !== prevStatus;
  if (isStatusChanged) {
    const statusLabel = doc.shipment_status.replace(/_/g, ' ').toUpperCase();
    const formattedTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const remarkText = (patch.remarks && patch.remarks.trim()) || `Status updated to ${statusLabel.toLowerCase()}`;
    const newRemarkLine = `[${formattedTimestamp}] [${statusLabel}]: ${remarkText}`;
    doc.remarks = doc.remarks ? `${doc.remarks}\n${newRemarkLine}` : newRemarkLine;
  } else if (patch.remarks !== undefined) {
    // Regular update of remarks (or initial overwrite/edit)
    doc.remarks = patch.remarks || undefined;
  }
  if (patch.vehicle_no !== undefined) doc.vehicle_number = patch.vehicle_no || '';
  if (patch.driver_phone !== undefined) doc.driver_mobile = patch.driver_phone || '';
  for (const dateField of ['dispatch_date', 'pickup_date', 'expected_delivery_date', 'actual_delivery_date']) {
    if (patch[dateField] !== undefined) doc[dateField] = patch[dateField] ? new Date(patch[dateField]) : undefined;
  }
  if (doc.shipment_status === 'delivered' && !doc.actual_delivery_date) doc.actual_delivery_date = new Date();

  await doc.save();

  if (doc.shipment_status === 'delivery_failed') {
    await OrderFlag.create({
      order: doc.order,
      flag_type: 'vehicle_issue',
      severity: 'high',
      title: 'Delivery failed',
      description: patch.failure_reason || doc.remarks || 'Transport shipment delivery failed',
      blocks_order: true,
      status: 'open',
      department: 'dispatch',
      raised_by: user._id,
    });
    const { recomputeOrderFlagAggregates } = require('../flags/flag.service');
    await recomputeOrderFlagAggregates(String(doc.order));
  }

  await syncTransportPlanLineFromShipment(doc, user, {
    event: doc.shipment_status === 'delivered' ? 'delivered' : 'updated',
  });

  await enqueuePostTransportJobs(doc.order, user._id, {
    remarks: patch.remarks || '',
    shipmentStatus: doc.shipment_status,
    metadata: {
      transport_shipment_id: String(doc._id),
      event: 'updated',
    },
  });

  return toPlain(doc.toObject());
}

async function listDeleted({ order } = {}) {
  const q = {};
  if (order) q.order = order;
  const rows = await listDeletedLean(getModels().TransportShipment, q);
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().TransportShipment, id, { notFoundMessage: TR_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'transport',
    entity_id: plain._id,
    action: 'deleted',
    message: `Transport shipment ${plain.shipment_no} soft-deleted`,
  });
  await enqueuePostTransportJobs(plain.order, user._id, {
    remarks: `Shipment ${plain.shipment_no} soft-deleted`,
    metadata: {
      transport_shipment_id: String(plain._id),
      event: 'deleted',
    },
  });
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().TransportShipment, id, { notFoundMessage: TR_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'transport',
    entity_id: plain._id,
    action: 'restored',
    message: `Transport shipment ${plain.shipment_no} restored`,
  });
  await enqueuePostTransportJobs(plain.order, user._id, {
    remarks: `Shipment ${plain.shipment_no} restored`,
    metadata: {
      transport_shipment_id: String(plain._id),
      event: 'restored',
    },
  });
  return plain;
}

async function applyTransportDeliveryOutcome(transportId, { status, remarks }, user) {
  const { TransportShipment } = getModels();
  const doc = await TransportShipment.findById(transportId);
  if (!doc) throw new ApiError(404, TR_NF);

  const prevStatus = doc.shipment_status;
  const nextStatus = normalizeShipmentStatus(status, doc.shipment_status);
  doc.shipment_status = nextStatus;

  if (nextStatus !== prevStatus) {
    const statusLabel = nextStatus.replace(/_/g, ' ').toUpperCase();
    const formattedTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const remarkText = (remarks && remarks.trim()) || `Status updated to ${statusLabel.toLowerCase()}`;
    const newRemarkLine = `[${formattedTimestamp}] [${statusLabel}]: ${remarkText}`;
    doc.remarks = doc.remarks ? `${doc.remarks}\n${newRemarkLine}` : newRemarkLine;
  } else if (remarks !== undefined && remarks.trim()) {
    const formattedTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newRemarkLine = `[${formattedTimestamp}] [NOTE]: ${remarks.trim()}`;
    doc.remarks = doc.remarks ? `${doc.remarks}\n${newRemarkLine}` : newRemarkLine;
  }

  if (doc.shipment_status === 'delivered' && !doc.actual_delivery_date) {
    doc.actual_delivery_date = new Date();
  }

  await doc.save();
  await syncTransportPlanLineFromShipment(doc, user, {
    event: doc.shipment_status === 'delivered' ? 'delivered' : 'updated',
  });
  return toPlain(doc.toObject());
}

module.exports = {
  list,
  get,
  create,
  patch,
  listDeleted,
  softDelete,
  restore,
  recalculateOrderShipmentState,
  processPostTransportShipmentJob,
  applyTransportDeliveryOutcome,
  workflowActionForShipmentStatus,
  workflowRoleForUser: workflowRoleForUser,
};
