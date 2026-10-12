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
router.get("/all", auth, checkPermission('STATE_TAX_READ'), stateTaxController.getAllStateTaxes);
router.post("/", auth, checkPermission('STATE_TAX_CREATE'), stateTaxController.createStateTax);
router.put("/:id", auth, checkPermission('STATE_TAX_EDIT'), stateTaxController.updateStateTax);
router.delete("/:id", auth, checkPermission('STATE_TAX_DELETE'), stateTaxController.deleteStateTax);

module.exports = router;
