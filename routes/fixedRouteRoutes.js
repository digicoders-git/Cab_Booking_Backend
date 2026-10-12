const express = require('express');
const router = express.Router();

const fixedRouteController = require('../controllers/fixedRouteController');
const fixedBookingController = require('../controllers/fixedBookingController');

// Assume these middleware exist. I will use standard names from other routes if possible.
// For now I'll just use standard middleware names that might exist or just protect it in server.js
const { auth, driverOnly, adminOnly, fleetOnly } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

// === Fixed Routes (Admin) ===
router.post('/routes', auth, checkPermission('FIXED_ROUTE_CREATE'), fixedRouteController.createRoute);
router.get('/routes', auth, checkPermission('FIXED_ROUTE_READ'), fixedRouteController.getAllRoutes);
router.put('/routes/:id', auth, checkPermission('FIXED_ROUTE_EDIT'), fixedRouteController.updateRoute);
router.put('/routes/:id/toggle', auth, checkPermission('FIXED_ROUTE_EDIT'), fixedRouteController.toggleRouteStatus);
router.delete('/routes/:id', auth, checkPermission('FIXED_ROUTE_DELETE'), fixedRouteController.deleteRoute);

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
router.get('/bookings/admin/all', auth, checkPermission(['FIXED_BOOKINGS_READ', 'FIXED_ROUTE_READ']), fixedBookingController.getAllAdminFixedBookings);
router.get('/bookings/marketplace/admin', auth, checkPermission(['FIXED_MARKETPLACE_READ', 'FIXED_ROUTE_READ']), fixedBookingController.getAdminMarketplaceBookings);
router.post('/bookings/:id/accept-admin', auth, checkPermission('FIXED_ROUTE_EDIT'), fixedBookingController.acceptBookingAdmin);
router.delete('/bookings/:id/admin', auth, checkPermission('FIXED_ROUTE_DELETE'), fixedBookingController.deleteBookingAdmin);

router.get('/bookings/marketplace/driver', auth, driverOnly, fixedBookingController.getDriverMarketplaceBookings);
router.post('/bookings/:id/accept-driver', auth, driverOnly, fixedBookingController.acceptBookingDriver);
router.post('/bookings/:id/start-driver', auth, driverOnly, fixedBookingController.startBookingDriver);
router.post('/bookings/:id/complete-driver', auth, driverOnly, fixedBookingController.completeBookingDriver);
router.post('/bookings/:id/confirm-cash', auth, driverOnly, fixedBookingController.confirmCashDriver);
router.get('/bookings/my-accepted/driver', auth, driverOnly, fixedBookingController.getDriverAcceptedBookings);

// === Fixed Bookings (Fleet Admin) ===
router.get('/fleet/bookings', auth, fleetOnly, fixedBookingController.getFleetFixedBookings);

module.exports = router;
