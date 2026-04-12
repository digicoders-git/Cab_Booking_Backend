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
    }
}, { timestamps: true });

// 🚀 Index for Geo-Spatial Search
areaPricingSchema.index({ location: "2dsphere" });

const AreaPricing = mongoose.model("AreaPricing", areaPricingSchema);
module.exports = AreaPricing;
