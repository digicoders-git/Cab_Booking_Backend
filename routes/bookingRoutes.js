const express = require("express");
const router = express.Router();

const {
    estimateFare,
    createBooking,
    getMyBookings,
    cancelBooking
} = require("../controllers/bookingController");

const { auth, adminOnly, agentOnly } = require("../middleware/auth"); // Can be imported later for roles

// 1. Get Fare Estimate (Public/User/Agent - Before confirming booking)
router.post("/estimate-fare", estimateFare); // Needs post as sending coords/distance

// 2. Create a new Booking (User/Agent)
// Requires Auth since we need to track who made the booking
router.post("/create", auth, createBooking);

// 3. View Booking History (User/Agent)
router.get("/my-bookings", auth, getMyBookings);

// 4. Cancel Booking (User/Agent/Admin)
router.put("/cancel/:bookingId", auth, cancelBooking);

module.exports = router;
