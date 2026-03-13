const FleetCar = require("../models/FleetCar");
const Fleet = require("../models/Fleet");
const CarCategory = require("../models/CarCategory");

// Fleet Creates Car (Fleet Only)
exports.createCar = async (req, res) => {
    try {
        const {
            carNumber, carModel, carBrand, carType, seatCapacity, carColor,
            manufacturingYear, insuranceExpiry, permitExpiry, pucExpiry
        } = req.body;

        if (!carNumber || !carModel || !carType) {
            return res.status(400).json({
                success: false,
                message: "Car number, model, and type are required"
            });
        }

        // Check if car number already exists
        const carExist = await FleetCar.findOne({ carNumber });
        if (carExist) {
            return res.status(400).json({
                success: false,
                message: "Car with this number already exists"
            });
        }

        // If seatCapacity is not provided, fetch it from CarCategory
        let finalSeatCapacity = seatCapacity;
        if (!finalSeatCapacity) {
            const category = await CarCategory.findById(carType);
            if (category) {
                finalSeatCapacity = category.seatCapacity;
            } else {
                finalSeatCapacity = 4; // Default fallback
            }
        }

        const car = await FleetCar.create({
            carNumber,
            carModel,
            carBrand,
            carType,
            seatCapacity: finalSeatCapacity,
            carColor,
            manufacturingYear,
            insuranceExpiry,
            permitExpiry,
            pucExpiry,
            fleetId: req.user.id,  // Fleet ID
            isActive: true,
            isAvailable: true
        });

        // Update fleet total cars count
        await Fleet.findByIdAndUpdate(
            req.user.id,
            { $inc: { totalCars: 1 } }
        );

        res.status(201).json({
            success: true,
            message: "Car created successfully",
            car
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error creating car",
            error: error.message
        });
    }
};

// Fleet Get All Cars (Fleet Only)
exports.getFleetCars = async (req, res) => {
    try {
        const cars = await FleetCar.find({ fleetId: req.user.id });

        res.json({
            success: true,
            count: cars.length,
            cars
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching cars",
            error: error.message
        });
    }
};

// Fleet Get Single Car (Fleet Only)
exports.getFleetCar = async (req, res) => {
    try {
        const { carId } = req.params;

        const car = await FleetCar.findById(carId);

        if (!car) {
            return res.status(404).json({
                success: false,
                message: "Car not found"
            });
        }

        // Check if car belongs to this fleet
        if (car.fleetId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You don't have access to this car"
            });
        }

        res.json({
            success: true,
            car
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching car",
            error: error.message
        });
    }
};

// Fleet Update Car (Fleet Only)
exports.updateCar = async (req, res) => {
    try {
        const { carId } = req.params;
        const {
            carModel, carBrand, carType, seatCapacity, carColor,
            manufacturingYear, insuranceExpiry, permitExpiry, pucExpiry,
            lastServiceDate, nextServiceDate
        } = req.body;

        const car = await FleetCar.findById(carId);

        if (!car) {
            return res.status(404).json({
                success: false,
                message: "Car not found"
            });
        }

        // Check if car belongs to this fleet
        if (car.fleetId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You don't have access to this car"
            });
        }

        const updatedCar = await FleetCar.findByIdAndUpdate(
            carId,
            {
                carModel,
                carBrand,
                carType,
                seatCapacity,
                carColor,
                manufacturingYear,
                insuranceExpiry,
                permitExpiry,
                pucExpiry,
                lastServiceDate,
                nextServiceDate
            },
            { new: true }
        );

        res.json({
            success: true,
            message: "Car updated successfully",
            car: updatedCar
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating car",
            error: error.message
        });
    }
};

// Fleet Delete Car (Fleet Only)
exports.deleteCar = async (req, res) => {
    try {
        const { carId } = req.params;

        const car = await FleetCar.findById(carId);

        if (!car) {
            return res.status(404).json({
                success: false,
                message: "Car not found"
            });
        }

        // Check if car belongs to this fleet
        if (car.fleetId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: "You don't have access to this car"
            });
        }

        // Check if car is assigned to a driver
        const FleetAssignment = require("../models/FleetAssignment");
        const assignment = await FleetAssignment.findOne({
            carId: carId,
            isAssigned: true
        });

        if (assignment) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete car that is assigned to a driver"
            });
        }

        await FleetCar.findByIdAndDelete(carId);

        // Update fleet total cars count
        await Fleet.findByIdAndUpdate(
            req.user.id,
            { $inc: { totalCars: -1 } }
        );

        res.json({
            success: true,
            message: "Car deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting car",
            error: error.message
        });
    }
};

// Fleet Get Available Cars (Fleet Only)
exports.getAvailableCars = async (req, res) => {
    try {
        const cars = await FleetCar.find({
            fleetId: req.user.id,
            isAvailable: true,
            isActive: true
        });

        res.json({
            success: true,
            count: cars.length,
            cars
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching available cars",
            error: error.message
        });
    }
};

// Fleet Get Busy Cars (Fleet Only)
exports.getBusyCars = async (req, res) => {
    try {
        const cars = await FleetCar.find({
            fleetId: req.user.id,
            isBusy: true
        });

        res.json({
            success: true,
            count: cars.length,
            cars
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching busy cars",
            error: error.message
        });
    }
};
