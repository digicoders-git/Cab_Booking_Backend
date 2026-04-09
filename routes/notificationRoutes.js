const express = require("express");
const router = express.Router();

const {
    createNotification,
    getMyNotifications,
    getAllNotifications,
    toggleNotificationStatus,
    deleteNotification
} = require("../controllers/notificationController");

const { auth, adminOnly } = require("../middleware/auth");
const { checkPermission } = require("../middleware/rbac");

// 1. Create a Notification (Admin Only)
// Expects: { "title": "Diwali Offer", "message": "10% Off", "targetRoles": ["user", "agent"] }
router.post("/create", auth, checkPermission("NEWS_POST"), createNotification);

// 2. Fetch Notifications for anyone who is logged in (User/Driver/Agent/Fleet)
// Token magic extracts role, no role parameter needed
router.get("/my-notifications", auth, getMyNotifications);

// 3. View All Notifications (Admin Panel Dashboard)
router.get("/all", auth, checkPermission("NEWS_VIEW"), getAllNotifications);

// 4. Toggle ON/OFF (Admin Only)
router.put("/toggle/:id", auth, checkPermission("NEWS_POST"), toggleNotificationStatus);

// 5. Delete Notification (Admin Only)
router.delete("/delete/:id", auth, checkPermission("NEWS_DELETE"), deleteNotification);

module.exports = router;
