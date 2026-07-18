/**
 * @fileoverview Communication HTTP controllers for typed message queues.
 * @module modules/communication/communication.controller
 */
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./communication.service');

/**
 * List registered communication queue types.
 * GET /api/communication/types
 */
exports.listTypes = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: service.listTypes(),
  });
});

/**
 * Queue a freeform email / WhatsApp message.
 * POST /api/communication/send
 */
exports.queueFreeform = asyncHandler(async (req, res) => {
  const data = await service.queueFreeformMessage(req.body);
  res.status(201).json({
    success: true,
    message: 'Message queued successfully',
    data,
  });
});

/**
 * Queue WhatsApp "order received" template for an order.
 * POST /api/communication/order-received
 */
exports.queueOrderReceived = asyncHandler(async (req, res) => {
  const data = await service.queueOrderReceivedMessages(req.body);
  res.status(201).json({
    success: true,
    message: 'Order-received message(s) queued successfully',
    data,
  });
});

/**
 * Queue by registered type name.
 * POST /api/communication/queue/:type
 */
exports.queueByType = asyncHandler(async (req, res) => {
  const data = await service.queueByType(req.params.type, req.body);
  res.status(201).json({
    success: true,
    message: `Communication type "${req.params.type}" queued successfully`,
    data,
  });
});
