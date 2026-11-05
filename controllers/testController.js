const Test = require("../models/Test");

// @desc    Create a new test record (name and password)
// @route   POST /api/test
// @access  Public (Test Only)
exports.createTest = async (req, res) => {
    try {
        const { name, password } = req.body;

        if (!name || !password) {
            return res.status(400).json({
                success: false,
                message: "Please provide both name and password"
            });
        }

        const newTest = await Test.create({
            name,
            password
        });

        return res.status(201).json({
            success: true,
            message: "Test record saved successfully! Server and Database are working.",
            data: newTest
        });
    } catch (error) {
        console.error("Create Test Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// @desc    Get all test records
// @route   GET /api/test
// @access  Public (Test Only)
exports.getAllTests = async (req, res) => {
    try {
        const tests = await Test.find().sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            message: "Server is live and responding successfully!",
            count: tests.length,
            data: tests
        });
    } catch (error) {
        console.error("Get All Tests Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// @desc    Delete a test record by ID
// @route   DELETE /api/test/:id
// @access  Public (Test Only)
exports.deleteTest = async (req, res) => {
    try {
        const { id } = req.params;
        const test = await Test.findByIdAndDelete(id);

        if (!test) {
            return res.status(404).json({
                success: false,
                message: "Test record not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Test record deleted successfully"
        });
    } catch (error) {
        console.error("Delete Test Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};
