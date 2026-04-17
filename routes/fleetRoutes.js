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
    getFleetCompletedRides,
    adminUpdateFleet,
    updateFcmToken
} = require("../controllers/fleetController");

const { auth, adminOnly, fleetOnly } = require("../middleware/auth");
const { checkPermission } = require("../middleware/rbac");
const upload = require("../middleware/uploadAdminImage");

// 1. Create Fleet (Admin Only) - Multi-part with documents
router.post("/create", auth, checkPermission("FLEET_CREATE"), upload.fields([
    { name: "image", maxCount: 1 },
    { name: "gstCertificate", maxCount: 1 },
    { name: "panCard", maxCount: 1 },
    { name: "businessLicense", maxCount: 1 }
]), createFleet);

// Fleet Login
router.post("/login", loginFleet);

// Fleet Profile (Protected - Fleet Only)
router.get("/profile", auth, fleetOnly, getFleetProfile);

// Update Fleet Profile (Protected - Fleet Only) - Multi-part
router.put("/profile-update", auth, fleetOnly, upload.fields([
    { name: "image", maxCount: 1 },
    { name: "gstCertificate", maxCount: 1 },
    { name: "panCard", maxCount: 1 },
    { name: "businessLicense", maxCount: 1 }
]), updateFleetProfile);

// Fleet Dashboard (Protected - Fleet Only)
router.get("/dashboard", auth, fleetOnly, getFleetDashboard);

// Fleet Performance Report (Protected - Fleet Only)
router.get("/performance", auth, fleetOnly, getFleetPerformance);

// Fleet Completed Rides Report (Protected - Fleet Only)
router.get("/completed-rides", auth, fleetOnly, getFleetCompletedRides);

// Get All Fleets (Admin Only)
router.get("/all", auth, checkPermission("FLEET_READ"), getAllFleets);

// Delete Fleet (Admin Only)
router.delete("/delete/:id", auth, checkPermission("FLEET_DELETE"), deleteFleet);

// Toggle Fleet Status (Admin Only)
router.put("/toggle-status/:id", auth, checkPermission("FLEET_STATUS"), toggleFleetStatus);

// Update Fleet Wallet Balance (Admin Only)
router.put("/update-wallet/:id", auth, checkPermission("FLEET_WALLET"), updateWalletBalance);

// Update Fleet Manually (Admin Only) - Multi-part
router.put("/update/:id", auth, checkPermission("FLEET_EDIT"), upload.fields([
    { name: "image", maxCount: 1 },
    { name: "gstCertificate", maxCount: 1 },
    { name: "panCard", maxCount: 1 },
    { name: "businessLicense", maxCount: 1 }
]), adminUpdateFleet);

// Update Fleet FCM Token
router.put("/update-fcm-token", auth, fleetOnly, updateFcmToken);

// Get Single Fleet (Admin Only) - MUST BE LAST
router.get("/:id", auth, checkPermission("FLEET_READ"), getSingleFleet);

module.exports = router;