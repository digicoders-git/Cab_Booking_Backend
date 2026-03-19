const FleetDriver = require("../models/FleetDriver");
const FleetCar = require("../models/FleetCar");
const FleetAssignment = require("../models/FleetAssignment");
const Driver = require("../models/Driver");
const bcrypt = require("bcryptjs");

// ============================================================
// Fleet Assigns Car to Driver (Fleet Only)
// ⭐ When assigned → COPY goes to main Driver model
//    for Admin approval. FleetDriver & FleetCar stay safe!
// ============================================================
exports.assignCarToDriver = async (req, res) => {
    try {
        const { driverId, carId } = req.body;

        if (!driverId || !carId) {
            return res.status(400).json({
                success: false,
                message: "Driver ID and Car ID are required"
            });
        }

        // Get FleetDriver
        const fleetDriver = await FleetDriver.findById(driverId);
        if (!fleetDriver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        // Check if driver belongs to this fleet
        if (fleetDriver.fleetId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "This driver doesn't belong to your fleet"
            });
        }

        // Get FleetCar
        const fleetCar = await FleetCar.findById(carId);
        if (!fleetCar) {
            return res.status(404).json({
                success: false,
                message: "Car not found"
            });
        }

        // Check if car belongs to this fleet
        if (fleetCar.fleetId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "This car doesn't belong to your fleet"
            });
        }

        // Check if car is already assigned to someone
        const existingAssignment = await FleetAssignment.findOne({
            carId: carId,
            isAssigned: true
        });

        if (existingAssignment) {
            return res.status(400).json({
                success: false,
                message: "Car is already assigned to another driver"
            });
        }

        // ─────────────────────────────────────────────────────────────
        // STEP 1: FleetAssignment record banao
        // ─────────────────────────────────────────────────────────────
        const assignment = await FleetAssignment.create({
            fleetId: req.user.id,
            carId: carId,
            driverId: driverId,
            carNumber: fleetCar.carNumber,
            carModel: fleetCar.carModel,
            carType: fleetCar.carType,
            seatCapacity: fleetCar.seatCapacity || 4, // Added fallback
            driverName: fleetDriver.name,
            driverEmail: fleetDriver.email,
            driverPhone: fleetDriver.phone,
            isAssigned: true,
            assignmentHistory: [{
                action: "assigned",
                timestamp: new Date(),
                performedBy: req.user.id
            }]
        });

        // ─────────────────────────────────────────────────────────────
        // STEP 2: FleetDriver update karo car details ke saath
        // (FleetDriver apni jagah REHTA HAI — DELETE nahi hoga!)
        // ─────────────────────────────────────────────────────────────
        const updatedFleetDriver = await FleetDriver.findByIdAndUpdate(
            driverId,
            {
                carId:     carId,
                carNumber: fleetCar.carNumber,
                carModel:  fleetCar.carModel,
                carType:   fleetCar.carType
            },
            { new: true }
        );

        // ─────────────────────────────────────────────────────────────
        // STEP 3: ⭐ MAIN LOGIC
        // Main Driver Model mein COPY bhejo — Admin Approval ke liye!
        // FleetDriver aur FleetCar DELETE nahi hote — sirf COPY jaati hai!
        // ─────────────────────────────────────────────────────────────
        const carDetails = {
            carNumber:         fleetCar.carNumber,
            carModel:          fleetCar.carModel,
            carBrand:          fleetCar.carBrand,
            carType:           fleetCar.carType,
            seatCapacity:      fleetCar.seatCapacity,
            carColor:          fleetCar.carColor,
            manufacturingYear: fleetCar.manufacturingYear,
            insuranceExpiry:   fleetCar.insuranceExpiry,
            permitExpiry:      fleetCar.permitExpiry,
            pucExpiry:         fleetCar.pucExpiry
        };

        let mainDriver = await Driver.findOne({ email: fleetDriver.email });
        let isNewDriver = false;

        if (!mainDriver) {
            // ✅ CASE 1: Pehli baar assign ho raha hai
            // → Driver model mein NAYA record banao
            // → isApproved: false → Admin ke paas approval ke liye!
            // → FleetDriver & FleetCar SAFE hain (delete nahi hue!)
            const hashedPassword = await bcrypt.hash(fleetDriver.password, 10);

            mainDriver = await Driver.create({
                name:           fleetDriver.name,
                email:          fleetDriver.email,
                phone:          fleetDriver.phone,
                password:       hashedPassword,
                image:          fleetDriver.image          || null,
                licenseNumber:  fleetDriver.licenseNumber  || "",
                licenseExpiry:  fleetDriver.licenseExpiry  || null,
                address:        fleetDriver.address        || "",
                city:           fleetDriver.city           || "",
                state:          fleetDriver.state          || "",
                pincode:        fleetDriver.pincode        || "",
                carDetails,                  // ← Assigned car ki poori details
                isActive:       false,       // ← Admin approve kare tab active hoga
                isApproved:     false,       // ← Admin approval PENDING hai
                isRejected:     false,
                createdBy:      req.user.id, // ← Fleet ka ID (kaun ne banaya)
                createdByModel: "Fleet",     // ← Fleet ne banaya hai
            });

            isNewDriver = true;

        } else {
            // ✅ CASE 2: Driver pehle se Driver model mein hai
            // → Sirf car details update karo, baaki sab same rehega
            await Driver.findByIdAndUpdate(
                mainDriver._id,
                { carDetails },
                { new: true }
            );
        }

        // ─────────────────────────────────────────────────────────────
        // STEP 4: Response bhejo
        // ─────────────────────────────────────────────────────────────
        res.json({
            success: true,
            message: isNewDriver
                ? `Car assigned! Driver '${fleetDriver.name}' ab Admin ke paas approval ke liye gaya hai.`
                : `Car assigned! Driver '${fleetDriver.name}' ki car details update ho gayi.`,
            assignment,
            fleetDriver: updatedFleetDriver,     // FleetDriver (apni jagah safe hai)
            mainDriver: {
                id:         mainDriver._id,
                name:       mainDriver.name,
                email:      mainDriver.email,
                carNumber:  carDetails.carNumber,
                isApproved: mainDriver.isApproved, // false → Admin se pending
                isActive:   mainDriver.isActive,   // false → Approved hone ke baad
                status:     isNewDriver ? "Pending Admin Approval" : "Car Details Updated"
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error assigning car",
            error: error.message
        });
    }
};

// Fleet Unassigns Car from Driver (Fleet Only)
exports.unassignCarFromDriver = async (req, res) => {
    try {
        const { assignmentId } = req.params;

        // Get assignment
        const assignment = await FleetAssignment.findById(assignmentId);
        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: "Assignment not found"
            });
        }

        // Check if assignment belongs to this fleet
        if (assignment.fleetId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You don't have access to this assignment"
            });
        }

        // Update assignment record
        assignment.isAssigned = false;
        assignment.unassignedAt = new Date();
        assignment.assignmentHistory.push({
            action: "unassigned",
            timestamp: new Date(),
            performedBy: req.user.id
        });

        await assignment.save();

        // FleetDriver ki car details hata do
        await FleetDriver.findByIdAndUpdate(
            assignment.driverId,
            {
                carId:     null,
                carNumber: null,
                carModel:  null,
                carType:   null
            },
            { new: true }
        );

        // Main Driver model mein bhi car details hata do
        const driver = await Driver.findOne({ email: assignment.driverEmail });
        if (driver) {
            await Driver.findByIdAndUpdate(
                driver._id,
                { carDetails: null },
                { new: true }
            );
        }

        res.json({
            success: true,
            message: "Car unassigned from driver successfully",
            assignment
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error unassigning car",
            error: error.message
        });
    }
};

// Fleet Get Car Assignment Status (Fleet Only)
exports.getCarAssignmentStatus = async (req, res) => {
    try {
        const { carId } = req.params;

        const fleetCar = await FleetCar.findById(carId);
        if (!fleetCar) {
            return res.status(404).json({
                success: false,
                message: "Car not found"
            });
        }

        if (fleetCar.fleetId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You don't have access to this car"
            });
        }

        const assignment = await FleetAssignment.findOne({
            carId: carId,
            isAssigned: true
        }).populate("driverId", "name email phone");

        res.json({
            success: true,
            assignment: {
                carNumber:  fleetCar.carNumber,
                carModel:   fleetCar.carModel,
                carType:    fleetCar.carType,
                isAssigned: !!assignment,
                assignment: assignment || null
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching assignment status",
            error: error.message
        });
    }
};

// Get All ACTIVE Assignments for Fleet (Fleet Only)
exports.getAllAssignments = async (req, res) => {
    try {
        const assignments = await FleetAssignment.find({
            fleetId: req.user.id,
            isAssigned: true // ← Sirf active assignments dikhao
        })
            .populate("driverId", "name email phone")
            .populate("carId", "carNumber carModel carType");

        res.json({
            success: true,
            count: assignments.length,
            assignments
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching assignments",
            error: error.message
        });
    }
};

// Get All UNASSIGNED (PAST) Assignments for Fleet (Fleet Only)
exports.getUnassignedHistory = async (req, res) => {
    try {
        const assignments = await FleetAssignment.find({
            fleetId: req.user.id,
            isAssigned: false // ← Sirf purani assignments (History)
        })
            .populate("driverId", "name email phone")
            // .populate("carId") // ← Request ke hisaab se car object populate nahi kar rahe, sirf snapshot name/number dikhega
            .sort({ unassignedAt: -1 });

        res.json({
            success: true,
            count: assignments.length,
            assignments
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching unassigned history",
            error: error.message
        });
    }
};

// Get Assignment History for a Car (Fleet Only)
exports.getAssignmentHistory = async (req, res) => {
    try {
        const { carId } = req.params;

        const fleetCar = await FleetCar.findById(carId);
        if (!fleetCar) {
            return res.status(404).json({
                success: false,
                message: "Car not found"
            });
        }

        if (fleetCar.fleetId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You don't have access to this car"
            });
        }

        const assignments = await FleetAssignment.find({ carId: carId })
            .populate("driverId", "name email phone")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: assignments.length,
            assignments
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching assignment history",
            error: error.message
        });
    }
};

// ============================================================
// Admin: Get All Assignments Across All Fleets (Admin Only)
// ============================================================
exports.adminGetAllAssignmentsGlobal = async (req, res) => {
    try {
        const assignments = await FleetAssignment.find()
            .populate("fleetId", "name companyName")
            .populate("driverId", "name phone email")
            .populate("carId", "carNumber carModel carType")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: assignments.length,
            assignments
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching global fleet assignments",
            error: error.message
        });
    }
};
