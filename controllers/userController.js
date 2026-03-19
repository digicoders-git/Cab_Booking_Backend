const jwt = require("jsonwebtoken");
const User = require("../models/User");

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