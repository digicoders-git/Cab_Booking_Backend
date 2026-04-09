const Admin = require("../models/Admin")
const jwt = require("jsonwebtoken")
const User = require("../models/User")
const Driver = require("../models/Driver")
const Agent = require("../models/Agent")
const Fleet = require("../models/Fleet")
const Booking = require("../models/Booking")
const Transaction = require("../models/Transaction")
const { isEmailTaken, isPhoneTaken } = require("../utils/globalUniqueness")

exports.registerAdmin = async (req, res) => {
    try {
        const { name, email, password } = req.body
        const image = req.file ? req.file.filename : null
        // Check global email uniqueness
        const emailTakenBy = await isEmailTaken(email);
        if (emailTakenBy) {
            return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
        }
        const admin = await Admin.create({
            name,
            email,
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
        const { name, email, password } = req.body
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
            password
        }
        if (req.file) {
            updateData.image = req.file.filename
        }
        const updatedAdmin = await Admin.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
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
        const { name, email, password, permissions } = req.body;
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
        const stats = {
            counts: {
                users: await User.countDocuments(),
                drivers: {
                    total: await Driver.countDocuments(),
                    approved: await Driver.countDocuments({ isApproved: true }),
                    pending: await Driver.countDocuments({ isApproved: false, isRejected: false }),
                    online: await Driver.countDocuments({ isApproved: true, isOnline: true }) // Matches Tracking API
                },
                agents: await Agent.countDocuments(),
                fleets: await Fleet.countDocuments(),
                bookings: {
                    total: await Booking.countDocuments(),
                    completed: await Booking.countDocuments({ bookingStatus: "Completed" }),
                    pending: await Booking.countDocuments({ bookingStatus: "Pending" }),
                    cancelled: await Booking.countDocuments({ bookingStatus: "Cancelled" }),
                    ongoing: await Booking.countDocuments({ bookingStatus: "Ongoing" })
                }
            },
            earnings: {
                adminWallet: 0,
                totalEarnings: 0
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
            success: false,
            message: "Error fetching live tracking data",
            error: error.message
        });
    }
}