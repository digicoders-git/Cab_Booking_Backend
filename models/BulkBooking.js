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
    priceModifiedPercentage: {
        type: Number,
        default: 0 // Track if user increased/decreased vs system
    },

    // 🚀 Marketplace Status
    status: {
        type: String,
        enum: ['PendingPayment', 'Marketplace', 'Accepted', 'Ongoing', 'Completed', 'Cancelled'],
        default: 'PendingPayment'
    },

    // 🏢 Assignment
    assignedFleet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Fleet",
        default: null
    },
    acceptedAt: {
        type: Date,
        default: null
    },

    // 📝 Additional Notes
    notes: {
        type: String,
        trim: true
    },
    startOtp: {
        type: String,
        default: null
    },
    
    // 💳 Payment Tracking
    advancePayment: {
        amount: { type: Number, default: 0 },
        isPaid: { type: Boolean, default: false },
        razorpayOrderId: { type: String, default: null },
        razorpayPaymentId: { type: String, default: null }
    },
    fleetSecurityPayment: {
        amount: { type: Number, default: 0 },
        isPaid: { type: Boolean, default: false },
        razorpayOrderId: { type: String, default: null },
        razorpayPaymentId: { type: String, default: null }
    },
    agentCommissionPaid: {
        type: Boolean,
        default: false
    },
    agentCommissionAmount: {
        type: Number,
        default: 0
    }


}, { timestamps: true });

// Index for Geospatial queries if needed later
bulkBookingSchema.index({ "pickup.latitude": 1, "pickup.longitude": 1 });

module.exports = mongoose.model("BulkBooking", bulkBookingSchema);
