const express = require("express");
const router = express.Router();
const bulkBookingController = require("../controllers/bulkBookingController");
const { auth, fleetOnly } = require("../middleware/auth");

// 1. Marketplace Access for Fleets & Admins
router.get("/marketplace", auth, bulkBookingController.getMarketplace);

// 2. Acceptance for Fleets
router.post("/accept/:bookingId", auth, fleetOnly, bulkBookingController.acceptBulkBooking);

// 3. Creation (Any protected role)
router.post("/create", auth, bulkBookingController.createBulkBooking);

// 4. View Own (Fleet)
router.get("/my-bulk-rides", auth, fleetOnly, bulkBookingController.getMyBulkBookings);

// 5. View Own (Creator/Admin)
router.get("/my-requests", auth, bulkBookingController.getMyCreatedRequests);

// 6. Cancel Request
router.delete("/cancel/:bookingId", auth, bulkBookingController.cancelBulkBooking);

module.exports = router;
