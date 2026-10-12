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
        const subscriptions = await UserSubscription.find()
            .populate('user', 'name phone email')
            .populate('assignedDriver', 'name phone vehicleDetails')
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
        
        const subscription = await UserSubscription.findById(subscriptionId);
        if (!subscription) return res.status(404).json({ success: false, message: "Subscription not found" });

        subscription.assignedDriver = driverId;
        await subscription.save();

        res.json({ success: true, message: "Driver assigned successfully", subscription });
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
        // date format: 'YYYY-MM-DD', tripType: 'goTrip' or 'returnTrip', status: 'Completed' or 'Missed'

        const subscription = await UserSubscription.findById(subscriptionId);
        if (!subscription) return res.status(404).json({ success: false, message: "Subscription not found" });

        if (subscription.assignedDriver?.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "Not authorized to update this subscription" });
        }

        // find log for this date
        let logIndex = subscription.dailyLogs.findIndex(log => log.date === date);
        if (logIndex === -1) {
            subscription.dailyLogs.push({
                date,
                goTrip: { status: 'Pending', completedAt: null },
                returnTrip: { status: 'Pending', completedAt: null }
            });
            logIndex = subscription.dailyLogs.length - 1;
        }

        if (tripType === 'goTrip') {
            subscription.dailyLogs[logIndex].goTrip.status = status;
            if (status === 'Completed') subscription.dailyLogs[logIndex].goTrip.completedAt = new Date();
        } else if (tripType === 'returnTrip') {
            subscription.dailyLogs[logIndex].returnTrip.status = status;
            if (status === 'Completed') subscription.dailyLogs[logIndex].returnTrip.completedAt = new Date();
        }

        await subscription.save();
        res.json({ success: true, message: "Attendance marked successfully", dailyLogs: subscription.dailyLogs });
    } catch (error) {
        console.error("Error marking attendance:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};
