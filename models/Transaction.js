const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'userModel',
        required: true
    },
    userModel: {
        type: String,
        required: true,
        enum: ['Driver', 'Agent', 'Fleet', 'Admin', 'Vendor', 'User']
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['Credit', 'Debit'],
        required: true
    },
    category: {
        type: String,
        enum: ['Ride Earning', 'Ride Payment', 'Commission', 'Withdrawal', 'Refund', 'Admin Adjustment', 'Bulk Advance', 'Bulk Security', 'Bulk Earnings', 'Bulk Payout', 'Wallet Recharge'],
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed', 'Cancelled'],
        default: 'Pending'
    },
    description: {
        type: String,
        default: ""
    },
    relatedBooking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        default: null
    },
    bankDetails: {
        accountNumber: String,
        ifscCode: String,
        bankName: String,
        accountHolderName: String
    }
}, { timestamps: true });

module.exports = mongoose.model("Transaction", transactionSchema);
