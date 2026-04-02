const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'senderModel'
    },
    senderModel: {
        type: String,
        required: true,
        enum: ['User', 'Agent', 'Driver', 'Fleet', 'Vendor']
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Open', 'In-Progress', 'Closed'],
        default: 'Open'
    },
    reply: {
        type: String,
        default: ""
    },
    repliedAt: {
        type: Date
    },
    repliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
    }
}, { timestamps: true });

module.exports = mongoose.model("Support", supportSchema);
