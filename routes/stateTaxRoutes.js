const express = require("express");
const router = express.Router();
const { auth, adminOnly } = require("../middleware/auth");
const { checkPermission } = require("../middleware/rbac");
const stateTaxController = require("../controllers/stateTaxController");

// --- Public/Booking API ---
// This is used by the frontend to get the applicable tax during checkout
router.post("/calculate", stateTaxController.calculateRouteTaxes);

// --- Admin APIs ---
// Require Admin authentication and specific permissions
router.post("/", auth, checkPermission('PRICING_MANAGE'), stateTaxController.createStateTax);
router.get("/all", auth, checkPermission('PRICING_READ'), stateTaxController.getAllStateTaxes);
router.put("/:id", auth, checkPermission('PRICING_MANAGE'), stateTaxController.updateStateTax);
router.delete("/:id", auth, checkPermission('PRICING_MANAGE'), stateTaxController.deleteStateTax);

module.exports = router;
