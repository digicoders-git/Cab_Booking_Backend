const FleetDriver = require("../models/FleetDriver");
const Fleet = require("../models/Fleet");
const FleetAssignment = require("../models/FleetAssignment");
const FleetCar = require("../models/FleetCar");

// Fleet Creates Driver (Fleet Only)
exports.createDriver = async (req, res) => {
    try {
        const {
            name, email, phone, password, licenseNumber, licenseExpiry,
            address, city, state, pincode
        } = req.body;

        const image = req.file ? req.file.filename : null;

        // Check if driver already exists
        const driverExist = await FleetDriver.findOne({ $or: [{ email }, { phone }] });

        if (driverExist) {
            return res.status(400).json({
                success: false,
                message: "Driver with this email or phone already exists"
            });
        }

        const driver = await FleetDriver.create({
            name,
            email,
            phone,
            password,
            image,
            licenseNumber,
            licenseExpiry,
            address,
            city,
            state,
            pincode,
            fleetId: req.user.id,  // Fleet ID
            isActive: false,
            isApproved: false
        });

        // Update fleet total drivers count
        await Fleet.findByIdAndUpdate(
            req.user.id,
            { $inc: { totalDrivers: 1 } }
        );

        res.status(201).json({
            success: true,
            message: "Driver created successfully by Fleet. Waiting for admin approval.",
            driver
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error creating driver",
            error: error.message
        });
    }
};

// Fleet Get All Drivers (Fleet Only)
exports.getFleetDrivers = async (req, res) => {
    try {
        const drivers = await FleetDriver.find({ fleetId: req.user.id }).lean();

        // Attach category info to each driver
        const driversWithInfo = await Promise.all(drivers.map(async (driver) => {
            const assignment = await FleetAssignment.findOne({ driverId: driver._id, isAssigned: true })
                .populate({
                    path: 'carId',
                    populate: { path: 'carType' }
                });

            if (assignment && assignment.carId && assignment.carId.carType) {
                return {
                    ...driver,
                    carCategory: {
                        _id: assignment.carId.carType._id,
                        name: assignment.carId.carType.name || assignment.carId.carType.categoryName,
                        image: assignment.carId.carType.image || assignment.carId.carType.categoryImage,
                        basePrice: assignment.carId.carType.basePrice || assignment.carId.carType.price,
                        pricePerKm: assignment.carId.carType.pricePerKm
                    },
                    carInfo: {
                        carNumber: assignment.carNumber,
                        carModel: assignment.carModel,
                        carBrand: assignment.carId.carBrand
                    }
                };
            }
            return driver;
        }));

        res.json({
            success: true,
            count: driversWithInfo.length,
            drivers: driversWithInfo
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching drivers",
            error: error.message
        });
    }
};

// ============================================================
// NEW API: Fleet LIVE Monitor (Directly from Main Driver Model)
// ============================================================
exports.getFleetDriversLive = async (req, res) => {
    try {
        const Driver = require("../models/Driver");
        const drivers = await Driver.find({ createdBy: req.user.id, createdByModel: "Fleet" })
            .populate("carDetails.carType", "name image")
            .sort({ isOnline: -1, updatedAt: -1 }).lean();

        res.json({
            success: true,
            count: drivers.length,
            drivers: drivers.map(d => ({ ...d, activeRideType: d.currentRideType || "Idle" }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching live data", error: error.message });
    }
};

// Fleet Get Single Driver (Fleet Only)
exports.getFleetDriver = async (req, res) => {
    try {
        const driver = await FleetDriver.findById(req.params.driverId);

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        // Check if driver belongs to this fleet
        if (driver.fleetId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You don't have access to this driver"
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

// Fleet Delete Driver (Fleet Only)
exports.deleteDriver = async (req, res) => {
    try {
        const driver = await FleetDriver.findById(req.params.driverId);

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        // Check if driver belongs to this fleet
        if (driver.fleetId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You don't have access to this driver"
            });
        }

        await FleetDriver.findByIdAndDelete(req.params.driverId);

        // Update fleet total drivers count
        await Fleet.findByIdAndUpdate(
            req.user.id,
            { $inc: { totalDrivers: -1 } }
        );

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

// Fleet Get Pending Drivers (Fleet Only)
exports.getPendingDrivers = async (req, res) => {
    try {
        const drivers = await FleetDriver.find({
            fleetId: req.user.id,
            isApproved: false,
            isRejected: false
        })
            .sort({ createdAt: -1 })
            .lean();

        // Attach category info to each driver
        const driversWithInfo = await Promise.all(drivers.map(async (driver) => {
            const assignment = await FleetAssignment.findOne({ driverId: driver._id, isAssigned: true })
                .populate({
                    path: 'carId',
                    populate: { path: 'carType' }
                });

            if (assignment && assignment.carId && assignment.carId.carType) {
                return {
                    ...driver,
                    carCategory: {
                        _id: assignment.carId.carType._id,
                        name: assignment.carId.carType.name || assignment.carId.carType.categoryName,
                        image: assignment.carId.carType.image || assignment.carId.carType.categoryImage,
                        basePrice: assignment.carId.carType.basePrice || assignment.carId.carType.price,
                        pricePerKm: assignment.carId.carType.pricePerKm
                    }
                };
            }
            return driver;
        }));

        res.json({
            success: true,
            count: driversWithInfo.length,
            drivers: driversWithInfo
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching pending drivers",
            error: error.message
        });
    }
};

// Fleet Get Approved Drivers (Fleet Only)
exports.getApprovedDrivers = async (req, res) => {
    try {
        const drivers = await FleetDriver.find({
            fleetId: req.user.id,
            isApproved: true
        })
            .sort({ approvedAt: -1 })
            .lean();

        // Attach category info to each driver
        const driversWithInfo = await Promise.all(drivers.map(async (driver) => {
            const assignment = await FleetAssignment.findOne({ driverId: driver._id, isAssigned: true })
                .populate({
                    path: 'carId',
                    populate: { path: 'carType' }
                });

            if (assignment && assignment.carId && assignment.carId.carType) {
                return {
                    ...driver,
                    carCategory: {
                        _id: assignment.carId.carType._id,
                        name: assignment.carId.carType.name || assignment.carId.carType.categoryName,
                        image: assignment.carId.carType.image || assignment.carId.carType.categoryImage,
                        basePrice: assignment.carId.carType.basePrice || assignment.carId.carType.price,
                        pricePerKm: assignment.carId.carType.pricePerKm
                    }
                };
            }
            return driver;
        }));

        res.json({
            success: true,
            count: driversWithInfo.length,
            drivers: driversWithInfo
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching approved drivers",
            error: error.message
        });
    }
};

// Fleet Update Driver (Fleet Only)
exports.updateDriver = async (req, res) => {
    try {
        const {
            name, email, phone, password, licenseNumber, licenseExpiry,
            address, city, state, pincode
        } = req.body;

        const driver = await FleetDriver.findById(req.params.driverId);

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        // Check if driver belongs to this fleet
        if (driver.fleetId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You don't have access to update this driver"
            });
        }

        const updateData = {
            name: name || driver.name,
            email: email || driver.email,
            phone: phone || driver.phone,
            licenseNumber: licenseNumber || driver.licenseNumber,
            licenseExpiry: licenseExpiry || driver.licenseExpiry,
            address: address || driver.address,
            city: city || driver.city,
            state: state || driver.state,
            pincode: pincode || driver.pincode
        };

        if (password) {
            updateData.password = password; // Note: bcrypt hash agar use karna ho toh yahan handle karein
        }

        if (req.file) {
            updateData.image = req.file.filename;
        }

        const updatedDriver = await FleetDriver.findByIdAndUpdate(
            req.params.driverId,
            updateData,
            { new: true }
        );

        res.json({
            success: true,
            message: "Driver updated successfully",
            driver: updatedDriver
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating driver",
            error: error.message
        });
    }
};

// ============================================================
// Admin: Get All Drivers Across All Fleets (Admin Only)
// ============================================================
exports.adminGetAllDrivers = async (req, res) => {
    try {
        const drivers = await FleetDriver.find()
            .populate("fleetId", "name companyName")
            .sort({ createdAt: -1 })
            .lean();

        // Attach category info to each driver
        const driversWithInfo = await Promise.all(drivers.map(async (driver) => {
            const assignment = await FleetAssignment.findOne({ driverId: driver._id, isAssigned: true })
                .populate({
                    path: 'carId',
                    populate: { path: 'carType' }
                });

            if (assignment && assignment.carId && assignment.carId.carType) {
                return {
                    ...driver,
                    carCategory: {
                        _id: assignment.carId.carType._id,
                        name: assignment.carId.carType.name || assignment.carId.carType.categoryName,
                        image: assignment.carId.carType.image || assignment.carId.carType.categoryImage,
                        basePrice: assignment.carId.carType.basePrice || assignment.carId.carType.price,
                        pricePerKm: assignment.carId.carType.pricePerKm
                    }
                };
            }
            return driver;
        }));

        res.json({
            success: true,
            count: driversWithInfo.length,
            drivers: driversWithInfo
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching global fleet drivers",
            error: error.message
        });
    }
};
