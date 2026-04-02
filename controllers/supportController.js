const Support = require("../models/Support");

// 1. Create Support Request (Any Logged-in User)
exports.createSupportRequest = async (req, res) => {
    try {
        const { subject, message } = req.body;

        if (!subject || !message) {
            return res.status(400).json({ success: false, message: "Subject and Message are required" });
        }

        // Determine sender model based on role from token
        let senderModel = "";
        const role = req.user.role;

        if (role === "user") senderModel = "User";
        else if (role === "agent") senderModel = "Agent";
        else if (role === "driver") senderModel = "Driver";
        else if (role === "fleet") senderModel = "Fleet";
        else if (role === "vendor") senderModel = "Vendor";
        else {
            return res.status(403).json({ success: false, message: "Invalid role for support request" });
        }

        const newRequest = await Support.create({
            sender: req.user.id,
            senderModel,
            subject,
            message
        });

        res.status(201).json({
            success: true,
            message: "Support request sent successfully. Admin will review it shortly.",
            supportRequest: newRequest
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Error sending support request", error: error.message });
    }
};

// 2. Get My Support Requests (User/Agent/Driver/Fleet)
exports.getMySupportRequests = async (req, res) => {
    try {
        const requests = await Support.find({ sender: req.user.id })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: requests.length,
            requests
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching support requests", error: error.message });
    }
};

// 3. Admin: Get All Support Requests
exports.getAllSupportRequests = async (req, res) => {
    try {
        const requests = await Support.find()
            .populate("sender", "name email phone")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            allRequests: requests
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching all support requests", error: error.message });
    }
};

// 4. Admin: Reply to Support Request
exports.replyToSupportRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { reply, status } = req.body;

        const request = await Support.findById(id);

        if (!request) {
            return res.status(404).json({ success: false, message: "Support request not found" });
        }

        request.reply = reply || request.reply;
        request.status = status || "Closed";
        request.repliedAt = new Date();
        request.repliedBy = req.user.id;

        await request.save();

        res.status(200).json({
            success: true,
            message: "Reply sent and request updated",
            request
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Error replying to support request", error: error.message });
    }
};

// 5. Get Support Ticket Summary (Report)
exports.getSupportSummary = async (req, res) => {
    try {
        const userId = req.user.id;

        const [total, open, inProgress, closed] = await Promise.all([
            Support.countDocuments({ sender: userId }),
            Support.countDocuments({ sender: userId, status: "Open" }),
            Support.countDocuments({ sender: userId, status: "In-Progress" }),
            Support.countDocuments({ sender: userId, status: "Closed" })
        ]);

        res.status(200).json({
            success: true,
            summary: {
                total,
                open,
                inProgress,
                closed
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching support summary", error: error.message });
    }
};
