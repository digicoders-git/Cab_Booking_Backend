const express = require("express");
const router = express.Router();
const { getSettings, toggleShareRide, getFirstRideStatusController } = require("../controllers/appSettingController");
const { auth, adminOnly } = require("../middleware/auth");

// GET: Fetch global settings (Public/User accessible)
router.get("/", getSettings);

// GET: Check First Ride Discount status & user eligibility (Public/User)
router.get("/first-ride-status", getFirstRideStatusController);

// PUT: Toggle Share Ride & Update App Settings (Admin Only)
router.put("/toggle-share-ride", auth, adminOnly, toggleShareRide);

module.exports = router;
