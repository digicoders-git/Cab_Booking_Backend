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

// 2. Toggle Share Ride Status & App Settings (Admin Only)
exports.toggleShareRide = async (req, res) => {
    try {
        const { 
            isShareRideEnabled,
            enableDriverIncentive,
            driverJoiningBonus,
            driverReferralBonus,
            enableFirstRideDiscount,
            firstRideDiscountType,
            firstRideDiscountAmount,
            firstRideMaxDiscount
        } = req.body;
        
        let settings = await AppSetting.findOne();
        if (!settings) {
            settings = new AppSetting();
        }
        
        if (typeof isShareRideEnabled === 'boolean') settings.isShareRideEnabled = isShareRideEnabled;
        if (typeof enableDriverIncentive === 'boolean') settings.enableDriverIncentive = enableDriverIncentive;
        if (driverJoiningBonus !== undefined) settings.driverJoiningBonus = Number(driverJoiningBonus);
        if (driverReferralBonus !== undefined) settings.driverReferralBonus = Number(driverReferralBonus);
        
        // First Ride Welcome Discount
        if (typeof enableFirstRideDiscount === 'boolean') settings.enableFirstRideDiscount = enableFirstRideDiscount;
        if (firstRideDiscountType && ['FLAT', 'PERCENTAGE'].includes(firstRideDiscountType)) {
            settings.firstRideDiscountType = firstRideDiscountType;
        }
        if (firstRideDiscountAmount !== undefined) settings.firstRideDiscountAmount = Number(firstRideDiscountAmount);
        if (firstRideMaxDiscount !== undefined) settings.firstRideMaxDiscount = Number(firstRideMaxDiscount);
        
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

// 3. Get First Ride Discount Status (for logged in User or Guest)
exports.getFirstRideStatusController = async (req, res) => {
    try {
        const jwt = require("jsonwebtoken");
        const firstRideHelper = require("../utils/firstRideHelper");
        
        let userId = req.user ? req.user.id : (req.query.userId || null);
        if (!userId && req.headers.authorization) {
            try {
                const token = req.headers.authorization.split(" ")[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                if (decoded && decoded.id) userId = decoded.id;
            } catch (e) {
                // Ignore token error for status check
            }
        }
        
        const status = await firstRideHelper.getFirstRideStatus(userId);
        res.json({ success: true, ...status });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};
