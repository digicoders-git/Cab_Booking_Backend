const FleetDriver = require("../models/FleetDriver");
const Fleet = require("../models/Fleet");

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
        const drivers = await FleetDriver.find({ fleetId: req.user.id })
            .select("-password");

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

// Fleet Get Single Driver (Fleet Only)
exports.getFleetDriver = async (req, res) => {
    try {
        const driver = await FleetDriver.findById(req.params.driverId)
            .select("-password");

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

// Fleet Get Approved Drivers (Fleet Only)
exports.getApprovedDrivers = async (req, res) => {
    try {
        const drivers = await FleetDriver.find({
            fleetId: req.user.id,
            isApproved: true
        })
            .select("-password")
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
