const User = require("../models/User");
const Booking = require("../models/Booking");
const BulkBooking = require("../models/BulkBooking");
const AppSetting = require("../models/AppSetting");

/**
 * Check if a user is eligible for the first ride discount and calculate the discount amount.
 * @param {string} userId - User's MongoDB _id
 * @param {number} fareAmount - Base fare/offered price
 * @returns {Promise<number>} - Discount amount in INR (0 if not eligible or disabled)
 */
exports.checkAndCalculateFirstRideDiscount = async (userId, fareAmount) => {
    try {
        if (!userId) return 0;

        const user = await User.findById(userId);
        if (!user) return 0;

        const settings = await AppSetting.findOne();
        if (!settings || !settings.enableFirstRideDiscount) return 0;

        // Check if user has any COMPLETED bookings in normal or bulk
        const [completedNormal, completedBulk] = await Promise.all([
            Booking.countDocuments({ user: userId, bookingStatus: 'Completed' }),
            BulkBooking.countDocuments({ createdBy: userId, createdByModel: 'User', status: 'Completed' })
        ]);

        if (completedNormal > 0 || completedBulk > 0) {
            if (!user.hasUsedFirstRideDiscount) {
                user.hasUsedFirstRideDiscount = true;
                await user.save();
            }
            return 0;
        }

        // Check if user currently has an ACTIVE ongoing ride (to avoid double-dipping while a ride is in-flight)
        const [activeNormal, activeBulk] = await Promise.all([
            Booking.countDocuments({ 
                user: userId, 
                bookingStatus: { $in: ['Pending', 'Accepted', 'Ongoing', 'Payment_Pending'] } 
            }),
            BulkBooking.countDocuments({ 
                createdBy: userId, 
                createdByModel: 'User', 
                status: { $in: ['PendingPayment', 'Marketplace', 'Accepted', 'Ongoing'] } 
            })
        ]);

        if (activeNormal > 0 || activeBulk > 0) {
            return 0;
        }

        // Self-heal: If user was previously marked hasUsedFirstRideDiscount=true but never had any completed rides, restore it!
        if (user.hasUsedFirstRideDiscount) {
            user.hasUsedFirstRideDiscount = false;
            await user.save();
        }

        let discount = 0;
        if (settings.firstRideDiscountType === 'PERCENTAGE') {
            discount = Math.round((fareAmount * (settings.firstRideDiscountAmount || 0)) / 100);
            if (settings.firstRideMaxDiscount && discount > settings.firstRideMaxDiscount) {
                discount = settings.firstRideMaxDiscount;
            }
        } else {
            discount = settings.firstRideDiscountAmount || 0;
        }

        return Math.min(discount, Math.max(0, fareAmount));
    } catch (err) {
        console.error("Error calculating first ride discount:", err);
        return 0;
    }
};

/**
 * Get the current First Ride Discount status and user eligibility.
 * @param {string|null} userId - User's MongoDB _id (optional)
 * @returns {Promise<Object>}
 */
exports.getFirstRideStatus = async (userId = null) => {
    try {
        let settings = await AppSetting.findOne();
        if (!settings) {
            settings = await AppSetting.create({ enableFirstRideDiscount: true, firstRideDiscountAmount: 50 });
        }

        const info = {
            enabled: !!settings.enableFirstRideDiscount,
            discountType: settings.firstRideDiscountType || 'FLAT',
            discountAmount: settings.firstRideDiscountAmount ?? 50,
            maxDiscount: settings.firstRideMaxDiscount ?? 100,
            isEligible: false
        };

        if (userId) {
            const user = await User.findById(userId);
            if (user && info.enabled) {
                const [completedNormal, completedBulk] = await Promise.all([
                    Booking.countDocuments({ user: userId, bookingStatus: 'Completed' }),
                    BulkBooking.countDocuments({ createdBy: userId, createdByModel: 'User', status: 'Completed' })
                ]);

                const [activeNormal, activeBulk] = await Promise.all([
                    Booking.countDocuments({ 
                        user: userId, 
                        bookingStatus: { $in: ['Pending', 'Accepted', 'Ongoing', 'Payment_Pending'] } 
                    }),
                    BulkBooking.countDocuments({ 
                        createdBy: userId, 
                        createdByModel: 'User', 
                        status: { $in: ['PendingPayment', 'Marketplace', 'Accepted', 'Ongoing'] } 
                    })
                ]);

                // Eligible ONLY if 0 completed rides and 0 active rides
                if (completedNormal === 0 && completedBulk === 0 && activeNormal === 0 && activeBulk === 0) {
                    info.isEligible = true;
                    if (user.hasUsedFirstRideDiscount) {
                        user.hasUsedFirstRideDiscount = false;
                        await user.save();
                    }
                }
            }
        }

        return info;
    } catch (err) {
        console.error("Error getting first ride status:", err);
        return {
            enabled: false,
            discountType: 'FLAT',
            discountAmount: 0,
            maxDiscount: 0,
            isEligible: false
        };
    }
};

/**
 * Restore First Ride Discount if user has 0 completed rides.
 * Call this when a booking is Cancelled or Expired.
 * @param {string} userId
 */
exports.restoreFirstRideDiscountIfNeeded = async (userId) => {
    try {
        if (!userId) return;
        const [completedNormal, completedBulk] = await Promise.all([
            Booking.countDocuments({ user: userId, bookingStatus: 'Completed' }),
            BulkBooking.countDocuments({ createdBy: userId, createdByModel: 'User', status: 'Completed' })
        ]);

        if (completedNormal === 0 && completedBulk === 0) {
            await User.findByIdAndUpdate(userId, { hasUsedFirstRideDiscount: false });
            console.log(`[FirstRideHelper] Restored first ride discount eligibility for User: ${userId}`);
        }
    } catch (err) {
        console.error("Error restoring first ride discount:", err);
    }
};
