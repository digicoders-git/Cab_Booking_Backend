const mongoose = require("mongoose");

const agentLeadSchema = new mongoose.Schema({
    //  Creator Details
    createdByAgent: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Agent'
    },

    // 👥 Customer Details (Hidden from drivers until they pay to unlock)
    customerName: {
        type: String,
        required: true
    },
    customerPhone: {
        type: String,
        required: true
    },

    // 🚗 Requested Vehicle Details
    carCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CarCategory',
        required: true
    },

    // 📍 Trip Details
    pickup: {
        address: { type: String, required: true },
        latitude: { type: Number },
        longitude: { type: Number }
    },
    drop: {
        address: { type: String, required: true },
        latitude: { type: Number },
        longitude: { type: Number }
    },
    pickupDateTime: {
        type: Date,
        required: true
    },

    // 💰 Pricing & Economics
    totalPrice: {
        type: Number,
        required: true // Amount User will pay to Driver in cash
    },
    agentCommission: {
        type: Number,
        required: true // Amount Driver must pay to Admin to unlock
    },
    driverEarning: {
        type: Number,
        required: true // totalPrice - agentCommission
    },

    // 🚀 Status
    status: {
        type: String,
        enum: ['Marketplace', 'Accepted', 'Ongoing', 'Completed', 'Cancelled'],
        default: 'Marketplace'
    },

    // 🚗 Assignment
    assignedDriver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Driver",
        default: null
    },
    assignedAdmin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null
    },
    pendingDriverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Driver",
        default: null
    },
    acceptedAt: {
        type: Date,
        default: null
    },

    // 💳 Escrow / Financial Tracking
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Held_In_Escrow', 'Settled', 'Refunded', 'Admin_Bypass'],
        default: 'Pending'
    },

    // Tracking HDFC payments for the unlock fee
    hdfcOrderId: { type: String, default: null },
    hdfcTransactionId: { type: String, default: null },

    // Tracking HDFC / Wallet payments for the unlock fee
    transactionId: {
        type: String,
        default: null
    },

    adminRead: {
        type: Boolean,
        default: false
    }

}, { timestamps: true });

module.exports = mongoose.model("AgentLead", agentLeadSchema);
