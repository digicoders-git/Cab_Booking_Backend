const express = require("express");
const router = express.Router();

const {
    createCar,
    getFleetCars,
    getFleetCar,
    updateCar,
    deleteCar,
    getAvailableCars,
    getBusyCars
} = require("../controllers/fleetCarController");

const { auth, fleetOnly } = require("../middleware/auth");

// Create Car (Fleet Only)
router.post("/create", auth, fleetOnly, createCar);

// Get All Fleet Cars (Fleet Only)
router.get("/all", auth, fleetOnly, getFleetCars);

// Get Available Cars (Fleet Only) - MUST BE BEFORE /:carId
router.get("/available", auth, fleetOnly, getAvailableCars);

// Get Busy Cars (Fleet Only) - MUST BE BEFORE /:carId
router.get("/busy", auth, fleetOnly, getBusyCars);

// Get Single Car by ID (Fleet Only)
router.get("/:carId", auth, fleetOnly, getFleetCar);

// Update Car by ID (Fleet Only)
router.put("/:carId", auth, fleetOnly, updateCar);

// Delete Car by ID (Fleet Only)
router.delete("/:carId", auth, fleetOnly, deleteCar);

module.exports = router;
