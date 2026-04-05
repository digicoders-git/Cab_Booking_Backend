const Driver = require("../models/Driver");
const Booking = require("../models/Booking");
const Transaction = require("../models/Transaction");
const jwt = require("jsonwebtoken");
const { isEmailTaken, isPhoneTaken } = require("../utils/globalUniqueness");
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

        const image = req.files?.image ? req.files.image[0].filename : null;
        const rcImage        = req.files?.rcImage        ? req.files.rcImage[0].filename        : null;
        const insuranceImage = req.files?.insuranceImage ? req.files.insuranceImage[0].filename : null;
        const permitImage    = req.files?.permitImage    ? req.files.permitImage[0].filename    : null;
        const pucImage       = req.files?.pucImage       ? req.files.pucImage[0].filename       : null;

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

        // Check if car number already exists (if provided)
        if (carNumber) {
            const carExist = await Driver.findOne({ "carDetails.carNumber": carNumber });
            if (carExist) {
                return res.status(400).json({ success: false, message: "Car number is already registered" });
            }
        }

        // Check if license number already exists
        if (licenseNumber) {
            const licenseExist = await Driver.findOne({ licenseNumber });
            if (licenseExist) {
                return res.status(400).json({ success: false, message: "License number is already registered" });
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
            pucExpiry,
            carDocuments: {
                rc:        rcImage,
                insurance: insuranceImage,
                permit:    permitImage,
                puc:       pucImage
            }
        } : undefined;

        // Saving password in plain text as requested
        const driver = await Driver.create({
            name,
            email,
            phone,
            password: password,
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

        // Compare plainly
        const isPasswordMatch = password === driver.password;
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

        const id = req.user.id;
        const driverRecord = await Driver.findById(id);
        if (!driverRecord) return res.status(404).json({ success: false, message: "Driver not found" });

        // Check global email uniqueness if changed
        if (email && email !== driverRecord.email) {
            const emailTakenBy = await isEmailTaken(email, id);
            if (emailTakenBy) return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
        }

        // Check global phone uniqueness if changed
        if (phone && phone !== driverRecord.phone) {
            const phoneTakenBy = await isPhoneTaken(phone, id);
            if (phoneTakenBy) return res.status(400).json({ success: false, message: `Phone number is already registered as ${phoneTakenBy}` });
        }

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

        if (req.files?.image) {
            updateData.image = req.files.image[0].filename;
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

        // Update Car Details (text fields)
        if (carNumber || carModel || carBrand || carType) {
            updateData["carDetails.carNumber"]         = carNumber;
            updateData["carDetails.carModel"]          = carModel;
            updateData["carDetails.carBrand"]          = carBrand;
            updateData["carDetails.carType"]           = carType;
            updateData["carDetails.seatCapacity"]      = seatCapacity || 4;
            updateData["carDetails.carColor"]          = carColor;
            updateData["carDetails.manufacturingYear"] = manufacturingYear;
            updateData["carDetails.insuranceExpiry"]   = insuranceExpiry;
            updateData["carDetails.permitExpiry"]      = permitExpiry;
            updateData["carDetails.pucExpiry"]         = pucExpiry;
            updateData["carDetails.lastServiceDate"]   = lastServiceDate;
            updateData["carDetails.nextServiceDate"]   = nextServiceDate;
        }

        // Update Car Documents — works even if ONLY files are uploaded (no text fields needed)
        if (req.files?.rcImage)        updateData["carDetails.carDocuments.rc"]        = req.files.rcImage[0].filename;
        if (req.files?.insuranceImage) updateData["carDetails.carDocuments.insurance"] = req.files.insuranceImage[0].filename;
        if (req.files?.permitImage)    updateData["carDetails.carDocuments.permit"]    = req.files.permitImage[0].filename;
        if (req.files?.pucImage)       updateData["carDetails.carDocuments.puc"]       = req.files.pucImage[0].filename;

        // Fallback: text-based document paths (if sent as strings, not files)
        if (!req.files?.rcImage        && rcDocument)        updateData["carDetails.carDocuments.rc"]        = rcDocument;
        if (!req.files?.insuranceImage && insuranceDocument) updateData["carDetails.carDocuments.insurance"] = insuranceDocument;
        if (!req.files?.permitImage    && permitDocument)    updateData["carDetails.carDocuments.permit"]    = permitDocument;
        if (!req.files?.pucImage       && pucDocument)       updateData["carDetails.carDocuments.puc"]       = pucDocument;

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
        const { latitude, longitude } = req.body;
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
        
        // Update location if coordinates are provided in the request
        if (latitude !== undefined && longitude !== undefined) {
            driver.currentLocation = {
                latitude,
                longitude,
                lastUpdated: new Date()
            };
        }

        await driver.save();

        res.json({
            success: true,
            message: `Driver is now ${driver.isOnline ? 'Online' : 'Offline'}`,
            isOnline: driver.isOnline,
            location: driver.currentLocation
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

        if (latitude === undefined || longitude === undefined) {
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
        });

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
        const drivers = await Driver.find().lean();

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
            lastServiceDate, nextServiceDate, debtLimit,
            accountNumber, ifscCode, accountHolderName, bankName,
            aadhar, pan
        } = req.body;

        const driver = await Driver.findById(id);

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        // Check global duplicates before updating
        if (email && email !== driver.email) {
            const emailTakenBy = await isEmailTaken(email, id);
            if (emailTakenBy) return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
        }
        if (phone && phone !== driver.phone) {
            const phoneTakenBy = await isPhoneTaken(phone, id);
            if (phoneTakenBy) return res.status(400).json({ success: false, message: `Phone number is already registered as ${phoneTakenBy}` });
        }
        if (carNumber && carNumber !== driver.carDetails?.carNumber) {
            const existing = await Driver.findOne({ "carDetails.carNumber": carNumber });
            if (existing) return res.status(400).json({ success: false, message: "Car number is already registered" });
        }
        if (licenseNumber && licenseNumber !== driver.licenseNumber) {
            const existing = await Driver.findOne({ licenseNumber });
            if (existing) return res.status(400).json({ success: false, message: "License number is already registered" });
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
        if (debtLimit !== undefined) driver.debtLimit = debtLimit;

        if (password) {
            driver.password = password;
        }

        // Update main image
        if (req.files?.image) {
            driver.image = req.files.image[0].filename;
        }

        // Update Documents (text versions)
        if (aadhar || pan) {
            driver.documents = {
                license: licenseNumber || driver.documents?.license,
                aadhar: aadhar || driver.documents?.aadhar,
                pan: pan || driver.documents?.pan
            };
        }

        // 4. Update Car Details and Document Images
        if (
            carNumber || carModel || carBrand || carType || lastServiceDate || nextServiceDate || 
            req.files?.rcImage || req.files?.insuranceImage || req.files?.permitImage || req.files?.pucImage
        ) {
            // First initialize object if missing
            if (!driver.carDetails) driver.carDetails = {};
            if (!driver.carDetails.carDocuments) driver.carDetails.carDocuments = {};

            // Update basic car text fields
            if (carNumber) driver.carDetails.carNumber = carNumber;
            if (carModel) driver.carDetails.carModel = carModel;
            if (carBrand) driver.carDetails.carBrand = carBrand;
            if (carType) driver.carDetails.carType = carType;
            if (seatCapacity) driver.carDetails.seatCapacity = seatCapacity;
            if (carColor) driver.carDetails.carColor = carColor;
            if (manufacturingYear) driver.carDetails.manufacturingYear = manufacturingYear;
            if (insuranceExpiry) driver.carDetails.insuranceExpiry = insuranceExpiry;
            if (permitExpiry) driver.carDetails.permitExpiry = permitExpiry;
            if (pucExpiry) driver.carDetails.pucExpiry = pucExpiry;
            if (lastServiceDate) driver.carDetails.lastServiceDate = lastServiceDate;
            if (nextServiceDate) driver.carDetails.nextServiceDate = nextServiceDate;

            // Update images
            if (req.files?.rcImage)        driver.carDetails.carDocuments.rc        = req.files.rcImage[0].filename;
            if (req.files?.insuranceImage) driver.carDetails.carDocuments.insurance = req.files.insuranceImage[0].filename;
            if (req.files?.permitImage)    driver.carDetails.carDocuments.permit    = req.files.permitImage[0].filename;
            if (req.files?.pucImage)       driver.carDetails.carDocuments.puc       = req.files.pucImage[0].filename;
            
            // Explicitly mark for Mongoose update
            driver.markModified('carDetails');
        }

        // Update Bank Details
        if (accountNumber || ifscCode || accountHolderName || bankName) {
            if (!driver.bankDetails) driver.bankDetails = {};
            if (accountNumber)      driver.bankDetails.accountNumber     = accountNumber;
            if (ifscCode)           driver.bankDetails.ifscCode          = ifscCode;
            if (accountHolderName)  driver.bankDetails.accountHolderName = accountHolderName;
            if (bankName)           driver.bankDetails.bankName          = bankName;
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

// Get Driver Dashboard Report Summary
exports.getDriverReport = async (req, res) => {
    try {
        const driverId = req.user.id;
        
        // 1. Fetch Basic Driver Profile
        const driver = await Driver.findById(driverId)
            .select("name walletBalance rating totalTrips totalEarnings isOnline isApproved");
            
        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        // 2. Fetch Trips Summary (Completed and Cancelled counts)
        const [totalCompletedTrips, totalCancelledTrips] = await Promise.all([
            Booking.countDocuments({ assignedDriver: driverId, bookingStatus: "Completed" }),
            Booking.countDocuments({ assignedDriver: driverId, bookingStatus: "Cancelled" })
        ]);

        // 3. Fetch Earnings Summary (Today, This Week, This Month)
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Fetch Transactions for earnings (ride earnings only)
        const earnings = await Transaction.find({
            user: driverId,
            type: "Credit",
            category: "Ride Earning"
        });

        // Calculate aggregated earnings
        const todayEarnings = earnings
            .filter(t => t.createdAt >= startOfToday)
            .reduce((sum, t) => sum + t.amount, 0);

        const weekEarnings = earnings
            .filter(t => t.createdAt >= startOfWeek)
            .reduce((sum, t) => sum + t.amount, 0);

        const monthEarnings = earnings
            .filter(t => t.createdAt >= startOfMonth)
            .reduce((sum, t) => sum + t.amount, 0);

        // 4. Fetch Recent Transactions
        const recentTransactions = await Transaction.find({ user: driverId })
            .sort({ createdAt: -1 })
            .limit(10);

        res.json({
            success: true,
            report: {
                driver,
                tripSummary: {
                    completedTrips: totalCompletedTrips,
                    cancelledTrips: totalCancelledTrips
                },
                earningsSummary: {
                    today: todayEarnings,
                    thisWeek: weekEarnings,
                    thisMonth: monthEarnings,
                    totalPlatformEarnings: driver.totalEarnings
                },
                recentTransactions
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching driver report",
            error: error.message
        });
    }
};
