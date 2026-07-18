/**
 * @fileoverview Queue WhatsApp "order received" template messages for an order.
 *
 * Meta body template (3 variables):
 *   Hello {{1}},
 *   Thank you for your order! We have received your order.
 *   📦 Order No: {{2}}
 *   🛒 Ordered Items:
 *   {{3}}
 *   We are reviewing your order...
 *
 * @module modules/communication/handlers/orderReceived.handler
 */
const mongoose = require('mongoose');
const { getModels } = require('../../../data/mongoRegistry');
const { ApiError } = require('../../../utils/ApiError');
const { logger } = require('../../../config/logger');
const messageService = require('../../messages/message.service');
const {
  WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_LANGUAGE,
} = require('../../messages/whatsappTemplates.registry');
const { normalizeRecipients, resolveContactName } = require('../communication.utils');

/** Format items for template {{3}} — one line per product, e.g. "Paracetamol 650 mg × 10" */
function buildOrderItemsSummary(order) {
  const lines = (order.order_items || []).map((item) => {
    const name = String(item.product_name || 'Item').trim();
    const qty = Number(item.ordered_quantity ?? item.quantity ?? 0);
    return `${name} × ${Number.isFinite(qty) ? qty : 0}`;
  });
  return lines.length ? lines.join('\n') : 'No items';
}

/**
 * @param {object} payload
 * @returns {Promise<{ order: object, queued: object[], failed: object[] }>}
 */
async function queueOrderReceived(payload = {}) {
  const { Order } = getModels();
  const orderId = payload.order;

  if (!orderId || !mongoose.Types.ObjectId.isValid(String(orderId))) {
    throw new ApiError(400, 'Valid order id is required');
  }

  const recipientsRaw =
    payload.recipient ?? payload.contact_number ?? payload.whatsapp_number;
  const recipients = normalizeRecipients(recipientsRaw);
  if (!recipients.length) {
    throw new ApiError(400, 'At least one recipient phone number is required');
  }

  const order = await Order.findById(orderId).lean();
  if (!order) {
    throw new ApiError(404, 'Order not found');
  }

  const orderNo =
    (payload.order_no != null && String(payload.order_no).trim()) ||
    order.order_no ||
    '';
  const itemsSummary =
    (payload.items_summary != null && String(payload.items_summary).trim()) ||
    buildOrderItemsSummary(order) ||
    'No items';
  const languageCode = payload.language_code || WHATSAPP_TEMPLATE_LANGUAGE;
  const templateName = payload.template_name || WHATSAPP_TEMPLATES.ORDER_RECEIVED;

  const queued = [];
  const failed = [];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    // {{1}} contact name, {{2}} order no, {{3}} ordered items
    const contactName = resolveContactName(payload.contact_name, i) || 'Sir/Madam';

    const templateParams = {
      languageCode,
      components: payload.template_components || [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: contactName },
            { type: 'text', text: orderNo },
            { type: 'text', text: itemsSummary },
          ],
        },
      ],
    };

    try {
      const msg = await messageService.createAndQueueMessage({
        order: order._id,
        recipient,
        channel: 'whatsapp',
        templateName,
        templateParams,
        body: [
          `Hello ${contactName},`,
          '',
          'Thank you for your order! We have received your order.',
          '',
          `📦 Order No: ${orderNo}`,
          '',
          '🛒 Ordered Items:',
          itemsSummary,
        ].join('\n'),
      });
      queued.push(msg);
    } catch (err) {
      logger.error(
        `[Communication] Failed to queue order-received WhatsApp to ${recipient}: ${err.message}`,
      );
      failed.push({ recipient, error: err.message });
    }
  }

  if (!queued.length) {
    throw new ApiError(500, 'Failed to queue order-received messages');
  }

  return {
    order: {
      id: String(order._id),
      order_no: orderNo,
      items_summary: itemsSummary,
      template_vars: {
        '1': resolveContactName(payload.contact_name, 0) || 'Sir/Madam',
        '2': orderNo,
        '3': itemsSummary,
      },
    },
    queued,
    failed,
  };
}

module.exports = {
  type: 'order_received',
  queue: queueOrderReceived,
};
