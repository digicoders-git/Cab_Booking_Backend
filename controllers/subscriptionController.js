const SubscriptionPlan = require('../models/SubscriptionPlan');

// Create a new Plan
exports.createPlan = async (req, res) => {
    try {
        const { name, description, pickup, drop, distanceKm, ridesPerDay, validityDays, price, carCategory } = req.body;
        
        const plan = new SubscriptionPlan({
            name, description, pickup, drop, distanceKm, ridesPerDay, validityDays, price, carCategory,
            createdBy: req.user.id
        });
        
        await plan.save();
        res.status(201).json({ success: true, message: "Subscription Plan created successfully", plan });
    } catch (error) {
        console.error("Error creating plan:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// Get all Plans
exports.getAllPlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.find().populate('carCategory', 'name').sort({ createdAt: -1 });
        res.json({ success: true, plans });
    } catch (error) {
        console.error("Error fetching plans:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// Update a Plan
exports.updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await SubscriptionPlan.findByIdAndUpdate(id, req.body, { new: true });
        res.json({ success: true, message: "Plan updated", plan: updated });
    } catch (error) {
        console.error("Error updating plan:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// Delete a Plan
exports.deletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        await SubscriptionPlan.findByIdAndDelete(id);
        res.json({ success: true, message: "Plan deleted successfully" });
    } catch (error) {
        console.error("Error deleting plan:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

const UserSubscription = require('../models/UserSubscription');

// Admin gets all purchased subscriptions
exports.getAllPurchasedSubscriptions = async (req, res) => {
    try {
        // Only return subscriptions where payment was successfully completed
        const filter = { paymentStatus: 'Completed' };
        if (req.query.status) {
            filter.status = req.query.status;
        }

        const subscriptions = await UserSubscription.find(filter)
            .populate('user', 'name phone email')
            .populate('assignedDriver', 'name phone image carDetails')
            .populate({
                path: 'plan',
                populate: { path: 'carCategory' }
            })
            .sort({ createdAt: -1 });
        res.json({ success: true, subscriptions });
    } catch (error) {
        console.error("Error fetching all user subscriptions:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// Admin assigns driver to a subscription
exports.assignDriver = async (req, res) => {
    try {
        const { subscriptionId, driverId } = req.body;
        
        const subscription = await UserSubscription.findById(subscriptionId).populate('plan');
        if (!subscription) return res.status(404).json({ success: false, message: "Subscription not found" });

        const Driver = require('../models/Driver');
        const driver = await Driver.findById(driverId).populate('carDetails.carType');
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

        subscription.assignedDriver = driverId;
        await subscription.save();

        const User = require('../models/User');
        const user = await User.findById(subscription.user);

        const { sendPushNotification } = require('../utils/fcmNotification');
        const { getIO } = require('../socket/socket');
        const Notification = require('../models/Notification');

        const planName = subscription.plan?.name || "Daily Commute Pass";
        const pickupAddr = subscription.pickup?.address || "Pickup";
        const dropAddr = subscription.drop?.address || "Drop";
        const pickupTime = subscription.pickupTime || "09:00 AM";

        // 1. Send FCM Push Notification to DRIVER
        if (driver.fcmToken) {
            await sendPushNotification(driver.fcmToken, {
                title: "Nayi Daily Pass Duty Assign Hui! 🚗",
                body: `Aapko ${planName} route assign kiya gaya hai. Subah pickup: ${pickupTime}.`,
                data: {
                    type: "subscription_assigned",
                    subscriptionId: subscription._id.toString(),
                    pickupAddress: pickupAddr,
                    dropAddress: dropAddr,
                    pickupTime: pickupTime
                }
            });
        }

        // 2. Send FCM Push Notification to USER (Passenger)
        if (user && user.fcmToken) {
            const driverCarName = driver.carDetails?.carType?.name || "Cab";
            const driverVehicleNum = driver.carDetails?.vehicleNumber || "";
            await sendPushNotification(user.fcmToken, {
                title: "Dedicated Captain Assigned! 🎉",
                body: `Aapke pass ke liye Captain ${driver.name} (${driverCarName} ${driverVehicleNum}) assign ho gaye hain.`,
                data: {
                    type: "subscription_driver_assigned",
                    subscriptionId: subscription._id.toString(),
                    driverName: driver.name,
                    driverPhone: driver.phone
                }
            });
        }

        // 3. In-App Notifications (Notification collection)
        try {
            const adminId = req.user?.id || (await require('../models/Admin').findOne())?._id;
            if (adminId) {
                // For Driver
                await Notification.create({
                    title: "Nayi Daily Pass Duty Assign Hui! 🚗",
                    message: `Aapko ${planName} (${pickupAddr} to ${dropAddr}) assign kiya gaya hai. Daily pickup: ${pickupTime}.`,
                    recipient: driver._id,
                    recipientModel: 'Driver',
                    createdBy: adminId,
                    createdByModel: 'Admin'
                });

                // For User
                if (user) {
                    await Notification.create({
                        title: "Dedicated Captain Assigned! 🎉",
                        message: `Aapke Daily Pass (${planName}) ke liye Captain ${driver.name} ko assign kar diya gaya hai.`,
                        recipient: user._id,
                        recipientModel: 'User',
                        createdBy: adminId,
                        createdByModel: 'Admin'
                    });
                }
            }
        } catch (notifErr) {
            console.error("In-App Notification Error:", notifErr.message);
        }

        // 4. Real-time Socket Event to Driver & User
        try {
            const io = getIO();
            if (io) {
                // Alert Driver
                io.to(driver._id.toString()).emit("subscription_assigned", {
                    subscriptionId: subscription._id,
                    planName,
                    pickupTime,
                    pickupAddress: pickupAddr,
                    dropAddress: dropAddr
                });

                // Alert User
                if (user) {
                    io.to(user._id.toString()).emit("subscription_driver_assigned", {
                        subscriptionId: subscription._id,
                        driver: {
                            id: driver._id,
                            name: driver.name,
                            phone: driver.phone,
                            carDetails: driver.carDetails
                        }
                    });
                }
            }
        } catch (socketErr) {
            console.error("Socket emit error on assignDriver:", socketErr.message);
        }

        res.json({ success: true, message: "Driver assigned successfully & notifications dispatched!", subscription });
    } catch (error) {
        console.error("Error assigning driver:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// Driver views assigned subscriptions
exports.getDriverAssignedSubscriptions = async (req, res) => {
    try {
        const subscriptions = await UserSubscription.find({ assignedDriver: req.user.id })
            .populate('user', 'name phone email')
            .populate({
                path: 'plan',
                populate: { path: 'carCategory' }
            })
            .sort({ createdAt: -1 });
        res.json({ success: true, subscriptions });
    } catch (error) {
        console.error("Error fetching driver subscriptions:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// Driver marks attendance (Go or Return trip)
exports.markSubscriptionAttendance = async (req, res) => {
    try {
        const { subscriptionId, date, tripType, status } = req.body;
        // date format: 'YYYY-MM-DD', tripType: 'goTrip' or 'returnTrip', status: 'Started', 'Completed', or 'Missed'

        const subscription = await UserSubscription.findById(subscriptionId).populate('plan');
        if (!subscription) return res.status(404).json({ success: false, message: "Subscription not found" });

        if (subscription.assignedDriver?.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "Not authorized to update this subscription" });
        }

        const Driver = require('../models/Driver');
        const driver = await Driver.findById(req.user.id);

        const User = require('../models/User');
        const user = await User.findById(subscription.user);

        const { sendPushNotification } = require('../utils/fcmNotification');
        const { getIO } = require('../socket/socket');
        const Notification = require('../models/Notification');

        // find log for this date
        let logIndex = subscription.dailyLogs.findIndex(log => log.date === date);
        if (logIndex === -1) {
            subscription.dailyLogs.push({
                date,
                goTrip: { status: 'Pending', startedAt: null, completedAt: null },
                returnTrip: { status: 'Pending', startedAt: null, completedAt: null }
            });
            logIndex = subscription.dailyLogs.length - 1;
        }

        const currentTrip = subscription.dailyLogs[logIndex][tripType] || { status: 'Pending' };

        // --- RULE: End/Complete karne ke pehle Ride ka Start hona zaroori hai ---
        if (status === 'Completed' && currentTrip.status !== 'Started') {
            return res.status(400).json({ 
                success: false, 
                message: "Ride ko End karne se pehle Start karna zaroori hai!" 
            });
        }

        if (currentTrip.status === 'Completed') {
            return res.status(400).json({
                success: false,
                message: "Yeh ride pehle se hi Completed hai!"
            });
        }

        const now = new Date();
        const tripName = tripType === 'goTrip' ? 'Morning Pickup' : 'Evening Return';
        const planName = subscription.plan?.name || "Daily Commute Pass";

        if (tripType === 'goTrip') {
            subscription.dailyLogs[logIndex].goTrip.status = status;
            if (status === 'Started') subscription.dailyLogs[logIndex].goTrip.startedAt = now;
            if (status === 'Completed') subscription.dailyLogs[logIndex].goTrip.completedAt = now;
        } else if (tripType === 'returnTrip') {
            subscription.dailyLogs[logIndex].returnTrip.status = status;
            if (status === 'Started') subscription.dailyLogs[logIndex].returnTrip.startedAt = now;
            if (status === 'Completed') subscription.dailyLogs[logIndex].returnTrip.completedAt = now;
        }

        await subscription.save();

        // --- DISPATCH FCM PUSH NOTIFICATIONS TO USER ---
        if (user && user.fcmToken) {
            let notifTitle = "";
            let notifBody = "";

            if (status === 'Started') {
                notifTitle = `Daily Pass: Ride Started! 🚕`;
                notifBody = `Aapki ${tripName} ride shuru ho gayi hai! Captain ${driver?.name || 'Driver'} raste mein hain.`;
            } else if (status === 'Completed') {
                notifTitle = `Daily Pass: Ride Completed! ✅`;
                notifBody = `Aapki ${tripName} commute ride successfully complete ho gayi hai. Have a safe day!`;
            } else if (status === 'Missed') {
                notifTitle = `Daily Pass: Ride Missed ⚠️`;
                notifBody = `Aapki aaj ki ${tripName} commute ride missed mark ki gayi hai.`;
            }

            if (notifTitle) {
                await sendPushNotification(user.fcmToken, {
                    title: notifTitle,
                    body: notifBody,
                    data: {
                        type: `subscription_ride_${status.toLowerCase()}`,
                        subscriptionId: subscription._id.toString(),
                        tripType,
                        status,
                        date
                    }
                });

                // Create in-app notification entry
                try {
                    await Notification.create({
                        title: notifTitle,
                        message: notifBody,
                        recipient: user._id,
                        recipientModel: 'User',
                        createdBy: driver?._id || user._id,
                        createdByModel: 'Driver'
                    });
                } catch (e) {
                    console.error("In-app notification creation error:", e.message);
                }
            }
        }

        // --- REAL-TIME SOCKET ALERT TO USER ---
        try {
            const io = getIO();
            if (io && user) {
                io.to(user._id.toString()).emit("subscription_trip_update", {
                    subscriptionId: subscription._id,
                    tripType,
                    status,
                    date,
                    timestamp: now
                });
            }
        } catch (socketErr) {
            console.error("Socket error on attendance update:", socketErr.message);
        }

        res.json({ success: true, message: `Attendance marked as ${status} successfully!`, dailyLogs: subscription.dailyLogs });
    } catch (error) {
        console.error("Error marking attendance:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};
