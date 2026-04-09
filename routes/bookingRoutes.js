const express = require("express");
const router = express.Router();

const {
    estimateFare,
    getAllFareEstimates,
    createBooking,
    getMyBookings,
    getAllBookings, // NEW: Admin view
    cancelBooking,
    getSingleBooking,
    deleteBooking
} = require("../controllers/bookingController");

const { auth, adminOnly, agentOnly } = require("../middleware/auth");
const { checkPermission } = require("../middleware/rbac");

// 1. Get Fare Estimate (Single Choice)
router.post("/estimate-fare", estimateFare); 

// 1b. Search Cabs (Get all category options with fares)
router.post("/search-cabs", getAllFareEstimates); 

// 2. Create a new Booking (User/Agent)
// Requires Auth since we need to track who made the booking
router.post("/create", auth, createBooking);

// 3. View Booking History (User/Agent)
router.get("/my-bookings", auth, getMyBookings);

// 3b. View All Bookings (Admin Only)
router.get("/all", auth, checkPermission("BOOKING_READ"), getAllBookings);

// 4. Cancel Booking (User/Agent/Admin)
router.put("/cancel/:bookingId", auth, cancelBooking);

// 5. Get Single Booking Details (User/Driver/Admin)
router.get("/:bookingId", auth, getSingleBooking);

// 6. Delete Booking (Admin Only)
router.delete("/delete/:bookingId", auth, checkPermission("BOOKING_DELETE"), deleteBooking);

module.exports = router;
