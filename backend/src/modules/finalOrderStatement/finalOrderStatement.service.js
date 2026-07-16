/**
 * @fileoverview Build final order statement from a closed order.
 * @module modules/finalOrderStatement/finalOrderStatement.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { ORDER_RETURN_STATUS } = require('../../constants/orderReturnStatus');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

function refId(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value._id ?? value.id ?? '');
  return String(value);
}

function partySnapshot(party) {
  if (!party || typeof party !== 'object') return null;
  return {
    _id: refId(party),
    party_name: party.party_name || party.name || '',
    party_code: party.party_code || party.code || '',
    gstin: party.gstin || '',
    billing_address: party.billing_address || party.address || '',
    city: party.city || '',
    state: party.state || '',
    pincode: party.pincode || '',
    phone: party.phone || party.mobile || '',
  };
}

function userSnapshot(user) {
  if (!user || typeof user !== 'object') return null;
  return {
    _id: refId(user),
    name: user.name || user.username || '',
    email: user.email || '',
  };
}

function buildLineStatement(line) {
  const ordered = num(line.ordered_quantity ?? line.quantity);
  const salesApproved = num(line.sales_approved_quantity);
  const approved = num(line.approved_quantity);
  const dispatched = num(line.dispatched_quantity);
  const returned = num(line.returned_quantity);
  const delivered = num(line.delivered_quantity);
  const netDelivered = Math.max(0, delivered - returned);
  const cancelled = num(line.cancelled_quantity);

  // Amounts are settled on the net delivered quantity (delivered minus returns).
  const unitPrice = num(line.unit_price);
  const discountPercent = num(line.discount_percent);
  const gstPercent = num(line.gst_percent);
  const grossAmount = round2(netDelivered * unitPrice);
  const discountAmount = round2((grossAmount * discountPercent) / 100);
  const taxableAmount = round2(grossAmount - discountAmount);
  const gstAmount = round2((taxableAmount * gstPercent) / 100);
  const totalAmount = round2(taxableAmount + gstAmount);

  return {
    order_item_id: refId(line._id),
    product: refId(line.product),
    product_name: line.product_name || '',
    sku: line.sku || '',
    brand: line.brand || '',
    unit: line.unit || '',
    hsn_code: line.hsn_code || '',
    gst_percent: num(line.gst_percent),
    ordered_quantity: ordered,
    sales_approved_quantity: salesApproved,
    approved_quantity: approved,
    dispatched_quantity: dispatched,
    delivered_quantity: delivered,
    returned_quantity: returned,
    net_delivered_quantity: netDelivered,
    cancelled_quantity: cancelled,
    unit_price: unitPrice,
    applied_rate_type: line.applied_rate_type || 'MANUAL',
    discount_percent: discountPercent,
    discount_amount: discountAmount,
    gross_amount: grossAmount,
    taxable_amount: taxableAmount,
    gst_amount: gstAmount,
    total_amount: totalAmount,
    line_status: line.line_status || 'active',
    remarks: line.remarks || '',
  };
}

function buildQuantitySummary(lines) {
  return lines.reduce(
    (acc, line) => {
      acc.ordered += line.ordered_quantity;
      acc.sales_approved += line.sales_approved_quantity;
      acc.approved += line.approved_quantity;
      acc.dispatched += line.dispatched_quantity;
      acc.delivered += line.delivered_quantity;
      acc.returned += line.returned_quantity;
      acc.net_delivered += line.net_delivered_quantity;
      acc.cancelled += line.cancelled_quantity;
      return acc;
    },
    {
      ordered: 0,
      sales_approved: 0,
      approved: 0,
      dispatched: 0,
      delivered: 0,
      returned: 0,
      net_delivered: 0,
      cancelled: 0,
    },
  );
}

function buildFinancialSummary(order, lines) {
  const subtotal = round2(
    lines.reduce((sum, line) => sum + line.gross_amount, 0),
  );
  const lineDiscountTotal = round2(
    lines.reduce((sum, line) => sum + line.discount_amount, 0),
  );
  const taxableAmount = round2(
    lines.reduce((sum, line) => sum + line.taxable_amount, 0),
  );
  const gstAmount = round2(
    lines.reduce((sum, line) => sum + line.gst_amount, 0),
  );

  const headerDiscount = num(order.discount_amount);
  const extraCharges = num(order.extra_charges);
  const penaltyAmount = num(order.penalty_amount);
  const damageCharge = num(order.damage_charge);

  const grandTotal = round2(
    taxableAmount +
      gstAmount -
      headerDiscount +
      extraCharges +
      penaltyAmount +
      damageCharge,
  );

  return {
    subtotal,
    header_discount_amount: headerDiscount,
    line_discount_total: lineDiscountTotal,
    taxable_amount: taxableAmount,
    gst_amount: gstAmount,
    extra_charges: extraCharges,
    penalty_amount: penaltyAmount,
    damage_charge: damageCharge,
    grand_total: grandTotal,
    payment_status: order.payment_status || 'unpaid',
  };
}

function buildReturnRefs(returns) {
  return (returns || []).map((ret) => {
    const items = Array.isArray(ret.return_items) ? ret.return_items : [];
    const totalReturnedQty = items.reduce(
      (sum, item) => sum + num(item.returned_quantity),
      0,
    );
    return {
      _id: refId(ret._id),
      return_no: ret.return_no || '',
      return_status: ret.return_status || '',
      received_at: ret.received_at || null,
      order_closed_at: ret.order_closed_at || null,
      total_returned_qty: totalReturnedQty,
      remarks: ret.remarks || '',
    };
  });
}

function statementNo(order) {
  const closedTs = order.closed_at
    ? new Date(order.closed_at).toISOString().slice(0, 10).replace(/-/g, '')
    : 'OPEN';
  return `FOS-${order.order_no}-${closedTs}`;
}

async function loadClosedOrder(orderId) {
  const order = await getModels()
    .Order.findOne({ _id: orderId, deletedAt: null })
    .populate('party')
    .populate('closed_by', 'name username email')
    .lean();

  if (!order) throw new ApiError(404, 'Order not found');

  if (String(order.status || '') !== 'closed' && !order.closed_at) {
    throw new ApiError(
      400,
      'Final order statement is available only after the order is closed',
    );
  }

  return order;
}

/**
 * Generate the final order statement for a closed order.
 * @param {string} orderId
 * @returns {Promise<object>}
 */
async function generateForOrder(orderId) {
  const order = await loadClosedOrder(orderId);
  const plain = toPlain(order);

  const returns = await getModels()
    .OrderReturn.find({
      order: orderId,
      deletedAt: null,
      return_status: {
        $in: [ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE, 'received'],
      },
    })
    .sort({ createdAt: 1 })
    .lean();

  const lines = (plain.order_items || []).map((line) => buildLineStatement(line));
  const quantitySummary = buildQuantitySummary(lines);
  const financialSummary = buildFinancialSummary(plain, lines);

  return {
    statement_no: statementNo(plain),
    generated_at: new Date().toISOString(),
    order: {
      _id: refId(plain._id),
      order_no: plain.order_no,
      order_date: plain.order_date,
      expected_delivery_date: plain.expected_delivery_date || null,
      priority: plain.priority || 'normal',
      status: plain.status,
      lifecycle_status: plain.lifecycle_status,
      workflow_stage: plain.workflow_stage,
      dispatch_status: plain.dispatch_status,
      delivery_status: plain.delivery_status,
      finance_approval_status: plain.finance_approval_status,
      account_approval_status: plain.account_approval_status,
      closed_at: plain.closed_at || null,
      closure_remarks: plain.closure_remarks || '',
      party: partySnapshot(plain.party),
      closed_by: userSnapshot(plain.closed_by),
    },
    lines,
    quantity_summary: quantitySummary,
    financial_summary: financialSummary,
    returns: buildReturnRefs(returns.map(toPlain)),
  };
}

/**
 * List final statements for orders (one entry per closed order in result set).
 * @param {{ order?: string }} query
 */
async function list({ order } = {}) {
  if (order) {
    return [await generateForOrder(order)];
  }

  const orders = await getModels()
    .Order.find({
      deletedAt: null,
      $or: [{ status: 'closed' }, { closed_at: { $ne: null } }],
    })
    .sort({ closed_at: -1 })
    .select('_id order_no closed_at')
    .lean();

  return orders.map((row) => ({
    order_id: refId(row._id),
    order_no: row.order_no,
    closed_at: row.closed_at || null,
    statement_no: statementNo(row),
  }));
}

async function getByOrderId(orderId) {
  return generateForOrder(orderId);
}

module.exports = {
  generateForOrder,
  getByOrderId,
  list,
};
