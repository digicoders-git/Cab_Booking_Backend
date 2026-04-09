const express = require("express")
const router = express.Router()

const {
    loginUser,
    getAllUsers,
    getUserProfile,
    updateUserProfile,
    deleteUser,
    toggleUserStatus
} = require("../controllers/userController")

const upload = require("../middleware/uploadAdminImage")
const { auth, adminOnly } = require("../middleware/auth")
const { checkPermission } = require("../middleware/rbac")

// User Login / Register Route (OTP Base)
router.post("/login", loginUser)

// Secure routes (Admin / Sub-Admin)
router.get("/all", auth, checkPermission("USER_READ"), getAllUsers)
router.get("/profile/:id", auth, getUserProfile)
router.put("/update-profile/:id", auth, upload.single("image"), updateUserProfile)
router.delete("/delete/:id", auth, checkPermission("USER_DELETE"), deleteUser)
router.put("/toggle-status/:id", auth, checkPermission("USER_STATUS"), toggleUserStatus)

module.exports = router