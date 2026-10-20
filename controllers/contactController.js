const ContactMessage = require("../models/ContactMessage");

// @desc    Submit a new contact message
// @route   POST /api/contact
// @access  Public (No Auth)
exports.createMessage = async (req, res) => {
    try {
        const { name, email, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                message: "Please provide name, email, and message"
            });
        }

        const newMessage = await ContactMessage.create({
            name,
            email,
            message
        });

        res.status(201).json({
            success: true,
            message: "Message sent successfully",
            data: newMessage
        });
    } catch (error) {
        console.error("Create Contact Message Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// @desc    Get all contact messages
// @route   GET /api/contact
// @access  Public (No Auth)
exports.getAllMessages = async (req, res) => {
    try {
        const messages = await ContactMessage.find().sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: messages.length,
            data: messages
        });
    } catch (error) {
        console.error("Get Contact Messages Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// @desc    Delete a contact message by ID
// @route   DELETE /api/contact/:id
// @access  Public (No Auth)
exports.deleteMessage = async (req, res) => {
    try {
        const { id } = req.params;

        const message = await ContactMessage.findById(id);

        if (!message) {
            return res.status(404).json({
                success: false,
                message: "Message not found"
            });
        }

        await ContactMessage.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: "Message deleted successfully"
        });
    } catch (error) {
        console.error("Delete Contact Message Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};
