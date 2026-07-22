const mongoose = require("mongoose");

const fixedRouteSchema = new mongoose.Schema({
    pickupLocation: {
        type: String,
        required: true
    },
    pickupLat: {
        type: Number,
        required: true
    },
    pickupLng: {
        type: Number,
        required: true
    },
    dropLocation: {
        type: String,
        required: true
    },
    dropLat: {
        type: Number,
        required: true
    },
    dropLng: {
        type: Number,
        required: true
    },
    carCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CarCategory',
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    adminCommission: {
        type: Number,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model("FixedRoute", fixedRouteSchema);
