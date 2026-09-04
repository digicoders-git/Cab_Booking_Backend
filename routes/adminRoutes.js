const express = require("express")
const router = express.Router()

const {
    registerAdmin,
    getProfile,
    updateProfile,
    loginAdmin,
    getDashboardStats,
    getSystemReport,
    getLiveDriversTracking,
    registerSubAdmin,
    getAllAdmins,
    updateAdminPermissions,
    deleteAdmin,
    getSingleAdmin,
    getBulkSettings,
    updateBulkSettings,
    getDriversByRadius,
    getDriversByHomeRadius,
    updateFcmToken,
    toggleDriverOnlineByAdmin,
    exportTaxReport,
    getNewBookings,
    markAllBookingsRead
} = require("../controllers/adminController")
const { registerAgent } = require("../controllers/agentController")
const { createFleet } = require("../controllers/fleetController")
const { auth, adminOnly } = require("../middleware/auth")
const { checkPermission } = require("../middleware/rbac")

const upload = require("../middleware/uploadAdminImage")

router.post("/register", upload.single("image"), registerAdmin)
router.post("/login", loginAdmin)

router.get("/profile", auth, adminOnly, getProfile)
router.put("/profile-update", auth, adminOnly, upload.single("image"), updateProfile)
router.put("/update-fcm-token", auth, adminOnly, updateFcmToken)

// Admin Dashboard & Reports
router.get("/dashboard-stats", auth, checkPermission("DASHBOARD_READ"), getDashboardStats)
router.get("/full-report", auth, checkPermission("REPORT_READ"), getSystemReport)
router.get("/export-tax-report", auth, checkPermission("REPORT_READ"), exportTaxReport)
router.get("/live-tracking", auth, checkPermission("TRACKING_READ"), getLiveDriversTracking)
router.get("/radius-search", auth, checkPermission("TRACKING_READ"), getDriversByRadius)
router.get("/home-radius-search", auth, checkPermission("TRACKING_READ"), getDriversByHomeRadius)
router.get("/new-bookings", auth, checkPermission("DASHBOARD_READ"), getNewBookings)
router.put("/mark-bookings-read", auth, checkPermission("DASHBOARD_READ"), markAllBookingsRead)

// Admin creates Agent / Fleet (Redundant but kept for compatibility)
router.post("/create-agent", auth, checkPermission("AGENT_CREATE"), upload.single("image"), registerAgent)
router.post("/create-fleet", auth, checkPermission("FLEET_CREATE"), upload.single("image"), createFleet)

// ================= RBAC: SUB-ADMIN MANAGEMENT =================
router.post("/subadmin/register", auth, checkPermission("STAFF_MANAGE"), upload.single("image"), registerSubAdmin)
router.get("/subadmin/all", auth, checkPermission("STAFF_VIEW"), getAllAdmins)
router.get("/subadmin/:id", auth, checkPermission("STAFF_VIEW"), getSingleAdmin)
router.put("/subadmin/permissions/:id", auth, checkPermission("STAFF_MANAGE"), updateAdminPermissions)
router.delete("/subadmin/:id", auth, checkPermission("STAFF_MANAGE"), deleteAdmin)

// Global Bulk Settingsvhcvdc
router.get("/bulk-settings", auth, adminOnly, getBulkSettings)
router.put("/bulk-settings", auth, adminOnly, updateBulkSettings)

// Force Driver Online/Offline
router.put("/driver/toggle-online", auth, adminOnly, toggleDriverOnlineByAdmin)

module.exports = router