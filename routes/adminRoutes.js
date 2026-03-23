const express = require("express")
const router = express.Router()

const {
    registerAdmin,
    getProfile,
    updateProfile,
    loginAdmin,
    getDashboardStats,
    getSystemReport,
    getLiveDriversTracking
} = require("../controllers/adminController")
const { registerAgent } = require("../controllers/agentController")
const { createFleet } = require("../controllers/fleetController")
const { auth, adminOnly } = require("../middleware/auth")

const upload = require("../middleware/uploadAdminImage")

router.post("/register", upload.single("image"), registerAdmin)
router.post("/login", loginAdmin)

router.get("/profile", auth, adminOnly, getProfile)
router.put("/profile-update", auth, adminOnly, upload.single("image"), updateProfile)

// Admin Dashboard & Reports
router.get("/dashboard-stats", auth, adminOnly, getDashboardStats)
router.get("/full-report", auth, adminOnly, getSystemReport)
router.get("/live-tracking", auth, adminOnly, getLiveDriversTracking)

// Admin creates Agent / Fleet
router.post("/create-agent", auth, adminOnly, upload.single("image"), registerAgent)
router.post("/create-fleet", auth, adminOnly, upload.single("image"), createFleet)

module.exports = router