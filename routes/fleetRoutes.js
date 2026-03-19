const express = require("express");
const router = express.Router();

const {
    createFleet,
    loginFleet,
    getFleetProfile,
    updateFleetProfile,
    getAllFleets,
    getSingleFleet,
    deleteFleet,
    toggleFleetStatus,
    getFleetDashboard,
    updateWalletBalance,
    getFleetPerformance,
    adminUpdateFleet
} = require("../controllers/fleetController");

const { auth, adminOnly, fleetOnly } = require("../middleware/auth");
const upload = require("../middleware/uploadAdminImage");

// Fleet Creation (Admin Only)
router.post("/create", auth, adminOnly, upload.single("image"), createFleet);

// Fleet Login
router.post("/login", loginFleet);

// Fleet Profile (Protected - Fleet Only)
router.get("/profile", auth, fleetOnly, getFleetProfile);

// Update Fleet Profile (Protected - Fleet Only)
router.put("/profile-update", auth, fleetOnly, upload.single("image"), updateFleetProfile);

// Fleet Dashboard (Protected - Fleet Only)
router.get("/dashboard", auth, fleetOnly, getFleetDashboard);

// Fleet Performance Report (Protected - Fleet Only)
router.get("/performance", auth, fleetOnly, getFleetPerformance);

// Get All Fleets (Admin Only)
router.get("/all", auth, adminOnly, getAllFleets);

// Delete Fleet (Admin Only)
router.delete("/delete/:id", auth, adminOnly, deleteFleet);

// Toggle Fleet Status (Admin Only)
router.put("/toggle-status/:id", auth, adminOnly, toggleFleetStatus);

// Update Fleet Wallet Balance (Admin Only)
router.put("/update-wallet/:id", auth, adminOnly, updateWalletBalance);

// Update Fleet Manually (Admin Only)
router.put("/update/:id", auth, adminOnly, upload.single("image"), adminUpdateFleet);

// Get Single Fleet (Admin Only) - MUST BE LAST
router.get("/:id", auth, adminOnly, getSingleFleet);

module.exports = router;