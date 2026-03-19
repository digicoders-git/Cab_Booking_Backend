const express = require("express");
const router = express.Router();

const {
    registerAgent,
    loginAgent,
    getAgentProfile,
    updateAgentProfile,
    getAllAgents,
    getSingleAgent,
    deleteAgent,
    toggleAgentStatus,
    updateCommission,
    adminUpdateAgent
} = require("../controllers/agentController");

const { auth, adminOnly, agentOnly } = require("../middleware/auth");
const upload = require("../middleware/uploadAdminImage");

// Agent Creation (Admin Only - Only Admin can create agents)
router.post("/create", auth, adminOnly, upload.single("image"), registerAgent);

// Agent Login
router.post("/login", loginAgent);

// Agent Profile (Protected - Agent Only)
router.get("/profile", auth, agentOnly, getAgentProfile);

// Update Agent Profile (Protected - Agent Only)
router.put("/profile-update", auth, agentOnly, upload.single("image"), updateAgentProfile);

// Get All Agents (Admin Only)
router.get("/all", auth, adminOnly, getAllAgents);

// Delete Agent (Admin Only)
router.delete("/delete/:id", auth, adminOnly, deleteAgent);

// Toggle Agent Status (Admin Only) - Active/Inactive
router.put("/toggle-status/:id", auth, adminOnly, toggleAgentStatus);

// Update Agent Commission (Admin Only)
router.put("/update-commission/:id", auth, adminOnly, updateCommission);

// Update Agent Manually (Admin Only)
router.put("/update/:id", auth, adminOnly, upload.single("image"), adminUpdateAgent);

// Get Single Agent (Admin Only)
router.get("/:id", auth, adminOnly, getSingleAgent);

module.exports = router;
