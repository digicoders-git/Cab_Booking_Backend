const mongoose = require("mongoose");

const rentalBookingSchema = new mongoose.Schema({
    bookingId: {
        type: String,
        required: true,
        unique: true
    },
    otp: {
        type: String,
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Driver",
        default: null
    },
    carCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CarCategory",
        required: true
    },
    rentalPackage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "RentalPackage",
        required: true
    },
    pickupLocation: {
        address: { type: String, required: true },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
    },
    status: {
        type: String,
        enum: ["Pending", "Accepted", "Arrived", "Started", "Completed", "Cancelled", "Expired"],
        default: "Pending"
    },
    cancelReason: {
        type: String,
        default: null
    },
    cancelledBy: {
        type: String,
        enum: ["User", "Driver", "Admin", null],
        default: null
    },
    startTime: {
        type: Date,
        default: null
    },
    endTime: {
        type: Date,
        default: null
    },
    driverLocation: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        heading: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: null }
    },
    totalDistanceTravelled: {
        type: Number,
        default: 0
    },
    paymentStatus: {
        type: String,
        enum: ["Pending", "Completed"],
        default: "Pending"
    },
    paymentMethod: {
        type: String,
        enum: ["Cash", "Online", "Wallet"],
        default: "Cash"
    },
    fareDetails: {
        baseFare: { type: Number, default: 0 },
        extraKmFare: { type: Number, default: 0 },
        extraTimeFare: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        totalFare: { type: Number, default: 0 },
        adminCommission: { type: Number, default: 0 }
    }
}, { timestamps: true });

module.exports = mongoose.model("RentalBooking", rentalBookingSchema);
