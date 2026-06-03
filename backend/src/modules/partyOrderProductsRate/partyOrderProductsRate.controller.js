/**
 * @fileoverview Controller for checking and mapping party order product rates.
 * @module modules/partyOrderProductsRate/partyOrderProductsRate.controller
 */
const service = require('./partyOrderProductsRate.service');

async function check(req, res, next) {
  try {
    const { orderId } = req.params;
    const result = await service.checkOrderRates(orderId);
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function checkLines(req, res, next) {
  try {
    const result = await service.checkPartyLineRates(req.body);
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function mapRate(req, res, next) {
  try {
    const result = await service.createMappingAndRate(req.body, req.user);
    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  check,
  checkLines,
  mapRate,
};
