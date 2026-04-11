const mongoose = require("mongoose");

const ServiceAreaSchema = new mongoose.Schema({
    cityName: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    pincodes: {
        type: [String], // Array of strings like ["233001", "233002"]
        default: []
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin"
    }
}, { timestamps: true });

module.exports = mongoose.model("ServiceArea", ServiceAreaSchema);
