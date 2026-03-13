const Fleet = require("../models/Fleet");
const jwt = require("jsonwebtoken");

// Create Fleet (Admin Only)
exports.createFleet = async (req, res) => {
    try {
        const { 
            name, email, phone, password, companyName, gstNumber, panNumber,
            address, city, state, pincode 
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
        const fleet = await Fleet.findById(req.user.id);

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: "Fleet not found"
            });
        }

        // You can add more complex calculations here
        const dashboardData = {
            totalCars: fleet.totalCars,
            totalDrivers: fleet.totalDrivers,
            totalEarnings: fleet.totalEarnings,
            walletBalance: fleet.walletBalance,
            activeStatus: fleet.isActive
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

// Get Fleet Performance Report
exports.getFleetPerformance = async (req, res) => {
    try {
        const fleet = await Fleet.findById(req.user.id);

        if (!fleet) {
            return res.status(404).json({
                success: false,
                message: "Fleet not found"
            });
        }

        // Mock performance data - you can implement actual calculations
        const performanceData = {
            totalCars: fleet.totalCars,
            totalDrivers: fleet.totalDrivers,
            totalEarnings: fleet.totalEarnings,
            monthlyEarnings: fleet.totalEarnings * 0.1, // Mock calculation
            averageEarningsPerCar: fleet.totalCars > 0 ? fleet.totalEarnings / fleet.totalCars : 0,
            activeDriversPercentage: fleet.totalDrivers > 0 ? 85 : 0, // Mock percentage
            carUtilizationRate: fleet.totalCars > 0 ? 75 : 0 // Mock percentage
        };

        res.json({
            success: true,
            performance: performanceData
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching performance",
            error: error.message
        });
    }
};