const express = require('express');
const {
  requireAuth,
  requireSoftDeletePermission,
} = require('../../middlewares/auth.middleware');
const { requireDepartment } = require('../../middlewares/dept.middleware');
const controller = require('./leadMaster.controller');

const router = express.Router();

router.use(requireAuth);

const salesAndAdmin = ['sales', 'admin', 'super_admin'];

/* --- Lead Sources --- */
router.get('/sources', requireDepartment(...salesAndAdmin), controller.listSources);
router.post('/sources', requireDepartment('admin', 'super_admin'), controller.createSource);
router.put('/sources/:id', requireDepartment('admin', 'super_admin'), controller.updateSource);
router.delete('/sources/:id', requireSoftDeletePermission, controller.deleteSource);

/* --- Lead Lost Reasons --- */
router.get('/lost-reasons', requireDepartment(...salesAndAdmin), controller.listLostReasons);
router.post('/lost-reasons', requireDepartment('admin', 'super_admin'), controller.createLostReason);
router.put('/lost-reasons/:id', requireDepartment('admin', 'super_admin'), controller.updateLostReason);
router.delete('/lost-reasons/:id', requireSoftDeletePermission, controller.deleteLostReason);

module.exports = router;
