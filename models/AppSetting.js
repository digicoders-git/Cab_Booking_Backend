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
    },
    enableFirstRideDiscount: {
        type: Boolean,
        default: true
    },
    firstRideDiscountType: {
        type: String,
        enum: ['FLAT', 'PERCENTAGE'],
        default: 'FLAT'
    },
    firstRideDiscountAmount: {
        type: Number,
        default: 50
    },
    firstRideMaxDiscount: {
        type: Number,
        default: 100
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AppSetting', appSettingSchema);
