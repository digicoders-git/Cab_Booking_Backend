const express = require("express");
const router = express.Router();
const areaPricingController = require("../controllers/areaPricingController");

// Basic CRUD for Area Pricing
router.post("/", areaPricingController.createAreaPricing);
router.get("/", areaPricingController.getAllAreaPricings);
router.put("/:id", areaPricingController.updateAreaPricing);
router.delete("/:id", areaPricingController.deleteAreaPricing);

module.exports = router;
