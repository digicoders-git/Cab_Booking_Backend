const mongoose = require("mongoose");

const areaPricingSchema = new mongoose.Schema({
    areaName: {
        type: String,
        required: [true, "Area name is required"],
        trim: true
    },
    // 🛰️ Geo-Spatial Fields
    centerLat: {
        type: Number,
        required: true
    },
    centerLng: {
        type: Number,
        required: true
    },
    radiusKm: {
        type: Number,
        default: 5 // Default 5KM range
    },
    // GeoJSON for high-speed MongoDB spatial queries
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true
        }
    },
    priority: {
        type: Number,
        default: 0
    },
    baseFareMultiplier: {
        type: Number,
        default: 1
    },
    privateRateMultiplier: {
        type: Number,
        default: 1
    },
    sharedRateMultiplier: {
        type: Number,
        default: 1
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // 📅 Time-Bound Validity
    validFrom: {
        type: Date,
        default: null
    },
    validUntil: {
        type: Date,
        default: null
    },
    // ⏰ Recurring Peak Time Scheduling
    daysOfWeek: {
        type: [String],
        enum: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        default: [] // Empty means all days
    },
    startTime: {
        type: String, // format "HH:mm" (24-hour), e.g. "17:00"
        default: null
    },
    endTime: {
        type: String, // format "HH:mm", e.g. "21:00"
        default: null
    }
}, { timestamps: true });

// 🚀 Index for Geo-Spatial Search
areaPricingSchema.index({ location: "2dsphere" });

const AreaPricing = mongoose.model("AreaPricing", areaPricingSchema);
module.exports = AreaPricing;
