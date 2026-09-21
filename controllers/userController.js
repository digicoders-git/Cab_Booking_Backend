const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Booking = require("../models/Booking");
const FixedBooking = require("../models/FixedBooking");
const CarCategory = require("../models/CarCategory");
const Driver = require("../models/Driver");
const FixedRoute = require("../models/FixedRoute");
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
        const { phone, otp, name, email, aadhaarCard } = req.body;

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
                aadhaarCard: aadhaarCard || null,
                isActive: true
            });
            isNewUser = true;
        }

        if (!user.isActive) {
            return res.status(403).json({ success: false, message: "Your account has been deactivated by Admin." });
        }

        // OTP is successfully verified and user is registered/logged in, now delete it
        await Otp.deleteMany({ phone });

        // Generate JWT Token
        const token = jwt.sign(
            { id: user._id, role: "user" },
            process.env.JWT_SECRET,
            { expiresIn: "365d" }
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
        const { name, email, accountNumber, ifscCode, accountHolderName, bankName, aadhaarCard } = req.body;

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
        if (aadhaarCard) user.aadhaarCard = aadhaarCard;
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

// Save User's First Known Location (Called when app opens)
exports.saveFirstLocation = async (req, res) => {
    try {
        const { latitude, longitude, address } = req.body;
        const userId = req.user.id;

        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ success: false, message: "Latitude and longitude are required" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Only save if it hasn't been saved before
        if (!user.firstLocation || user.firstLocation.latitude === null) {
            user.firstLocation = {
                latitude,
                longitude,
                address: address || "Unknown",
                recordedAt: new Date()
            };
            await user.save();
            return res.status(200).json({
                success: true,
                message: "First location recorded successfully",
                firstLocation: user.firstLocation
            });
        }

        res.status(200).json({
            success: true,
            message: "First location already exists, skipped update",
            firstLocation: user.firstLocation
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error saving first location",
            error: error.message
        });
    }
};

// 10. Admin: Get user's account details, customer age, and complete ride history
exports.getUserRides = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select("-password");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Fetch regular bookings
        const regularBookings = await Booking.find({ user: id })
            .populate("carCategory", "name image")
            .populate("assignedDriver", "name phone image carDetails")
            .sort({ createdAt: -1 })
            .lean();

        // Fetch fixed package bookings
        const fixedBookings = await FixedBooking.find({ user: id })
            .populate("carCategory", "name icon")
            .populate("assignedDriver", "name phone image")
            .populate("fixedRoute", "name")
            .sort({ createdAt: -1 })
            .lean();

        // Standardize into unified ride history
        const formattedRegular = regularBookings.map(b => ({
            _id: b._id,
            bookingId: b._id.toString().slice(-8).toUpperCase(),
            type: "City Ride",
            rideType: b.rideType || "Private",
            carCategory: b.carCategory?.name || "Standard",
            carImage: b.carCategory?.image || null,
            pickup: b.pickup?.address || "N/A",
            drop: b.drop?.address || "N/A",
            fare: b.fare || 0,
            status: b.status || "Pending",
            paymentMethod: b.paymentMethod || "Cash",
            paymentStatus: b.paymentStatus || "Pending",
            createdAt: b.createdAt,
            date: b.createdAt,
            driver: b.assignedDriver ? {
                name: b.assignedDriver.name,
                phone: b.assignedDriver.phone,
                image: b.assignedDriver.image
            } : null
        }));

        const formattedFixed = fixedBookings.map(b => ({
            _id: b._id,
            bookingId: b._id.toString().slice(-8).toUpperCase(),
            type: "Package Ride",
            rideType: b.tripType || "Fixed Package",
            carCategory: b.carCategory?.name || "Standard",
            carImage: b.carCategory?.icon || null,
            pickup: b.pickupLocation || "N/A",
            drop: b.dropLocation || "N/A",
            fare: b.totalWithTax || b.price || 0,
            status: b.status || "Marketplace",
            paymentMethod: b.paymentMethod || "Cash",
            paymentStatus: b.paymentStatus || "Pending",
            createdAt: b.createdAt,
            date: b.pickupDate || b.createdAt,
            pickupTime: b.pickupTime || "",
            driver: b.assignedDriver ? {
                name: b.assignedDriver.name,
                phone: b.assignedDriver.phone,
                image: b.assignedDriver.image
            } : null
        }));

        const allRides = [...formattedRegular, ...formattedFixed].sort(
            (a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
        );

        // Stats calculation
        const totalRides = allRides.length;
        const completedRides = allRides.filter(r => r.status === "Completed").length;
        const cancelledRides = allRides.filter(r => r.status === "Cancelled").length;
        const totalSpent = allRides
            .filter(r => r.status === "Completed" || r.paymentStatus === "Completed")
            .reduce((sum, r) => sum + (Number(r.fare) || 0), 0);

        // Calculate Customer Age (Tenure)
        const joinDate = user.createdAt ? new Date(user.createdAt) : new Date();
        const now = new Date();
        const diffMs = now - joinDate;
        const totalDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        const years = Math.floor(totalDays / 365);
        const remDaysAfterYears = totalDays % 365;
        const months = Math.floor(remDaysAfterYears / 30);
        const days = remDaysAfterYears % 30;

        let customerAgeText = "";
        if (years > 0) {
            customerAgeText = `${years} Year${years > 1 ? "s" : ""}${months > 0 ? `, ${months} Month${months > 1 ? "s" : ""}` : ""}`;
        } else if (months > 0) {
            customerAgeText = `${months} Month${months > 1 ? "s" : ""}${days > 0 ? `, ${days} Day${days > 1 ? "s" : ""}` : ""}`;
        } else if (days > 0) {
            customerAgeText = `${days} Day${days > 1 ? "s" : ""}`;
        } else {
            customerAgeText = "Joined Today";
        }

        res.status(200).json({
            success: true,
            user,
            stats: {
                totalRides,
                completedRides,
                cancelledRides,
                totalSpent,
                customerAgeText,
                totalDays,
                joinedDate: user.createdAt
            },
            rides: allRides,
            regularRides: formattedRegular,
            fixedRides: formattedFixed
        });
    } catch (error) {
        console.error("Error fetching user rides:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching user rides",
            error: error.message
        });
    }
};
