const mongoose = require("mongoose");

const rentalPackageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        // Example: "2 Hrs - 20 KMs"
    },
    hours: {
        type: Number,
        required: true,
    },
    baseDistance: {
        type: Number,
        required: true,
    },
    basePrice: {
        type: Number,
        required: true,
    },
    extraKmPrice: {
        type: Number,
        required: true,
    },
    extraMinutePrice: {
        type: Number,
        required: true,
    },
    carCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CarCategory",
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model("RentalPackage", rentalPackageSchema);
