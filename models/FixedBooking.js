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
    tripType: {
        type: String,
        default: 'One-Way'
    },
    maxTimeHours: {
        type: Number,
        default: 0
    },
    extraTimeChargePerHour: {
        type: Number,
        default: 0
    },
    maxDistanceKm: {
        type: Number,
        default: 0
    },
    extraDistanceChargePerKm: {
        type: Number,
        default: 0
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
        enum: ['Marketplace', 'Accepted', 'Started', 'Completed', 'Cancelled'],
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
    },
    startOtp: {
        type: String,
        default: null
    },
    startedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    },
    extraTimeCharges: {
        type: Number,
        default: 0
    },
    totalDistanceDriven: {
        type: Number,
        default: 0
    },
    extraDistanceCharges: {
        type: Number,
        default: 0
    },
    finalPrice: {
        type: Number,
        default: 0
    },
    cgst: {
        type: Number,
        default: 0
    },
    sgst: {
        type: Number,
        default: 0
    },
    totalWithTax: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model("FixedBooking", fixedBookingSchema);
