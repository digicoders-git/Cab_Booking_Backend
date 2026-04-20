const express = require("express")
const router = express.Router()

const {
    loginUser,
    sendOtp,
    getAllUsers,
    getUserProfile,
    updateUserProfile,
    deleteUser,
    toggleUserStatus,
    updateFcmToken
} = require("../controllers/userController")

const upload = require("../middleware/uploadAdminImage")
const { auth, adminOnly } = require("../middleware/auth")
const { checkPermission } = require("../middleware/rbac")

// User Login / Register Route (OTP Base)
router.post("/send-otp", sendOtp)
router.post("/login", loginUser)

// Update FCM Token (Self)
router.put("/update-fcm-token", auth, updateFcmToken)

// Secure routes (Admin / Sub-Admin)
router.get("/all", auth, checkPermission("USER_READ"), getAllUsers)
router.get("/profile/:id", auth, getUserProfile)
router.put("/update-profile/:id", auth, upload.single("image"), updateUserProfile)
router.delete("/delete/:id", auth, checkPermission("USER_DELETE"), deleteUser)
router.put("/toggle-status/:id", auth, checkPermission("USER_STATUS"), toggleUserStatus)

module.exports = router