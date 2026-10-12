const mongoose = require('mongoose');

const userSubscriptionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubscriptionPlan",
        required: true
    },
    // Fixed Route Details
    pickup: {
        address: { type: String, required: true },
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true }
    },
    drop: {
        address: { type: String, required: true },
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true }
    },
    routeDistanceKm: { type: Number, required: true },
    
    // Fixed Timings
    pickupTime: { type: String, required: true }, // e.g. "09:00 AM"
    returnTime: { type: String, default: null }, // e.g. "06:00 PM"

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    
    status: {
        type: String,
        enum: ['Active', 'Expired', 'Cancelled', 'Inactive'],
        default: 'Active'
    },
    
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Completed'],
        default: 'Pending'
    },
    transactionId: { type: String, default: null },

    assignedDriver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Driver",
        default: null
    },

    dailyLogs: [{
        date: { type: String }, // e.g., "YYYY-MM-DD"
        goTrip: {
            status: { type: String, enum: ['Pending', 'Completed', 'Missed'], default: 'Pending' },
            completedAt: { type: Date, default: null }
        },
        returnTrip: {
            status: { type: String, enum: ['Pending', 'Completed', 'Missed'], default: 'Pending' },
            completedAt: { type: Date, default: null }
        }
    }]

}, { timestamps: true });

module.exports = mongoose.model('UserSubscription', userSubscriptionSchema);
