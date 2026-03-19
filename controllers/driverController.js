const Driver = require("../models/Driver");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// Register Driver (Open Registration - Pending Admin Approval)
// Driver can register with car details
exports.registerDriver = async (req, res) => {
    try {
        const { 
            // Driver Details
            name, email, phone, password, licenseNumber, licenseExpiry, 
            address, city, state, pincode,
            aadhar, pan,
            accountNumber, ifscCode, accountHolderName, bankName,
            
            // Car Details (Optional for direct registration)
            carNumber, carModel, carBrand, carType, seatCapacity, carColor, 
            manufacturingYear, insuranceExpiry, permitExpiry, pucExpiry
        } = req.body;

        const image = req.file ? req.file.filename : null;

        // Check if driver already exists
        const driverExist = await Driver.findOne({ $or: [{ email }, { phone }] });

        if (driverExist) {
            return res.status(400).json({
                success: false,
                message: "Driver with this email or phone already exists"
            });
        }

        // Check if car number already exists (if provided)
        if (carNumber) {
            const carExist = await Driver.findOne({ "carDetails.carNumber": carNumber });
            if (carExist) {
                return res.status(400).json({
                    success: false,
                    message: "Car with this number is already registered"
                });
            }
        }

        // Prepare car details object
        const carDetails = carNumber ? {
            carNumber,
            carModel,
            carBrand,
            carType,
            seatCapacity: seatCapacity || 4,
            carColor,
            manufacturingYear,
            insuranceExpiry,
            permitExpiry,
            pucExpiry
        } : undefined;

        // Bug Fix 3: Hash password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        const driver = await Driver.create({
            name,
            email,
            phone,
            password: hashedPassword,
            image,
            licenseNumber,
            licenseExpiry,
            address,
            city,
            state,
            pincode,
            documents: {
                license: licenseNumber,
                aadhar,
                pan
            },
            bankDetails: {
                accountNumber,
                ifscCode,
                accountHolderName,
                bankName
            },
            carDetails,  // Car details included
            isActive: false,  // Inactive until admin approves
            isApproved: false,  // Pending approval
            createdBy: req.user ? req.user.id : null,
            createdByModel: req.user ? (req.user.role === "admin" ? "Admin" : "Fleet") : "Self"
        });

        res.status(201).json({
            success: true,
            message: "Driver registration submitted successfully. Waiting for admin approval.",
            driver
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Login Driver
exports.loginDriver = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const driver = await Driver.findOne({ email });

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        if (!driver.isApproved) {
            return res.status(403).json({
                success: false,
                message: "Your account is pending admin approval"
            });
        }

        if (!driver.isActive) {
            return res.status(403).json({
                success: false,
                message: "Your account has been deactivated by Admin"
            });
        }

        // Bug Fix 3: bcrypt se password compare karo (plain text nahi)
        const isPasswordMatch = await bcrypt.compare(password, driver.password);
        if (!isPasswordMatch) {
            return res.status(400).json({
                success: false,
                message: "Invalid password"
            });
        }

        const token = jwt.sign(
            {
                id: driver._id,
                role: "driver"
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            driver
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Get Driver Profile
exports.getDriverProfile = async (req, res) => {
    try {
        const driver = await Driver.findById(req.user.id)
            .select("-password");

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        res.json({
            success: true,
            driver
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Update Driver Profile (Including Documents, Bank Details & Car Details)
exports.updateDriverProfile = async (req, res) => {
    try {
        const { 
            name, email, phone, password, 
            licenseNumber, licenseExpiry,
            address, city, state, pincode,
            accountNumber, ifscCode, accountHolderName, bankName,
            license, aadhar, pan,
            
            // Car Details
            carNumber, carModel, carBrand, carType, seatCapacity, carColor,
            manufacturingYear, insuranceExpiry, permitExpiry, pucExpiry,
            lastServiceDate, nextServiceDate,
            rcDocument, insuranceDocument, permitDocument, pucDocument
        } = req.body;

        const updateData = {
            name,
            email,
            phone,
            licenseNumber,
            licenseExpiry,
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

        if (license || aadhar || pan) {
            updateData.documents = {
                license: license || undefined,
                aadhar: aadhar || undefined,
                pan: pan || undefined
            };
        }

        // Update Car Details
        if (carNumber || carModel || carBrand || carType) {
            updateData.carDetails = {
                carNumber,
                carModel,
                carBrand,
                carType,
                seatCapacity: seatCapacity || 4,
                carColor,
                manufacturingYear,
                insuranceExpiry,
                permitExpiry,
                pucExpiry,
                lastServiceDate,
                nextServiceDate,
                carDocuments: {
                    rc: rcDocument || undefined,
                    insurance: insuranceDocument || undefined,
                    permit: permitDocument || undefined,
                    puc: pucDocument || undefined
                }
            };
        }

        const driver = await Driver.findByIdAndUpdate(
            req.user.id,
            updateData,
            { new: true }
        ).select("-password");

        res.json({
            success: true,
            message: "Profile updated successfully",
            driver
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Toggle Online/Offline Status
exports.toggleOnlineStatus = async (req, res) => {
    try {
        const driver = await Driver.findById(req.user.id);

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        // Check debt limit before allowing to go online
        if (!driver.isOnline && driver.walletBalance < (driver.debtLimit || -500)) {
            return res.status(403).json({
                success: false,
                message: `Cannot go online. Your debt (₹${Math.abs(driver.walletBalance)}) exceeds the limit. Please recharge.`
            });
        }

        driver.isOnline = !driver.isOnline;
        await driver.save();

        res.json({
            success: true,
            message: `Driver is now ${driver.isOnline ? 'Online' : 'Offline'}`,
            isOnline: driver.isOnline
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error toggling status",
            error: error.message
        });
    }
};

// Update Driver Location (Live Tracking)
exports.updateLocation = async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: "Latitude and longitude are required"
            });
        }

        const driver = await Driver.findByIdAndUpdate(
            req.user.id,
            {
                currentLocation: {
                    latitude,
                    longitude,
                    lastUpdated: new Date()
                }
            },
            { new: true }
        ).select("-password");

        res.json({
            success: true,
            message: "Location updated successfully",
            location: driver.currentLocation
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating location",
            error: error.message
        });
    }
};

// Get Available Drivers (Admin/Fleet)
exports.getAvailableDrivers = async (req, res) => {
    try {
        const drivers = await Driver.find({
            isOnline: true,
            isAvailable: true,
            isActive: true
        }).select("-password");

        res.json({
            success: true,
            count: drivers.length,
            drivers
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching drivers",
            error: error.message
        });
    }
};

// Get All Drivers (Admin/Fleet)
exports.getAllDrivers = async (req, res) => {
    try {
        // Bug Fix 1: createdByModel = "Self" ke liye populate crash karta tha
        // Pehle saare drivers lo bina populate ke
        const drivers = await Driver.find().select("-password").lean();

        // Phir sirf Admin/Fleet wale drivers ko populate karo
        const Admin = require("../models/Admin");
        const Fleet = require("../models/Fleet");

        const populatedDrivers = await Promise.all(
            drivers.map(async (driver) => {
                if (driver.createdByModel === "Admin" && driver.createdBy) {
                    const creator = await Admin.findById(driver.createdBy).select("name email").lean();
                    return { ...driver, createdBy: creator };
                } else if (driver.createdByModel === "Fleet" && driver.createdBy) {
                    const creator = await Fleet.findById(driver.createdBy).select("name email").lean();
                    return { ...driver, createdBy: creator };
                }
                // createdByModel === "Self" → createdBy null hi rahega
                return driver;
            })
        );

        res.json({
            success: true,
            count: populatedDrivers.length,
            drivers: populatedDrivers
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching drivers",
            error: error.message
        });
    }
};

// Get Single Driver (Admin/Fleet)
exports.getSingleDriver = async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id)
            .select("-password")
            .populate("createdBy", "name email");

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        res.json({
            success: true,
            driver
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching driver",
            error: error.message
        });
    }
};


// Delete Driver (Admin Only)
exports.deleteDriver = async (req, res) => {
    try {
        const driver = await Driver.findByIdAndDelete(req.params.id);

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        res.json({
            success: true,
            message: "Driver deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting driver",
            error: error.message
        });
    }
};

// Toggle Driver Status (Admin Only)
exports.toggleDriverStatus = async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        driver.isActive = !driver.isActive;
        await driver.save();

        res.json({
            success: true,
            message: `Driver is now ${driver.isActive ? 'Active' : 'Deactivated'}`,
            isActive: driver.isActive
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error toggling status",
            error: error.message
        });
    }
};

// Get Driver Location (Admin/Fleet)
exports.getDriverLocation = async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id)
            .select("name phone currentLocation isOnline isAvailable");

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        res.json({
            success: true,
            driver
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching location",
            error: error.message
        });
    }
};

// Get All Drivers Location (Admin/Fleet - For Live Tracking)
exports.getAllDriversLocation = async (req, res) => {
    try {
        const drivers = await Driver.find({ isOnline: true })
            .select("name phone currentLocation isAvailable assignedCar");

        res.json({
            success: true,
            count: drivers.length,
            drivers
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching locations",
            error: error.message
        });
    }
};

// Get Pending Drivers (Admin Only)
exports.getPendingDrivers = async (req, res) => {
    try {
        const drivers = await Driver.find({ isApproved: false, isRejected: false })
            .select("-password")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: drivers.length,
            drivers
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching pending drivers",
            error: error.message
        });
    }
};

// Get Approved Drivers (Admin Only)
exports.getApprovedDrivers = async (req, res) => {
    try {
        const drivers = await Driver.find({ isApproved: true })
            .select("-password")
            .populate("approvedBy", "name email")
            .sort({ approvedAt: -1 });

        res.json({
            success: true,
            count: drivers.length,
            drivers
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching approved drivers",
            error: error.message
        });
    }
};

// Approve Driver (Admin Only)
exports.approveDriver = async (req, res) => {
    try {
        const driver = await Driver.findById(req.params.id);

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        if (driver.isApproved) {
            return res.status(400).json({
                success: false,
                message: "Driver is already approved"
            });
        }

        driver.isApproved = true;
        driver.isActive = true;
        driver.approvedBy = req.user.id;
        driver.approvedAt = new Date();
        await driver.save();

        res.json({
            success: true,
            message: "Driver approved successfully",
            driver: {
                id: driver._id,
                name: driver.name,
                email: driver.email,
                isApproved: driver.isApproved,
                isActive: driver.isActive,
                approvedAt: driver.approvedAt
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error approving driver",
            error: error.message
        });
    }
};

// Reject Driver (Admin Only)
exports.rejectDriver = async (req, res) => {
    try {
        const { reason } = req.body;
        const driver = await Driver.findById(req.params.id);

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        driver.isRejected = true;
        driver.isActive = false;
        driver.rejectedBy = req.user.id;
        driver.rejectedAt = new Date();
        driver.rejectionReason = reason || "Not specified";
        await driver.save();

        res.json({
            success: true,
            message: `Driver registration rejected${reason ? ': ' + reason : ''}`,
            driver: {
                id: driver._id,
                name: driver.name,
                email: driver.email,
                isRejected: driver.isRejected,
                rejectionReason: driver.rejectionReason
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error rejecting driver",
            error: error.message
        });
    }
};

// Update Driver Manually (Admin Only)
exports.adminUpdateDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name, email, phone, password, licenseNumber, licenseExpiry, 
            address, city, state, pincode,
            carNumber, carModel, carBrand, carType, seatCapacity, carColor,
            manufacturingYear, insuranceExpiry, permitExpiry, pucExpiry,
            accountNumber, ifscCode, accountHolderName, bankName
        } = req.body;

        const driver = await Driver.findById(id);

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        // Update basic info
        if (name) driver.name = name;
        if (email) driver.email = email;
        if (phone) driver.phone = phone;
        if (licenseNumber) driver.licenseNumber = licenseNumber;
        if (licenseExpiry) driver.licenseExpiry = licenseExpiry;
        if (address) driver.address = address;
        if (city) driver.city = city;
        if (state) driver.state = state;
        if (pincode) driver.pincode = pincode;

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            driver.password = hashedPassword;
        }

        // Update image if provided
        if (req.file) {
            driver.image = req.file.filename;
        }

        // Update Car Details
        if (carNumber || carModel || carBrand || carType) {
            driver.carDetails = {
                carNumber: carNumber || driver.carDetails?.carNumber,
                carModel: carModel || driver.carDetails?.carModel,
                carBrand: carBrand || driver.carDetails?.carBrand,
                carType: carType || driver.carDetails?.carType,
                seatCapacity: seatCapacity || driver.carDetails?.seatCapacity || 4,
                carColor: carColor || driver.carDetails?.carColor,
                manufacturingYear: manufacturingYear || driver.carDetails?.manufacturingYear,
                insuranceExpiry: insuranceExpiry || driver.carDetails?.insuranceExpiry,
                permitExpiry: permitExpiry || driver.carDetails?.permitExpiry,
                pucExpiry: pucExpiry || driver.carDetails?.pucExpiry
            };
        }

        // Update Bank Details
        if (accountNumber || ifscCode || accountHolderName || bankName) {
            driver.bankDetails = {
                accountNumber: accountNumber || driver.bankDetails?.accountNumber,
                ifscCode: ifscCode || driver.bankDetails?.ifscCode,
                accountHolderName: accountHolderName || driver.bankDetails?.accountHolderName,
                bankName: bankName || driver.bankDetails?.bankName
            };
        }

        await driver.save();

        res.json({
            success: true,
            message: "Driver updated successfully by Admin",
            driver
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating driver",
            error: error.message
        });
    }
};
