const express = require('express');
const router = express.Router();

const fixedRouteController = require('../controllers/fixedRouteController');
const fixedBookingController = require('../controllers/fixedBookingController');

// Assume these middleware exist. I will use standard names from other routes if possible.
// For now I'll just use standard middleware names that might exist or just protect it in server.js
const { auth, driverOnly, adminOnly } = require('../middleware/auth');

// === Fixed Routes (Admin) ===
router.post('/routes', auth, adminOnly, fixedRouteController.createRoute);
router.get('/routes', auth, adminOnly, fixedRouteController.getAllRoutes);
router.put('/routes/:id', auth, adminOnly, fixedRouteController.updateRoute);
router.put('/routes/:id/toggle', auth, adminOnly, fixedRouteController.toggleRouteStatus);
router.delete('/routes/:id', auth, adminOnly, fixedRouteController.deleteRoute);

// === Fixed Routes (User) ===
router.get('/routes/active', fixedRouteController.getActiveRoutes); // User can fetch active routes

// === Fixed Bookings (User) ===
router.post('/bookings', auth, fixedBookingController.bookFixedRoute); // User booking
router.get('/bookings/my-bookings', auth, fixedBookingController.getMyFixedBookings); // User fetches their own bookings
router.put('/bookings/:id/cancel', auth, fixedBookingController.cancelBookingUser); // User cancels their own booking
router.post('/bookings/:id/pay', auth, fixedBookingController.createOnlinePayment); // User creates payment
router.get('/bookings/:id/verify-payment', fixedBookingController.verifyOnlinePayment); // User verifies payment via Redirect
router.get('/bookings/:id/receipt', auth, fixedBookingController.downloadReceipt); // Download Fixed Booking Receipt

// === Marketplace & All Bookings (Admin) ===
router.get('/bookings/admin/all', auth, adminOnly, fixedBookingController.getAllAdminFixedBookings);
router.get('/bookings/marketplace/admin', auth, adminOnly, fixedBookingController.getAdminMarketplaceBookings);
router.post('/bookings/:id/accept-admin', auth, adminOnly, fixedBookingController.acceptBookingAdmin);
router.delete('/bookings/:id/admin', auth, adminOnly, fixedBookingController.deleteBookingAdmin);

router.get('/bookings/marketplace/driver', auth, driverOnly, fixedBookingController.getDriverMarketplaceBookings);
router.post('/bookings/:id/accept-driver', auth, driverOnly, fixedBookingController.acceptBookingDriver);
router.post('/bookings/:id/start-driver', auth, driverOnly, fixedBookingController.startBookingDriver);
router.post('/bookings/:id/complete-driver', auth, driverOnly, fixedBookingController.completeBookingDriver);
router.post('/bookings/:id/confirm-cash', auth, driverOnly, fixedBookingController.confirmCashDriver);
router.get('/bookings/my-accepted/driver', auth, driverOnly, fixedBookingController.getDriverAcceptedBookings);

module.exports = router;
