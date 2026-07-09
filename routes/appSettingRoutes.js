const express = require("express");
const router = express.Router();
const { getSettings, toggleShareRide } = require("../controllers/appSettingController");
const { auth, adminOnly } = require("../middleware/auth");

// GET: Fetch global settings (Public/User accessible)
router.get("/", getSettings);

// PUT: Toggle Share Ride (Admin Only)
router.put("/toggle-share-ride", auth, adminOnly, toggleShareRide);

module.exports = router;
