/**
 * @fileoverview Transport shipment helpers backed by TransportShipment.
 * @module modules/transport/transport.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const { assertTransportAllowedForOrder } = require('./transport.policy');
const fulfillmentService = require('../orders/orderFulfillment.service');

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
  const rows = await getModels().TransportShipment.find(q).sort({ createdAt: -1 }).lean();
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
      orderDoc.status = 'full_dispatch_created';
      orderDoc.current_action = 'full_dispatch';
    } else if (orderDoc.dispatch_status === 'partial') {
      orderDoc.status = 'partial_dispatch_created';
      orderDoc.current_action = 'partial_dispatch';
    } else if (Number(orderDoc.order_items?.reduce((s, l) => s + Number(l.approved_quantity || 0), 0) || 0) > 0) {
      orderDoc.status = 'dispatch_pending';
      orderDoc.current_action = 'sent_to_dispatch';
    }
  } else if (shipments.every((shipment) => shipment.shipment_status === 'delivered')) {
    orderDoc.delivery_status = 'completed';
    orderDoc.lifecycle_status = 'fulfilled';
    orderDoc.workflow_stage = 'completed';
    orderDoc.current_action = 'delivered';
    orderDoc.status = 'delivered';
  } else {
    orderDoc.delivery_status = fulfillmentState.fullyDelivered ? 'completed' : 'partial';
    orderDoc.workflow_stage = 'dispatch_execution';
    if (shipments.some((shipment) => ['in_transit', 'out_for_delivery', 'picked_up'].includes(shipment.shipment_status))) {
      orderDoc.current_action = shipments.some((s) => s.shipment_status === 'out_for_delivery')
        ? 'out_for_delivery'
        : 'in_transit';
      orderDoc.status = 'in_transit';
    } else if (shipments.some((s) => ['transporter_assigned', 'vehicle_assigned'].includes(s.shipment_status))) {
      orderDoc.current_action = 'transporter_assigned';
      orderDoc.status = 'transport_assigned';
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
        orderDoc.status = 'fully_transported';
      } else {
        orderDoc.current_action = 'partially_transported';
        orderDoc.status = 'partially_transported';
      }
    }
  }

  orderDoc.updated_by = user._id;
  await orderDoc.save();
  return toPlain(orderDoc.toObject());
}

async function create(body, user) {
  const { Order, OrderDispatch, TransportShipment, OrderWorkflow } = getModels();
  const order = await Order.findById(body.order).lean();
  if (!order) throw new ApiError(404, 'Order not found');

  const dispatchExists = await OrderDispatch.exists({ _id: body.dispatch, order: body.order });
  if (!dispatchExists) throw new ApiError(404, 'Order dispatch not found');

  assertTransportAllowedForOrder(toPlain(order));

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
    remarks: body.remarks || '',
    created_by: user._id,
  });

  const orderState = await recalculateOrderShipmentState(body.order, user);
  await OrderWorkflow.create({
    order: body.order,
    action_by: user._id,
    role: user.department === 'admin' ? 'admin' : 'dispatch',
    action: orderState?.current_action || 'partially_transported',
    to_stage: 'dispatch_execution',
    to_status: orderState?.status || doc.shipment_status,
    remarks: body.remarks || `Shipment ${doc.shipment_no} created`,
    revision_number: orderState?.current_revision || order.current_revision || 1,
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
  const { TransportShipment, OrderWorkflow, OrderFlag } = getModels();
  const doc = await TransportShipment.findById(id);
  if (!doc) throw new ApiError(404, TR_NF);

  const patch = patchBody || {};
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
    'remarks',
  ]) {
    if (patch[field] !== undefined) doc[field] = patch[field] || undefined;
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

  const orderState = await recalculateOrderShipmentState(doc.order, user);
  await OrderWorkflow.create({
    order: doc.order,
    action_by: user._id,
    role: user.department === 'admin' ? 'admin' : 'dispatch',
    action: orderState?.current_action || workflowActionForShipmentStatus(doc.shipment_status),
    to_stage: orderState?.workflow_stage || 'dispatch_execution',
    to_status: orderState?.status || doc.shipment_status,
    remarks: patch.remarks || '',
    revision_number: orderState?.current_revision || 1,
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
  await recalculateOrderShipmentState(plain.order, user);
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
  await recalculateOrderShipmentState(plain.order, user);
  return plain;
}

module.exports = { list, get, create, patch, listDeleted, softDelete, restore, recalculateOrderShipmentState };
