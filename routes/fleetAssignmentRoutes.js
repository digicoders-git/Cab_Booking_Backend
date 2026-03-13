const express = require("express");
const router = express.Router();

const {
    assignCarToDriver,
    unassignCarFromDriver,
    getCarAssignmentStatus,
    getAllAssignments,
    getAssignmentHistory
} = require("../controllers/fleetAssignmentController");

const { auth, fleetOnly } = require("../middleware/auth");

// Assign Car to Driver (Fleet Only)
router.post("/assign", auth, fleetOnly, assignCarToDriver);

// Get All Assignments for Fleet (Fleet Only)
router.get("/all", auth, fleetOnly, getAllAssignments);

// Unassign Car from Driver (Fleet Only) - uses assignmentId
router.put("/unassign/:assignmentId", auth, fleetOnly, unassignCarFromDriver);

// Get Car Assignment Status (Fleet Only) - uses carId
router.get("/status/:carId", auth, fleetOnly, getCarAssignmentStatus);

// Get Assignment History for a Car (Fleet Only) - uses carId
router.get("/history/:carId", auth, fleetOnly, getAssignmentHistory);

module.exports = router;
