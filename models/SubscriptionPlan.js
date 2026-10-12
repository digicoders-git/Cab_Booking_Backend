const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
    name: { type: String, required: true }, // e.g., "Gomti Nagar to Hazratganj Pass"
    description: { type: String, default: "" },
    
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
    distanceKm: { type: Number, required: true }, // Exact distance of this route
    
    ridesPerDay: { type: Number, default: 2 }, // Usually 2 (up and down)
    validityDays: { type: Number, default: 30 },
    price: { type: Number, required: true },
    carCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CarCategory",
        required: true
    },
    isActive: { type: Boolean, default: true },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin"
    }
}, { timestamps: true });

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
