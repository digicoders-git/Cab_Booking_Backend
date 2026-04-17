const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { isEmailTaken, isPhoneTaken } = require("../utils/globalUniqueness");

// Login / Register User Using Phone and Fixed OTP (Combined API)
exports.loginUser = async (req, res) => {
    try {
        const { phone, otp, name, email } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({ success: false, message: "Phone number and OTP are required" });
        }

        // Using a fixed OTP for testing
        const FIX_OTP = "123456";

        if (otp !== FIX_OTP) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        let user = await User.findOne({ phone });

        let isNewUser = false;

        if (!user) {
            // Check global phone uniqueness
            const phoneTakenBy = await isPhoneTaken(phone);
            if (phoneTakenBy) {
                return res.status(400).json({ success: false, message: `Phone number is already registered as ${phoneTakenBy}` });
            }

            // Check global email uniqueness if provided
            if (email) {
                const emailTakenBy = await isEmailTaken(email);
                if (emailTakenBy) {
                    return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
                }
            }

            // If user doesn't exist, register them (New Flow)
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
            { expiresIn: "7d" }
        );

        res.status(isNewUser ? 201 : 200).json({
            success: true,
            message: isNewUser ? "Registration and Login successful" : "Login successful",
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
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found to delete"
            });
        }
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
