const Admin = require("../models/Admin")
const jwt = require("jsonwebtoken")
const User = require("../models/User")
const Driver = require("../models/Driver")
const Agent = require("../models/Agent")
const Fleet = require("../models/Fleet")
const Booking = require("../models/Booking")
const Transaction = require("../models/Transaction")

exports.registerAdmin = async (req, res) => {
    try {
        const { name, email, password } = req.body
        const image = req.file ? req.file.filename : null
        const adminExist = await Admin.findOne({ email })
        if (adminExist) {
            return res.status(400).json({
                success: false,
                message: "Admin already exists"
            })
        }
        const admin = await Admin.create({
            name,
            email,
            password,
            image
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
            admin
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
        const admin = await Admin.findById(req.user.id)
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            })
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
        const updateData = {
            name,
            email,
            password
        }
        if (req.file) {
            updateData.image = req.file.filename
        }
        const admin = await Admin.findByIdAndUpdate(
            req.user.id,
            updateData,
            { new: true }
        )
        res.json({
            success: true,
            message: "Profile updated successfully",
            admin
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error"
        })
    }
}

exports.getDashboardStats = async (req, res) => {
    try {
        const stats = {
            counts: {
                users: await User.countDocuments(),
                drivers: {
                    total: await Driver.countDocuments(),
                    approved: await Driver.countDocuments({ isApproved: true }),
                    pending: await Driver.countDocuments({ isApproved: false, isRejected: false })
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
                .populate("user", "name")
                .populate("assignedDriver", "name")
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