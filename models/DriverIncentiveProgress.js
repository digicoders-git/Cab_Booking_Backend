const mongoose = require('mongoose');

const driverIncentiveProgressSchema = new mongoose.Schema({
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
    incentive: { type: mongoose.Schema.Types.ObjectId, ref: 'Incentive', required: true },
    progressCount: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
    amountRewarded: { type: Number, default: 0 },
    completedBookingIds: { type: [String], default: [] }
}, { timestamps: true });

// Prevent duplicate entries for the same driver and incentive
driverIncentiveProgressSchema.index({ driver: 1, incentive: 1 }, { unique: true });

module.exports = mongoose.model('DriverIncentiveProgress', driverIncentiveProgressSchema);
