const mongoose = require("mongoose")

const adminSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },
    phone: {
        type: String,
        default: ""
    },


    password: {
        type: String,
        required: true
    },

    image: {
        type: String
    },
    walletBalance: {
        type: Number,
        default: 0
    },
    totalEarnings: {
        type: Number,
        default: 0
    },
    defaultCommission: {
        type: Number,
        default: 10 // Global platform fee % for individual drivers
    },
    // --- NEW: Global Settings for Bulk Booking ---
    userBulkAdvancePct: { type: Number, default: 25 },
    userPayViaBank: { type: Boolean, default: true },

    agentBulkAdvancePct: { type: Number, default: 5 },
    agentPayViaBank: { type: Boolean, default: false },

    vendorBulkAdvancePct: { type: Number, default: 15 },
    vendorPayViaBank: { type: Boolean, default: true },

    adminBulkAdvancePct: { type: Number, default: 0 },
    adminPayViaBank: { type: Boolean, default: false },

    fleetBulkSecurityPct: { type: Number, default: 20 },
    fleetSecurityPayViaBank: { type: Boolean, default: true },

    maxNegativeWalletLimit: { type: Number, default: 3000 },
    role: {
        type: String,
        enum: ["SuperAdmin", "SubAdmin"],
        default: "SuperAdmin"
    },
    permissions: [{
        type: String
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    fcmToken: {
        type: String,
        default: null
    }
}, { timestamps: true })

module.exports = mongoose.model("Admin", adminSchema)