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
    getSingleAdmin
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

// Admin Dashboard & Reports
router.get("/dashboard-stats", auth, checkPermission("DASHBOARD_READ"), getDashboardStats)
router.get("/full-report", auth, checkPermission("REPORT_READ"), getSystemReport)
router.get("/live-tracking", auth, checkPermission("TRACKING_READ"), getLiveDriversTracking)

// Admin creates Agent / Fleet (Redundant but kept for compatibility)
router.post("/create-agent", auth, checkPermission("AGENT_CREATE"), upload.single("image"), registerAgent)
router.post("/create-fleet", auth, checkPermission("FLEET_CREATE"), upload.single("image"), createFleet)

// ================= RBAC: SUB-ADMIN MANAGEMENT =================
router.post("/subadmin/register", auth, checkPermission("STAFF_MANAGE"), upload.single("image"), registerSubAdmin)
router.get("/subadmin/all", auth, checkPermission("STAFF_VIEW"), getAllAdmins)
router.get("/subadmin/:id", auth, checkPermission("STAFF_VIEW"), getSingleAdmin)
router.put("/subadmin/permissions/:id", auth, checkPermission("STAFF_MANAGE"), updateAdminPermissions)
router.delete("/subadmin/:id", auth, checkPermission("STAFF_MANAGE"), deleteAdmin)

module.exports = router