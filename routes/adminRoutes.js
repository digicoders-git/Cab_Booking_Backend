const express = require("express")
const router = express.Router()

const {
    registerAdmin,
    getProfile,
    updateProfile
} = require("../controllers/adminController")
const { loginAdmin } = require("../controllers/adminController")
const { registerAgent } = require("../controllers/agentController")
const { createFleet } = require("../controllers/fleetController")
const { auth, adminOnly } = require("../middleware/auth")

const upload = require("../middleware/uploadAdminImage")

router.post("/register", upload.single("image"), registerAdmin)

router.get("/profile", auth, adminOnly, getProfile)


router.post("/login", loginAdmin)

// Admin creates Agent
router.post("/create-agent", auth, adminOnly, upload.single("image"), registerAgent)

// Admin creates Fleet
router.post("/create-fleet", auth, adminOnly, upload.single("image"), createFleet)

router.put(
    "/profile-update",
    auth,
    adminOnly,
    upload.single("image"),
    updateProfile
)

module.exports = router