const mongoose = require('mongoose');

const appSettingSchema = new mongoose.Schema({
    isShareRideEnabled: {
        type: Boolean,
        default: true
    },
    enableDriverIncentive: {
        type: Boolean,
        default: false
    },
    driverJoiningBonus: {
        type: Number,
        default: 0
    },
    driverReferralBonus: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AppSetting', appSettingSchema);
