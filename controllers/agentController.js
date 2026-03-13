const Agent = require("../models/Agent");
const jwt = require("jsonwebtoken");

// Create Agent (Admin Only)
exports.registerAgent = async (req, res) => {
    try {
        const { name, email, phone, password, commissionPercentage, address, city, state, pincode } = req.body;

        const image = req.file ? req.file.filename : null;

        // Check if agent already exists
        const agentExist = await Agent.findOne({ $or: [{ email }, { phone }] });

        if (agentExist) {
            return res.status(400).json({
                success: false,
                message: "Agent with this email or phone already exists"
            });
        }

        const agent = await Agent.create({
            name,
            email,
            phone,
            password,
            image,
            commissionPercentage: commissionPercentage || 10,
            address,
            city,
            state,
            pincode,
            isActive: true,  // Admin creates, so directly active
            createdBy: req.user.id  // Admin who created
        });

        res.status(201).json({
            success: true,
            message: "Agent created successfully by Admin",
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Login Agent
exports.loginAgent = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const agent = await Agent.findOne({ email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        if (!agent.isActive) {
            return res.status(403).json({
                success: false,
                message: "Your account has been deactivated by Admin"
            });
        }

        if (agent.password !== password) {
            return res.status(400).json({
                success: false,
                message: "Invalid password"
            });
        }

        const token = jwt.sign(
            {
                id: agent._id,
                role: "agent"
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Get Agent Profile
exports.getAgentProfile = async (req, res) => {
    try {
        const agent = await Agent.findById(req.user.id).select("-password");

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        res.json({
            success: true,
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Update Agent Profile (Including Documents)
exports.updateAgentProfile = async (req, res) => {
    try {
        const { name, email, phone, password, address, city, state, pincode, accountNumber, ifscCode, accountHolderName, bankName, aadhar, pan } = req.body;

        const updateData = {
            name,
            email,
            phone,
            address,
            city,
            state,
            pincode
        };

        if (password) {
            updateData.password = password;
        }

        if (req.file) {
            updateData.image = req.file.filename;
        }

        if (accountNumber || ifscCode || accountHolderName || bankName) {
            updateData.bankDetails = {
                accountNumber,
                ifscCode,
                accountHolderName,
                bankName
            };
        }

        if (aadhar || pan) {
            updateData.documents = {
                aadhar: aadhar || undefined,
                pan: pan || undefined
            };
        }

        const agent = await Agent.findByIdAndUpdate(
            req.user.id,
            updateData,
            { new: true }
        ).select("-password");

        res.json({
            success: true,
            message: "Profile updated successfully",
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};



// Get All Agents (Admin Only)
exports.getAllAgents = async (req, res) => {
    try {
        const agents = await Agent.find().select("-password").populate("createdBy", "name email");

        res.json({
            success: true,
            count: agents.length,
            agents
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching agents",
            error: error.message
        });
    }
};

// Get Single Agent (Admin Only)
exports.getSingleAgent = async (req, res) => {
    try {
        const agent = await Agent.findById(req.params.id).select("-password").populate("createdBy", "name email");

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        res.json({
            success: true,
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching agent",
            error: error.message
        });
    }
};

// Delete Agent (Admin Only)
exports.deleteAgent = async (req, res) => {
    try {
        const agent = await Agent.findByIdAndDelete(req.params.id);

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        res.json({
            success: true,
            message: "Agent deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting agent",
            error: error.message
        });
    }
};

// Toggle Agent Status (Admin Only)
exports.toggleAgentStatus = async (req, res) => {
    try {
        const agent = await Agent.findById(req.params.id);

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        agent.isActive = !agent.isActive;
        await agent.save();

        res.json({
            success: true,
            message: `Agent is now ${agent.isActive ? 'Active' : 'Deactivated'}`,
            isActive: agent.isActive
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error toggling status",
            error: error.message
        });
    }
};

// Update Agent Commission (Admin Only)
exports.updateCommission = async (req, res) => {
    try {
        const { commissionPercentage } = req.body;

        if (!commissionPercentage || commissionPercentage < 0 || commissionPercentage > 100) {
            return res.status(400).json({
                success: false,
                message: "Invalid commission percentage (0-100)"
            });
        }

        const agent = await Agent.findByIdAndUpdate(
            req.params.id,
            { commissionPercentage },
            { new: true }
        ).select("-password");

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        res.json({
            success: true,
            message: "Commission updated successfully",
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating commission",
            error: error.message
        });
    }
};


