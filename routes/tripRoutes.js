const express = require("express");
const router = express.Router();

const {
    findAndAssignDriver,
    getPendingRequests,
    respondToRequest,
    startTrip,
    endTrip,
    markArrived,
    cancelTripByDriver,
    getDriverLocation,
    getDriverTrips
} = require("../controllers/tripController");

const { auth, driverOnly } = require("../middleware/auth"); 

// 1. Manually trigger auto-match (Auto-Matching for Private Rides usually)
router.post("/trigger-match/:bookingId", findAndAssignDriver);

// 2. Driver App: Polling for new ride requests
router.get("/requests/pending", auth, driverOnly, getPendingRequests); // Driver gets notified

// 3. Driver App: Action on notification
router.put("/requests/:requestId/respond", auth, driverOnly, respondToRequest); // Accept or Reject

// 4. Driver notified arrival (Waiting starts)
router.put("/execute/:bookingId/arrived", auth, driverOnly, markArrived);

// 5. Start the trip (OTP required)
router.put("/execute/:bookingId/start", auth, driverOnly, startTrip);

// 5. End the trip
router.put("/execute/:bookingId/end", auth, driverOnly, endTrip);

// 5b. Driver Cancel the trip (Before start)
router.put("/execute/:bookingId/cancel", auth, driverOnly, cancelTripByDriver);

// 6. Track Driver Location (User Only)
router.get("/track/:bookingId", auth, getDriverLocation);

// 7. Driver's Own Bookings
router.get("/driver/my-trips", auth, driverOnly, getDriverTrips);

module.exports = router;
