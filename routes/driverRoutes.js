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
    rejectDriver
} = require("../controllers/driverController");

const { auth, adminOnly, driverOnly, fleetOnly } = require("../middleware/auth");
const upload = require("../middleware/uploadAdminImage");

// Driver Registration (Open - Anyone can register)
router.post("/register", upload.single("image"), registerDriver);

// Driver Login
router.post("/login", loginDriver);

// Driver Profile (Protected - Driver Only)
router.get("/profile", auth, driverOnly, getDriverProfile);

// Update Driver Profile (Protected - Driver Only)
// Includes: Basic Info, Address, Bank Details, Documents, License
router.put("/profile-update", auth, driverOnly, upload.single("image"), updateDriverProfile);

// Toggle Online/Offline Status (Protected - Driver Only)
router.put("/toggle-online", auth, driverOnly, toggleOnlineStatus);

// Update Driver Location (Protected - Driver Only)
router.put("/update-location", auth, driverOnly, updateLocation);

// Get Pending Drivers (Admin Only) - MUST BE BEFORE /:id
router.get("/pending", auth, adminOnly, getPendingDrivers);

// Get Approved Drivers (Admin Only) - MUST BE BEFORE /:id
router.get("/approved", auth, adminOnly, getApprovedDrivers);

// Get Available Drivers (Admin/Fleet)
router.get("/available", auth, getAvailableDrivers);

// Get All Drivers (Admin/Fleet)
router.get("/all", auth, getAllDrivers);


// Get Driver Location (Admin/Fleet)
router.get("/location/:id", auth, getDriverLocation);

// Get All Drivers Location - Live Tracking (Admin/Fleet) - MUST BE BEFORE /:id
router.get("/locations/all", auth, getAllDriversLocation);

// Get Single Driver (Admin/Fleet) - MUST BE LAST
router.get("/:id", auth, getSingleDriver);

// Approve Driver (Admin Only)
router.put("/approve/:id", auth, adminOnly, approveDriver);

// Reject Driver (Admin Only)
router.put("/reject/:id", auth, adminOnly, rejectDriver);

// Delete Driver (Admin Only)
router.delete("/delete/:id", auth, adminOnly, deleteDriver);

// Toggle Driver Status (Admin Only)
router.put("/toggle-status/:id", auth, adminOnly, toggleDriverStatus);

module.exports = router;
