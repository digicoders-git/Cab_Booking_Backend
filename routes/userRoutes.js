const express = require("express")
const router = express.Router()

const {
    createUser,
    loginUser,
    getAllUsers,
    getUserProfile,
    deleteUser,
    toggleUserStatus
} = require("../controllers/userController")

const upload = require("../middleware/uploadAdminImage")
const { auth, adminOnly } = require("../middleware/auth")

// Create User (Open / Registration)
router.post("/create", upload.single("image"), createUser)

// User Login Route (OTP Base)
router.post("/login", loginUser)

// Secure routes
router.get("/all", auth, adminOnly, getAllUsers)
router.get("/profile/:id", auth, getUserProfile)
router.delete("/delete/:id", auth, adminOnly, deleteUser)
router.put("/toggle-status/:id", auth, adminOnly, toggleUserStatus)

module.exports = router