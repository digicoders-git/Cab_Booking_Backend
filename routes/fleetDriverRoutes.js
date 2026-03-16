const express = require("express");
const router = express.Router();

const {
    createDriver,
    getFleetDrivers,
    getFleetDriver,
    deleteDriver,
    getPendingDrivers,
    getApprovedDrivers,
    updateDriver
} = require("../controllers/fleetDriverController");

const { auth, fleetOnly } = require("../middleware/auth");
const upload = require("../middleware/uploadAdminImage");

// Create Driver (Fleet Only)
router.post("/create", auth, fleetOnly, upload.single("image"), createDriver);

// Get All Fleet Drivers (Fleet Only)
router.get("/all", auth, fleetOnly, getFleetDrivers);

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
