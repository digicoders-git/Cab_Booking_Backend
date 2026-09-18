const AppSetting = require("../models/AppSetting");

// 1. Get Global App Settings (Public or Authenticated)
exports.getSettings = async (req, res) => {
    try {
        let settings = await AppSetting.findOne();
        
        // If settings don't exist yet, create default settings
        if (!settings) {
            settings = await AppSetting.create({
                isShareRideEnabled: true
            });
        }
        
        res.json({
            success: true,
            settings
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 2. Toggle Share Ride Status (Admin Only)
exports.toggleShareRide = async (req, res) => {
    try {
        const { 
            isShareRideEnabled,
            enableDriverIncentive,
            driverJoiningBonus,
            driverReferralBonus
        } = req.body;
        
        let settings = await AppSetting.findOne();
        if (!settings) {
            settings = new AppSetting();
        }
        
        if (typeof isShareRideEnabled === 'boolean') settings.isShareRideEnabled = isShareRideEnabled;
        if (typeof enableDriverIncentive === 'boolean') settings.enableDriverIncentive = enableDriverIncentive;
        if (driverJoiningBonus !== undefined) settings.driverJoiningBonus = Number(driverJoiningBonus);
        if (driverReferralBonus !== undefined) settings.driverReferralBonus = Number(driverReferralBonus);
        
        await settings.save();
        
        res.json({
            success: true,
            message: `App settings updated successfully.`,
            settings
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};
