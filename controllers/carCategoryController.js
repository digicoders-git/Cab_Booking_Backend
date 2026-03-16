const CarCategory = require("../models/CarCategory");

// 1. Create a New Car Category (Admin Only)
exports.createCarCategory = async (req, res) => {
    try {
        const { name, seatCapacity, privateRatePerKm, sharedRatePerSeatPerKm, baseFare, seatLayout, avgSpeedKmH } = req.body;

        const image = req.file ? req.file.filename : null;

        if (!name || !seatCapacity || !privateRatePerKm || !sharedRatePerSeatPerKm) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required fields (name, seatCapacity, rates)"
            });
        }

        const exactExist = await CarCategory.findOne({ name: name.trim() });
        if (exactExist) {
            return res.status(400).json({
                success: false,
                message: "A Car Category with this name already exists"
            });
        }

        const newCategory = await CarCategory.create({
            name,
            seatCapacity,
            privateRatePerKm,
            sharedRatePerSeatPerKm,
            baseFare,
            seatLayout: seatLayout || [],
            avgSpeedKmH: avgSpeedKmH || 25,
            image,
            createdBy: req.user.id
        });

        res.status(201).json({
            success: true,
            message: "Car Category created successfully",
            category: newCategory
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// 2. Get All Active Categories (Public / App Users / Drivers / Fleets)
exports.getAllActiveCategories = async (req, res) => {
    try {
        const categories = await CarCategory.find({ isActive: true }).select("-createdBy");

        res.json({
            success: true,
            count: categories.length,
            categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// 3. Get All Categories (Admin Dashboard)
exports.getAllCategoriesAdmin = async (req, res) => {
    try {
        const categories = await CarCategory.find().populate("createdBy", "name email");

        res.json({
            success: true,
            count: categories.length,
            categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// 4. Update Car Category (Admin Only)
exports.updateCarCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, seatCapacity, privateRatePerKm, sharedRatePerSeatPerKm, baseFare, isActive, seatLayout, avgSpeedKmH } = req.body;

        const category = await CarCategory.findById(id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Car Category not found"
            });
        }

        // Update fields if provided
        if (name) category.name = name.trim();
        if (seatCapacity) category.seatCapacity = seatCapacity;
        if (privateRatePerKm) category.privateRatePerKm = privateRatePerKm;
        if (sharedRatePerSeatPerKm) category.sharedRatePerSeatPerKm = sharedRatePerSeatPerKm;
        if (baseFare !== undefined) category.baseFare = baseFare;
        if (isActive !== undefined) category.isActive = isActive;
        if (seatLayout) category.seatLayout = seatLayout;
        if (avgSpeedKmH !== undefined) category.avgSpeedKmH = avgSpeedKmH;
        
        if (req.file) {
            category.image = req.file.filename;
        }

        await category.save();

        res.json({
            success: true,
            message: "Car Category updated successfully",
            category
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// 5. Delete Category (Admin Only - Avoid if bookings depend on it)
exports.deleteCarCategory = async (req, res) => {
    try {
        const category = await CarCategory.findById(req.params.id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Car Category not found"
            });
        }

        // TODO: In Future, check if any FleetCar or DriverCar uses this before delete. 
        // If they use it, recommend making it "Inactive" instead of Delete.

        await CarCategory.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: "Car Category deleted permanently."
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};
