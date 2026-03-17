const Notification = require("../models/Notification");

// 1. Create a Notification (Admin Only)
exports.createNotification = async (req, res) => {
    try {
        const { title, message, targetRoles } = req.body;

        if (!title || !message || !targetRoles || !Array.isArray(targetRoles)) {
            return res.status(400).json({ 
                success: false, 
                message: "Please provide title, message, and targetRoles as an array" 
            });
        }

        const notification = await Notification.create({
            title,
            message,
            targetRoles,
            createdBy: req.user.id
        });

        res.status(201).json({
            success: true,
            message: "Notification broadcasted successfully!",
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
            .populate("createdBy", "name")
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
