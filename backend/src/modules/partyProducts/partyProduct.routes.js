/**
 * @fileoverview Party Products: Express routes.
 * @module modules/partyProducts/partyProduct.routes
 */
const { Router } = require("express");
const router = Router();
const {
  requireAuth,
  requireSoftDeletePermission,
} = require("../../middlewares/auth.middleware");
const controller = require("./partyProduct.controller");

router.use(requireAuth);

// Mappings routing
router.get("/deleted", controller.listDeleted);
router.get("/", controller.list);
router.delete("/:id", controller.softDelete);
router.post("/:id/restore", controller.restore);
router.get("/:id", controller.get);
router.post("/", controller.create);
router.patch("/:id", controller.update);

// Rates routing
router.post("/:id/rates", controller.addRate);
router.patch("/rates/:rateId", controller.updateRate);
router.delete("/rates/:rateId", controller.deleteRate);
router.post("/rates/:rateId/approve", controller.approveRate);

module.exports = router;
