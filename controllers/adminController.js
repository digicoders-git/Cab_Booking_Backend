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
            { expiresIn: "7d" }
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
                    todayBookings: await Booking.countDocuments({ createdAt: { $gte: new Date().setHours(0,0,0,0) } })
                },
                users: {
                    total: await User.countDocuments(),
                    today: await User.countDocuments({ createdAt: { $gte: new Date().setHours(0,0,0,0) } })
                }
            },
            driverStats: {
                total: await Driver.countDocuments(),
                online: await Driver.countDocuments({ isApproved: true, isOnline: true }),
                offline: await Driver.countDocuments({ isApproved: true, isOnline: false }),
                busy: await Driver.countDocuments({ isApproved: true, isAvailable: false }),
                idle: await Driver.countDocuments({ isApproved: true, isOnline: true, isAvailable: true }),
                rejected: await Driver.countDocuments({ isRejected: true }),
                today: await Driver.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } })
            },
            partnerStats: {
                todayAgents: await Agent.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } }),
                todayFleets: await Fleet.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } }),
                todayVendors: await Vendor.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } })
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
                    { $match: { bookingStatus: "Completed", createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } } },
                    { $group: { _id: null, total: { $sum: "$actualFare" } } }
                ]))[0]?.total || 0,
                profit: (await Transaction.aggregate([
                    { $match: { userModel: "Admin", category: "Commission", createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } } },
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
                maxNegativeWalletLimit: admin.maxNegativeWalletLimit ?? 3000
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
            'maxNegativeWalletLimit'
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
                maxNegativeWalletLimit: admin.maxNegativeWalletLimit
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