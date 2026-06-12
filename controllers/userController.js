const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { isEmailTaken, isPhoneTaken } = require("../utils/globalUniqueness");
const { sendPushNotification } = require("../utils/fcmNotification");
const Otp = require("../models/Otp");
const { sendOtpSms } = require("../utils/sendSms");

// 1. Send OTP Placeholder API (For Frontend Flow)
exports.sendOtp = async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ success: false, message: "Phone number is required" });
        }

        // Validate 10 digit number
        if (phone.length !== 10 || isNaN(phone)) {
            return res.status(400).json({ success: false, message: "Please enter a valid 10-digit phone number" });
        }

        // Generate a 6-digit random OTP
        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

        // Delete any existing OTP for this phone to avoid conflicts
        await Otp.deleteMany({ phone });

        // Save new OTP to database (will auto-expire in 5 mins due to TTL index)
        await Otp.create({ phone, otp: generatedOtp });

        // Trigger live SMS via BulkSMSPlans
        await sendOtpSms(phone, generatedOtp);

        res.status(200).json({
            success: true,
            message: "OTP sent successfully to your mobile number",
            phone,
            otpMode: "LIVE",
            // otp: generatedOtp // Uncomment for extreme debugging, but NEVER expose OTP in production response!
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to process OTP request" });
    }
};

// Login / Register User Using Phone and Fixed OTP (Combined API)
exports.loginUser = async (req, res) => {
    try {
        const { phone, otp, name, email } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({ success: false, message: "Phone number and OTP are required" });
        }

        // Validate 10 digit number
        if (phone.length !== 10 || isNaN(phone)) {
            return res.status(400).json({ success: false, message: "Please enter a valid 10-digit phone number" });
        }

        // Check against the database OTP
        const dbOtp = await Otp.findOne({ phone }).sort({ createdAt: -1 });

        // Validation logic: allow ONLY the real generated OTP
        if (!dbOtp || dbOtp.otp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        // OTP is valid, delete it so it can't be reused
        if (dbOtp) {
            await Otp.deleteMany({ phone });
        }

        let user = await User.findOne({ phone });

        let isNewUser = false;

        if (!user) {
            // Check global phone uniqueness (Optional check if phone registered as driver etc)
            const phoneTakenBy = await isPhoneTaken(phone);
            if (phoneTakenBy) {
                return res.status(400).json({ success: false, message: `Phone number is already registered as ${phoneTakenBy}` });
            }

            // If name is not provided, it means we don't have registration details yet
            if (!name) {
                return res.status(200).json({
                    success: true,
                    isNewUser: true,
                    message: "New user detected. Please provide your name to complete registration.",
                    tempPhone: phone
                });
            }

            // If user doesn't exist but name IS provided, then register them
            if (email) {
                const emailTakenBy = await isEmailTaken(email);
                if (emailTakenBy) {
                    return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
                }
            }

            user = await User.create({
                phone,
                name: name || "",
                email: email || "",
                isActive: true
            });
            isNewUser = true;
        }

        if (!user.isActive) {
            return res.status(403).json({ success: false, message: "Your account has been deactivated by Admin." });
        }

        // Generate JWT Token
        const token = jwt.sign(
            { id: user._id, role: "user" },
            process.env.JWT_SECRET,
            { expiresIn: "364d" }
        );

        res.status(isNewUser ? 201 : 200).json({
            success: true,
            message: isNewUser ? "Registration Successful" : "Login successful",
            token,
            user,
            isNewUser
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Authentication failed",
            error: error.message
        });
    }
};

// Get all users
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select("-password");
        res.status(200).json({
            success: true,
            count: users.length,
            users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching users",
            error: error.message
        });
    }
};

// Get My / Single User Profile
exports.getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-password");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching profile",
            error: error.message
        });
    }
};

// Delete User
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found to delete"
            });
        }

        // 🔔 NOTIFY USER: Account Deleted
        if (user.fcmToken) {
            try {
                await sendPushNotification(user.fcmToken, {
                    title: "🗑️ Account Deleted",
                    body: `Your account has been deleted by the Administrator.`,
                    data: {
                        type: "USER_ACCOUNT_DELETED"
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (User Deletion):", fcmErr.message);
            }
        }

        await User.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: "User deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting user",
            error: error.message
        });
    }
};

// Active / Deactive User Status
exports.toggleUserStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Reverse functionality
        user.isActive = !user.isActive;
        await user.save();

        res.status(200).json({
            success: true,
            message: `User is now ${user.isActive ? 'Active' : 'Deactivated'}`,
            isActive: user.isActive
        });

        // 🔔 NOTIFY USER: Status Update
        if (user.fcmToken) {
            try {
                await sendPushNotification(user.fcmToken, {
                    title: `🛡️ Account Status Update`,
                    body: `Your account has been ${user.isActive ? 'ACTIVATED' : 'DEACTIVATED'} by the Administrator.`,
                    data: {
                        type: "USER_STATUS_TOGGLE",
                        isActive: user.isActive.toString()
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (User Status Toggle):", fcmErr.message);
            }
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error toggling status",
            error: error.message
        });
    }
};
// 6. Update User Profile (Self Update)
exports.updateUserProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, accountNumber, ifscCode, accountHolderName, bankName } = req.body;

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Only allow user to update their own profile (or admin)
        if (req.user.role !== "admin" && req.user.id !== id) {
            return res.status(401).json({
                success: false,
                message: "You can only update your own profile"
            });
        }

        if (name) user.name = name;
        if (email && email !== user.email) {
            const emailTakenBy = await isEmailTaken(email, id);
            if (emailTakenBy) {
                return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
            }
            user.email = email;
        }

        // Update bank details if any fields provided
        if (accountNumber || ifscCode || accountHolderName || bankName) {
            user.bankDetails = {
                accountNumber: accountNumber || user.bankDetails?.accountNumber,
                ifscCode: ifscCode || user.bankDetails?.ifscCode,
                accountHolderName: accountHolderName || user.bankDetails?.accountHolderName,
                bankName: bankName || user.bankDetails?.bankName
            };
        }

        // If a profile image was uploaded
        if (req.file) {
            user.image = req.file.filename;
        }

        await user.save();

        // 🔔 NOTIFY USER: Profile Updated
        if (user.fcmToken) {
            try {
                const { sendPushNotification } = require("../utils/fcmNotification");
                await sendPushNotification(user.fcmToken, {
                    title: "📝 Profile Updated",
                    body: `Your profile details have been updated by the Administrator.`,
                    data: {
                        type: "USER_PROFILE_UPDATED"
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (User Profile Update):", fcmErr.message);
            }
        }

        res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating profile",
        });
    }
};

// Update FCM Token for push notifications
exports.updateFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        const userId = req.user.id;

        if (!fcmToken) {
            return res.status(400).json({ success: false, message: "FCM token is required" });
        }

        await User.findByIdAndUpdate(userId, { fcmToken });

        // Subscribe to Topics for Broadcasts
        try {
            const { subscribeToTopic } = require("../utils/fcmNotification");
            await subscribeToTopic(fcmToken, "all");
            await subscribeToTopic(fcmToken, "user");
        } catch (topicErr) {
            console.error("User Topic Sync Error:", topicErr.message);
        }

        res.status(200).json({
            success: true,
            message: "FCM token and Topics updated successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating FCM token",
            error: error.message
        });
    }
};
