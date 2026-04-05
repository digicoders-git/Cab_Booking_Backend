const Vendor = require("../models/Vendor");
const Driver = require("../models/Driver");
const Fleet = require("../models/Fleet");
const Transaction = require("../models/Transaction");
const Booking = require("../models/Booking");
const jwt = require("jsonwebtoken");
const { isEmailTaken, isPhoneTaken } = require("../utils/globalUniqueness");

// ============================================================
// 1. Create Vendor (Admin Only)
// ============================================================
exports.createVendor = async (req, res) => {
    try {
        const {
            name, email, phone, password, companyName,
            assignedArea, commissionPercentage,
            address, city, state, pincode,
            accountNumber, ifscCode, accountHolderName, bankName
        } = req.body;

        if (!name || !email || !phone || !password || !companyName || !assignedArea) {
            return res.status(400).json({
                success: false,
                message: "Name, email, phone, password, companyName aur assignedArea required hain"
            });
        }

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

        // Handle documents from uploadProfile.fields if used, or fallback to single image
        const image = req.files?.image ? req.files.image[0].filename : (req.file ? req.file.filename : null);
        const aadhar = req.files?.aadhar ? req.files.aadhar[0].filename : null;
        const pan = req.files?.pan ? req.files.pan[0].filename : null;
        const gst = req.files?.gst ? req.files.gst[0].filename : null;

        const vendor = await Vendor.create({
            name,
            email,
            phone,
            password,
            companyName,
            assignedArea,
            image, // Photo
            documents: {
                aadhar,
                pan,
                gst
            },
            commissionPercentage: commissionPercentage || 25, // Default 25%
            address, city, state, pincode,
            bankDetails: { accountNumber, ifscCode, accountHolderName, bankName },
            isActive: true,
            createdBy: req.user.id
        });

        res.status(201).json({
            success: true,
            message: `Vendor '${name}' create ho gaya! Unhe ${commissionPercentage || 25}% commission milega har trip par.`,
            vendor
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 2. Vendor Login
// ============================================================
exports.loginVendor = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email aur password required hain" });
        }

        const vendor = await Vendor.findOne({ email });

        if (!vendor) {
            return res.status(404).json({ success: false, message: "Vendor nahi mila" });
        }

        if (!vendor.isActive) {
            return res.status(403).json({ success: false, message: "Aapka account Admin ne deactivate kar diya hai" });
        }

        if (vendor.password !== password) {
            return res.status(400).json({ success: false, message: "Invalid password" });
        }

        const token = jwt.sign(
            { id: vendor._id, role: "vendor" },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            vendor
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 3. Get Vendor Profile (Vendor: Apna, Admin: Kisi ka bhi)
// ============================================================
exports.getVendorProfile = async (req, res) => {
    try {
        const vendor = await Vendor.findById(req.user.id).select("-password");

        if (!vendor) {
            return res.status(404).json({ success: false, message: "Vendor nahi mila" });
        }

        res.json({ success: true, vendor });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
// ============================================================
// 4. Update Self Profile (Vendor Only)
// ============================================================
exports.updateSelfProfile = async (req, res) => {
    try {
        const {
            name, email, phone, password,
            address, city, state, pincode,
            accountNumber, ifscCode, accountHolderName, bankName
        } = req.body;

        const vendor = await Vendor.findById(req.user.id);
        if (!vendor) {
            return res.status(404).json({ success: false, message: "Vendor nahi mila" });
        }

        // Update basic info
        if (name) vendor.name = name;
        if (email) vendor.email = email;
        if (phone) vendor.phone = phone;
        if (password) vendor.password = password;
        if (address) vendor.address = address;
        if (city) vendor.city = city;
        if (state) vendor.state = state;
        if (pincode) vendor.pincode = pincode;

        // Update photo if uploaded
        if (req.files) {
            if (req.files.image) vendor.image = req.files.image[0].filename;

            if (req.files.aadhar || req.files.pan || req.files.gst) {
                if (!vendor.documents) vendor.documents = {};
                if (req.files.aadhar) vendor.documents.aadhar = req.files.aadhar[0].filename;
                if (req.files.pan) vendor.documents.pan = req.files.pan[0].filename;
                if (req.files.gst) vendor.documents.gst = req.files.gst[0].filename;
                vendor.markModified('documents');
            }
        }

        // Update Bank Details
        if (accountNumber || ifscCode || accountHolderName || bankName) {
            vendor.bankDetails = {
                accountNumber: accountNumber || vendor.bankDetails?.accountNumber || "",
                ifscCode: ifscCode || vendor.bankDetails?.ifscCode || "",
                accountHolderName: accountHolderName || vendor.bankDetails?.accountHolderName || "",
                bankName: bankName || vendor.bankDetails?.bankName || ""
            };
        }

        await vendor.save();

        res.json({
            success: true,
            message: "Aapki profile details update ho gayi hain!",
            vendor
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 5. Vendor Dashboard Stats
// ============================================================
exports.getVendorDashboard = async (req, res) => {
    try {
        const vendor = await Vendor.findById(req.user.id).select("-password");

        if (!vendor) {
            return res.status(404).json({ success: false, message: "Vendor nahi mila" });
        }

        // Drivers created by this Vendor
        const totalDrivers = await Driver.countDocuments({ createdBy: req.user.id, createdByModel: "Vendor" });
        const onlineDrivers = await Driver.countDocuments({ createdBy: req.user.id, createdByModel: "Vendor", isOnline: true });
        const approvedDrivers = await Driver.countDocuments({ createdBy: req.user.id, createdByModel: "Vendor", isApproved: true });

        // Fleets created by this Vendor
        const totalFleets = await Fleet.countDocuments({ createdBy: req.user.id });

        // Recent 5 Transactions
        const recentTransactions = await Transaction.find({
            user: req.user.id,
            userModel: "Vendor"
        }).sort({ createdAt: -1 }).limit(5);

        // Last 30 days earnings
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const monthlyEarnings = await Transaction.find({
            user: req.user.id,
            userModel: "Vendor",
            type: "Credit",
            createdAt: { $gte: thirtyDaysAgo }
        });
        const monthlyTotal = monthlyEarnings.reduce((sum, t) => sum + t.amount, 0);

        res.json({
            success: true,
            dashboard: {
                name: vendor.name,
                companyName: vendor.companyName,
                assignedArea: vendor.assignedArea,
                commissionPercentage: vendor.commissionPercentage,
                walletBalance: vendor.walletBalance,
                totalEarnings: vendor.totalEarnings,
                monthlyEarnings: monthlyTotal,
                drivers: {
                    total: totalDrivers,
                    online: onlineDrivers,
                    approved: approvedDrivers
                },
                fleets: {
                    total: totalFleets
                },
                recentTransactions
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 5. Vendor Creates Driver (Vendor Only)
// ============================================================
exports.createDriver = async (req, res) => {
    try {
        const {
            name, email, phone, password,
            licenseNumber, licenseExpiry,
            address, city, state, pincode,
            carNumber, carModel, carBrand, carType, carColor, manufacturingYear,
            accountNumber, ifscCode, accountHolderName, bankName
        } = req.body;

        // Image Handling from uploadCarDocs (multer)
        const image = req.files && req.files.image ? req.files.image[0].filename : null;

        // Document Handling
        const rcImage = req.files && req.files.rcImage ? req.files.rcImage[0].filename : null;
        const insuranceImage = req.files && req.files.insuranceImage ? req.files.insuranceImage[0].filename : null;
        const permitImage = req.files && req.files.permitImage ? req.files.permitImage[0].filename : null;
        const pucImage = req.files && req.files.pucImage ? req.files.pucImage[0].filename : null;

        // Duplicate check
        const driverExist = await Driver.findOne({ $or: [{ email }, { phone }] });
        if (driverExist) {
            return res.status(400).json({
                success: false,
                message: "Is email ya phone se Driver pehle se exist karta hai"
            });
        }

        // Prepare nested data
        const carDetails = {
            carNumber, carModel, carBrand, carType,
            carColor, manufacturingYear
        };

        const bankDetails = {
            accountNumber, ifscCode, accountHolderName, bankName
        };

        const documents = {
            rcImage, insuranceImage, permitImage, pucImage
        };

        const driver = await Driver.create({
            name, email, phone, password, image,
            licenseNumber, licenseExpiry,
            address, city, state, pincode,
            carDetails,
            bankDetails,
            documents,
            isActive: true,       // Since it's created by a verified Vendor, we can keep it active
            isApproved: false,    // Admin approval still needed
            createdBy: req.user.id,
            createdByModel: "Vendor"
        });

        // Update vendor's total driver count
        const Vendor = require("../models/Vendor");
        await Vendor.findByIdAndUpdate(req.user.id, { $inc: { totalDrivers: 1 } });

        res.status(201).json({
            success: true,
            message: "Driver created successfully with all documents and car details!",
            driver
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 6. Vendor Creates Fleet (Vendor Only)
// ============================================================
exports.createFleet = async (req, res) => {
    try {
        const Fleet = require("../models/Fleet");
        const {
            name, email, phone, password, companyName,
            gstNumber, panNumber, address, city, state, pincode,
            accountNumber, ifscCode, accountHolderName, bankName
        } = req.body;

        // Image & Document Handling from uploadFleetDocs
        const image = req.files && req.files.image ? req.files.image[0].filename : null;
        const gstCertificate = req.files && req.files.gstCertificate ? req.files.gstCertificate[0].filename : null;
        const panCard = req.files && req.files.panCard ? req.files.panCard[0].filename : null;
        const businessLicense = req.files && req.files.businessLicense ? req.files.businessLicense[0].filename : null;

        const fleetExist = await Fleet.findOne({ $or: [{ email }, { phone }] });
        if (fleetExist) {
            return res.status(400).json({
                success: false,
                message: "Is email ya phone se Fleet pehle se exist karti hai"
            });
        }

        const fleet = await Fleet.create({
            name, email, phone, password, image,
            companyName, gstNumber, panNumber,
            address, city, state, pincode,
            bankDetails: { accountNumber, ifscCode, accountHolderName, bankName },
            documents: { gstCertificate, panCard, businessLicense },
            isActive: true,
            createdBy: req.user.id,
            createdByModel: "Vendor"
        });

        // Update vendor's total fleets count
        const Vendor = require("../models/Vendor");
        await Vendor.findByIdAndUpdate(req.user.id, { $inc: { totalFleets: 1 } });

        res.status(201).json({
            success: true,
            message: "Fleet account created successfully by Vendor with all documents!",
            fleet
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 7. Get Vendor's All Drivers (Vendor Only)
// ============================================================
exports.getMyDrivers = async (req, res) => {
    try {
        const drivers = await Driver.find({
            createdBy: req.user.id,
            createdByModel: "Vendor"
        }).select("-password").sort({ createdAt: -1 });

        res.json({ success: true, count: drivers.length, drivers });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 8. Get Vendor's All Fleets (Vendor Only)
// ============================================================
exports.getMyFleets = async (req, res) => {
    try {
        const fleets = await Fleet.find({
            createdBy: req.user.id
        }).select("-password").sort({ createdAt: -1 });

        res.json({ success: true, count: fleets.length, fleets });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 9. Get All Vendors (Admin Only)
// ============================================================
exports.getAllVendors = async (req, res) => {
    try {
        const vendors = await Vendor.find()
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 });

        res.json({ success: true, count: vendors.length, vendors });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 10. Get Single Vendor (Admin Only)
// ============================================================
exports.getSingleVendor = async (req, res) => {
    try {
        const vendor = await Vendor.findById(req.params.id)
            .populate("createdBy", "name email");

        if (!vendor) {
            return res.status(404).json({ success: false, message: "Vendor nahi mila" });
        }

        res.json({ success: true, vendor });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 11. Update Vendor (Admin Only)
// ============================================================
exports.updateVendor = async (req, res) => {
    try {
        const {
            name, email, phone, password, companyName,
            assignedArea, commissionPercentage,
            address, city, state, pincode,
            accountNumber, ifscCode, accountHolderName, bankName
        } = req.body;

        const vendor = await Vendor.findById(req.params.id);
        if (!vendor) {
            return res.status(404).json({ success: false, message: "Vendor nahi mila" });
        }

        // Global Uniqueness Checks
        if (email && email !== vendor.email) {
            const emailTakenBy = await isEmailTaken(email, req.params.id);
            if (emailTakenBy) return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
        }
        if (phone && phone !== vendor.phone) {
            const phoneTakenBy = await isPhoneTaken(phone, req.params.id);
            if (phoneTakenBy) return res.status(400).json({ success: false, message: `Phone number is already registered as ${phoneTakenBy}` });
        }

        if (name) vendor.name = name;
        if (email) vendor.email = email;
        if (phone) vendor.phone = phone;
        if (password) vendor.password = password; // Passowrd update capability
        if (companyName) vendor.companyName = companyName;
        if (assignedArea) vendor.assignedArea = assignedArea;
        if (commissionPercentage !== undefined) vendor.commissionPercentage = commissionPercentage;
        if (address) vendor.address = address;
        if (city) vendor.city = city;
        if (state) vendor.state = state;
        if (pincode) vendor.pincode = pincode;
        
        // Handle Files
        if (req.files) {
            if (req.files.image) vendor.image = req.files.image[0].filename;
            
            // Ensure documents object exists before assigning
            if (!vendor.documents) {
                vendor.documents = { aadhar: null, pan: null, gst: null };
            }
            
            if (req.files.aadhar) {
                vendor.documents.aadhar = req.files.aadhar[0].filename;
                vendor.markModified('documents.aadhar');
            }
            if (req.files.pan) {
                vendor.documents.pan = req.files.pan[0].filename;
                vendor.markModified('documents.pan');
            }
            if (req.files.gst) {
                vendor.documents.gst = req.files.gst[0].filename;
                vendor.markModified('documents.gst');
            }
            
            vendor.markModified('documents');
        } else if (req.file) {
            vendor.image = req.file.filename;
        }

        if (accountNumber || ifscCode || accountHolderName || bankName) {
            vendor.bankDetails = {
                accountNumber: accountNumber || (vendor.bankDetails ? vendor.bankDetails.accountNumber : ""),
                ifscCode: ifscCode || (vendor.bankDetails ? vendor.bankDetails.ifscCode : ""),
                accountHolderName: accountHolderName || (vendor.bankDetails ? vendor.bankDetails.accountHolderName : ""),
                bankName: bankName || (vendor.bankDetails ? vendor.bankDetails.bankName : "")
            };
        }

        await vendor.save();

        res.json({ success: true, message: "Vendor update ho gaya", vendor });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 12. Toggle Vendor Status (Admin Only)
// ============================================================
exports.toggleVendorStatus = async (req, res) => {
    try {
        const vendor = await Vendor.findById(req.params.id);
        if (!vendor) {
            return res.status(404).json({ success: false, message: "Vendor nahi mila" });
        }

        vendor.isActive = !vendor.isActive;
        await vendor.save();

        res.json({
            success: true,
            message: `Vendor ab ${vendor.isActive ? "Active" : "Deactivated"} hai`,
            isActive: vendor.isActive
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 13. Delete Vendor (Admin Only)
// ============================================================
exports.deleteVendor = async (req, res) => {
    try {
        const vendor = await Vendor.findByIdAndDelete(req.params.id);
        if (!vendor) {
            return res.status(404).json({ success: false, message: "Vendor nahi mila" });
        }

        res.json({ success: true, message: "Vendor delete ho gaya" });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 14. Update Vendor Commission % (Admin Only)
// ============================================================
exports.updateVendorCommission = async (req, res) => {
    try {
        const { commissionPercentage } = req.body;

        if (commissionPercentage === undefined || commissionPercentage < 0 || commissionPercentage > 100) {
            return res.status(400).json({ success: false, message: "Valid commission % do (0-100)" });
        }

        const vendor = await Vendor.findByIdAndUpdate(
            req.params.id,
            { commissionPercentage },
            { new: true }
        );

        if (!vendor) {
            return res.status(404).json({ success: false, message: "Vendor nahi mila" });
        }

        res.json({
            success: true,
            message: `Vendor '${vendor.name}' ka commission ${commissionPercentage}% set ho gaya`,
            vendor
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 15. Get My Single Driver BY ID (Vendor Only)
// ============================================================
exports.getVendorDriverById = async (req, res) => {
    try {
        const driver = await Driver.findOne({
            _id: req.params.id,
            createdBy: req.user.id,
            createdByModel: "Vendor"
        }).select("-password");

        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver nahi mila ya aapke pas access nahi hai" });
        }

        res.json({ success: true, driver });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 16. Update My Driver (Full Data Edit - Vendor Only)
// ============================================================
exports.updateVendorDriver = async (req, res) => {
    try {
        const {
            name, email, phone, password,
            licenseNumber, licenseExpiry,
            address, city, state, pincode,
            carNumber, carModel, carBrand, carType, carColor, manufacturingYear,
            accountNumber, ifscCode, accountHolderName, bankName
        } = req.body;

        let driver = await Driver.findOne({
            _id: req.params.id,
            createdBy: req.user.id,
            createdByModel: "Vendor"
        });

        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver nahi mila ya access nahi hai" });
        }

        // --- 1. Basic Details Update ---
        if (name) driver.name = name;
        if (email) driver.email = email;
        if (phone) driver.phone = phone;
        if (password) driver.password = password;
        if (licenseNumber) driver.licenseNumber = licenseNumber;
        if (licenseExpiry) driver.licenseExpiry = licenseExpiry;

        // --- 2. Address Update ---
        if (address) driver.address = address;
        if (city) driver.city = city;
        if (state) driver.state = state;
        if (pincode) driver.pincode = pincode;

        // --- 3. Car Details Update ---
        const carDetailsUpdate = { ...driver.carDetails.toObject() };
        if (carNumber) carDetailsUpdate.carNumber = carNumber;
        if (carModel) carDetailsUpdate.carModel = carModel;
        if (carBrand) carDetailsUpdate.carBrand = carBrand;
        if (carType) carDetailsUpdate.carType = carType;
        if (carColor) carDetailsUpdate.carColor = carColor;
        if (manufacturingYear) carDetailsUpdate.manufacturingYear = manufacturingYear;
        driver.carDetails = carDetailsUpdate;

        // --- 4. Bank Details Update ---
        if (accountNumber || ifscCode || accountHolderName || bankName) {
            driver.bankDetails = {
                accountNumber: accountNumber || driver.bankDetails.accountNumber,
                ifscCode: ifscCode || driver.bankDetails.ifscCode,
                accountHolderName: accountHolderName || driver.bankDetails.accountHolderName,
                bankName: bankName || driver.bankDetails.bankName
            };
        }

        // --- 5. Files/Documents Update (Multer) ---
        if (req.files) {
            if (req.files.image) driver.image = req.files.image[0].filename;
            if (req.files.rcImage) driver.carDetails.carDocuments.rc = req.files.rcImage[0].filename;
            if (req.files.insuranceImage) driver.carDetails.carDocuments.insurance = req.files.insuranceImage[0].filename;
            if (req.files.permitImage) driver.carDetails.carDocuments.permit = req.files.permitImage[0].filename;
            if (req.files.pucImage) driver.carDetails.carDocuments.puc = req.files.pucImage[0].filename;
        }

        await driver.save();

        res.json({
            success: true,
            message: "Driver ki saari details aur documents update ho gaye hain!",
            driver
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 17. Delete My Driver (Vendor Only)
// ============================================================
exports.deleteVendorDriver = async (req, res) => {
    try {
        const driver = await Driver.findOneAndDelete({
            _id: req.params.id,
            createdBy: req.user.id,
            createdByModel: "Vendor"
        });

        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver nahi mila" });
        }

        // Vendor ka total count kam karo
        const Vendor = require("../models/Vendor"); // Context safety
        await Vendor.findByIdAndUpdate(req.user.id, { $inc: { totalDrivers: -1 } });

        res.json({ success: true, message: "Driver system se hata diya gaya" });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 18. Toggle Vendor Driver Status (Active/Inactive)
// ============================================================
exports.toggleVendorDriverStatus = async (req, res) => {
    try {
        const Driver = require("../models/Driver");
        const driver = await Driver.findOne({
            _id: req.params.id,
            createdBy: req.user.id,
            createdByModel: "Vendor"
        });

        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver nahi mila ya access nahi hai" });
        }

        // Status change
        driver.isActive = !driver.isActive;
        await driver.save();

        res.json({
            success: true,
            message: `Driver status ab ${driver.isActive ? "Active" : "In-active"} hai`,
            isActive: driver.isActive
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 19. Get My Single Fleet BY ID (Vendor Only)
// ============================================================
exports.getVendorFleetById = async (req, res) => {
    try {
        const Fleet = require("../models/Fleet");
        const fleet = await Fleet.findOne({
            _id: req.params.id,
            createdBy: req.user.id,
            createdByModel: "Vendor"
        }).select("-password");

        if (!fleet) {
            return res.status(404).json({ success: false, message: "Fleet nahi mila ya access nahi hai" });
        }

        res.json({ success: true, fleet });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 20. Update My Fleet (Full Support - Ink. Docs)
// ============================================================
exports.updateVendorFleet = async (req, res) => {
    try {
        const Fleet = require("../models/Fleet");
        const {
            companyName, phone, address, city, state, pincode,
            accountNumber, ifscCode, accountHolderName, bankName,
            gstNumber, panNumber
        } = req.body;

        let fleet = await Fleet.findOne({
            _id: req.params.id,
            createdBy: req.user.id,
            createdByModel: "Vendor"
        });

        if (!fleet) {
            return res.status(404).json({ success: false, message: "Fleet nahi mila" });
        }

        // --- Text Fields Update ---
        if (companyName) fleet.companyName = companyName;
        if (phone) fleet.phone = phone;
        if (address) fleet.address = address;
        if (city) fleet.city = city;
        if (state) fleet.state = state;
        if (pincode) fleet.pincode = pincode;
        if (gstNumber) fleet.gstNumber = gstNumber;
        if (panNumber) fleet.panNumber = panNumber;

        // --- Nested Bank Details Update ---
        if (accountNumber) fleet.bankDetails.accountNumber = accountNumber;
        if (ifscCode) fleet.bankDetails.ifscCode = ifscCode;
        if (accountHolderName) fleet.bankDetails.accountHolderName = accountHolderName;
        if (bankName) fleet.bankDetails.bankName = bankName;

        // --- Files/Documents Update (Using uploadFleetDocs) ---
        if (req.files) {
            if (req.files.image) fleet.image = req.files.image[0].filename;
            if (req.files.gstCertificate) fleet.documents.gstCertificate = req.files.gstCertificate[0].filename;
            if (req.files.panCard) fleet.documents.panCard = req.files.panCard[0].filename;
            if (req.files.businessLicense) fleet.documents.businessLicense = req.files.businessLicense[0].filename;
        }

        await fleet.save();

        res.json({
            success: true,
            message: "Fleet ki saari details aur documents update ho gaye hain!",
            fleet
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 21. Delete My Fleet (Vendor Only)
// ============================================================
exports.deleteVendorFleet = async (req, res) => {
    try {
        const Fleet = require("../models/Fleet");
        const fleet = await Fleet.findOneAndDelete({
            _id: req.params.id,
            createdBy: req.user.id,
            createdByModel: "Vendor"
        });

        if (!fleet) {
            return res.status(404).json({ success: false, message: "Fleet nahi mila" });
        }

        // Vendor ka total count kam karo
        const Vendor = require("../models/Vendor");
        await Vendor.findByIdAndUpdate(req.user.id, { $inc: { totalFleets: -1 } });

        res.json({ success: true, message: "Fleet system se hata diya gaya" });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 23. Request Withdrawal (Vendor Only)
// ============================================================
exports.requestVendorWithdrawal = async (req, res) => {
    try {
        const { amount, note } = req.body;
        const Withdrawal = require("../models/Withdrawal"); // Model path
        const Vendor = require("../models/Vendor");

        const vendor = await Vendor.findById(req.user.id);

        if (amount < 100) {
            return res.status(400).json({ success: false, message: "Minimum 100 ka withdraw request kar sakte hain" });
        }

        if (vendor.walletBalance < amount) {
            return res.status(400).json({ success: false, message: "Aapke wallet mein paryapt balance nahi hai" });
        }

        // Create Withdrawal request
        const withdrawal = await Withdrawal.create({
            userId: req.user.id,
            userType: "Vendor",
            amount,
            note,
            status: "Pending",
            bankDetails: vendor.bankDetails
        });

        res.json({
            success: true,
            message: "Withdrawal request Admin ko bhej di gayi hai!",
            withdrawal
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ============================================================
// 24. Get My Withdrawal History (Vendor Only)
// ============================================================
exports.getMyVendorWithdrawals = async (req, res) => {
    try {
        const Withdrawal = require("../models/Withdrawal");
        const withdrawals = await Withdrawal.find({
            userId: req.user.id,
            userType: "Vendor"
        }).sort({ createdAt: -1 });

        res.json({ success: true, withdrawals });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};


// ============================================================
// 25. MEGA REPORT: Pure Vendor Data (Combine All Info)
// ============================================================
exports.getPureVendorDataReport = async (req, res) => {
    try {
        const Vendor = require("../models/Vendor");
        const Driver = require("../models/Driver");
        const Fleet = require("../models/Fleet");
        const Booking = require("../models/Booking");
        const Transaction = require("../models/Transaction");

        const vendor = await Vendor.findById(req.user.id).select("-password");
        if (!vendor) return res.status(404).json({ success: false, message: "Vendor nahi mila" });

        // 1. Driver Metrics
        const drivers = await Driver.find({ createdBy: req.user.id, createdByModel: "Vendor" })
            .populate("carDetails.carType", "name image")
            .select("-password");

        const driverStats = {
            total: drivers.length,
            online: drivers.filter(d => d.isOnline).length,
            offline: drivers.filter(d => !d.isOnline).length,
            approved: drivers.filter(d => d.isApproved).length,
            pendingApproval: drivers.filter(d => !d.isApproved).length
        };

        // 2. Fleet Metrics
        const fleets = await Fleet.find({ createdBy: req.user.id }).select("-password");

        // 3. Trip & Booking Metrics (Linked to this Vendor's Drivers)
        const driverIds = drivers.map(d => d._id);
        const bookings = await Booking.find({ assignedDriver: { $in: driverIds } });

        const bookingStats = {
            total: bookings.length,
            completed: bookings.filter(b => b.bookingStatus === "Completed").length,
            ongoing: bookings.filter(b => b.bookingStatus === "Ongoing" || b.bookingStatus === "Accepted").length,
            cancelled: bookings.filter(b => b.bookingStatus === "Cancelled").length,
            totalGrossFar: bookings.reduce((sum, b) => sum + (b.actualFare || b.fareEstimate), 0)
        };

        // 4. Wallet & Financials
        const recentTransactions = await Transaction.find({ user: req.user.id, userModel: "Vendor" }).sort({ createdAt: -1 }).limit(10);

        // 5. Build Final Response
        res.json({
            success: true,
            report: {
                vendorInfo: {
                    name: vendor.name,
                    company: vendor.companyName,
                    area: vendor.assignedArea,
                    wallet: vendor.walletBalance,
                    commission: vendor.commissionPercentage + "%"
                },
                driverManagement: {
                    stats: driverStats,
                    list: drivers.map(d => ({
                        id: d._id,
                        name: d.name,
                        phone: d.phone,
                        isOnline: d.isOnline,
                        rating: d.rating || 0,
                        currentLocation: d.currentLocation,
                        currentHeading: d.currentHeading || 0,
                        carCategory: d.carDetails?.carType ? {
                            id: d.carDetails.carType._id,
                            name: d.carDetails.carType.name,
                            image: d.carDetails.carType.image
                        } : null
                    }))
                },
                fleetManagement: {
                    total: fleets.length,
                    list: fleets.map(f => ({ id: f._id, company: f.companyName, phone: f.phone }))
                },
                tripReporting: {
                    stats: bookingStats,
                    recentBookings: bookings.slice(-5).map(b => ({ id: b._id, customer: b.passengerDetails.name, status: b.bookingStatus, fare: b.actualFare || b.fareEstimate }))
                },
                financialSummary: {
                    totalEarnings: vendor.totalEarnings,
                    balance: vendor.walletBalance,
                    transactions: recentTransactions
                }
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};


// ============================================================
// 22. Toggle Vendor Fleet Status (Active/Inactive)
// ============================================================
exports.toggleVendorFleetStatus = async (req, res) => {
    try {
        const Fleet = require("../models/Fleet");
        const fleet = await Fleet.findOne({
            _id: req.params.id,
            createdBy: req.user.id,
            createdByModel: "Vendor"
        });

        if (!fleet) {
            return res.status(404).json({ success: false, message: "Fleet nahi mila ya access nahi hai" });
        }

        // Status change
        fleet.isActive = !fleet.isActive;
        await fleet.save();

        res.json({
            success: true,
            message: `Fleet status ab ${fleet.isActive ? "Active" : "In-active"} hai`,
            isActive: fleet.isActive
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};




