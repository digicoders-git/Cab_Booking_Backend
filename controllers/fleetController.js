const Fleet = require("../models/Fleet");
const FleetCar = require("../models/FleetCar");
const FleetDriver = require("../models/FleetDriver");
const FleetAssignment = require("../models/FleetAssignment");
const Transaction = require("../models/Transaction");
const jwt = require("jsonwebtoken");

// Create Fleet (Admin Only)
exports.createFleet = async (req, res) => {
    try {
        const { 
            name, email, phone, password, companyName, gstNumber, panNumber,
            address, city, state, pincode, commissionPercentage,
            accountNumber, ifscCode, accountHolderName, bankName
        } = req.body;

        const image = req.file ? req.file.filename : null;

        // Check if fleet already exists
        const fleetExist = await Fleet.findOne({ $or: [{ email }, { phone }] });

        if (fleetExist) {
            return res.status(400).json({
                success: false,
                message: "Fleet with this email or phone already exists"
            });
        }

        const fleet = await Fleet.create({
            name,
            email,
            phone,
            password,
            image,
            companyName,
            gstNumber,
            panNumber,
            address,
            city,
            state,
            pincode,
            commissionPercentage: commissionPercentage || 10,
            bankDetails: {
                accountNumber,
                ifscCode,
                accountHolderName,
                bankName
            },
            isActive: true,
            createdBy: req.user.id
        });

        res.status(201).json({
            success: true,
            message: "Fleet created successfully by Admin",
            fleet
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Fleet Login
exports.loginFleet = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const fleet = await Fleet.findOne({ email });

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: "Fleet not found"
            });
        }

        if (!fleet.isActive) {
            return res.status(403).json({
                success: false,
                message: "Your account has been deactivated by Admin"
            });
        }

        if (fleet.password !== password) {
            return res.status(400).json({
                success: false,
                message: "Invalid password"
            });
        }

        const token = jwt.sign(
            {
                id: fleet._id,
                role: "fleet"
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            fleet
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Get Fleet Profile
exports.getFleetProfile = async (req, res) => {
    try {
        const fleet = await Fleet.findById(req.user.id).select("-password");

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: "Fleet not found"
            });
        }

        res.json({
            success: true,
            fleet
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Update Fleet Profile
exports.updateFleetProfile = async (req, res) => {
    try {
        const { 
            name, email, phone, password, companyName, gstNumber, panNumber,
            address, city, state, pincode,
            accountNumber, ifscCode, accountHolderName, bankName,
            gstCertificate, panCard, businessLicense
        } = req.body;

        const updateData = {
            name,
            email,
            phone,
            companyName,
            gstNumber,
            panNumber,
            address,
            city,
            state,
            pincode
        };

        if (password) {
            updateData.password = password;
        }

        if (req.file) {
            updateData.image = req.file.filename;
        }

        if (accountNumber || ifscCode || accountHolderName || bankName) {
            updateData.bankDetails = {
                accountNumber,
                ifscCode,
                accountHolderName,
                bankName
            };
        }

        if (gstCertificate || panCard || businessLicense) {
            updateData.documents = {
                gstCertificate: gstCertificate || undefined,
                panCard: panCard || undefined,
                businessLicense: businessLicense || undefined
            };
        }

        const fleet = await Fleet.findByIdAndUpdate(
            req.user.id,
            updateData,
            { new: true }
        ).select("-password");

        res.json({
            success: true,
            message: "Profile updated successfully",
            fleet
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Get All Fleets (Admin Only)
exports.getAllFleets = async (req, res) => {
    try {
        const fleets = await Fleet.find().select("-password").populate("createdBy", "name email");

        res.json({
            success: true,
            count: fleets.length,
            fleets
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching fleets",
            error: error.message
        });
    }
};

// Get Single Fleet (Admin Only)
exports.getSingleFleet = async (req, res) => {
    try {
        const fleet = await Fleet.findById(req.params.id).select("-password").populate("createdBy", "name email");

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: "Fleet not found"
            });
        }

        res.json({
            success: true,
            fleet
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching fleet",
            error: error.message
        });
    }
};

// Delete Fleet (Admin Only)
exports.deleteFleet = async (req, res) => {
    try {
        const fleet = await Fleet.findByIdAndDelete(req.params.id);

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: "Fleet not found"
            });
        }

        res.json({
            success: true,
            message: "Fleet deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting fleet",
            error: error.message
        });
    }
};

// Toggle Fleet Status (Admin Only)
exports.toggleFleetStatus = async (req, res) => {
    try {
        const fleet = await Fleet.findById(req.params.id);

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: "Fleet not found"
            });
        }

        fleet.isActive = !fleet.isActive;
        await fleet.save();

        res.json({
            success: true,
            message: `Fleet is now ${fleet.isActive ? 'Active' : 'Deactivated'}`,
            isActive: fleet.isActive
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error toggling status",
            error: error.message
        });
    }
};

// Get Fleet Dashboard Stats
exports.getFleetDashboard = async (req, res) => {
    try {
        const fleet = await Fleet.findById(req.user.id).select("-password -__v");

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: "Fleet not found"
            });
        }

        // 1. Car Stats
        const totalCars = await FleetCar.countDocuments({ fleetId: req.user.id });
        const availableCars = await FleetCar.countDocuments({ fleetId: req.user.id, isAvailable: true, isActive: true });
        const busyCars = await FleetCar.countDocuments({ fleetId: req.user.id, isBusy: true });

        // 2. Driver Stats
        const totalDrivers = await FleetDriver.countDocuments({ fleetId: req.user.id });
        const activeDrivers = await FleetDriver.countDocuments({ fleetId: req.user.id, isApproved: true });
        const pendingDrivers = await FleetDriver.countDocuments({ fleetId: req.user.id, isApproved: false, isRejected: false });

        // 3. Recent 5 Assignments
        const recentAssignments = await FleetAssignment.find({ fleetId: req.user.id })
            .populate("driverId", "name phone")
            .populate("carId", "carNumber carModel")
            .sort({ createdAt: -1 })
            .limit(5);

        // 4. Recent 5 Wallet Transactions
        const recentTransactions = await Transaction.find({ user: req.user.id, userModel: "Fleet" })
            .sort({ createdAt: -1 })
            .limit(5);

        const dashboardData = {
            profile: fleet,
            stats: {
                cars: {
                    total: totalCars,
                    available: availableCars,
                    busy: busyCars
                },
                drivers: {
                    total: totalDrivers,
                    active: activeDrivers,
                    pending: pendingDrivers
                }
            },
            recentActivity: {
                assignments: recentAssignments,
                transactions: recentTransactions
            }
        };

        res.json({
            success: true,
            dashboard: dashboardData
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching dashboard",
            error: error.message
        });
    }
};

// Update Fleet Wallet Balance (Admin Only)
exports.updateWalletBalance = async (req, res) => {
    try {
        const { amount, type } = req.body; // type: 'credit' or 'debit'

        if (!amount || !type) {
            return res.status(400).json({
                success: false,
                message: "Amount and type are required"
            });
        }

        const fleet = await Fleet.findById(req.params.id);

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: "Fleet not found"
            });
        }

        const Transaction = require("../models/Transaction");

        if (type === 'credit') {
            fleet.walletBalance += amount;
        } else if (type === 'debit') {
            if (fleet.walletBalance < amount) {
                return res.status(400).json({
                    success: false,
                    message: "Insufficient wallet balance"
                });
            }
            fleet.walletBalance -= amount;
        }

        await fleet.save();

        // Create transaction record for audit
        await Transaction.create({
            user: fleet._id,
            userModel: 'Fleet',
            amount: amount,
            type: type === 'credit' ? 'Credit' : 'Debit',
            category: 'Admin Adjustment',
            status: 'Completed',
            description: `Admin manual ${type}`
        });

        res.json({
            success: true,
            message: `Wallet ${type}ed successfully`,
            walletBalance: fleet.walletBalance
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating wallet",
            error: error.message
        });
    }
};

// Get Fleet Performance Report (Real Data Driven)
exports.getFleetPerformance = async (req, res) => {
    try {
        const fleetId = req.user.id;
        const fleet = await Fleet.findById(fleetId);

        if (!fleet) {
            return res.status(404).json({ success: false, message: "Fleet not found" });
        }

        // 1. Car Wise Performance (Top 5 by Earnings)
        const topCars = await FleetCar.find({ fleetId })
            .sort({ totalEarnings: -1 })
            .limit(5)
            .select("carNumber carModel totalTrips totalEarnings");

        // 2. Car Wise Performance (Bottom 5 by Trips - need more attention)
        const leastUsedCars = await FleetCar.find({ fleetId })
            .sort({ totalTrips: 1 })
            .limit(5)
            .select("carNumber carModel totalTrips totalEarnings");

        // 3. Overall Stats
        const totalCars = await FleetCar.countDocuments({ fleetId });
        const busyCars = await FleetCar.countDocuments({ fleetId, isBusy: true });
        
        // Utilization calculation
        const utilizationRate = totalCars > 0 ? (busyCars / totalCars) * 100 : 0;

        // 4. Monthly Earnings Snapshot (Last 30 days transactions from wallet)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentTransactions = await Transaction.find({
            user: fleetId,
            userModel: 'Fleet',
            type: 'Credit',
            createdAt: { $gte: thirtyDaysAgo }
        });

        const monthlyEarnings = recentTransactions.reduce((acc, trans) => acc + trans.amount, 0);

        const performanceReport = {
            fleetStats: {
                totalEarnings: fleet.totalEarnings,
                walletBalance: fleet.walletBalance,
                monthlyEarningsSnapshot: monthlyEarnings, // Real calculation from transactions
                totalCars,
                totalDrivers: await FleetDriver.countDocuments({ fleetId })
            },
            utilization: {
                busyCarsCount: busyCars,
                utilizationRate: Math.round(utilizationRate) + "%"
            },
            topPerformingCars: topCars,
            needsAttentionCars: leastUsedCars, // Cars with 0 or very few trips
            reportGeneratedAt: new Date()
        };

        res.json({
            success: true,
            report: performanceReport
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error generating performance report",
            error: error.message
        });
    }
};

// Update Fleet (Admin Only)
exports.adminUpdateFleet = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name, email, phone, password, companyName, gstNumber, panNumber,
            address, city, state, pincode, commissionPercentage,
            accountNumber, ifscCode, accountHolderName, bankName
        } = req.body;

        const fleet = await Fleet.findById(id);

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: "Fleet not found"
            });
        }

        // Update basic info
        if (name) fleet.name = name;
        if (email) fleet.email = email;
        if (phone) fleet.phone = phone;
        if (password) fleet.password = password;
        if (companyName) fleet.companyName = companyName;
        if (gstNumber !== undefined) fleet.gstNumber = gstNumber;
        if (panNumber !== undefined) fleet.panNumber = panNumber;
        if (address) fleet.address = address;
        if (city) fleet.city = city;
        if (state) fleet.state = state;
        if (pincode) fleet.pincode = pincode;
        if (commissionPercentage !== undefined) fleet.commissionPercentage = commissionPercentage;

        // Update image if provided
        if (req.file) {
            fleet.image = req.file.filename;
        }

        // Update Bank Details if any field provided
        if (accountNumber || ifscCode || accountHolderName || bankName) {
            fleet.bankDetails = {
                accountNumber: accountNumber || fleet.bankDetails.accountNumber,
                ifscCode: ifscCode || fleet.bankDetails.ifscCode,
                accountHolderName: accountHolderName || fleet.bankDetails.accountHolderName,
                bankName: bankName || fleet.bankDetails.bankName
            };
        }

        await fleet.save();

        res.json({
            success: true,
            message: "Fleet updated successfully by Admin",
            fleet
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating fleet",
            error: error.message
        });
    }
};

// Get All Completed Rides for Fleet (Detailed Report)
exports.getFleetCompletedRides = async (req, res) => {
    try {
        const fleetId = req.user.id;
        const Booking = require("../models/Booking");

        // 1. Get all drivers belonging to this fleet
        const fleetDrivers = await FleetDriver.find({ fleetId }).select("driverId");
        const driverIds = fleetDrivers.map(fd => fd.driverId);

        // 2. Find all completed bookings for these drivers
        const completedBookings = await Booking.find({
            assignedDriver: { $in: driverIds },
            bookingStatus: "Completed"
        })
        .populate("assignedDriver", "name phone")
        .populate("carCategory", "name")
        .sort({ updatedAt: -1 });

        res.json({
            success: true,
            count: completedBookings.length,
            completedRides: completedBookings
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching completed rides report",
            error: error.message
        });
    }
};