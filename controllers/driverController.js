const Driver = require("../models/Driver");
const Booking = require("../models/Booking");
const Transaction = require("../models/Transaction");
const AppSetting = require("../models/AppSetting");
const jwt = require("jsonwebtoken");
const { isEmailTaken, isPhoneTaken } = require("../utils/globalUniqueness");
const bcrypt = require("bcryptjs");
const FleetCar = require("../models/FleetCar");
const FleetDriver = require("../models/FleetDriver");
const Admin = require("../models/Admin");
const DriverLead = require("../models/DriverLead"); // Added DriverLead
const FixedBooking = require("../models/FixedBooking");
const CarCategory = require("../models/CarCategory");
const User = require("../models/User");
const { sendPushNotification } = require("../utils/fcmNotification");

// Register Driver (Open Registration - Pending Admin Approval)
// Driver can register with car details
exports.registerDriver = async (req, res) => {
    try {
        let { 
            // Driver Details
            name, email, phone, password, licenseNumber, licenseExpiry, 
            address, city, state, pincode,
            aadharNumber, panNumber,
            addressLatitude, addressLongitude,
            accountNumber, ifscCode, accountHolderName, bankName,
            
            // Car Details (Optional for direct registration)
            vehicleType, carNumber, carModel, carBrand, carType, seatCapacity, carColor, 
            manufacturingYear, insuranceExpiry, permitExpiry, pucExpiry,
            
            // Referral
            referredByCode
        } = req.body;

        if (email) email = email.trim().toLowerCase();

        const image = req.files?.image ? req.files.image[0].filename : null;
        const rcImage        = req.files?.rcImage        ? req.files.rcImage[0].filename        : null;
        const insuranceImage = req.files?.insuranceImage ? req.files.insuranceImage[0].filename : null;
        const permitImage    = req.files?.permitImage    ? req.files.permitImage[0].filename    : null;
        const pucImage       = req.files?.pucImage       ? req.files.pucImage[0].filename       : null;
        const carImage       = req.files?.carImage       ? req.files.carImage[0].filename       : null;

        const aadhar = req.files?.aadhar ? req.files.aadhar[0].filename : null;
        const pan = req.files?.pan ? req.files.pan[0].filename : null;

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
            vehicleType: vehicleType || "Car",
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
            carImage,
            carDocuments: {
                rc:        rcImage,
                insurance: insuranceImage,
                permit:    permitImage,
                puc:       pucImage
            }
        } : undefined;

        // Generate a random unique referral code
        const generateReferralCode = async () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let code;
            let isUnique = false;
            while (!isUnique) {
                code = 'KWIK' + Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
                const existing = await Driver.findOne({ referralCode: code });
                if (!existing) isUnique = true;
            }
            return code;
        };
        const newReferralCode = await generateReferralCode();
        
        let referredById = null;
        if (referredByCode) {
            const referrer = await Driver.findOne({ referralCode: referredByCode.toUpperCase() });
            if (referrer) {
                referredById = referrer._id;
            }
        }

        // Saving password in plain text as requested
        const driver = await Driver.create({
            name,
            email,
            phone,
            password: password,
            image,
            referralCode: newReferralCode,
            referredBy: referredById,
            licenseNumber,
            licenseExpiry,
            address,
            city,
            state,
            pincode,
            addressLatitude,
            addressLongitude,
            aadharNumber,
            panNumber,
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

        // Update DriverLead status to CONVERTED if it exists
        try {
            await DriverLead.findOneAndUpdate(
                { mobile: phone, status: 'INCOMPLETE_REGISTRATION' },
                { status: 'CONVERTED' }
            );
        } catch (leadErr) {
            console.error("Error updating DriverLead status:", leadErr.message);
        }

        // 🔔 NOTIFY ADMINS: New Driver Registration
        try {
            const admins = await Admin.find({ fcmToken: { $ne: null } });
            if (admins.length > 0) {
                for (const admin of admins) {
                    await sendPushNotification(admin.fcmToken, {
                        title: "🆕 New Driver Registration",
                        body: `${name} has registered and is waiting for approval.`,
                        data: {
                            type: "NEW_DRIVER_REGISTRATION",
                            driverId: driver._id.toString()
                        }
                    });
                }
            }
        } catch (fcmErr) {
            console.error("FCM Error (New Driver Notification):", fcmErr.message);
        }

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
        let { email, password } = req.body;

        if (email) email = email.trim().toLowerCase();

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

        if (driver.isRejected) {
            return res.status(403).json({
                success: false,
                message: `Your registration was rejected by Admin. Reason: ${driver.rejectionReason || "Not specified"}`,
                driver: {
                    name: driver.name,
                    email: driver.email,
                    phone: driver.phone,
                    licenseNumber: driver.licenseNumber,
                    licenseExpiry: driver.licenseExpiry,
                    address: driver.address,
                    city: driver.city,
                    state: driver.state,
                    pincode: driver.pincode,
                    aadharNumber: driver.aadharNumber,
                    panNumber: driver.panNumber,
                    carDetails: driver.carDetails,
                    bankDetails: driver.bankDetails
                }
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
            { expiresIn: "365d" }
        );

        // Notify old devices to logout via Socket.io
        try {
            const { getIO } = require("../socket/socket");
            const io = getIO();
            io.to(driver._id.toString()).emit("force_logout", {
                message: "Session expired. Logged in from another device."
            });
        } catch (socketErr) {
            console.error("Socket emit error on login:", socketErr.message);
        }

        // Track single session token
        driver.activeSessionToken = token;
        await driver.save();

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
        let { 
            name, email, phone, password, 
            licenseNumber, licenseExpiry,
            address, city, state, pincode,
            aadharNumber, panNumber,
            addressLatitude, addressLongitude,
            accountNumber, ifscCode, accountHolderName, bankName,
            license, aadhar, pan,
            
            // Car Details
            vehicleType, carNumber, carModel, carBrand, carType, seatCapacity, carColor,
            manufacturingYear, insuranceExpiry, permitExpiry, pucExpiry,
            lastServiceDate, nextServiceDate,
            rcDocument, insuranceDocument, permitDocument, pucDocument
        } = req.body;

        if (email) email = email.trim().toLowerCase();

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
            pincode,
            aadharNumber,
            panNumber,
            addressLatitude,
            addressLongitude
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
        if (vehicleType || carNumber || carModel || carBrand || carType) {
            updateData["carDetails.vehicleType"]       = vehicleType || driverRecord.carDetails?.vehicleType || "Car";
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
        if (req.files?.carImage)       updateData["carDetails.carImage"]               = req.files.carImage[0].filename;

        // Fallback: text-based document paths (if sent as strings, not files)
        if (!req.files?.rcImage        && rcDocument)        updateData["carDetails.carDocuments.rc"]        = rcDocument;
        if (!req.files?.insuranceImage && insuranceDocument) updateData["carDetails.carDocuments.insurance"] = insuranceDocument;
        if (!req.files?.permitImage    && permitDocument)    updateData["carDetails.carDocuments.permit"]    = permitDocument;
        if (!req.files?.pucImage       && pucDocument)       updateData["carDetails.carDocuments.puc"]       = pucDocument;
        if (!req.files?.carImage       && req.body.carImageText) updateData["carDetails.carImage"]       = req.body.carImageText;

        const driver = await Driver.findByIdAndUpdate(
            req.user.id,
            updateData,
            { returnDocument: 'after' }
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

        // 🎯 Real-time Status Update to Admin Panel
        try {
            const { getIO } = require("../socket/socket");
            const io = getIO();
            
            let activityStatus = "Offline";
            if (driver.isOnline) {
                if (driver.isAvailable) activityStatus = "Idle";
                else activityStatus = driver.currentRideType === "Shared" ? "On Shared Ride" : "On Private Ride";
            }

            io.to('admin_room').emit("driver_location_update", {
                driverId: driver._id.toString(),
                status: activityStatus,
                latitude: driver.currentLocation?.latitude,
                longitude: driver.currentLocation?.longitude,
                heading: driver.currentHeading || 0
            });
            console.log(`Admin notified of Driver ${driver.name} status change to ${activityStatus} 🟢`);
        } catch (err) {
            console.error("Socket Error (toggleStatus):", err.message);
        }

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
            { returnDocument: 'after' }
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

        // Phir sirf Admin/Fleet/Vendor wale drivers ko populate karo
        const Admin = require("../models/Admin");
        const Fleet = require("../models/Fleet");
        const Vendor = require("../models/Vendor");

        const populatedDrivers = await Promise.all(
            drivers.map(async (driver) => {
                if (driver.createdByModel === "Admin" && driver.createdBy) {
                    const creator = await Admin.findById(driver.createdBy).select("name email").lean();
                    return { ...driver, createdBy: creator };
                } else if (driver.createdByModel === "Fleet" && driver.createdBy) {
                    const creator = await Fleet.findById(driver.createdBy).select("name email").lean();
                    return { ...driver, createdBy: creator };
                } else if (driver.createdByModel === "Vendor" && driver.createdBy) {
                    const creator = await Vendor.findById(driver.createdBy).select("name email companyName").lean();
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
        const driver = await Driver.findById(req.params.id);

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        // 🔔 NOTIFY DRIVER: Account Deleted
        if (driver.fcmToken) {
            try {
                await sendPushNotification(driver.fcmToken, {
                    title: "🗑️ Account Deleted",
                    body: `Your account has been deleted by the Administrator. Please contact support if you have questions.`,
                    data: {
                        type: "ACCOUNT_DELETED"
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (Driver Deletion):", fcmErr.message);
            }
        }

        await Driver.findByIdAndDelete(req.params.id);

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

        // 🔔 NOTIFY DRIVER: Account Status Change (Active/Inactive)
        if (driver.fcmToken) {
            try {
                await sendPushNotification(driver.fcmToken, {
                    title: `🛡️ Account Status Update`,
                    body: `Your account has been ${driver.isActive ? 'ACTIVATED' : 'DEACTIVATED'} by the Administrator.`,
                    data: {
                        type: "ACCOUNT_STATUS_TOGGLE",
                        isActive: driver.isActive.toString()
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (Account Status Toggle):", fcmErr.message);
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
        
        // 🚀 INCENTIVE SYSTEM: Check for Joining & Referral Bonuses
        try {
            const settings = await AppSetting.findOne();
            if (settings && settings.enableDriverIncentive) {
                // Joining Bonus
                if (settings.driverJoiningBonus > 0) {
                    driver.walletBalance += settings.driverJoiningBonus;
                    await driver.save();
                    
                    await Transaction.create({
                        user: driver._id,
                        userModel: "Driver",
                        amount: settings.driverJoiningBonus,
                        type: "Credit",
                        category: "Joining Bonus",
                        description: `Received joining bonus of ₹${settings.driverJoiningBonus}`,
                        status: "Completed"
                    });
                }
                
                // Referral Bonus
                if (settings.driverReferralBonus > 0 && driver.referredBy) {
                    const referrer = await Driver.findById(driver.referredBy);
                    if (referrer) {
                        referrer.walletBalance += settings.driverReferralBonus;
                        await referrer.save();
                        
                        await Transaction.create({
                            user: referrer._id,
                            userModel: "Driver",
                            amount: settings.driverReferralBonus,
                            type: "Credit",
                            category: "Referral Bonus",
                            description: `Received referral bonus for inviting ${driver.name}`,
                            status: "Completed"
                        });
                    }
                }
            }
        } catch (incentiveErr) {
            console.error("Incentive error during approval:", incentiveErr.message);
        }

        // 🚀 SYNC: If this is a Fleet Driver, approve their Fleet records too
        try {
            if (driver.createdByModel === "Fleet") {
                // 1. Approve Fleet Car if assigned
                if (driver.carDetails && driver.carDetails.carNumber) {
                    await FleetCar.findOneAndUpdate(
                        { carNumber: driver.carDetails.carNumber },
                        { isApproved: true, isActive: true }
                    );
                }
                
                // 2. Approve Fleet Driver
                await FleetDriver.findOneAndUpdate(
                    { email: driver.email },
                    { isApproved: true }
                );
            }
        } catch (syncErr) {
            console.error("Fleet sync error during approval:", syncErr.message);
        }

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

        // 🔔 NOTIFY DRIVER: Approval Message
        if (driver.fcmToken) {
            try {
                await sendPushNotification(driver.fcmToken, {
                    title: "🎉 Account Approved!",
                    body: `Congratulations ${driver.name}! Admin has approved your account. You can now start accepting rides.`,
                    data: {
                        type: "DRIVER_APPROVAL",
                        driverId: driver._id.toString()
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (Driver Approval):", fcmErr.message);
            }
        }

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

        // 🔔 NOTIFY DRIVER: Rejection Message
        if (driver.fcmToken) {
            try {
                await sendPushNotification(driver.fcmToken, {
                    title: "⚠️ Registration Rejected",
                    body: `Your account registration was rejected. Reason: ${driver.rejectionReason}`,
                    data: {
                        type: "DRIVER_REJECTION",
                        reason: driver.rejectionReason
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (Driver Rejection):", fcmErr.message);
            }
        }

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
            address, city, state, pincode, aadharNumber, panNumber,
            addressLatitude, addressLongitude,
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
        if (aadharNumber !== undefined) driver.aadharNumber = aadharNumber;
        if (panNumber !== undefined) driver.panNumber = panNumber;
        if (addressLatitude !== undefined) driver.addressLatitude = addressLatitude;
        if (addressLongitude !== undefined) driver.addressLongitude = addressLongitude;
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

        // 🔔 NOTIFY DRIVER: Profile Updated by Admin
        if (driver.fcmToken) {
            try {
                await sendPushNotification(driver.fcmToken, {
                    title: "📝 Profile Updated by Admin",
                    body: `Your profile details have been updated by the Administrator. Please check your app for changes.`,
                    data: {
                        type: "PROFILE_UPDATED_BY_ADMIN"
                    }
                });
            } catch (fcmErr) {
                console.error("FCM Error (Admin Profile Update):", fcmErr.message);
            }
        }

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

// Resubmit Documents for Rejected Drivers
exports.resubmitDriverDocuments = async (req, res) => {
    try {
        const { email, phone } = req.body;

        if (!email && !phone) {
            return res.status(400).json({ success: false, message: "Email or Phone is required to identify the driver" });
        }

        const query = email ? { email } : { phone };
        const driver = await Driver.findOne(query);

        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        if (!driver.isRejected) {
            return res.status(400).json({ success: false, message: "Only rejected drivers can use this option. Your account is either approved or already pending." });
        }

        // Update basic info if provided (optional)
        const { name, address, city, state, pincode, licenseNumber, licenseExpiry } = req.body;
        if (name) driver.name = name;
        if (address) driver.address = address;
        if (city) driver.city = city;
        if (state) driver.state = state;
        if (pincode) driver.pincode = pincode;
        if (licenseNumber) driver.licenseNumber = licenseNumber;
        if (licenseExpiry) driver.licenseExpiry = licenseExpiry;

        // Safety: Ensure nested objects exist
        if (!driver.carDetails) driver.carDetails = {};
        if (!driver.carDetails.carDocuments) driver.carDetails.carDocuments = {};
        if (!driver.documents) driver.documents = {};

        // Update documents (files)
        if (req.files?.image) driver.image = req.files.image[0].filename;
        if (req.files?.rcImage) driver.carDetails.carDocuments.rc = req.files.rcImage[0].filename;
        if (req.files?.insuranceImage) driver.carDetails.carDocuments.insurance = req.files.insuranceImage[0].filename;
        if (req.files?.permitImage) driver.carDetails.carDocuments.permit = req.files.permitImage[0].filename;
        if (req.files?.pucImage) driver.carDetails.carDocuments.puc = req.files.pucImage[0].filename;
        if (req.files?.aadhar) driver.documents.aadhar = req.files.aadhar[0].filename;
        if (req.files?.pan) driver.documents.pan = req.files.pan[0].filename;

        // Reset rejection status
        driver.isRejected = false;
        driver.rejectionReason = null;
        driver.isActive = false; 
        driver.isApproved = false;

        // Important: Mark modified for nested objects
        driver.markModified("carDetails");
        driver.markModified("documents");

        await driver.save();

        res.status(200).json({
            success: true,
            message: "Documents resubmitted successfully. Waiting for admin approval.",
            driver
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error resubmitting documents",
            error: error.message
        });
    }
};

// Update Driver's FCM Token
exports.updateFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        const driverId = req.user.id;

        if (!fcmToken) {
            return res.status(400).json({ success: false, message: "FCM Token is required" });
        }

        const driver = await Driver.findByIdAndUpdate(
            driverId,
            { fcmToken },
            { new: true }
        );

        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        // Subscribe to Topics for Broadcasts
        try {
            const { subscribeToTopic } = require("../utils/fcmNotification");
            await subscribeToTopic(fcmToken, "all");
            await subscribeToTopic(fcmToken, "driver");
        } catch (topicErr) {
            console.error("Driver Topic Sync Error:", topicErr.message);
        }

        res.json({
            success: true,
            message: "FCM Token and Topics updated successfully"
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error updating FCM token", error: error.message });
    }
};

// --- NEW: Destination Filter ---
exports.setDestinationFilter = async (req, res) => {
    try {
        const { latitude, longitude, address } = req.body;
        const driverId = req.user.id;

        const driver = await Driver.findById(driverId);
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Reset count if it's a new day
        if (!driver.destinationFilterDate || driver.destinationFilterDate < today) {
            driver.destinationFilterCount = 0;
            driver.destinationFilterDate = today;
        }

        if (driver.destinationFilterCount >= 4) {
            return res.status(400).json({ success: false, message: "You have reached the limit of 4 destination filters per day." });
        }

        driver.destinationFilterActive = true;
        driver.preferredDestination = {
            latitude,
            longitude,
            address: address || "Custom Destination"
        };
        driver.destinationFilterCount += 1;
        
        await driver.save();

        res.json({
            success: true,
            message: "Destination filter activated successfully.",
            destinationFilterCount: driver.destinationFilterCount
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

exports.clearDestinationFilter = async (req, res) => {
    try {
        const driverId = req.user.id;

        const driver = await Driver.findById(driverId);
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

        driver.destinationFilterActive = false;
        driver.preferredDestination = { latitude: null, longitude: null, address: "" };
        
        await driver.save();

        res.json({
            success: true,
            message: "Destination filter cleared."
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Change Driver / Car Ownership (Direct ↔ Vendor)
exports.changeDriverOwnership = async (req, res) => {
    try {
        const { id } = req.params;
        const { targetType, vendorId } = req.body; // targetType: 'Vendor' or 'Direct'

        if (!targetType || !["Vendor", "Direct"].includes(targetType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid targetType. Must be 'Vendor' or 'Direct'."
            });
        }

        const driver = await Driver.findById(id);
        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found."
            });
        }

        const Vendor = require("../models/Vendor");

        // Step 1: Agar driver pehle kisi Vendor ke under tha, purane vendor ka count decrement karo
        if (driver.createdByModel === "Vendor" && driver.createdBy) {
            if (targetType === "Vendor" && driver.createdBy.toString() === vendorId) {
                return res.status(400).json({
                    success: false,
                    message: "Yeh driver pehle se hi is Vendor ke under assigned hai."
                });
            }
            await Vendor.findByIdAndUpdate(driver.createdBy, { $inc: { totalDrivers: -1 } });
        }

        // Step 2: Target ke hisaab se ownership update karo
        if (targetType === "Vendor") {
            if (!vendorId) {
                return res.status(400).json({
                    success: false,
                    message: "Vendor ID is required when transferring to a Vendor."
                });
            }

            const targetVendor = await Vendor.findById(vendorId);
            if (!targetVendor) {
                return res.status(404).json({
                    success: false,
                    message: "Selected Vendor not found."
                });
            }

            // Increment new vendor's driver count
            await Vendor.findByIdAndUpdate(vendorId, { $inc: { totalDrivers: 1 } });

            driver.createdBy = vendorId;
            driver.createdByModel = "Vendor";
            await driver.save();

            return res.json({
                success: true,
                message: `Driver/Car successfully transferred to Vendor '${targetVendor.name}' (${targetVendor.companyName || ''})!`,
                driver: {
                    ...driver.toObject(),
                    createdBy: {
                        _id: targetVendor._id,
                        name: targetVendor.name,
                        email: targetVendor.email,
                        companyName: targetVendor.companyName
                    }
                }
            });
        } else if (targetType === "Direct") {
            driver.createdBy = req.user?.id || null;
            driver.createdByModel = "Admin";
            await driver.save();

            return res.json({
                success: true,
                message: "Driver/Car successfully moved to Direct (Admin/Platform)!",
                driver: {
                    ...driver.toObject(),
                    createdBy: null
                }
            });
        }
    } catch (error) {
        console.error("Change Driver Ownership Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while changing ownership",
            error: error.message
        });
    }
};

// Get Driver Full History (Profile, Day 1 Lifetime Transactions, Day 1 Lifetime Rides)
exports.getDriverFullHistory = async (req, res) => {
    try {
        const { id } = req.params;

        const driverDoc = await Driver.findById(id)
            .populate({ path: "carDetails.carType", select: "name seatLayout icon", strictPopulate: false })
            .populate({ path: "referredBy", select: "name phone", strictPopulate: false })
            .lean();

        if (!driverDoc) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        const driver = { ...driverDoc };

        // Safely resolve createdBy if Admin, Fleet or Vendor
        if (driver.createdBy && driver.createdByModel) {
            try {
                if (driver.createdByModel === "Admin") {
                    const Admin = require("../models/Admin");
                    driver.createdBy = await Admin.findById(driver.createdBy).select("name email").lean();
                } else if (driver.createdByModel === "Fleet") {
                    const Fleet = require("../models/Fleet");
                    driver.createdBy = await Fleet.findById(driver.createdBy).select("name email").lean();
                } else if (driver.createdByModel === "Vendor") {
                    const Vendor = require("../models/Vendor");
                    driver.createdBy = await Vendor.findById(driver.createdBy).select("name email companyName").lean();
                }
            } catch (popErr) {
                console.warn("Could not populate createdBy:", popErr.message);
            }
        }

        // 1. Fetch All Lifetime Transactions for this Driver (from Day 1)
        const transactions = await Transaction.find({
            user: id,
            userModel: "Driver"
        })
            .populate("relatedBooking", "bookingStatus pickup drop")
            .sort({ createdAt: -1 });

        // Calculate Wallet Stats
        const totalCredits = transactions
            .filter(t => t.type === "Credit")
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        const totalDebits = transactions
            .filter(t => t.type === "Debit")
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        const totalRideEarnings = transactions
            .filter(t => t.category === "Ride Earning" && t.type === "Credit")
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        const totalCommissionPaid = transactions
            .filter(t => t.category === "Commission" && t.type === "Debit")
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        // 2. Fetch All Lifetime Rides assigned to this Driver (from Day 1)
        // City / Regular Bookings
        const regularBookings = await Booking.find({ assignedDriver: id })
            .populate("user", "name phone email image")
            .populate("assignedCar", "carNumber carModel")
            .sort({ createdAt: -1 });

        // Fixed / Package Bookings
        const fixedBookings = await FixedBooking.find({ assignedDriver: id })
            .populate("user", "name phone email image")
            .populate("agent", "name phone email")
            .populate("carCategory", "name icon")
            .sort({ createdAt: -1 });

        // Unified format for rides
        const formattedRegular = regularBookings.map(b => {
            const fare = Number(b.actualFare || b.fareEstimate || 0);
            const driverEarning = Math.max(0, fare - (Number(b.adminCommission) || 0) - (Number(b.agentCommission) || 0));
            return {
                _id: b._id,
                bookingId: b._id.toString().slice(-8).toUpperCase(),
                type: "City Ride",
                rideType: b.tripType || "Regular Ride",
                carCategory: b.assignedCar?.carModel || driver.carDetails?.carModel || "Standard",
                pickup: b.pickup?.address || "N/A",
                drop: b.drop?.address || "N/A",
                fare,
                driverEarning,
                adminCommission: Number(b.adminCommission) || 0,
                status: b.bookingStatus || "Pending",
                paymentMethod: b.paymentMethod || "Cash",
                paymentStatus: b.paymentStatus || "Pending",
                createdAt: b.createdAt,
                date: b.pickupDate || b.createdAt,
                pickupTime: b.pickupTime || "",
                distanceKm: b.estimatedDistanceKm || 0,
                customer: {
                    name: b.user?.name || b.customerName || "Passenger",
                    phone: b.user?.phone || b.customerPhone || "N/A",
                    email: b.user?.email || "",
                    image: b.user?.image || null
                }
            };
        });

        const formattedFixed = fixedBookings.map(b => {
            const fare = Number(b.totalWithTax || b.price || 0);
            const driverEarning = Math.max(0, fare - (Number(b.adminCommission) || 0) - (Number(b.agentCommission) || 0));
            return {
                _id: b._id,
                bookingId: b._id.toString().slice(-8).toUpperCase(),
                type: "Package Ride",
                rideType: b.tripType || "Fixed Package",
                carCategory: b.carCategory?.name || driver.carDetails?.carModel || "Standard",
                pickup: b.pickupLocation || "N/A",
                drop: b.dropLocation || "N/A",
                fare,
                driverEarning,
                adminCommission: Number(b.adminCommission) || 0,
                status: b.status || "Marketplace",
                paymentMethod: b.paymentMethod || "Cash",
                paymentStatus: b.paymentStatus || "Pending",
                createdAt: b.createdAt,
                date: b.pickupDate || b.createdAt,
                pickupTime: b.pickupTime || "",
                distanceKm: b.maxDistanceKm || 0,
                customer: {
                    name: b.user?.name || b.customerName || (b.agent ? `Agent Client (${b.agent.name})` : "Passenger"),
                    phone: b.user?.phone || b.customerPhone || b.agent?.phone || "N/A",
                    email: b.user?.email || b.agent?.email || "",
                    image: b.user?.image || null
                }
            };
        });

        const allRides = [...formattedRegular, ...formattedFixed].sort(
            (a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
        );

        // Ride Stats
        const totalRides = allRides.length;
        const completedRides = allRides.filter(r => r.status === "Completed").length;
        const cancelledRides = allRides.filter(r => r.status === "Cancelled").length;
        const activeRides = allRides.filter(r => ["Accepted", "Ongoing", "Started"].includes(r.status)).length;
        const totalFareGenerated = allRides
            .filter(r => r.status === "Completed")
            .reduce((sum, r) => sum + (Number(r.fare) || 0), 0);
        const totalDriverEarningsCalculated = allRides
            .filter(r => r.status === "Completed")
            .reduce((sum, r) => sum + (Number(r.driverEarning) || 0), 0);

        // Calculate Driver Platform Tenure (Joined Age)
        const joinDate = driver.createdAt ? new Date(driver.createdAt) : new Date();
        const now = new Date();
        const diffMs = now - joinDate;
        const totalDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        const years = Math.floor(totalDays / 365);
        const remDaysAfterYears = totalDays % 365;
        const months = Math.floor(remDaysAfterYears / 30);
        const days = remDaysAfterYears % 30;

        let tenureText = "";
        if (years > 0) {
            tenureText = `${years} Year${years > 1 ? "s" : ""}${months > 0 ? `, ${months} Month${months > 1 ? "s" : ""}` : ""}`;
        } else if (months > 0) {
            tenureText = `${months} Month${months > 1 ? "s" : ""}${days > 0 ? `, ${days} Day${days > 1 ? "s" : ""}` : ""}`;
        } else if (days > 0) {
            tenureText = `${days} Day${days > 1 ? "s" : ""}`;
        } else {
            tenureText = "Joined Today";
        }

        res.status(200).json({
            success: true,
            driver,
            tenure: {
                tenureText,
                totalDays,
                joinedDate: driver.createdAt
            },
            wallet: {
                walletBalance: driver.walletBalance || 0,
                totalEarnings: driver.totalEarnings || totalDriverEarningsCalculated,
                debtLimit: driver.debtLimit || -500,
                totalCredits,
                totalDebits,
                totalRideEarnings,
                totalCommissionPaid,
                transactionsCount: transactions.length,
                transactions
            },
            rides: {
                totalRides,
                completedRides,
                cancelledRides,
                activeRides,
                totalFareGenerated,
                totalDriverEarningsCalculated,
                allRides,
                regularRides: formattedRegular,
                fixedRides: formattedFixed
            }
        });

    } catch (error) {
        console.error("Error fetching driver full history:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching driver full history",
            error: error.message
        });
    }
};


