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
    bulkAdvancePercentage: {
        type: Number,
        default: 25
    },
    bulkSecurityPercentage: {
        type: Number,
        default: 20
    },
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
    }
}, { timestamps: true })

module.exports = mongoose.model("Admin", adminSchema)