/**
 * @fileoverview Routes for checking and mapping party order product rates.
 * @module modules/partyOrderProductsRate/partyOrderProductsRate.routes
 */
const { Router } = require('express');
const router = Router();
const { requireAuth } = require('../../middlewares/auth.middleware');
const controller = require('./partyOrderProductsRate.controller');

router.use(requireAuth);

router.get('/check/:orderId', controller.check);
router.post('/check-lines', controller.checkLines);
router.post('/map', controller.mapRate);

module.exports = router;
