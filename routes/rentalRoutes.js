const express = require("express");
const router = express.Router();
const { auth, adminOnly, userOnly, driverOnly } = require("../middleware/auth");
const { checkPermission } = require("../middleware/rbac");
const {
    createRentalPackage,
    updateRentalPackage,
    getRentalPackagesAdmin,
    getAllRentalBookingsAdmin,
    toggleRentalPackageStatus,
    deleteRentalPackage,
    getActiveRentalPackages,
    bookRental,
    getUserRentalBookings,
    endRentalTrip,
    cancelRentalBooking,
    deleteRentalBookingAdmin,
    acceptRentalBooking,
    startRentalRide,
    getDriverRentalBookings,
    rejectRentalBooking,
    verifyRentalPayment
} = require("../controllers/rentalController");

// Admin Routes
router.post("/package", auth, checkPermission("RENTAL_PACKAGE_CREATE"), createRentalPackage);
router.put("/package/:id", auth, checkPermission("RENTAL_PACKAGE_EDIT"), updateRentalPackage);
router.get("/packages/all", auth, checkPermission("RENTAL_PACKAGE_READ"), getRentalPackagesAdmin);
router.get("/bookings/all", auth, checkPermission("RENTAL_BOOKING_READ"), getAllRentalBookingsAdmin);
router.delete("/bookings/:id", auth, checkPermission("RENTAL_BOOKING_DELETE"), deleteRentalBookingAdmin);
router.put("/package/:id/toggle", auth, checkPermission("RENTAL_PACKAGE_EDIT"), toggleRentalPackageStatus);
router.delete("/package/:id", auth, checkPermission("RENTAL_PACKAGE_DELETE"), deleteRentalPackage);

// User Routes
router.get("/packages", getActiveRentalPackages);
router.post("/book", auth, userOnly, bookRental);
router.get("/my-bookings", auth, userOnly, getUserRentalBookings);
router.put("/bookings/:id/cancel", auth, userOnly, cancelRentalBooking);

// Driver Routes (Simplified)
router.get("/driver/my-bookings", auth, driverOnly, getDriverRentalBookings);
router.put("/bookings/:id/accept", auth, driverOnly, acceptRentalBooking);
router.put("/bookings/:id/reject", auth, driverOnly, rejectRentalBooking);
router.post("/start-trip", auth, driverOnly, startRentalRide);
router.post("/end-trip", auth, driverOnly, endRentalTrip);
router.post("/verify-payment", verifyRentalPayment); // Or auth, driverOnly depending on who triggers it, but Razorpay webhook/redirect might not have auth headers easily if done via frontend redirect. Better to leave it open for Razorpay callback, but usually frontend sends it with token.
// Actually frontend will send this request after Razorpay redirects back. We can keep it auth, driverOnly if driver sends it, or let's just make it public.
router.post("/verify-payment", auth, driverOnly, verifyRentalPayment);

module.exports = router;
