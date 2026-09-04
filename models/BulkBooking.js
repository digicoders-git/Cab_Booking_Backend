const mongoose = require("mongoose");

const bulkBookingSchema = new mongoose.Schema({
    // Who created the request
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'createdByModel'
    },
    createdByModel: {
        type: String,
        required: true,
        enum: ['User', 'Agent', 'Vendor', 'Admin', 'Fleet']
    },

    // 📍 Trip Details
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
    pickupDateTime: {
        type: Date,
        required: true
    },
    tripType: {
        type: String,
        enum: ['OneWay', 'RoundTrip'],
        default: 'OneWay'
    },
    returnDateTime: {
        type: Date,
        default: null
    },
    numberOfDays: {
        type: Number,
        default: 1
    },
    totalDistance: {
        type: Number,
        default: 0
    },
    isOutstation: {
        type: Boolean,
        default: false
    },

    // 🚗 Requirements (Multiple Categories)
    carsRequired: [{
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CarCategory",
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            default: 1
        }
    }],

    // 💰 Pricing Logic
    systemEstimatedPrice: {
        type: Number,
        default: 0
    },
    offeredPrice: {
        type: Number,
        required: true // Custom Price set by Rider
    },
    cgst: {
        type: Number,
        default: 0
    },
    sgst: {
        type: Number,
        default: 0
    },
    totalPriceWithTax: {
        type: Number,
        default: 0
    },
    priceModifiedPercentage: {
        type: Number,
        default: 0 // Track if user increased/decreased vs system
    },
    mcdStateTaxApplied: {
        type: Number,
        default: 0
    },
    taxBreakdown: {
        type: Array,
        default: []
    },
    appliedAreaPricing: {
        areaName: { type: String, default: null },
        appliedMultiplier: { type: Number, default: 1 }
    },

    // 🚀 Marketplace Status
    status: {
        type: String,
        enum: ['PendingPayment', 'Marketplace', 'Accepted', 'Ongoing', 'Completed', 'Cancelled', 'Expired'],
        default: 'PendingPayment'
    },
    appliedOffer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Offer",
        default: null
    },
    discountAmount: {
        type: Number,
        default: 0
    },

    // 🏢 Assignment
    assignedFleet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Fleet",
        default: null
    },
    assignedAdmin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null
    },
    // 🚗 Multiple Driver/Car Assignments for the deal
    assignedDrivers: [{
        driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver" },
        car: { type: mongoose.Schema.Types.ObjectId, ref: "FleetCar" },
        status: { 
            type: String, 
            enum: ['Pending', 'Ongoing', 'Completed'], 
            default: 'Pending' 
        },
        startedAt: { type: Date, default: null },
        endedAt: { type: Date, default: null },
        assignedAt: { type: Date, default: Date.now }
    }],
    acceptedAt: {
        type: Date,
        default: null
    },

    // 📝 Additional Notes
    notes: {
        type: String,
        trim: true
    },
    customerName: {
        type: String,
        default: null
    },
    customerPhone: {
        type: String,
        default: null
    },
    startOtp: {
        type: String,
        default: null
    },
    
    // 💳 Payment Tracking
    advancePayment: {
        amount: { type: Number, default: 0 },
        isPaid: { type: Boolean, default: false },
        hdfcOrderId: { type: String } // Save HDFC order ID to track webhook
    },
    fleetSecurityPayment: {
        amount: { type: Number, default: 0 },
        isPaid: { type: Boolean, default: false },
        hdfcOrderId: { type: String, default: null },
        hdfcTransactionId: { type: String, default: null },
        fleetId: { type: mongoose.Schema.Types.ObjectId, ref: "Fleet", default: null }
    },
    hdfcFinalOrderId: { type: String }, // For tracking final bulk payment webhook
    finalPayment: {
        amount: { type: Number, default: 0 },
        method: { type: String, enum: ['Cash', 'Online'], default: 'Cash' },
        hdfcOrderId: { type: String, default: null },
        hdfcTransactionId: { type: String, default: null },
        isPaid: { type: Boolean, default: false },
        at: { type: Date, default: null }
    },
    agentCommissionPaid: {
        type: Boolean,
        default: false
    },
    agentCommissionAmount: {
        type: Number,
        default: 0
    },
    // duplicate removed
    adminRead: {
        type: Boolean,
        default: false
    }

}, { timestamps: true });

// Index for Geospatial queries if needed later
bulkBookingSchema.index({ "pickup.latitude": 1, "pickup.longitude": 1 });

module.exports = mongoose.model("BulkBooking", bulkBookingSchema);
