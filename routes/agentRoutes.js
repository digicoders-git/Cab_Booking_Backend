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
    getAgentDashboard, // Naya function add kiya
    getAgentReport, // Detail report including 7 days earnings
    downloadAgentReport, // Download report as PDF or CSV
    adminUpdateAgent
} = require("../controllers/agentController");

const { auth, adminOnly, agentOnly } = require("../middleware/auth");
const upload = require("../middleware/uploadAdminImage");

// Agent Creation (Admin Only - Only Admin can create agents)
router.post("/create", auth, adminOnly, upload.fields([
    { name: "image", maxCount: 1 },
    { name: "aadhar", maxCount: 1 },
    { name: "pan", maxCount: 1 }
]), registerAgent);

// Agent Login
router.post("/login", loginAgent);

// Agent Profile (Protected - Agent Only)
router.get("/profile", auth, agentOnly, getAgentProfile);

// Agent Dashboard (Protected - Agent Only)
router.get("/dashboard", auth, agentOnly, getAgentDashboard);

// Agent Detailed Report (Protected - Agent Only)
router.get("/report", auth, agentOnly, getAgentReport);

// Agent Report Download PDF/CSV (Protected - Agent Only)
router.get("/report/download", auth, agentOnly, downloadAgentReport);

// Update Agent Profile (Protected - Agent Only)
router.put("/profile-update", auth, agentOnly, upload.fields([
    { name: "image", maxCount: 1 },
    { name: "aadhar", maxCount: 1 },
    { name: "pan", maxCount: 1 }
]), updateAgentProfile);

// Get All Agents (Admin Only)
router.get("/all", auth, adminOnly, getAllAgents);

// Delete Agent (Admin Only)
router.delete("/delete/:id", auth, adminOnly, deleteAgent);

// Toggle Agent Status (Admin Only) - Active/Inactive
router.put("/toggle-status/:id", auth, adminOnly, toggleAgentStatus);

// Update Agent Commission (Admin Only)
router.put("/update-commission/:id", auth, adminOnly, updateCommission);

// Update Agent Manually (Admin Only)
router.put("/update/:id", auth, adminOnly, upload.fields([
    { name: "image", maxCount: 1 },
    { name: "aadhar", maxCount: 1 },
    { name: "pan", maxCount: 1 }
]), adminUpdateAgent);

// Get Single Agent (Admin Only)
router.get("/:id", auth, adminOnly, getSingleAgent);

module.exports = router;
