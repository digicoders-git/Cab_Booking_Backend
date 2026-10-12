const express = require("express");
const router = express.Router();
const areaPricingController = require("../controllers/areaPricingController");

const { auth } = require("../middleware/auth");
const { checkPermission } = require("../middleware/rbac");

// CRUD for Area Pricing protected by Granular Permissions
router.get("/", auth, checkPermission("AREA_PRICING_READ"), areaPricingController.getAllAreaPricings);
router.post("/", auth, checkPermission("AREA_PRICING_CREATE"), areaPricingController.createAreaPricing);
router.put("/:id", auth, checkPermission("AREA_PRICING_EDIT"), areaPricingController.updateAreaPricing);
router.delete("/:id", auth, checkPermission("AREA_PRICING_DELETE"), areaPricingController.deleteAreaPricing);

module.exports = router;
