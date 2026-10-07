const Fleet = require("../models/Fleet");
const FleetCar = require("../models/FleetCar");
const FleetDriver = require("../models/FleetDriver");
const FleetAssignment = require("../models/FleetAssignment");
const Transaction = require("../models/Transaction");
const jwt = require("jsonwebtoken");
const { isEmailTaken, isPhoneTaken } = require("../utils/globalUniqueness");
const { sendPushNotification } = require("../utils/fcmNotification");

// Create Fleet (Admin Only)
exports.createFleet = async (req, res) => {
    try {
        const { 
            name, email, phone, password, companyName, gstNumber, panNumber,
            address, city, state, pincode, commissionPercentage,
            accountNumber, ifscCode, accountHolderName, bankName
        } = req.body;

        const image = req.files?.image ? req.files.image[0].filename : null;
        const gstCertificate = req.files?.gstCertificate ? req.files.gstCertificate[0].filename : null;
        const panCard = req.files?.panCard ? req.files.panCard[0].filename : null;
        const businessLicense = req.files?.businessLicense ? req.files.businessLicense[0].filename : null;

        // Check global email uniqueness
        const emailTakenBy = await isEmailTaken(email);
        if (emailTakenBy) {
            return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
        }

        // Check global phone uniqueness
        const phoneTakenBy = await isPhoneTaken(phone);
        if (phoneTakenBy) {
            return res.status(400).json({ success: false, message: `Phone number is already registered as ${phoneTakenBy}` });
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
            documents: {
                gstCertificate,
                panCard,
                businessLicense
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
            { expiresIn: "365d" }
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
        const fleet = await Fleet.findById(req.user.id);

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

        const id = req.user.id;
        const fleetRecord = await Fleet.findById(id);
        if (!fleetRecord) return res.status(404).json({ success: false, message: "Fleet not found" });

        // Check global email uniqueness if changed
        if (email && email !== fleetRecord.email) {
            const emailTakenBy = await isEmailTaken(email, id);
            if (emailTakenBy) return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
        }

        // Check global phone uniqueness if changed
        if (phone && phone !== fleetRecord.phone) {
            const phoneTakenBy = await isPhoneTaken(phone, id);
            if (phoneTakenBy) return res.status(400).json({ success: false, message: `Phone number is already registered as ${phoneTakenBy}` });
        }

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
        const fleets = await Fleet.find().populate("createdBy", "name email");

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
        const fleet = await Fleet.findById(req.params.id).populate("createdBy", "name email");

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
        const fleet = await Fleet.findById(req.params.id);

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: "Fleet not found"
            });
        }

        // 🔔 NOTIFY FLEET: Account Deleted
        if (fleet.fcmToken) {
            try {
                await sendPushNotification(fleet.fcmToken, {
                    title: "🗑️ Account Deleted",
                    body: `Your Fleet Partner account has been deleted by the Administrator.`,
                    data: {
                        type: "FLEET_ACCOUNT_DELETED"
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (Fleet Deletion):", fcmErr.message);
            }
        }

        await Fleet.findByIdAndDelete(req.params.id);

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

        // 🔔 NOTIFY FLEET: Status Update
        if (fleet.fcmToken) {
            try {
                await sendPushNotification(fleet.fcmToken, {
                    title: `🛡️ Account Status Update`,
                    body: `Your Fleet account has been ${fleet.isActive ? 'ACTIVATED' : 'DEACTIVATED'} by the Administrator.`,
                    data: {
                        type: "FLEET_STATUS_TOGGLE",
                        isActive: fleet.isActive.toString()
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (Fleet Status Toggle):", fcmErr.message);
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

        // Check global email uniqueness if changed
        if (email && email !== fleet.email) {
            const emailTakenBy = await isEmailTaken(email, id);
            if (emailTakenBy) return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
        }

        // Check global phone uniqueness if changed
        if (phone && phone !== fleet.phone) {
            const phoneTakenBy = await isPhoneTaken(phone, id);
            if (phoneTakenBy) return res.status(400).json({ success: false, message: `Phone number is already registered as ${phoneTakenBy}` });
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

        // Update image if provided from req.files fields
        if (req.files) {
            if (req.files.image) fleet.image = req.files.image[0].filename;
            
            if (req.files.gstCertificate || req.files.panCard || req.files.businessLicense) {
                if (!fleet.documents) fleet.documents = {};
                if (req.files.gstCertificate) fleet.documents.gstCertificate = req.files.gstCertificate[0].filename;
                if (req.files.panCard) fleet.documents.panCard = req.files.panCard[0].filename;
                if (req.files.businessLicense) fleet.documents.businessLicense = req.files.businessLicense[0].filename;
            }
        }

        // Update Bank Details if any field provided
        if (accountNumber || ifscCode || accountHolderName || bankName) {
            fleet.bankDetails = {
                accountNumber: accountNumber || fleet.bankDetails?.accountNumber || "",
                ifscCode: ifscCode || fleet.bankDetails?.ifscCode || "",
                accountHolderName: accountHolderName || fleet.bankDetails?.accountHolderName || "",
                bankName: bankName || fleet.bankDetails?.bankName || ""
            };
        }

        await fleet.save();

        res.json({
            success: true,
            message: "Fleet updated successfully by Admin",
            fleet
        });

        // 🔔 NOTIFY FLEET: Profile Updated by Admin
        if (fleet.fcmToken) {
            try {
                await sendPushNotification(fleet.fcmToken, {
                    title: "📝 Profile Updated by Admin",
                    body: `Your Fleet profile details have been updated by the Administrator.`,
                    data: {
                        type: "FLEET_PROFILE_UPDATED"
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (Fleet Admin Update):", fcmErr.message);
            }
        }

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

// Update Fleet FCM Token
exports.updateFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken) return res.status(400).json({ success: false, message: "FCM Token is required" });

        const fleet = await Fleet.findByIdAndUpdate(req.user.id, { fcmToken }, { new: true });
        console.log(`[FCM-SYNC] Token updated for Fleet: ${fleet?.name || 'Unknown'} (${req.user.id})`);

        // Subscribe to Topics for Broadcasts
        try {
            const { subscribeToTopic } = require("../utils/fcmNotification");
            await subscribeToTopic(fcmToken, "all");
            await subscribeToTopic(fcmToken, "fleet");
        } catch (topicErr) {
            console.error("Topic Sync Error:", topicErr.message);
        }

        res.json({
            success: true,
            message: "Fleet FCM Token and Topics updated successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating FCM Token",
            error: error.message
        });
    }
};

// Export Fleet Tax Report (GST)
exports.exportTaxReport = async (req, res) => {
    try {
        const Booking = require("../models/Booking");
        const BulkBooking = require("../models/BulkBooking");
        const FixedBooking = require("../models/FixedBooking");
        const Driver = require("../models/Driver");
        
        const { timeframe } = req.query;
        const fleetId = req.user.id;
        
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

        // Find drivers belonging to fleet (using main Driver model where they log in)
        const fleetDrivers = await Driver.find({ createdBy: fleetId, createdByModel: 'Fleet' }).select("_id");
        const driverIds = fleetDrivers.map(fd => fd._id);

        if (driverIds.length > 0) {
            filterNormal.assignedDriver = { $in: driverIds };
            filterFixed.assignedDriver = { $in: driverIds };
        } else {
            // We can't early return yet because there might be BulkBookings assigned directly to the Fleet.
            // But we can set a dummy filter so they don't match anything
            filterNormal._id = null;
            filterFixed._id = null;
        }

        // Bulk bookings are assigned to the fleet, not an individual driver directly at the root
        filterBulk.assignedFleet = fleetId;

        const normalBookings = await Booking.find(filterNormal).populate('user', 'name').populate('assignedDriver', 'name');
        const bulkBookings = await BulkBooking.find(filterBulk).populate('createdBy', 'name');
        const fixedBookings = await FixedBooking.find(filterFixed).populate('user', 'name').populate('assignedDriver', 'name');

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
                "Driver Name": b.assignedDriver?.name || "Unknown",
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
                "Driver Name": "Multiple Drivers", // Bulk has multiple drivers usually
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
                "Driver Name": b.assignedDriver?.name || "Unknown",
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

        // Return JSON format if requested for PDF generation
        if (req.query.format === 'json') {
            return res.status(200).json({
                success: true,
                data: exportData,
                totals: totals,
                timeframe: timeframe || 'all'
            });
        }

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Tax Report');

        // Add Header Row
        const headerRow = sheet.addRow([
            "Date", "Booking ID", "Ride Type", "Customer Name", "Driver Name",
            "Base Fare", "CGST (2.5%)", "SGST (2.5%)", "Total Tax", "Final Fare"
        ]);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
        
        // Add Data Rows
        exportData.forEach(row => {
            sheet.addRow([
                row["Date"], row["Booking ID"], row["Ride Type"], row["Customer Name"], row["Driver Name"],
                row["Base Fare"], row["CGST (2.5%)"], row["SGST (2.5%)"], row["Total Tax"], row["Final Fare"]
            ]);
        });

        sheet.addRow([]);
        
        // Add Total Row
        const totalRow = sheet.addRow([
            "TOTAL", "", "", "", "",
            totals.baseFare.toFixed(2), totals.cgst.toFixed(2), totals.sgst.toFixed(2),
            totals.totalTax.toFixed(2), totals.finalFare.toFixed(2)
        ]);
        totalRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0504D' } };

        sheet.columns.forEach((column, index) => {
            column.width = index === 1 ? 25 : 18; 
        });

        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment('fleet_tax_report.xlsx');
        
        await workbook.xlsx.write(res);
        return res.end();
    } catch (error) {
        res.status(500).json({ success: false, message: "Error exporting tax report", error: error.message });
    }
};

// ============================================
// FIXED BOOKINGS MARKETPLACE (FLEET PANEL)
// ============================================

// 1. Get Open Fixed Packages from Marketplace
exports.getFixedMarketplace = async (req, res) => {
    try {
        const FixedBooking = require("../models/FixedBooking");
        const FleetDriver = require("../models/FleetDriver");
        const FleetAssignment = require("../models/FleetAssignment");

        // 1. Get all approved drivers for this fleet
        const approvedDrivers = await FleetDriver.find({ fleetId: req.user.id, isApproved: true }).select('_id');
        const approvedDriverIds = approvedDrivers.map(d => d._id);

        // 2. Get their active car assignments
        const activeAssignments = await FleetAssignment.find({
            fleetId: req.user.id,
            driverId: { $in: approvedDriverIds },
            isAssigned: true
        }).populate('carId');

        // 3. Extract unique car category IDs
        const availableCarCategoryIds = activeAssignments
            .filter(a => a.carId && a.carId.carType)
            .map(a => a.carId.carType.toString());
        const uniqueCarCategories = [...new Set(availableCarCategoryIds)];

        // 4. Fetch only bookings that match the available car categories
        const openBookings = await FixedBooking.find({ 
            status: 'Marketplace',
            carCategory: { $in: uniqueCarCategories }
        })
            .populate('fixedRoute', 'routeName startCity endCity type')
            .populate('carCategory', 'name image capacity')
            .sort({ createdAt: -1 });

        res.json({ success: true, count: openBookings.length, data: openBookings });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error fetching marketplace" });
    }
};

// 2. Fleet Accepts Fixed Booking and Assigns to their Driver
exports.acceptFixedBooking = async (req, res) => {
    try {
        const { driverId } = req.body;
        if (!driverId) return res.status(400).json({ success: false, message: "Driver ID is required" });

        const FixedBooking = require("../models/FixedBooking");
        const Driver = require("../models/Driver");
        
        const booking = await FixedBooking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
        if (booking.status !== 'Marketplace') return res.status(400).json({ success: false, message: "Booking already accepted" });

        // Verify driver belongs to fleet via FleetDriver model
        const FleetDriver = require("../models/FleetDriver");
        const fleetDriver = await FleetDriver.findOne({ _id: driverId, fleetId: req.user.id });
        if (!fleetDriver) return res.status(403).json({ success: false, message: "Driver does not belong to your fleet or is invalid" });

        // Find the actual Driver model document (which is created when assigned a car)
        const mainDriver = await Driver.findOne({ email: fleetDriver.email, createdBy: req.user.id });
        if (!mainDriver) return res.status(403).json({ success: false, message: "Driver must be assigned a car first before accepting bookings" });

        booking.status = 'Accepted';
        booking.assignedDriver = mainDriver._id;
        booking.assignedFleet = req.user.id;
        booking.acceptedAt = new Date();

        await booking.save();

        res.json({ success: true, message: "Booking accepted & driver assigned successfully", data: booking });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error accepting booking" });
    }
};

// 3. Get Fleet's Managed Fixed Bookings
exports.getMyFixedBookings = async (req, res) => {
    try {
        const FixedBooking = require("../models/FixedBooking");
        const myBookings = await FixedBooking.find({ assignedFleet: req.user.id })
            .populate('fixedRoute', 'routeName startCity endCity type')
            .populate('carCategory', 'name image capacity')
            .populate('assignedDriver', 'name phone')
            .sort({ acceptedAt: -1 });

        res.json({ success: true, count: myBookings.length, data: myBookings });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error fetching your fixed bookings" });
    }
};