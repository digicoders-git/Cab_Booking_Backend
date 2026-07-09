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
        const { isShareRideEnabled } = req.body;
        
        if (typeof isShareRideEnabled !== 'boolean') {
            return res.status(400).json({ success: false, message: "isShareRideEnabled must be a boolean" });
        }
        
        let settings = await AppSetting.findOne();
        if (!settings) {
            settings = new AppSetting({ isShareRideEnabled });
        } else {
            settings.isShareRideEnabled = isShareRideEnabled;
        }
        
        await settings.save();
        
        res.json({
            success: true,
            message: `Share Ride feature has been ${isShareRideEnabled ? 'enabled' : 'disabled'} successfully.`,
            settings
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};
