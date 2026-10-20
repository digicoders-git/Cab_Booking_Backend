const mongoose = require("mongoose");

const contactMessageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Name is required"],
        trim: true
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        trim: true,
        lowercase: true
    },
    message: {
        type: String,
        required: [true, "Message is required"],
        trim: true
    }
}, { timestamps: true });

module.exports = mongoose.model("ContactMessage", contactMessageSchema);
