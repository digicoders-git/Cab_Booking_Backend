const mongoose = require("mongoose");

const AreaPricingSchema = new mongoose.Schema({
    areaName: {
        type: String,
        required: true,
        unique: true, // e.g., "Ghazipur", "Lucknow", "Airport Zone"
        trim: true
    },
    // We can match this name against the address parts from Google Maps
    matchingKeywords: {
        type: [String],
        default: [] // ["Ghazipur", "Saidpur", "Zamania"] - Keywords to match in address
    },
    
    // Pricing Overrides
    baseFareMultiplier: { type: Number, default: 1 }, // 1 means no change, 1.2 means 20% extra
    privateRateMultiplier: { type: Number, default: 1 }, // Multiplier for Private Rate per KM
    sharedRateMultiplier: { type: Number, default: 1 },  // Multiplier for Shared Rate per KM (Seat based)
    
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 } // Higher number = Higher priority (Specific areas should have higher priority than districts)
}, { timestamps: true });

module.exports = mongoose.model("AreaPricing", AreaPricingSchema);
