const express = require("express");
const router = express.Router();

const {
    findAndAssignDriver,
    getPendingRequests,
    respondToRequest,
    startTrip,
    endTrip,
    markArrived,
    markStopArrived,
    completeStop,
    cancelTripByDriver,
    getDriverLocation,
    getDriverTrips,
    initiateTripPayment,
    verifyTripPayment,
    initiateTripCompletion,
    selectPaymentMethod,
    confirmCashCollection
} = require("../controllers/tripController");

const { auth, driverOnly, userOnly } = require("../middleware/auth"); 

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

// 5b. Multi-stop management
router.put("/execute/:bookingId/stops/:stopIndex/arrived", auth, driverOnly, markStopArrived);
router.put("/execute/:bookingId/stops/:stopIndex/complete", auth, driverOnly, completeStop);

// 5c. Driver Cancel the trip (Before start)
router.put("/execute/:bookingId/cancel", auth, driverOnly, cancelTripByDriver);

// 6. Track Driver Location (User Only)
router.get("/track/:bookingId", auth, getDriverLocation);

// 7. Driver's Own Bookings
router.get("/driver/my-trips", auth, driverOnly, getDriverTrips);

// 8. Payments for Normal Trips
router.post("/execute/:bookingId/initiate-payment", auth, driverOnly, initiateTripPayment);
router.post("/execute/verify-payment", auth, driverOnly, verifyTripPayment);
router.all("/execute/payment-return", require("../controllers/tripController").paymentReturn);

// 9. User-Side Payment Flow APIs
router.post("/execute/:bookingId/initiate-completion", auth, driverOnly, initiateTripCompletion);
router.post("/execute/:bookingId/select-payment", auth, selectPaymentMethod); // Removed userOnly strictly since Agent could also be the one paying if they booked it? Let's keep it simple with just auth for now.
router.post("/execute/:bookingId/confirm-cash", auth, driverOnly, confirmCashCollection);

module.exports = router;
