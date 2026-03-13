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
    }

}, { timestamps: true })

module.exports = mongoose.model("Admin", adminSchema)