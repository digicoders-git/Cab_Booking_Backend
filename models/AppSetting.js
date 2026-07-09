const mongoose = require('mongoose');

const appSettingSchema = new mongoose.Schema({
    isShareRideEnabled: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AppSetting', appSettingSchema);
