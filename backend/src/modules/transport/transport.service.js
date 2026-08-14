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
      select: 'order_no party customer grand_total',
      populate: [
        { path: 'party', select: 'party_name billing_address shipping_address' },
        { path: 'customer', select: 'party_name billing_address shipping_address' },
      ],
    })
    .populate({
      path: 'dispatch',
      populate: {
        path: 'dispatch_items.product',
        select: 'product_name sku hsn_code',
      },
    })
    .sort({ createdAt: -1 })
    .lean();
  const { TransportPlanOrder, OrderDelivery } = getModels();
  const dispatchIds = rows.map((r) => r.dispatch?._id || r.dispatch).filter(Boolean);
  const planOrders = await TransportPlanOrder.find({
    dispatch: { $in: dispatchIds },
    deletedAt: null,
  }).lean();

  const deliveries = await OrderDelivery.find({
    dispatch: { $in: dispatchIds },
    deletedAt: null,
  }).lean();

  const planOrderMap = new Map(planOrders.map((p) => [String(p.dispatch), p]));
  const deliveryMap = new Map(deliveries.map((d) => [String(d.dispatch), d]));

  return rows.map((r) => {
    const plain = toPlain(r);
    const dispatchIdStr = String(plain.dispatch?._id || plain.dispatch || "");
    const po = planOrderMap.get(dispatchIdStr);
    if (po) {
      plain.plan_packages = po.packages;
      plain.plan_weight = po.weight;
    }
    const del = deliveryMap.get(dispatchIdStr);
    plain.delivered_at = plain.delivered_at || del?.delivered_at || del?.actual_delivery_date || del?.createdAt || plain.actual_delivery_date;
    plain.received_by = plain.received_by || del?.received_by;
    return plain;
  });
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
      orderDoc.current_action = 'dispatch_created';
    } else if (Number(orderDoc.order_items?.reduce((s, l) => s + Number(l.approved_quantity || 0), 0) || 0) > 0) {
      orderDoc.status = ORDER_STATUS.DISPATCH;
      orderDoc.current_action = 'sent_to_dispatch';
    }
  } else if (shipments.every((shipment) => shipment.shipment_status === 'delivered')) {
    orderDoc.delivery_status = fulfillmentState.fullyDelivered ? 'completed' : 'partial';
    if (fulfillmentState.fullyDelivered) {
      orderDoc.lifecycle_status = ORDER_LIFECYCLE_STATUS.FULFILLED;
      orderDoc.workflow_stage = ORDER_WORKFLOW_STAGE.COMPLETED;
      orderDoc.current_action = 'delivered';
    } else if (
      ![ORDER_LIFECYCLE_STATUS.CANCELLED, ORDER_LIFECYCLE_STATUS.ON_HOLD].includes(orderDoc.lifecycle_status)
    ) {
      orderDoc.lifecycle_status = ORDER_LIFECYCLE_STATUS.ACTIVE;
      orderDoc.workflow_stage = ORDER_WORKFLOW_STAGE.DISPATCH;
      orderDoc.current_action = 'delivered';
    }
    orderDoc.status = ORDER_STATUS.DELIVERED;
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

      orderDoc.current_action = 'in_transit';
      orderDoc.status = ORDER_STATUS.IN_TRANSIT;
    }
  }

  orderDoc.updated_by = user._id;
  await orderDoc.save();

  const allShipmentsDelivered =
    shipments.length > 0 && shipments.every((s) => s.shipment_status === 'delivered');

  if (
    fulfillmentState.fullyDelivered &&
    allShipmentsDelivered &&
    orderDoc.status !== ORDER_STATUS.DELIVERED &&
    !orderDoc.is_locked &&
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

/**
 * Auto-settle remaining release clearance after transport create/update
 * (same path as Settle & Unbilled Order):
 * shrink approval + main order to net dispatched qty and write the rest onto UnbilledOrder.
 * Client may pass kit-aware settle_approval_items / settle_rest_items (kit shells only on unbilled).
 */
async function settleReleaseAfterTransportCreated(dispatchId, user, settleBody = {}) {
  if (!dispatchId) return null;
  try {
    const { OrderDispatch, OrderApproval } = getModels();
    const dispatch = await OrderDispatch.findById(dispatchId)
      .select('finance_approval order')
      .lean();
    if (!dispatch?.finance_approval) {
      // eslint-disable-next-line no-console
      console.warn('[transport] auto-settle skipped: dispatch has no finance_approval', String(dispatchId));
      return null;
    }

    const approval = await OrderApproval.findOne({
      _id: dispatch.finance_approval,
      deletedAt: null,
    })
      .select('_id dispatch_release_resolved is_account_approved is_finance_approved approval_no')
      .lean();

    if (!approval) {
      // eslint-disable-next-line no-console
      console.warn('[transport] auto-settle skipped: approval not found', String(dispatch.finance_approval));
      return null;
    }
    // Do not bail on dispatch_release_resolved — resolvePartialDispatchByAccount
    // reopens the release when remaining clearance / returns still exist.
    if (!approval.is_finance_approved || !approval.is_account_approved) {
      // eslint-disable-next-line no-console
      console.warn('[transport] auto-settle skipped: approval not fully cleared', String(approval._id));
      return null;
    }

    const resolveBody = {
      amendment_notes:
        settleBody.amendment_notes
        || 'Auto-settled when transport was saved — remaining clearance moved to Unbilled Order',
    };
    if (Array.isArray(settleBody.approval_items) && settleBody.approval_items.length > 0) {
      resolveBody.approval_items = settleBody.approval_items;
    }
    if (Array.isArray(settleBody.settled_rest_items)) {
      resolveBody.settled_rest_items = settleBody.settled_rest_items;
    }

    const orderApprovalService = require('../orderApproval/orderApproval.service');
    return await orderApprovalService.resolvePartialDispatchByAccount(
      approval._id,
      resolveBody,
      user,
      { skipAsyncJobs: true },
    );
  } catch (err) {
    // No remaining qty / already resolved / not eligible — transport still succeeds.
    const msg = String(err?.message || err || '');
    const expected =
      err?.statusCode === 400
      || /no remaining|already been resolved|at least one dispatch/i.test(msg);
    if (!expected) {
      // eslint-disable-next-line no-console
      console.warn('[transport] auto-settle after transport failed:', msg);
    }
    return null;
  }
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
    if (line.status === 'delivered') {
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
      }
    }
  }

  return line;
}

async function create(body, user) {
  const { Order, OrderDispatch, TransportShipment, TransportAgent } = getModels();
  const order = await Order.findById(body.order).lean();
  if (!order) throw new ApiError(404, 'Order not found');

  const dispatchExists = await OrderDispatch.exists({ _id: body.dispatch, order: body.order });
  if (!dispatchExists) throw new ApiError(404, 'Order dispatch not found');

  let lrRequired = false;
  if (body.transport_agent) {
    const agent = await TransportAgent.findById(body.transport_agent).select('lr_number_required').lean();
    lrRequired = agent?.lr_number_required === true;
  }

  const lr = String(body.lr_number || '').trim();
  if (lrRequired && !lr) {
    throw new ApiError(400, 'LR number is required for this transport agent');
  }
  if (lr) {
    const existingShipment = await TransportShipment.findOne({
      lr_number: lr,
      deletedAt: null,
    }).lean();
    if (existingShipment) {
      throw new ApiError(400, `LR number "${lr}" is already in use by transport shipment ${existingShipment.shipment_no}`);
    }
  }

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
    lr_number: lr,
    tracking_number: body.tracking_number || '',
    eway_bill_no: body.eway_bill_no || '',
    dispatch_date: body.dispatch_date ? new Date(body.dispatch_date) : undefined,
    pickup_date: body.pickup_date ? new Date(body.pickup_date) : undefined,
    expected_delivery_date: body.expected_delivery_date ? new Date(body.expected_delivery_date) : undefined,
    actual_delivery_date: body.actual_delivery_date ? new Date(body.actual_delivery_date) : undefined,
    delivered_at: body.delivered_at ? new Date(body.delivered_at) : undefined,
    received_by: body.received_by || '',
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

  // Auto settle remaining release clearance → approval + order + UnbilledOrder.
  // Prefer kit-aware settle payload from create-transport client when present.
  await settleReleaseAfterTransportCreated(body.dispatch, user, {
    approval_items: body.settle_approval_items || body.approval_items,
    settled_rest_items: body.settle_rest_items || body.settled_rest_items,
    amendment_notes: body.settle_amendment_notes,
  });

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

  if (patch.lr_number !== undefined) {
    const lr = String(patch.lr_number || '').trim();
    let lrRequired = false;
    const agentId = patch.transport_agent || doc.transport_agent;
    if (agentId) {
      const { TransportAgent } = getModels();
      const agent = await TransportAgent.findById(agentId).select('lr_number_required').lean();
      lrRequired = agent?.lr_number_required === true;
    }
    if (lrRequired && !lr) {
      throw new ApiError(400, 'LR number is required for this transport agent');
    }
    if (lr) {
      const existingShipment = await TransportShipment.findOne({
        lr_number: lr,
        _id: { $ne: id },
        deletedAt: null,
      }).lean();
      if (existingShipment) {
        throw new ApiError(400, `LR number "${lr}" is already in use by transport shipment ${existingShipment.shipment_no}`);
      }
    }
  }

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
  for (const dateField of ['dispatch_date', 'pickup_date', 'expected_delivery_date', 'actual_delivery_date', 'delivered_at']) {
    if (patch[dateField] !== undefined) doc[dateField] = patch[dateField] ? new Date(patch[dateField]) : undefined;
  }
  if (patch.received_by !== undefined) doc.received_by = patch.received_by || '';
  if (doc.shipment_status === 'delivered' && !doc.actual_delivery_date) doc.actual_delivery_date = new Date();
  if (doc.shipment_status === 'delivered' && !doc.delivered_at) doc.delivered_at = new Date();

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

  // Same auto-settle path as create — remaining clearance → approval/order + UnbilledOrder.
  // Prefer kit-aware settle payload from the client when present.
  const settleDispatchId = patch.dispatch || doc.dispatch;
  if (settleDispatchId) {
    await settleReleaseAfterTransportCreated(settleDispatchId, user, {
      approval_items: patch.settle_approval_items || patch.approval_items,
      settled_rest_items: patch.settle_rest_items || patch.settled_rest_items,
      amendment_notes:
        patch.settle_amendment_notes
        || 'Auto-settled when transport was updated — remaining clearance moved to Unbilled Order',
    });
  }

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
