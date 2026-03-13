const express = require("express");
const router = express.Router();

const {
    findAndAssignDriver,
    getPendingRequests,
    respondToRequest,
    startTrip,
    endTrip
} = require("../controllers/tripController");

const { auth, driverOnly } = require("../middleware/auth"); 

// 1. Manually trigger auto-match (Auto-Matching for Private Rides usually)
router.post("/trigger-match/:bookingId", findAndAssignDriver);

// 1.B NEW PHASE: Search specifically for Shared Rides (returns map of cars & seats)
const { searchSharedRides, requestSpecificSharedDriver } = require("../controllers/tripController");
router.get("/shared-rides/search/:bookingId", searchSharedRides);

// 1.C NEW PHASE: Request a specific seat from a specific driver
router.post("/shared-rides/book-seat/:bookingId", requestSpecificSharedDriver);

// 2. Driver App: Polling for new ride requests
router.get("/requests/pending", auth, driverOnly, getPendingRequests); // Driver gets notified

// 3. Driver App: Action on notification
router.put("/requests/:requestId/respond", auth, driverOnly, respondToRequest); // Accept or Reject

// 4. Start the trip (OTP required)
router.put("/execute/:bookingId/start", auth, driverOnly, startTrip);

// 5. End the trip
router.put("/execute/:bookingId/end", auth, driverOnly, endTrip);

module.exports = router;
