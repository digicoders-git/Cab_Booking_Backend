const Admin = require("../models/Admin")
const jwt = require("jsonwebtoken")
const User = require("../models/User")
const Driver = require("../models/Driver")
const Agent = require("../models/Agent")
const Fleet = require("../models/Fleet")
const Booking = require("../models/Booking")
const Transaction = require("../models/Transaction")
const Vendor = require("../models/Vendor")
const ServiceArea = require("../models/ServiceArea")
const CarCategory = require("../models/CarCategory")
const Support = require("../models/Support")
const { isEmailTaken, isPhoneTaken } = require("../utils/globalUniqueness")
const { sendPushNotification } = require("../utils/fcmNotification")

exports.registerAdmin = async (req, res) => {
    try {
        const { name, email, password, phone } = req.body
        const image = req.file ? req.file.filename : null
        // Check global email uniqueness
        const emailTakenBy = await isEmailTaken(email);
        if (emailTakenBy) {
            return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
        }
        const admin = await Admin.create({
            name,
            email,
            phone,
            password,
            image,
            role: "SuperAdmin" // Default first admin should be SuperAdmin
        })

        res.status(201).json({
            success: true,
            message: "Admin registered successfully",
            admin
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error"
        })
    }
}

exports.loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body
        const admin = await Admin.findOne({ email })
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            })
        }
        if (admin.password !== password) {
            return res.status(400).json({
                success: false,
                message: "Invalid password"
            })
        }

        // Check if account is active
        if (admin.isActive === false) {
            return res.status(403).json({
                success: false,
                message: "⚠️ Account On Hold: your access has been temporarily suspended by the management. Please contact the Super Admin."
            })
        }
        const token = jwt.sign(
            {
                id: admin._id,
                role: "admin"
            },
            process.env.JWT_SECRET,
            { expiresIn: "365d" }
        )
        res.json({
            success: true,
            message: "Login successful",
            token,
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
                permissions: admin.permissions
            }
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error"
        })
    }
}

exports.getProfile = async (req, res) => {
    try {
        const admin = await Admin.findById(req.user.id);
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin account not found"
            });
        }

        // check if account is active
        if (admin.isActive === false && admin.role !== 'SuperAdmin') {
            return res.status(403).json({
                success: false,
                message: "Access Denied: Your account is currently inactive."
            });
        }
        res.json({
            success: true,
            admin
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error"
        })
    }
}

exports.updateProfile = async (req, res) => {
    try {
        const { name, email, password, phone } = req.body
        const id = req.user.id;

        const admin = await Admin.findById(id);
        if (!admin) {
            return res.status(404).json({ success: false, message: "Admin not found" });
        }

        // Check global email uniqueness if changed
        if (email && email !== admin.email) {
            const emailTakenBy = await isEmailTaken(email, id);
            if (emailTakenBy) return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
        }

        const updateData = {
            name,
            email,
            phone,
            password
        }

        if (req.file) {
            updateData.image = req.file.filename
        }
        const updatedAdmin = await Admin.findByIdAndUpdate(
            id,
            updateData,
            { returnDocument: 'after' }
        )
        res.json({
            success: true,
            message: "Profile updated successfully",
            admin: updatedAdmin
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error"
        })
    }
}

// ================= RBAC: SUB-ADMIN MANAGEMENT =================

// 1. Register a new Sub-Admin (Only SuperAdmin)
exports.registerSubAdmin = async (req, res) => {
    try {
        const { name, email, password, phone, permissions } = req.body;
        const image = req.file ? req.file.filename : null;

        // Check global email uniqueness
        const emailTakenBy = await isEmailTaken(email);
        if (emailTakenBy) {
            return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
        }

        const finalPermissions = typeof permissions === 'string' ? JSON.parse(permissions) : (permissions || []);

        const subAdmin = await Admin.create({
            name,
            email,
            phone,
            password,
            image,
            role: "SubAdmin",
            permissions: finalPermissions
        });


        res.status(201).json({
            success: true,
            message: "Sub-Admin created successfully",
            subAdmin
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// 2. Get All Admin/Sub-Admins
exports.getAllAdmins = async (req, res) => {
    try {
        const admins = await Admin.find({ role: "SubAdmin" }).sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: admins.length,
            admins
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching admins" });
    }
};

// 3. Update Sub-Admin Permissions
exports.updateAdminPermissions = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, password, permissions, isActive } = req.body;

        const admin = await Admin.findById(id);
        if (!admin) {
            return res.status(404).json({ success: false, message: "Admin not found" });
        }

        if (admin.role === "SuperAdmin") {
            return res.status(400).json({ success: false, message: "Cannot modify SuperAdmin permissions" });
        }

        if (permissions !== undefined) {
            admin.permissions = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
        }
        if (isActive !== undefined) admin.isActive = isActive;
        if (name) admin.name = name;
        if (password) admin.password = password;
        if (email && email !== admin.email) {
            const emailTakenBy = await isEmailTaken(email, id);
            if (emailTakenBy) return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
            admin.email = email;
        }

        await admin.save();

        res.json({
            success: true,
            message: "Permissions updated successfully",
            admin
        });

        // 🔔 NOTIFY SUB-ADMIN: Permissions/Status Updated
        if (admin.fcmToken) {
            try {
                await sendPushNotification(admin.fcmToken, {
                    title: `🛡️ Staff Account Update`,
                    body: `Your staff account details or permissions have been updated by the Super Admin.`,
                    data: {
                        type: "STAFF_UPDATE"
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (Sub-Admin Update):", fcmErr.message);
            }
        }

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 4. Delete Admin/Sub-Admin
exports.deleteAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (id === req.user.id) {
            return res.status(400).json({ success: false, message: "You cannot delete yourself" });
        }

        const admin = await Admin.findById(id);
        if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

        if (admin.role === "SuperAdmin") {
            return res.status(400).json({ success: false, message: "SuperAdmin cannot be deleted" });
        }

        // 🔔 NOTIFY SUB-ADMIN: Account Deleted
        if (admin.fcmToken) {
            try {
                await sendPushNotification(admin.fcmToken, {
                    title: "🗑️ Account Deleted",
                    body: `Your staff account has been deleted by the Super Admin.`,
                    data: {
                        type: "STAFF_DELETED"
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (Sub-Admin Deletion):", fcmErr.message);
            }
        }

        await Admin.findByIdAndDelete(id);

        res.json({
            success: true,
            message: "Admin deleted successfully"
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// 5. Get Single Admin/Sub-Admin
exports.getSingleAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const admin = await Admin.findById(id);
        if (!admin) {
            return res.status(404).json({ success: false, message: "Admin not found" });
        }
        res.status(200).json({
            success: true,
            admin
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching admin" });
    }
};

// ================= ORIGINAL ADMIN LOGIC CONTINUES =================

exports.getDashboardStats = async (req, res) => {
    try {
        const admin = await Admin.findById(req.user.id);
        const driverLiabilities = (await Driver.aggregate([{ $group: { _id: null, total: { $sum: "$walletBalance" } } }]))[0]?.total || 0;
        const agentLiabilities = (await Agent.aggregate([{ $group: { _id: null, total: { $sum: "$walletBalance" } } }]))[0]?.total || 0;
        const fleetLiabilities = (await Fleet.aggregate([{ $group: { _id: null, total: { $sum: "$walletBalance" } } }]))[0]?.total || 0;
        const vendorLiabilities = (await Vendor.aggregate([{ $group: { _id: null, total: { $sum: "$walletBalance" } } }]))[0]?.total || 0;

        const stats = {
            counts: {
                users: await User.countDocuments(),
                admins: await Admin.countDocuments({ role: { $ne: "SuperAdmin" } }),
                drivers: {
                    total: await Driver.countDocuments(),
                    approved: await Driver.countDocuments({ isApproved: true }),
                    pending: await Driver.countDocuments({ isApproved: false, isRejected: false }),
                    online: await Driver.countDocuments({ isApproved: true, isOnline: true }) // Matches Tracking API
                },
                agents: await Agent.countDocuments(),
                fleets: await Fleet.countDocuments(),
                vendors: await Vendor.countDocuments(),
                serviceAreas: await ServiceArea.countDocuments({ isActive: true }),
                carCategories: await CarCategory.countDocuments({ isActive: true }),
                supportTickets: {
                    total: await Support.countDocuments(),
                    pending: await Support.countDocuments({ status: "Open" })
                },
                bookings: {
                    total: await Booking.countDocuments(),
                    completed: await Booking.countDocuments({ bookingStatus: "Completed" }),
                    pending: await Booking.countDocuments({ bookingStatus: "Pending" }),
                    cancelled: await Booking.countDocuments({ bookingStatus: "Cancelled" }),
                    ongoing: await Booking.countDocuments({ bookingStatus: "Ongoing" }),
                    onlinePayments: await Booking.countDocuments({ paymentMethod: "Online" }),
                    cashPayments: await Booking.countDocuments({ paymentMethod: "Cash" }),
                    sharedRides: await Booking.countDocuments({ rideType: "Shared" }),
                    privateRides: await Booking.countDocuments({ rideType: "Private" }),
                    todayBookings: await Booking.countDocuments({ createdAt: { $gte: new Date().setHours(0, 0, 0, 0) } })
                },
                users: {
                    total: await User.countDocuments(),
                    today: await User.countDocuments({ createdAt: { $gte: new Date().setHours(0, 0, 0, 0) } })
                }
            },
            driverStats: {
                total: await Driver.countDocuments(),
                online: await Driver.countDocuments({ isApproved: true, isOnline: true }),
                offline: await Driver.countDocuments({ isApproved: true, isOnline: false }),
                busy: await Driver.countDocuments({ isApproved: true, isAvailable: false }),
                idle: await Driver.countDocuments({ isApproved: true, isOnline: true, isAvailable: true }),
                rejected: await Driver.countDocuments({ isRejected: true }),
                today: await Driver.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } })
            },
            partnerStats: {
                todayAgents: await Agent.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
                todayFleets: await Fleet.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
                todayVendors: await Vendor.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } })
            },
            payoutStats: {
                totalPayouts: (await Transaction.aggregate([
                    { $match: { category: "Withdrawal", status: "Completed" } },
                    { $group: { _id: null, total: { $sum: "$amount" } } }
                ]))[0]?.total || 0,
                pendingPayoutsCount: await Transaction.countDocuments({ category: "Withdrawal", status: "Pending" })
            },
            infrastructure: {
                totalAreas: await ServiceArea.countDocuments(),
                activeAreas: await ServiceArea.countDocuments({ isActive: true }),
                inactiveAreas: await ServiceArea.countDocuments({ isActive: false })
            },
            earnings: {
                adminWallet: admin ? admin.walletBalance : 0,
                totalEarnings: admin ? admin.totalEarnings : 0,
                partnerLiabilities: driverLiabilities + agentLiabilities + fleetLiabilities + vendorLiabilities
            },
            todayFinancials: {
                revenue: (await Booking.aggregate([
                    { $match: { bookingStatus: "Completed", createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } } },
                    { $group: { _id: null, total: { $sum: "$actualFare" } } }
                ]))[0]?.total || 0,
                profit: (await Transaction.aggregate([
                    { $match: { userModel: "Admin", category: "Commission", createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } } },
                    { $group: { _id: null, total: { $sum: "$amount" } } }
                ]))[0]?.total || 0
            },
            verifications: {
                pendingDrivers: await Driver.countDocuments({ isApproved: false, isRejected: false }),
                pendingFleets: await Fleet.countDocuments({ isActive: true }), // Fleets don't have isApproved yet, just active
                pendingVendors: await Vendor.countDocuments({ isApproved: false })
            },
            recentBookings: await Booking.find()
                .limit(5)
                .sort({ createdAt: -1 })
                .populate("user", "name image")
                .populate("assignedDriver", "name image")
        };

        const adminData = await Admin.findById(req.user.id);
        if (adminData) {
            stats.earnings.adminWallet = adminData.walletBalance || 0;
            stats.earnings.totalEarnings = adminData.totalEarnings || 0;
        }

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
}

// NEW: Detailed System Report for Admin
exports.getSystemReport = async (req, res) => {
    try {
        const totalFares = await Booking.aggregate([
            { $match: { bookingStatus: "Completed" } },
            { $group: { _id: null, total: { $sum: "$actualFare" } } }
        ]);

        const agentCommissions = await Booking.aggregate([
            { $match: { bookingStatus: "Completed" } },
            { $group: { _id: null, total: { $sum: "$agentCommission" } } }
        ]);

        const report = {
            overview: {
                totalRevenue: totalFares[0]?.total || 0,
                totalBookings: await Booking.countDocuments(),
                completedRides: await Booking.countDocuments({ bookingStatus: "Completed" }),
                cancelledRides: await Booking.countDocuments({ bookingStatus: "Cancelled" }),
                cancellationRate: 0
            },
            financials: {
                totalAgentCommissions: agentCommissions[0]?.total || 0,
                adminEarnings: 0 // Will get from Admin model
            },
            growth: {
                newUsersLast30Days: await User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
                newDriversLast30Days: await Driver.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } })
            },
            recentTransactions: await Transaction.find()
                .limit(10)
                .sort({ createdAt: -1 })
                .populate("user", "name")
        };

        if (report.overview.totalBookings > 0) {
            report.overview.cancellationRate = ((report.overview.cancelledRides / report.overview.totalBookings) * 100).toFixed(2) + "%";
        }

        const adminData = await Admin.findById(req.user.id);
        if (adminData) {
            report.financials.adminEarnings = adminData.totalEarnings || 0;
        }

        res.json({
            success: true,
            message: "Full System Report Generated",
            report
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error generating report",
            error: error.message
        });
    }
}

// NEW: Real-time Drivers Tracking for Admin Map
exports.getLiveDriversTracking = async (req, res) => {
    try {
        // 1. Fetch ALL approved drivers
        const drivers = await Driver.find({ isApproved: true })
            .select("name phone isOnline isAvailable image currentRideType availableSeats currentHeading currentLocation carDetails")
            .populate({
                path: "seatMap.bookingId",
                select: "pickup drop rideType bookingStatus passengerDetails carCategory"
            });

        // 2. Fetch all car categories for manual mapping (more robust)
        const CarCategory = require("../models/CarCategory");
        const allCategories = await CarCategory.find().select("name image _id");
        const categoryMap = {};
        allCategories.forEach(cat => {
            categoryMap[cat._id.toString()] = {
                name: cat.name,
                image: cat.image
            };
        });

        const trackingData = await Promise.all(drivers.map(async driver => {
            let activityStatus = "Offline"; // Default if not online

            if (driver.isOnline) {
                if (driver.isAvailable) {
                    activityStatus = "Idle"; // Online but no ride
                } else {
                    activityStatus = driver.currentRideType === "Shared" ? "On Shared Ride" : "On Private Ride";
                }
            }

            // Get Category ID, Name and Image
            const rawCatId = driver.carDetails?.carType ? driver.carDetails.carType.toString() : "N/A";
            const catData = categoryMap[rawCatId] || { name: "Unknown Category", image: null };

            // 3. Construct Ongoing Trip Details
            let ongoingTrip = null;
            if (driver.isOnline && !driver.isAvailable) {
                // Try to get from seatMap first
                let activeBookings = driver.seatMap
                    .filter(s => s.isBooked && s.bookingId)
                    .map(s => s.bookingId);

                // If found in seatMap
                if (activeBookings.length > 0) {
                    ongoingTrip = {
                        type: driver.currentRideType,
                        pickup: {
                            address: activeBookings[0].pickup?.address || "Fetching...",
                            latitude: activeBookings[0].pickup?.latitude || null,
                            longitude: activeBookings[0].pickup?.longitude || null
                        },
                        drop: {
                            address: activeBookings[0].drop?.address || "Fetching...",
                            latitude: activeBookings[0].drop?.latitude || null,
                            longitude: activeBookings[0].drop?.longitude || null
                        },
                        passengers: activeBookings.length,
                        currentPosition: driver.currentLocation // Live Progress
                    };
                } else {
                    // DEEP SEARCH FALLBACK: Query the Booking model directly for this driver
                    const Booking = require("../models/Booking");
                    // We also need to search by status 'Ongoing'
                    const directBooking = await Booking.findOne({
                        assignedDriver: driver._id,
                        bookingStatus: "Ongoing"
                    });

                    if (directBooking) {
                        ongoingTrip = {
                            type: driver.currentRideType,
                            pickup: {
                                address: directBooking.pickup.address,
                                latitude: directBooking.pickup.latitude,
                                longitude: directBooking.pickup.longitude
                            },
                            drop: {
                                address: directBooking.drop.address,
                                latitude: directBooking.drop.latitude,
                                longitude: directBooking.drop.longitude
                            },
                            passengers: directBooking.seatsBooked || 1,
                            currentPosition: driver.currentLocation
                        };
                    } else {
                        // Very last fallback if nothing found at all
                        ongoingTrip = {
                            type: driver.currentRideType,
                            pickup: { address: "Active Ride In Progress", latitude: null, longitude: null },
                            drop: { address: "Locating on Map...", latitude: null, longitude: null },
                            passengers: "N/A",
                            currentPosition: driver.currentLocation
                        };
                    }
                }
            }

            return {
                driverId: driver._id,
                name: driver.name,
                phone: driver.phone,
                image: driver.image,
                carInfo: {
                    carNumber: driver.carDetails?.carNumber || "N/A",
                    carModel: driver.carDetails?.carModel || "N/A",
                    carCategoryName: catData.name, // "Sedan", "SUV", etc.
                    carCategoryId: rawCatId,
                    carCategoryImage: catData.image
                },
                location: driver.currentLocation,
                heading: driver.currentHeading,
                status: activityStatus,
                rideType: driver.currentRideType,
                availableSeats: driver.availableSeats,
                currentTrip: ongoingTrip
            };
        }));

        res.json({
            success: true,
            count: trackingData.length,
            drivers: trackingData
        });

    } catch (error) {
        res.status(500).json({
            message: "Error fetching live tracking data",
            error: error.message
        });
    }
}

// NEW: Get Global Bulk Booking Settings
exports.getBulkSettings = async (req, res) => {
    try {
        const admin = await Admin.findOne({ role: "SuperAdmin" });
        if (!admin) return res.status(404).json({ success: false, message: "SuperAdmin not found" });

        res.json({
            success: true,
            settings: {
                defaultCommission: admin.defaultCommission ?? 10,
                userBulkAdvancePct: admin.userBulkAdvancePct ?? 25,
                userPayViaBank: admin.userPayViaBank ?? true,
                agentBulkAdvancePct: admin.agentBulkAdvancePct ?? 5,
                agentPayViaBank: admin.agentPayViaBank ?? false,
                vendorBulkAdvancePct: admin.vendorBulkAdvancePct ?? 15,
                vendorPayViaBank: admin.vendorPayViaBank ?? true,
                adminBulkAdvancePct: admin.adminBulkAdvancePct ?? 0,
                adminPayViaBank: admin.adminPayViaBank ?? false,
                fleetBulkSecurityPct: admin.fleetBulkSecurityPct ?? 20,
                fleetSecurityPayViaBank: admin.fleetSecurityPayViaBank ?? true,
                maxNegativeWalletLimit: admin.maxNegativeWalletLimit ?? 3000,
                agentLeadAdminProfitPct: admin.agentLeadAdminProfitPct ?? 10
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// NEW: Update Global Bulk Booking Settings
exports.updateBulkSettings = async (req, res) => {
    try {
        const updates = req.body; // Expecting the full settings object

        // Only SuperAdmin should be allowed to change global financial settings
        const admin = await Admin.findById(req.user.id);
        if (!admin || admin.role !== "SuperAdmin") {
            return res.status(403).json({ success: false, message: "Unauthorized: Only SuperAdmin can change global settings" });
        }

        const validKeys = [
            'defaultCommission',
            'userBulkAdvancePct', 'userPayViaBank',
            'agentBulkAdvancePct', 'agentPayViaBank',
            'vendorBulkAdvancePct', 'vendorPayViaBank',
            'adminBulkAdvancePct', 'adminPayViaBank',
            'fleetBulkSecurityPct', 'fleetSecurityPayViaBank',
            'maxNegativeWalletLimit', 'agentLeadAdminProfitPct'
        ];

        validKeys.forEach(key => {
            if (updates[key] !== undefined) {
                admin[key] = updates[key];
            }
        });

        await admin.save();

        res.json({
            success: true,
            message: "Bulk Booking settings updated successfully",
            settings: {
                defaultCommission: admin.defaultCommission,
                userBulkAdvancePct: admin.userBulkAdvancePct,
                userPayViaBank: admin.userPayViaBank,
                agentBulkAdvancePct: admin.agentBulkAdvancePct,
                agentPayViaBank: admin.agentPayViaBank,
                vendorBulkAdvancePct: admin.vendorBulkAdvancePct,
                vendorPayViaBank: admin.vendorPayViaBank,
                adminBulkAdvancePct: admin.adminBulkAdvancePct,
                adminPayViaBank: admin.adminPayViaBank,
                fleetBulkSecurityPct: admin.fleetBulkSecurityPct,
                fleetSecurityPayViaBank: admin.fleetSecurityPayViaBank,
                maxNegativeWalletLimit: admin.maxNegativeWalletLimit,
                agentLeadAdminProfitPct: admin.agentLeadAdminProfitPct
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// NEW: Radius-based Driver Search for Admin
exports.getDriversByRadius = async (req, res) => {
    try {
        const { lat, lng, radius } = req.query;

        if (!lat || !lng || !radius) {
            return res.status(400).json({
                success: false,
                message: "Latitude, Longitude aur Radius zaroori hain bhai."
            });
        }

        const centerLat = parseFloat(lat);
        const centerLng = parseFloat(lng);
        const searchRadius = parseFloat(radius);

        // Fetch all approved drivers with ALL necessary fields for the table
        const drivers = await Driver.find({ isApproved: true })
            .select("name phone email isOnline isAvailable currentLocation carDetails image address city state pincode password currentRideType availableSeats currentHeading")
            .lean();

        // Use Haversine formula to filter
        const filteredDrivers = drivers.filter(driver => {
            if (!driver.currentLocation || driver.currentLocation.latitude === null || driver.currentLocation.longitude === null) {
                return false;
            }

            const dLat = driver.currentLocation.latitude;
            const dLng = driver.currentLocation.longitude;

            const R = 6371; // Earth's radius in KM
            const dLatRad = (dLat - centerLat) * Math.PI / 180;
            const dLonRad = (dLng - centerLng) * Math.PI / 180;

            const a =
                Math.sin(dLatRad / 2) * Math.sin(dLatRad / 2) +
                Math.cos(centerLat * Math.PI / 180) * Math.cos(dLat * Math.PI / 180) *
                Math.sin(dLonRad / 2) * Math.sin(dLonRad / 2);

            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;

            // Attach distance to the driver object for frontend display
            driver.distanceFromCenter = distance.toFixed(2);

            return distance <= searchRadius;
        });

        // 2. Fetch all car categories for manual mapping (more robust)
        const CarCategory = require("../models/CarCategory");
        const allCategories = await CarCategory.find().select("name image _id");
        const categoryMap = {};
        allCategories.forEach(cat => {
            categoryMap[cat._id.toString()] = {
                name: cat.name,
                image: cat.image
            };
        });

        // Map drivers to consistent tracking format
        const trackingData = await Promise.all(filteredDrivers.map(async driver => {
            let activityStatus = "Offline";
            if (driver.isOnline) {
                if (driver.isAvailable) {
                    activityStatus = "Idle";
                } else {
                    activityStatus = driver.currentRideType === "Shared" ? "On Shared Ride" : "On Private Ride";
                }
            }

            const rawCatId = driver.carDetails?.carType ? driver.carDetails.carType.toString() : "N/A";
            const catData = categoryMap[rawCatId] || { name: "Unknown Category", image: null };

            return {
                ...driver,
                _id: driver._id,
                driverId: driver._id,
                carInfo: {
                    carNumber: driver.carDetails?.carNumber || "N/A",
                    carModel: driver.carDetails?.carModel || "N/A",
                    carCategoryName: catData.name,
                    carCategoryId: rawCatId,
                    carCategoryImage: catData.image
                },
                location: driver.currentLocation,
                heading: driver.currentHeading,
                status: activityStatus,
                rideType: driver.currentRideType,
                availableSeats: driver.availableSeats,
                distanceFromCenter: driver.distanceFromCenter
            };
        }));

        res.json({
            success: true,
            count: trackingData.length,
            center: { lat: centerLat, lng: centerLng },
            radius: searchRadius,
            drivers: trackingData
        });

    } catch (error) {
        console.error("Radius Search Error:", error);
        res.status(500).json({
            success: false,
            message: "Radius search fail ho gaya bhai.",
            error: error.message
        });
    }
};

// NEW: Home Address-based Driver Search for Admin
exports.getDriversByHomeRadius = async (req, res) => {
    try {
        const { lat, lng, radius } = req.query;

        if (!lat || !lng || !radius) {
            return res.status(400).json({
                success: false,
                message: "Latitude, Longitude aur Radius zaroori hain bhai."
            });
        }

        const centerLat = parseFloat(lat);
        const centerLng = parseFloat(lng);
        const searchRadius = parseFloat(radius);

        // Fetch all drivers (Approved, Pending, etc.) to see all home locations
        const drivers = await Driver.find({}).lean();

        // Use Haversine formula to filter based on Home Address (addressLatitude, addressLongitude)
        const filteredDrivers = drivers.filter(driver => {
            if (driver.addressLatitude === null || driver.addressLongitude === null) {
                return false;
            }

            const dLat = driver.addressLatitude;
            const dLng = driver.addressLongitude;

            const R = 6371; // Earth's radius in KM
            const dLatRad = (dLat - centerLat) * Math.PI / 180;
            const dLonRad = (dLng - centerLng) * Math.PI / 180;

            const a =
                Math.sin(dLatRad / 2) * Math.sin(dLatRad / 2) +
                Math.cos(centerLat * Math.PI / 180) * Math.cos(dLat * Math.PI / 180) *
                Math.sin(dLonRad / 2) * Math.sin(dLonRad / 2);

            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;

            // Attach distance for UI
            driver.distanceFromCenter = distance.toFixed(2);

            return distance <= searchRadius;
        });

        // 2. Fetch all car categories for manual mapping (more robust)
        const CarCategory = require("../models/CarCategory");
        const allCategories = await CarCategory.find().select("name image _id");
        const categoryMap = {};
        allCategories.forEach(cat => {
            categoryMap[cat._id.toString()] = {
                name: cat.name,
                image: cat.image
            };
        });

        // Map drivers to consistent format
        const trackingData = await Promise.all(filteredDrivers.map(async driver => {
            let activityStatus = "Offline";
            if (driver.isOnline) {
                if (driver.isAvailable) {
                    activityStatus = "Idle";
                } else {
                    activityStatus = driver.currentRideType === "Shared" ? "On Shared Ride" : "On Private Ride";
                }
            }

            const rawCatId = driver.carDetails?.carType ? driver.carDetails.carType.toString() : "N/A";
            const catData = categoryMap[rawCatId] || { name: "Unknown Category", image: null };

            return {
                ...driver,
                _id: driver._id,
                driverId: driver._id,
                carInfo: {
                    carNumber: driver.carDetails?.carNumber || "N/A",
                    carModel: driver.carDetails?.carModel || "N/A",
                    carCategoryName: catData.name,
                    carCategoryId: rawCatId,
                    carCategoryImage: catData.image
                },
                location: driver.currentLocation,
                heading: driver.currentHeading,
                status: activityStatus,
                rideType: driver.currentRideType,
                availableSeats: driver.availableSeats,
                distanceFromCenter: driver.distanceFromCenter
            };
        }));

        res.json({
            success: true,
            count: trackingData.length,
            center: { lat: centerLat, lng: centerLng },
            radius: searchRadius,
            drivers: trackingData
        });

    } catch (error) {
        console.error("Home Radius Search Error:", error);
        res.status(500).json({
            success: false,
            message: "Home radius search fail ho gaya bhai.",
            error: error.message
        });
    }
};

// Update Admin FCM Token
exports.updateFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken) {
            return res.status(400).json({ success: false, message: "FCM token is required" });
        }

        await Admin.findByIdAndUpdate(req.user.id, { fcmToken });

        res.json({
            success: true,
            message: "Admin FCM token updated successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating FCM token",
            error: error.message
        });
    }
};

// Toggle Driver Online/Offline by Admin
exports.toggleDriverOnlineByAdmin = async (req, res) => {
    try {
        const { driverId, status } = req.body; // status: true for online, false for offline

        const driver = await Driver.findById(driverId);
        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        driver.isOnline = status;
        await driver.save();

        // 🔔 NOTIFY DRIVER: Admin changed your status
        if (driver.fcmToken) {
            const statusText = status ? "ONLINE" : "OFFLINE";
            try {
                await sendPushNotification(driver.fcmToken, {
                    title: `🔄 Status Updated by Admin`,
                    body: `Your status has been set to ${statusText} by the Administrator.`,
                    data: {
                        type: "ADMIN_STATUS_UPDATE",
                        status: statusText,
                        isOnline: status.toString()
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (Admin Status Update):", fcmErr.message);
            }
        }

        // 🎯 SYNC: Update Admin Panel Map (Socket)
        try {
            const { getIO } = require("../socket/socket");
            const io = getIO();

            let activityStatus = status ? (driver.isAvailable ? "Idle" : "Busy") : "Offline";

            io.to('admin_room').emit("driver_location_update", {
                driverId: driver._id.toString(),
                status: activityStatus,
                latitude: driver.currentLocation?.latitude,
                longitude: driver.currentLocation?.longitude,
                heading: driver.currentHeading || 0
            });
        } catch (socketErr) {
            console.error("Socket Error (Admin toggleStatus):", socketErr.message);
        }

        res.json({
            success: true,
            message: `Driver status updated to ${status ? 'Online' : 'Offline'}`,
            isOnline: driver.isOnline
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 30. Export Tax Report (GST)
exports.exportTaxReport = async (req, res) => {
    try {
        const Booking = require("../models/Booking");
        const BulkBooking = require("../models/BulkBooking");
        const FixedBooking = require("../models/FixedBooking");

        const { timeframe } = req.query;
        let dateFilter = {};

        const now = new Date();
        if (timeframe === 'daily') {
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);
            dateFilter = { $gte: startOfDay, $lte: endOfDay };
        } else if (timeframe === 'weekly') {
            const lastWeek = new Date(now);
            lastWeek.setDate(now.getDate() - 7);
            dateFilter = { $gte: lastWeek, $lte: new Date() };
        } else if (timeframe === 'monthly') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            dateFilter = { $gte: startOfMonth, $lte: new Date() };
        } else if (timeframe === 'yearly') {
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            dateFilter = { $gte: startOfYear, $lte: new Date() };
        }

        const filterNormal = { bookingStatus: 'Completed' };
        const filterBulk = { status: 'Completed' };
        const filterFixed = { status: 'Completed' };

        if (Object.keys(dateFilter).length > 0) {
            filterNormal.updatedAt = dateFilter;
            filterBulk.updatedAt = dateFilter;
            filterFixed.updatedAt = dateFilter;
        }

        // Fetch completed bookings
        const normalBookings = await Booking.find(filterNormal).populate('user', 'name');
        const bulkBookings = await BulkBooking.find(filterBulk).populate('createdBy', 'name');
        const fixedBookings = await FixedBooking.find(filterFixed).populate('user', 'name');

        const exportData = [];

        normalBookings.forEach(b => {
            const finalFare = b.actualFare || b.fareEstimate || 0;
            const baseFare = finalFare * (100 / 105); // reverse calc 5% gst
            const totalTax = finalFare - baseFare;
            const cgst = totalTax / 2;
            const sgst = totalTax / 2;

            exportData.push({
                "Date": new Date(b.tripData?.endedAt || b.updatedAt).toLocaleString('en-IN'),
                "Booking ID": b._id.toString(),
                "Ride Type": "Normal",
                "Customer Name": b.passengerDetails?.name || b.user?.name || "Unknown",
                "Base Fare": baseFare.toFixed(2),
                "CGST (2.5%)": cgst.toFixed(2),
                "SGST (2.5%)": sgst.toFixed(2),
                "Total Tax": totalTax.toFixed(2),
                "Final Fare": finalFare.toFixed(2)
            });
        });

        bulkBookings.forEach(b => {
            const baseFare = b.offeredPrice || 0;
            const cgst = b.cgst || 0;
            const sgst = b.sgst || 0;
            const totalTax = cgst + sgst;
            const finalFare = b.totalPriceWithTax ? b.totalPriceWithTax : (baseFare + totalTax);

            exportData.push({
                "Date": new Date(b.updatedAt).toLocaleString('en-IN'),
                "Booking ID": b._id.toString(),
                "Ride Type": "Bulk Booking",
                "Customer Name": b.customerName || b.createdBy?.name || "Unknown",
                "Base Fare": baseFare.toFixed(2),
                "CGST (2.5%)": cgst.toFixed(2),
                "SGST (2.5%)": sgst.toFixed(2),
                "Total Tax": totalTax.toFixed(2),
                "Final Fare": finalFare.toFixed(2)
            });
        });

        fixedBookings.forEach(b => {
            const baseFare = b.price || 0;
            const cgst = b.cgst || 0;
            const sgst = b.sgst || 0;
            const totalTax = cgst + sgst;
            const finalFare = b.finalPrice ? b.finalPrice : (baseFare + totalTax);

            exportData.push({
                "Date": new Date(b.completedAt || b.updatedAt).toLocaleString('en-IN'),
                "Booking ID": b._id.toString(),
                "Ride Type": "Fixed Package",
                "Customer Name": b.passengerDetails?.name || b.user?.name || "Unknown",
                "Base Fare": baseFare.toFixed(2),
                "CGST (2.5%)": cgst.toFixed(2),
                "SGST (2.5%)": sgst.toFixed(2),
                "Total Tax": totalTax.toFixed(2),
                "Final Fare": finalFare.toFixed(2)
            });
        });

        // Sort by Date (newest first)
        exportData.sort((a, b) => new Date(b.Date) - new Date(a.Date));

        // Calculate Totals
        const totals = { baseFare: 0, cgst: 0, sgst: 0, totalTax: 0, finalFare: 0 };
        exportData.forEach(row => {
            totals.baseFare += parseFloat(row["Base Fare"]) || 0;
            totals.cgst += parseFloat(row["CGST (2.5%)"]) || 0;
            totals.sgst += parseFloat(row["SGST (2.5%)"]) || 0;
            totals.totalTax += parseFloat(row["Total Tax"]) || 0;
            totals.finalFare += parseFloat(row["Final Fare"]) || 0;
        });

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Tax Report');

        // Add Header Row
        const headerRow = sheet.addRow([
            "Date", "Booking ID", "Ride Type", "Customer Name",
            "Base Fare", "CGST (2.5%)", "SGST (2.5%)", "Total Tax", "Final Fare"
        ]);
        // Style Header (Blue Background, White Text, Bold)
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
        
        // Add Data Rows
        exportData.forEach(row => {
            sheet.addRow([
                row["Date"], row["Booking ID"], row["Ride Type"], row["Customer Name"],
                row["Base Fare"], row["CGST (2.5%)"], row["SGST (2.5%)"], row["Total Tax"], row["Final Fare"]
            ]);
        });

        // Add Empty Row for separation
        sheet.addRow([]);

        // Add Total Row
        const totalRow = sheet.addRow([
            "TOTAL", "", "", "",
            totals.baseFare.toFixed(2), totals.cgst.toFixed(2), totals.sgst.toFixed(2),
            totals.totalTax.toFixed(2), totals.finalFare.toFixed(2)
        ]);
        // Style Total Row (Red/Orange Background, White Text, Bold)
        totalRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0504D' } };

        // Auto adjust column widths slightly
        sheet.columns.forEach((column, index) => {
            column.width = index === 1 ? 25 : 18; // Make Booking ID column wider
        });

        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment('tax_report.xlsx');
        
        await workbook.xlsx.write(res);
        return res.end();
    } catch (error) {
        res.status(500).json({ success: false, message: "Error exporting tax report", error: error.message });
    }
};

exports.getNewBookings = async (req, res) => {
    try {
        const Booking = require("../models/Booking");
        const BulkBooking = require("../models/BulkBooking");
        const AgentLead = require("../models/AgentLead");
        const FixedBooking = require("../models/FixedBooking");

        // Fetch unread normal bookings
        const normalBookings = await Booking.find({ adminRead: false }).populate("user", "name phone").lean();
        // Fetch unread bulk bookings
        const bulkBookings = await BulkBooking.find({ adminRead: false }).populate("createdBy", "name phone").lean();
        // Fetch unread fixed bookings
        const fixedBookings = await FixedBooking.find({ adminRead: false }).populate("user", "name phone").lean();
        // Fetch unread agent leads
        const agentLeads = await AgentLead.find({ adminRead: false }).populate("agent", "name phone").lean();

        let allBookings = [];

        normalBookings.forEach(b => {
            allBookings.push({
                _id: b._id,
                type: 'Normal Booking',
                customerName: b.user ? b.user.name : "Unknown",
                phone: b.user ? b.user.phone : "Unknown",
                date: b.createdAt,
                pickup: b.pickupLocation ? b.pickupLocation.address : "N/A",
                drop: b.dropLocation ? b.dropLocation.address : "N/A",
                status: b.bookingStatus
            });
        });

        bulkBookings.forEach(b => {
            allBookings.push({
                _id: b._id,
                type: 'Bulk Booking',
                customerName: b.customerName || (b.createdBy ? b.createdBy.name : "Unknown"),
                phone: b.customerPhone || (b.createdBy ? b.createdBy.phone : "Unknown"),
                date: b.createdAt,
                pickup: b.pickup ? b.pickup.address : "N/A",
                drop: b.drop ? b.drop.address : "N/A",
                status: b.status
            });
        });

        fixedBookings.forEach(b => {
            allBookings.push({
                _id: b._id,
                type: 'Fixed Package',
                customerName: b.passengerDetails ? b.passengerDetails.name : (b.user ? b.user.name : "Unknown"),
                phone: b.passengerDetails ? b.passengerDetails.phone : (b.user ? b.user.phone : "Unknown"),
                date: b.createdAt,
                pickup: b.pickupLocation || "N/A",
                drop: b.dropLocation || "N/A",
                status: b.status
            });
        });

        agentLeads.forEach(b => {
            allBookings.push({
                _id: b._id,
                type: 'Agent Lead',
                customerName: b.passengerName || "Unknown",
                phone: b.passengerPhone || "Unknown",
                date: b.createdAt,
                pickup: b.pickupLocation ? b.pickupLocation.address : "N/A",
                drop: b.dropLocation ? b.dropLocation.address : "N/A",
                status: b.status
            });
        });

        // Sort descending by date
        allBookings.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ success: true, count: allBookings.length, data: allBookings });
    } catch (error) {
        console.error("Error fetching new bookings:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

exports.markAllBookingsRead = async (req, res) => {
    try {
        const Booking = require("../models/Booking");
        const BulkBooking = require("../models/BulkBooking");
        const AgentLead = require("../models/AgentLead");
        const FixedBooking = require("../models/FixedBooking");

        await Promise.all([
            Booking.updateMany({ adminRead: false }, { adminRead: true }),
            BulkBooking.updateMany({ adminRead: false }, { adminRead: true }),
            FixedBooking.updateMany({ adminRead: false }, { adminRead: true }),
            AgentLead.updateMany({ adminRead: false }, { adminRead: true })
        ]);

        res.json({ success: true, message: "All bookings marked as read." });
    } catch (error) {
        console.error("Error marking bookings as read:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};