const express = require("express");
const router = express.Router();

const {
    createDriver,
    getFleetDrivers,
    getFleetDriver,
    deleteDriver,
    getPendingDrivers,
    getApprovedDrivers,
    updateDriver,
    getFleetDriversLive, // NEW
    adminGetAllDrivers // NEW: Admin view all fleets' drivers
} = require("../controllers/fleetDriverController");

const { auth, fleetOnly, adminOnly } = require("../middleware/auth");
const upload = require("../middleware/uploadAdminImage");

// Admin: Get All Drivers Across ALL Fleets (Admin Only)
router.get("/admin/all", auth, adminOnly, adminGetAllDrivers);

// Create Driver (Fleet Only)
router.post("/create", auth, fleetOnly, upload.single("image"), createDriver);

// Get All Fleet Drivers (Fleet Only)
router.get("/all", auth, fleetOnly, getFleetDrivers);

// New: Live Monitor API for fleet-only drivers (Fleet Only)
router.get("/live", auth, fleetOnly, getFleetDriversLive);

// Get Pending Drivers (Fleet Only) - MUST BE BEFORE /:driverId
router.get("/pending", auth, fleetOnly, getPendingDrivers);

// Get Approved Drivers (Fleet Only) - MUST BE BEFORE /:driverId
router.get("/approved", auth, fleetOnly, getApprovedDrivers);

// Update Driver (Fleet Only)
router.put("/update/:driverId", auth, fleetOnly, upload.single("image"), updateDriver);

// Delete Driver (Fleet Only) - MUST BE BEFORE /:driverId
router.delete("/delete/:driverId", auth, fleetOnly, deleteDriver);

// Get Single Driver (Fleet Only) - MUST BE LAST
router.get("/:driverId", auth, fleetOnly, getFleetDriver);

module.exports = router;
