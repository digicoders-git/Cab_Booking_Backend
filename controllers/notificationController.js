const Notification = require("../models/Notification");

// 1. Create a Notification (Admin Only)
exports.createNotification = async (req, res) => {
    try {
        const { title, message, targetRoles, recipient, recipientModel } = req.body;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: "Please provide both title and message"
            });
        }

        // Validate that either targetRoles exists OR a specific recipient is provided
        if ((!targetRoles || !Array.isArray(targetRoles)) && !recipient) {
            return res.status(400).json({
                success: false,
                message: "Please provide either targetRoles (array) or a specific recipient"
            });
        }

        const notification = await Notification.create({
            title,
            message,
            targetRoles: targetRoles || [],
            recipient: recipient || null,
            recipientModel: recipientModel || null,
            createdBy: req.user.id,
            createdByModel: 'Admin'
        });

        console.log(`[ADMIN-NOTIF-DEBUG] Notification saved to DB. ID: ${notification._id}`);

        // --- Firebase Push Notification Dispatch ---
        const { sendPushNotification, sendTopicNotification, sendConditionNotification } = require("../utils/fcmNotification");
        
        const fcmPayload = {
            title: title,
            body: message,
            data: { 
                type: "ANNOUNCEMENT", 
                id: notification._id.toString(),
                title: title,
                body: message
            }
        };

        try {
            if (recipient) {
                console.log(`[ADMIN-NOTIF-DEBUG] Targeting specific user: ${recipient} (${recipientModel})`);
                const models = { 
                    User: require("../models/User"), 
                    Driver: require("../models/Driver"),
                    Agent: require("../models/Agent"),
                    Fleet: require("../models/Fleet"),
                    Vendor: require("../models/Vendor"),
                    SubAdmin: require("../models/Admin")
                };
                if (models[recipientModel]) {
                    const target = await models[recipientModel].findById(recipient);
                    if (target?.fcmToken) {
                        await sendPushNotification(target.fcmToken, fcmPayload);
                        console.log(`[ADMIN-NOTIF-DEBUG] FCM sent to individual: ${target.name}`);
                    } else {
                        console.log(`[ADMIN-NOTIF-DEBUG] ⚠️ Individual target found but has no FCM Token.`);
                    }
                }
            } else if (targetRoles?.includes("all")) {
                console.log(`[ADMIN-NOTIF-DEBUG] Broadcasting to EVERYONE (topic: all)`);
                const fcmRes = await sendTopicNotification("all", fcmPayload);
                console.log(`[ADMIN-NOTIF-DEBUG] Global Broadcast Response:`, fcmRes);
            } else if (targetRoles?.length > 0) {
                const condition = targetRoles.map(role => `'${role}' in topics`).join(' || ');
                console.log(`[ADMIN-NOTIF-DEBUG] Broadcasting to ROLES: ${targetRoles.join(', ')} (Condition: ${condition})`);
                const fcmRes = await sendConditionNotification(condition, fcmPayload);
                console.log(`[ADMIN-NOTIF-DEBUG] Role Broadcast Response:`, fcmRes);
            }
        } catch (fcmErr) {
            console.error(`[ADMIN-NOTIF-DEBUG] ❌ FCM Dispatch Failed:`, fcmErr.message);
        }

        res.status(201).json({
            success: true,
            message: "Notification sent successfully!",
            notification
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 2. Fetch Notifications for Logged-In User/Driver/Agent/Fleet (My Notifications)
exports.getMyNotifications = async (req, res) => {
    try {
        const myRole = req.user.role; // Extract role from the JWT token magic!

        // Find active notifications meant for "all", my role OR specifically for ME
        const notifications = await Notification.find({
            isActive: true,
            $or: [
                { targetRoles: { $in: ["all", myRole] } },
                { recipient: req.user.id }
            ]
        }).sort({ createdAt: -1 }); // Newest first

        res.json({
            success: true,
            count: notifications.length,
            notifications
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 3. Get All Notifications (Admin Panel View)
exports.getAllNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find()
            .populate("createdBy", "name image")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: notifications.length,
            notifications
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 4. Toggle Notification Status (Turn an offer ON/OFF) - Admin Only
exports.toggleNotificationStatus = async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);

        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        notification.isActive = !notification.isActive;
        await notification.save();

        res.json({
            success: true,
            message: `Notification is now ${notification.isActive ? 'Active' : 'Inactive'}`,
            isActive: notification.isActive
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 5. Delete a Notification permanently (Admin Only)
exports.deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findByIdAndDelete(req.params.id);

        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        res.json({
            success: true,
            message: "Notification deleted successfully"
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
