const mongoose = require("mongoose");

const ServiceAreaSchema = new mongoose.Schema({
    cityName: {
        type: String,
        required: true,
        trim: true
    },
    // 🛰️ Geo-Spatial Fields (THE ONLY SOURCE OF TRUTH)
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
        default: 50 // Operational Radius for the city
    },
    // GeoJSON for high-speed MongoDB spatial queries ($nearSphere)
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
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin"
    }
}, { timestamps: true });

// 🚀 Index for Geo-Spatial Search
ServiceAreaSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("ServiceArea", ServiceAreaSchema);
