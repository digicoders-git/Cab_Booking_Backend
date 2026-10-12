const express = require("express");
const router = express.Router();
const { getSettings, toggleShareRide, getFirstRideStatusController } = require("../controllers/appSettingController");
const { auth } = require("../middleware/auth");
const { checkPermission } = require("../middleware/rbac");

// GET: Fetch global settings (Public/User accessible)
router.get("/", getSettings);

// GET: Check First Ride Discount status & user eligibility (Public/User)
router.get("/first-ride-status", getFirstRideStatusController);

// PUT: Toggle Share Ride & Update App Settings (Admin with SETTINGS_MANAGE)
router.put("/toggle-share-ride", auth, checkPermission("SETTINGS_MANAGE"), toggleShareRide);

module.exports = router;
