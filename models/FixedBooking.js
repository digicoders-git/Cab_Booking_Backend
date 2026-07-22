const mongoose = require("mongoose");

const fixedBookingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fixedRoute: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FixedRoute',
        required: true
    },
    // We snapshot these in case the route is deleted or changed later
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
    pickupDate: {
        type: Date,
        required: true
    },
    pickupTime: {
        type: String, // e.g. "10:30 AM"
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['Cash', 'Online'],
        default: 'Cash'
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Completed'],
        default: 'Pending'
    },
    status: {
        type: String,
        enum: ['Marketplace', 'Accepted', 'Completed', 'Cancelled'],
        default: 'Marketplace'
    },
    assignedDriver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
        default: null
    },
    assignedAdmin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        default: null
    },
    acceptedAt: {
        type: Date,
        default: null
    },
    // To track if commission is deducted
    commissionDeducted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model("FixedBooking", fixedBookingSchema);
