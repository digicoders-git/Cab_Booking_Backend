const Admin = require("../models/Admin");
const Driver = require("../models/Driver");
const Fleet = require("../models/Fleet");
const Agent = require("../models/Agent");
const User = require("../models/User");
const Vendor = require("../models/Vendor");

/**
 * Checks if an email is already in use across all user types
 * @param {string} email - The email to check
 * @param {string} excludeId - Optional ID to exclude (for updates)
 * @returns {Promise<string|null>} - Returns the entity type if found, else null
 */
exports.isEmailTaken = async (email, excludeId = null) => {
    if (!email) return null;

    const queries = [
        Admin.findOne({ email }),
        Driver.findOne({ email }),
        Fleet.findOne({ email }),
        Agent.findOne({ email }),
        User.findOne({ email }),
        Vendor.findOne({ email })
    ];

    const results = await Promise.all(queries);
    const types = ["Admin", "Driver", "Fleet", "Agent", "User", "Vendor"];

    for (let i = 0; i < results.length; i++) {
        if (results[i]) {
            // If excludeId is provided, check if the found record is the one we are updating
            if (excludeId && results[i]._id.toString() === excludeId.toString()) {
                continue;
            }
            return types[i];
        }
    }

    return null;
};

/**
 * Checks if a phone number is already in use across all user types
 * @param {string} phone - The phone to check
 * @param {string} excludeId - Optional ID to exclude (for updates)
 * @returns {Promise<string|null>} - Returns the entity type if found, else null
 */
exports.isPhoneTaken = async (phone, excludeId = null) => {
    if (!phone) return null;

    const queries = [
        Admin.findOne({ phone }), 
        Driver.findOne({ phone }),
        Fleet.findOne({ phone }),
        Agent.findOne({ phone }),
        User.findOne({ phone }),
        Vendor.findOne({ phone })
    ];

    const results = await Promise.all(queries);
    const types = ["Admin", "Driver", "Fleet", "Agent", "User", "Vendor"];

    for (let i = 0; i < results.length; i++) {
        if (results[i]) {
            if (excludeId && results[i]._id.toString() === excludeId.toString()) {
                continue;
            }
            return types[i];
        }
    }

    return null;
};
