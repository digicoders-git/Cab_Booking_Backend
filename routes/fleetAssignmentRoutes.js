const express = require("express");
const router = express.Router();

const {
    assignCarToDriver,
    unassignCarFromDriver,
    getCarAssignmentStatus,
    getAllAssignments,
    getUnassignedHistory, // ← Naya function add kiya
    getAssignmentHistory,
    adminGetAllAssignmentsGlobal // NEW: Admin view all fleets' assignments
} = require("../controllers/fleetAssignmentController");

const { auth, fleetOnly, adminOnly } = require("../middleware/auth");

// Admin: Get All Assignments Across ALL Fleets (Admin Only)
router.get("/admin/all", auth, adminOnly, adminGetAllAssignmentsGlobal);

// Assign Car to Driver (Fleet Only)
router.post("/assign", auth, fleetOnly, assignCarToDriver);

// Get All ACTIVE Assignments for Fleet (Fleet Only)
router.get("/all", auth, fleetOnly, getAllAssignments);

// Get All UNASSIGNED (PAST) Assignments for Fleet (Fleet Only)
router.get("/unassigned", auth, fleetOnly, getUnassignedHistory);

// Unassign Car from Driver (Fleet Only) - uses assignmentId
router.put("/unassign/:assignmentId", auth, fleetOnly, unassignCarFromDriver);

// Get Car Assignment Status (Fleet Only) - uses carId
router.get("/status/:carId", auth, fleetOnly, getCarAssignmentStatus);

// Get Assignment History for a Car (Fleet Only) - uses carId
router.get("/history/:carId", auth, fleetOnly, getAssignmentHistory);

module.exports = router;
