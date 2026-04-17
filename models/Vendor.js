const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema({
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
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    image: {
        type: String,
        default: null
    },

    // Business Details
    companyName: {
        type: String,
        required: true
    },

    // Area/Zone assigned to this Vendor
    assignedArea: {
        type: String,
        required: true  // e.g. "Pune", "Nashik", "Mumbai"
    },

    // Commission % that Vendor will RECEIVE from every trip in their area
    // Admin sets this at creation time — each vendor can have different %
    commissionPercentage: {
        type: Number,
        default: 25,  // Vendor ko milega 25% (Admin ke paas 75% jayega)
        min: 0,
        max: 100
    },

    // Wallet & Earnings
    walletBalance: {
        type: Number,
        default: 0
    },
    totalEarnings: {
        type: Number,
        default: 0
    },

    // Stats
    totalDrivers: {
        type: Number,
        default: 0
    },
    totalFleets: {
        type: Number,
        default: 0
    },

    // Bank Details (For Withdrawals)
    bankDetails: {
        accountNumber: { type: String, default: "" },
        ifscCode:      { type: String, default: "" },
        accountHolderName: { type: String, default: "" },
        bankName:      { type: String, default: "" }
    },

    // Address
    address: { type: String, default: "" },
    city:    { type: String, default: "" },
    state:   { type: String, default: "" },
    pincode: { type: String, default: "" },

    // Documents
    documents: {
        aadhar: { type: String, default: null },
        pan:    { type: String, default: null },
        gst:    { type: String, default: null }
    },

    // Status
    isActive: {
        type: Boolean,
        default: true
    },

    fcmToken: {
        type: String,
        default: null
    },

    // Who created this vendor (Always Admin)
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null
    }

}, { timestamps: true });

module.exports = mongoose.model("Vendor", vendorSchema);
