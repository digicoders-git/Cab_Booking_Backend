const express = require("express");
const router = express.Router();

const {
    registerDriver,
    loginDriver,
    getDriverProfile,
    updateDriverProfile,
    toggleOnlineStatus,
    updateLocation,
    getAvailableDrivers,
    getAllDrivers,
    getSingleDriver,
    deleteDriver,
    toggleDriverStatus,
    getDriverLocation,
    getAllDriversLocation,
    getPendingDrivers,
    getApprovedDrivers,
    approveDriver,
    rejectDriver,
    adminUpdateDriver,
    getDriverReport
} = require("../controllers/driverController");

const { auth, adminOnly, driverOnly, fleetOnly } = require("../middleware/auth");
const { checkPermission } = require("../middleware/rbac");
const uploadCarDocs = require("../middleware/uploadCarDocs");

// Driver Registration (Open - Anyone can register)
router.post("/register", uploadCarDocs, registerDriver);

// Driver Login
router.post("/login", loginDriver);

// Driver Profile (Protected - Driver Only)
router.get("/profile", auth, driverOnly, getDriverProfile);

// Update Driver Profile (Protected - Driver Only)
// Includes: Basic Info, Address, Bank Details, Documents, License
router.put("/profile-update", auth, driverOnly, uploadCarDocs, updateDriverProfile);

// Toggle Online/Offline Status (Protected - Driver Only)
router.put("/toggle-online", auth, driverOnly, toggleOnlineStatus);

// Update Driver Location (Protected - Driver Only)
router.put("/update-location", auth, driverOnly, updateLocation);

// Get Pending Drivers (Admin Only) - MUST BE BEFORE /:id
router.get("/pending", auth, checkPermission("DRIVER_READ"), getPendingDrivers);

// Get Approved Drivers (Admin Only) - MUST BE BEFORE /:id
router.get("/approved", auth, checkPermission("DRIVER_READ"), getApprovedDrivers);

// Get Available Drivers (Admin/Fleet)
router.get("/available", auth, checkPermission("DRIVER_READ"), getAvailableDrivers);

// Get All Drivers (Admin/Fleet)
router.get("/all", auth, checkPermission("DRIVER_READ"), getAllDrivers);


// Get Driver Location (Admin/Fleet)
router.get("/location/:id", auth, getDriverLocation);

// Get All Drivers Location - Live Tracking (Admin/Fleet) - MUST BE BEFORE /:id
router.get("/locations/all", auth, getAllDriversLocation);

// Get Driver Dashboard Report Summary (Protected - Driver Only) - MUST BE BEFORE /:id
router.get("/report", auth, driverOnly, getDriverReport);

// Get Single Driver (Admin/Fleet) - MUST BE LAST
router.get("/:id", auth, checkPermission("DRIVER_READ"), getSingleDriver);

// Approve Driver (Admin Only)
router.put("/approve/:id", auth, checkPermission("DRIVER_APPROVE"), approveDriver);

// Reject Driver (Admin Only)
router.put("/reject/:id", auth, checkPermission("DRIVER_REJECT"), rejectDriver);

// Delete Driver (Admin Only)
router.delete("/delete/:id", auth, checkPermission("DRIVER_DELETE"), deleteDriver);

// Toggle Driver Status (Admin Only)
router.put("/toggle-status/:id", auth, checkPermission("DRIVER_STATUS"), toggleDriverStatus);

// Update Driver Manually (Admin Only)
router.put("/update/:id", auth, checkPermission("DRIVER_EDIT"), uploadCarDocs, adminUpdateDriver);

module.exports = router;
