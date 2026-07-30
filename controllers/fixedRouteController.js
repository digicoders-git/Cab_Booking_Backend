const FixedRoute = require("../models/FixedRoute");
const User = require("../models/User");
const { getIO } = require("../socket/socket");
const { sendPushNotification } = require("../utils/fcmNotification");

// Create a new Fixed Route (Admin)
exports.createRoute = async (req, res) => {
    try {
        const { pickupLocation, pickupLat, pickupLng, dropLocation, dropLat, dropLng, carCategory, price, adminCommission, isActive, tripType, maxTimeHours, extraTimeChargePerHour, distanceKm } = req.body;
        
        const newRoute = new FixedRoute({
            pickupLocation,
            pickupLat,
            pickupLng,
            dropLocation,
            dropLat,
            dropLng,
            carCategory,
            price,
            adminCommission,
            isActive,
            tripType: tripType || 'One-Way',
            maxTimeHours: maxTimeHours || 0,
            extraTimeChargePerHour: extraTimeChargePerHour || 0,
            distanceKm: distanceKm || 0
        });

        await newRoute.save();

        // 1. WebSocket Event to Website (Users)
        try {
            const io = getIO();
            if (io) {
                io.emit('newFixedRoute', { route: newRoute });
            }
        } catch (sockErr) {
            console.error("Socket error on new route:", sockErr);
        }

        // 2. FCM Notification to all Users
        try {
            const users = await User.find({ fcmToken: { $ne: null }, isActive: true });
            const payload = {
                title: "New Fixed Route Available! 🚖",
                body: `New package from ${pickupLocation} to ${dropLocation} is now available at ₹${price}.`,
                data: { routeId: newRoute._id.toString() }
            };
            
            users.forEach(user => {
                if (user.fcmToken) {
                    sendPushNotification(user.fcmToken, payload);
                }
            });
        } catch (fcmErr) {
            console.error("FCM error on new route:", fcmErr);
        }

        res.status(201).json({ success: true, message: "Fixed route created successfully", route: newRoute });
    } catch (error) {
        console.error("Error creating fixed route:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Get all Fixed Routes (Admin)
exports.getAllRoutes = async (req, res) => {
    try {
        const routes = await FixedRoute.find().populate('carCategory', 'name icon');
        res.status(200).json({ success: true, routes });
    } catch (error) {
        console.error("Error fetching fixed routes:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Get active Fixed Routes (User)
exports.getActiveRoutes = async (req, res) => {
    try {
        const routes = await FixedRoute.find({ isActive: true }).populate('carCategory', 'name icon');
        res.status(200).json({ success: true, routes });
    } catch (error) {
        console.error("Error fetching active fixed routes:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Update a Fixed Route (Admin)
exports.updateRoute = async (req, res) => {
    try {
        const { pickupLocation, pickupLat, pickupLng, dropLocation, dropLat, dropLng, carCategory, price, adminCommission, isActive, tripType, maxTimeHours, extraTimeChargePerHour, distanceKm } = req.body;
        
        const route = await FixedRoute.findByIdAndUpdate(
            req.params.id, 
            { pickupLocation, pickupLat, pickupLng, dropLocation, dropLat, dropLng, carCategory, price, adminCommission, isActive, tripType, maxTimeHours, extraTimeChargePerHour, distanceKm },
            { new: true }
        );

        if (!route) {
            return res.status(404).json({ success: false, message: "Fixed route not found" });
        }
        res.status(200).json({ success: true, message: "Fixed route updated successfully", route });
    } catch (error) {
        console.error("Error updating fixed route:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Toggle a Fixed Route status (Admin)
exports.toggleRouteStatus = async (req, res) => {
    try {
        const route = await FixedRoute.findById(req.params.id);
        if (!route) {
            return res.status(404).json({ success: false, message: "Fixed route not found" });
        }
        route.isActive = !route.isActive;
        await route.save();
        res.status(200).json({ success: true, message: "Fixed route status updated", route });
    } catch (error) {
        console.error("Error toggling fixed route status:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Delete a Fixed Route (Admin)
exports.deleteRoute = async (req, res) => {
    try {
        const route = await FixedRoute.findByIdAndDelete(req.params.id);
        if (!route) {
            return res.status(404).json({ success: false, message: "Fixed route not found" });
        }
        res.status(200).json({ success: true, message: "Fixed route deleted successfully" });
    } catch (error) {
        console.error("Error deleting fixed route:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
