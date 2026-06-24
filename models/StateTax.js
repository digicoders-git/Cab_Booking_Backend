const mongoose = require("mongoose");

const stateTaxSchema = new mongoose.Schema({
    stateName: {
        type: String,
        required: [true, "State or City name is required"],
        trim: true,
        lowercase: true // Helps in exact matching later (e.g. "uttar pradesh" == "Uttar Pradesh")
    },
    taxType: {
        type: String,
        enum: ['MCD', 'State Tax', 'Toll'],
        default: 'State Tax'
    },
    carCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CarCategory",
        required: [true, "Car Category is required (e.g., SUV, Mini)"]
    },
    amount: {
        type: Number,
        required: [true, "Tax amount is required"],
        min: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    latitude: {
        type: Number
    },
    longitude: {
        type: Number
    }
}, { timestamps: true });

// Ensure we don't have duplicate taxes for the same state and car category
stateTaxSchema.index({ stateName: 1, carCategory: 1, taxType: 1 }, { unique: true });

const StateTax = mongoose.model("StateTax", stateTaxSchema);
module.exports = StateTax;
