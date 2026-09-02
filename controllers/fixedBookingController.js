const FixedRoute = require("../models/FixedRoute");
const FixedBooking = require("../models/FixedBooking");
const Driver = require("../models/Driver");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const User = require("../models/User");
const { RazorpayHandler } = require("../utils/RazorpayHandler");
const razorpayHandler = RazorpayHandler.getInstance();
const { getIO } = require("../socket/socket");
const { sendPushNotification } = require("../utils/fcmNotification");

// User books a fixed route
exports.bookFixedRoute = async (req, res) => {
    try {
        const { routeId, pickupDate, pickupTime, paymentMethod } = req.body;
        const userId = req.user.id; // Assuming user auth middleware sets req.user

        const route = await FixedRoute.findById(routeId);
        if (!route) return res.status(404).json({ success: false, message: "Route not found" });
        if (!route.isActive) return res.status(400).json({ success: false, message: "This route is currently inactive" });

        const newBooking = new FixedBooking({
            user: userId,
            fixedRoute: route._id,
            pickupLocation: route.pickupLocation,
            pickupLat: route.pickupLat,
            pickupLng: route.pickupLng,
            dropLocation: route.dropLocation,
            dropLat: route.dropLat,
            dropLng: route.dropLng,
            carCategory: route.carCategory,
            price: route.price,
            adminCommission: route.adminCommission,
            pickupDate,
            pickupTime,
            paymentMethod: paymentMethod || 'Cash',
            tripType: route.tripType || 'One-Way',
            maxTimeHours: route.maxTimeHours || 0,
            extraTimeChargePerHour: route.extraTimeChargePerHour || 0,
            maxDistanceKm: route.maxDistanceKm || 0,
            extraDistanceChargePerKm: route.extraDistanceChargePerKm || 0,
            startOtp: Math.floor(1000 + Math.random() * 9000).toString()
        });

        // GST Calculation
        newBooking.cgst = Math.round(newBooking.price * 0.025);
        newBooking.sgst = Math.round(newBooking.price * 0.025);
        newBooking.totalWithTax = newBooking.price + newBooking.cgst + newBooking.sgst;
        // finalPrice initially equals totalWithTax unless extra charges are added later
        newBooking.finalPrice = newBooking.totalWithTax;

        await newBooking.save();

        // 1. WebSocket Event to Admin & Driver Marketplace
        try {
            const io = getIO();
            if (io) {
                // Populate required fields for marketplace view before emitting
                const populatedBooking = await FixedBooking.findById(newBooking._id)
                    .populate('user', 'name phone')
                    .populate('carCategory', 'name icon');
                io.emit('newFixedBookingMarketplace', { booking: populatedBooking });
            }
        } catch (sockErr) {
            console.error("Socket error on new booking:", sockErr);
        }

        // 2. FCM Notification to Drivers and Admin
        try {
            // Find drivers matching the car category
            const drivers = await Driver.find({ 'carDetails.carType': route.carCategory, fcmToken: { $ne: null } });
            
            const payload = {
                title: "New Package Ride Available! 🚖",
                body: `Package trip from ${route.pickupLocation} to ${route.dropLocation} for ₹${route.price}`,
                data: { bookingId: newBooking._id.toString(), type: "FIXED_BOOKING" }
            };
            
            drivers.forEach(driver => {
                if (driver.fcmToken) {
                    sendPushNotification(driver.fcmToken, payload);
                }
            });

            // Also notify Admin if they have an FCM token setup (assuming Admin model has it or just skip for now, 
            // usually admins use the web dashboard so websocket is enough, but we can do a general topic if needed).
            // Let's rely on websocket for Admin for now as they are on dashboard.
        } catch (fcmErr) {
            console.error("FCM error on new booking:", fcmErr);
        }

        res.status(201).json({ success: true, message: "Fixed route booked successfully", booking: newBooking });
    } catch (error) {
        console.error("Error booking fixed route:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Get User's own fixed bookings
exports.getMyFixedBookings = async (req, res) => {
    try {
        const userId = req.user.id;
        const bookings = await FixedBooking.find({ user: userId })
            .populate('fixedRoute')
            .populate('assignedDriver', 'name phone profilePicture')
            .populate('carCategory', 'name')
            .sort({ createdAt: -1 });
            
        res.status(200).json({ success: true, bookings });
    } catch (error) {
        console.error("Error fetching user's fixed bookings:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Admin gets all marketplace bookings
exports.getAdminMarketplaceBookings = async (req, res) => {
    try {
        const bookings = await FixedBooking.find({ status: 'Marketplace' })
            .populate('user', 'name phone')
            .populate('carCategory', 'name icon');
        res.status(200).json({ success: true, bookings });
    } catch (error) {
        console.error("Error fetching admin marketplace:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Admin gets ALL fixed bookings (for table history)
exports.getAllAdminFixedBookings = async (req, res) => {
    try {
        const bookings = await FixedBooking.find({})
            .populate('user', 'name phone email')
            .populate('assignedDriver', 'name phone')
            .populate('carCategory', 'name icon')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, bookings });
    } catch (error) {
        console.error("Error fetching all admin fixed bookings:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Driver gets matching marketplace bookings
exports.getDriverMarketplaceBookings = async (req, res) => {
    try {
        const driverId = req.user.id; // From driver auth middleware
        const driver = await Driver.findById(driverId);
        if (!driver || !driver.carDetails || !driver.carDetails.carType) {
            return res.status(400).json({ success: false, message: "Driver car category not set" });
        }

        const bookings = await FixedBooking.find({ 
            status: 'Marketplace',
            carCategory: driver.carDetails.carType
        }).populate('user', 'name phone').populate('carCategory', 'name icon');

        res.status(200).json({ success: true, bookings });
    } catch (error) {
        console.error("Error fetching driver marketplace:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Driver gets their accepted/completed bookings
exports.getDriverAcceptedBookings = async (req, res) => {
    try {
        const driverId = req.user.id;
        
        const bookings = await FixedBooking.find({ 
            assignedDriver: driverId,
            status: { $in: ['Accepted', 'Started', 'Completed', 'Cancelled'] }
        }).populate('user', 'name phone').populate('carCategory', 'name icon').sort({ acceptedAt: -1 });

        res.status(200).json({ success: true, bookings });
    } catch (error) {
        console.error("Error fetching driver accepted bookings:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Driver accepts booking
exports.acceptBookingDriver = async (req, res) => {
    try {
        const { id } = req.params; // booking id
        const driverId = req.user.id;

        const booking = await FixedBooking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
        if (booking.status !== 'Marketplace') return res.status(400).json({ success: false, message: "Booking no longer available" });

        const driver = await Driver.findById(driverId);
        if (driver.carDetails.carType.toString() !== booking.carCategory.toString()) {
            return res.status(403).json({ success: false, message: "Car category mismatch" });
        }

        // Deduct commission upfront ONLY if cash payment
        if (booking.paymentMethod === 'Cash') {
            if (driver.walletBalance - booking.adminCommission < driver.debtLimit) {
                return res.status(400).json({ success: false, message: "Insufficient wallet balance to accept this cash ride" });
            }

            driver.walletBalance -= booking.adminCommission;
            await driver.save();

            const tx = new Transaction({
                user: driverId,
                userModel: 'Driver',
                amount: booking.adminCommission,
                type: 'Debit',
                category: 'Commission',
                status: 'Completed',
                description: `Admin commission for Fixed Route Booking ${booking._id}`
            });
            await tx.save();

            const admin = await Admin.findOne();
            if (admin) {
                admin.walletBalance = (admin.walletBalance || 0) + booking.adminCommission;
                admin.totalEarnings = (admin.totalEarnings || 0) + booking.adminCommission;
                await admin.save();
                await Transaction.create({
                    user: admin._id, userModel: 'Admin', amount: booking.adminCommission, type: 'Credit',
                    category: 'Commission', status: 'Completed', description: `Admin commission for Fixed Route Booking ${booking._id}`
                });
            }

            booking.commissionDeducted = true;
        }

        booking.status = 'Accepted';
        booking.assignedDriver = driverId;
        booking.acceptedAt = new Date();
        await booking.save();

        // Socket and FCM to User
        try {
            const io = getIO();
            if (io) {
                // Remove from marketplace for everyone
                io.emit('removeFixedBookingMarketplace', { bookingId: booking._id });
                // Notify user
                io.to(booking.user.toString()).emit('booking_update', { bookingId: booking._id });
                io.to(booking.user.toString()).emit('fixedBookingAccepted', { bookingId: booking._id });
            }

            const user = await User.findById(booking.user);
            console.log(`[FCM-DEBUG-FIXED] User fetched: ${user?.name}, Token: ${user?.fcmToken}`);
            if (user && user.fcmToken) {
                const fcmRes = await sendPushNotification(user.fcmToken, {
                    title: "Ride Accepted! 🚖",
                    body: `${driver.name} is arriving to pick you up.`,
                    data: { bookingId: booking._id.toString(), type: "FIXED_BOOKING_ACCEPTED" }
                });
                console.log(`[FCM-DEBUG-FIXED] Push sent to user. Response:`, fcmRes);
            } else {
                console.log(`[FCM-DEBUG-FIXED] No FCM Token for User ID ${booking.user}`);
            }
        } catch (err) {
            console.error("Error sending accept notifications:", err);
        }

        res.status(200).json({ success: true, message: "Booking accepted successfully", booking });
    } catch (error) {
        console.error("Error accepting booking driver:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Driver cancels booking
exports.cancelBookingDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const driverId = req.user.id;

        const booking = await FixedBooking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
        if (booking.assignedDriver?.toString() !== driverId.toString()) {
            return res.status(403).json({ success: false, message: "Not your booking" });
        }
        if (booking.status !== 'Accepted') {
            return res.status(400).json({ success: false, message: "Cannot cancel this booking" });
        }

        // Refund commission if deducted
        if (booking.commissionDeducted) {
            const driver = await Driver.findById(driverId);
            if (driver) {
                driver.walletBalance += booking.adminCommission;
                await driver.save();
                await Transaction.create({
                    user: driverId, userModel: 'Driver', amount: booking.adminCommission, type: 'Credit',
                    category: 'Refund', status: 'Completed', description: `Commission refund for cancelled booking ${booking._id}`
                });
            }
            const admin = await Admin.findOne();
            if (admin) {
                admin.walletBalance -= booking.adminCommission;
                admin.totalEarnings -= booking.adminCommission;
                await admin.save();
                await Transaction.create({
                    user: admin._id, userModel: 'Admin', amount: booking.adminCommission, type: 'Debit',
                    category: 'Refund', status: 'Completed', description: `Commission refund for cancelled booking ${booking._id}`
                });
            }
        }

        booking.status = 'Cancelled';
        await booking.save();

        res.status(200).json({ success: true, message: "Booking cancelled", booking });
    } catch (error) {
        console.error("Error cancelling booking:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// User cancels booking
exports.cancelBookingUser = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const booking = await FixedBooking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
        if (booking.user.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Not your booking" });
        }
        if (['Completed', 'Cancelled'].includes(booking.status)) {
            return res.status(400).json({ success: false, message: "Cannot cancel this booking" });
        }

        // Check previous status for notifications
        const previousStatus = booking.status;

        // If it was already accepted, we need to refund the driver
        if (previousStatus === 'Accepted' && booking.commissionDeducted && booking.assignedDriver) {
            const driver = await Driver.findById(booking.assignedDriver);
            if (driver) {
                driver.walletBalance += booking.adminCommission;
                await driver.save();
                await Transaction.create({
                    user: booking.assignedDriver, userModel: 'Driver', amount: booking.adminCommission, type: 'Credit',
                    category: 'Refund', status: 'Completed', description: `Commission refund for cancelled booking ${booking._id} (User Cancelled)`
                });
                
                // FCM to Driver
                if (driver.fcmToken) {
                    sendPushNotification(driver.fcmToken, {
                        title: "Ride Cancelled ❌",
                        body: "The user has cancelled the package ride.",
                        data: { bookingId: booking._id.toString(), type: "FIXED_BOOKING_CANCELLED" }
                    });
                }
            }
            const admin = await Admin.findOne();
            if (admin) {
                admin.walletBalance -= booking.adminCommission;
                admin.totalEarnings -= booking.adminCommission;
                await admin.save();
                await Transaction.create({
                    user: admin._id, userModel: 'Admin', amount: booking.adminCommission, type: 'Debit',
                    category: 'Refund', status: 'Completed', description: `Commission refund for cancelled booking ${booking._id} (User Cancelled)`
                });
            }
        }

        booking.status = 'Cancelled';
        await booking.save();

        // Socket Events
        try {
            const io = getIO();
            if (io) {
                if (previousStatus === 'Marketplace') {
                    // Remove from marketplace
                    io.emit('removeFixedBookingMarketplace', { bookingId: booking._id });
                } else if (previousStatus === 'Accepted' && booking.assignedDriver) {
                    // Notify specific driver
                    io.to(booking.assignedDriver.toString()).emit('fixedBookingCancelled', { bookingId: booking._id });
                    // Also refresh driver's marketplace just in case
                    io.emit('removeFixedBookingMarketplace', { bookingId: booking._id });
                    
                    // Notify user as well
                    io.to(booking.user.toString()).emit('fixedBookingCancelled', { bookingId: booking._id });
                }
            }
        } catch (sockErr) {
            console.error("Socket error on cancel user booking:", sockErr);
        }

        res.status(200).json({ success: true, message: "Booking cancelled successfully", booking });
    } catch (error) {
        console.error("Error cancelling user booking:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Create Online Payment Session
exports.createOnlinePayment = async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await FixedBooking.findById(id).populate('user');
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.paymentMethod !== 'Online') {
            return res.status(400).json({ success: false, message: "Booking is not set for online payment" });
        }
        if (booking.paymentStatus === 'Completed') {
            return res.status(400).json({ success: false, message: "Payment already completed" });
        }
        if (booking.status !== 'Completed') {
            return res.status(400).json({ success: false, message: "Ride must be completed before payment" });
        }

        const source = (req.body && req.body.source) ? req.body.source : 'web';
        const protocol = req.get('host').includes('localhost') ? 'http' : 'https';
        const return_url = `${protocol}://${req.get('host')}/api/fixed-routes/bookings/${booking._id}/verify-payment?source=${source}`;

        const finalAmount = (booking.finalPrice && booking.finalPrice > 0) ? booking.finalPrice : booking.price;
        const sessionResponse = await razorpayHandler.orderSession({
            amount: finalAmount, // full fare including extra time charges

            currency: 'INR',
            order_id: `fb_${booking._id.toString().slice(-6)}_${Date.now()}`,
            customer_id: booking.user.name || "Customer",
            customer_email: booking.user.email || "customer@example.com",
            customer_phone: booking.user.phone || "",
            return_url: return_url
        });

        res.status(200).json({ success: true, session: sessionResponse });
    } catch (error) {
        console.error("Error creating online payment:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Verify Online Payment
exports.verifyOnlinePayment = async (req, res) => {
    try {
        const { id } = req.params;
        // The return payload from payment link comes via query parameters
        const { source, razorpay_payment_id, razorpay_payment_link_id, razorpay_payment_link_reference_id, razorpay_payment_link_status, razorpay_signature } = req.query;

        const booking = await FixedBooking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        const isValid = razorpayHandler.validateSignature(
            razorpay_payment_id, 
            razorpay_payment_link_id, 
            razorpay_payment_link_reference_id, 
            razorpay_payment_link_status, 
            razorpay_signature
        );

        if (!isValid) {
            return res.status(400).json({ success: false, message: "Invalid payment signature" });
        }

        // Payment successful
        booking.paymentStatus = 'Completed';
        await booking.save();

        // Credit the Driver's earnings
        const Driver = require("../models/Driver");
        const Transaction = require("../models/Transaction");
        const Admin = require("../models/Admin");

        const totalPaid = (booking.finalPrice && booking.finalPrice > 0) ? booking.finalPrice : booking.price;
        const driverEarning = totalPaid - (booking.adminCommission || 0);
        
        if (booking.assignedDriver) {
            const driver = await Driver.findById(booking.assignedDriver);
            if (driver) {
                driver.walletBalance = (driver.walletBalance || 0) + driverEarning;
                driver.totalEarnings = (driver.totalEarnings || 0) + driverEarning;
                await driver.save();

                await Transaction.create({
                    user: driver._id,
                    userModel: 'Driver',
                    amount: driverEarning,
                    type: 'Credit',
                    category: 'Ride Earning',
                    status: 'Completed',
                    relatedBooking: booking._id,
                    description: `Earning for Fixed Route Booking ${booking._id} (Online Payment)`
                });
            }
        }

        // Admin gets the commission
        const admin = await Admin.findOne();
        if (admin) {
            admin.walletBalance = (admin.walletBalance || 0) + booking.adminCommission;
            admin.totalEarnings = (admin.totalEarnings || 0) + booking.adminCommission;
            await admin.save();

            await Transaction.create({
                user: admin._id, userModel: 'Admin', amount: booking.adminCommission, type: 'Credit',
                category: 'Commission', status: 'Completed', description: `Commission for Fixed Route Booking ${booking._id} (Online Payment)`
            });
        }

        // Emit WebSocket Event
        try {
            const io = getIO();
            if (io) {
                io.emit('fixedBookingPaymentSuccess', { bookingId: booking._id, status: 'Completed' });
            }
        } catch (sockErr) {
            console.error("Socket error during payment success:", sockErr);
        }

        if (source === 'app') {
            // Redirect to the custom scheme so the app intercepts it and closes the browser automatically
            return res.redirect(`kwikcab://payment-success?booking_id=${booking._id}&status=success`);
        }

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/my-booking?payment_success=true&booking_id=${booking._id}`);
    } catch (error) {
        console.error("Error verifying online payment:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Driver starts booking (OTP Verification)
exports.startBookingDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const { otp } = req.body;
        const driverId = req.user.id;

        const booking = await FixedBooking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.assignedDriver.toString() !== driverId.toString()) {
            return res.status(403).json({ success: false, message: "You are not assigned to this booking" });
        }
        if (booking.status !== 'Accepted') {
            return res.status(400).json({ success: false, message: "Only accepted bookings can be started" });
        }
        if (booking.startOtp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        booking.status = 'Started';
        booking.startedAt = new Date();
        await booking.save();

        try {
            const io = getIO();
            if (io) {
                io.to(booking.user.toString()).emit('booking_update', { bookingId: booking._id });
                io.to(booking.user.toString()).emit('fixedBookingStarted', { bookingId: booking._id });
            }

            const user = await User.findById(booking.user);
            if (user && user.fcmToken) {
                sendPushNotification(user.fcmToken, {
                    title: "Ride Started! 🚖",
                    body: "Your package ride has successfully started.",
                    data: { bookingId: booking._id.toString(), type: "FIXED_BOOKING_STARTED" }
                });
            }
        } catch (err) {
            console.error("Error sending start notifications:", err);
        }

        res.status(200).json({ success: true, message: "Booking started successfully", booking });
    } catch (error) {
        console.error("Error starting booking:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Driver completes booking
exports.completeBookingDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const driverId = req.user.id;
        const { totalDistanceDriven } = req.body; // Extract total distance

        const booking = await FixedBooking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Ensure the booking is assigned to this driver and is currently Started
        if (booking.assignedDriver.toString() !== driverId.toString()) {
            return res.status(403).json({ success: false, message: "You are not assigned to this booking" });
        }
        if (booking.status !== 'Started' && booking.status !== 'Accepted') {
            return res.status(400).json({ success: false, message: "Booking is not in a state to be completed" });
        }

        booking.status = 'Completed';
        booking.completedAt = new Date();

        // Calculate time penalty if applicable
        let finalPrice = booking.price;
        let extraCharges = 0;

        if (booking.startedAt && booking.maxTimeHours > 0) {
            const durationMs = booking.completedAt - booking.startedAt;
            const durationHours = durationMs / (1000 * 60 * 60);

            if (durationHours > booking.maxTimeHours) {
                const extraHours = Math.ceil(durationHours - booking.maxTimeHours);
                extraCharges = extraHours * booking.extraTimeChargePerHour;
                finalPrice += extraCharges;
            }
        }

        let extraDistanceCharges = 0;
        let actualDistance = totalDistanceDriven ? parseFloat(totalDistanceDriven) : 0;
        
        if (actualDistance > 0 && booking.maxDistanceKm > 0) {
            if (actualDistance > booking.maxDistanceKm) {
                const extraKm = Math.ceil(actualDistance - booking.maxDistanceKm);
                extraDistanceCharges = extraKm * booking.extraDistanceChargePerKm;
                finalPrice += extraDistanceCharges;
            }
        }

        booking.extraDistanceCharges = extraDistanceCharges;
        
        const totalExtra = extraCharges + extraDistanceCharges;
        if (totalExtra > 0) {
            // Recalculate tax on the new final price if there are extra charges
            booking.cgst = Math.round(finalPrice * 0.025);
            booking.sgst = Math.round(finalPrice * 0.025);
            booking.totalWithTax = finalPrice + booking.cgst + booking.sgst;
            booking.finalPrice = booking.totalWithTax;
        } else {
            // Keep original if no extra charges
            // booking.finalPrice is already totalWithTax from creation
            booking.finalPrice = booking.totalWithTax;
        }


        await booking.save();

        // Socket and FCM to User
        try {
            const io = getIO();
            if (io) {
                // Notify user to refresh UI (e.g. show Pay Now button)
                io.to(booking.user.toString()).emit('booking_update', { bookingId: booking._id });
                io.to(booking.user.toString()).emit('fixedBookingCompleted', { 
                    bookingId: booking._id,
                    price: booking.finalPrice,
                    paymentMethod: booking.paymentMethod
                });
            }

            const user = await User.findById(booking.user);
            if (user && user.fcmToken) {
                sendPushNotification(user.fcmToken, {
                    title: "Ride Completed! 🎉",
                    body: "Your package ride has been completed. Please proceed with payment if applicable.",
                    data: { bookingId: booking._id.toString(), type: "FIXED_BOOKING_COMPLETED" }
                });
            }
        } catch (err) {
            console.error("Error sending complete notifications:", err);
        }

        res.status(200).json({ success: true, message: "Booking marked as completed", booking });
    } catch (error) {
        console.error("Error completing booking:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Driver confirms cash collected
exports.confirmCashDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const driverId = req.user.id;

        const booking = await FixedBooking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Ensure the booking is assigned to this driver
        if (booking.assignedDriver.toString() !== driverId.toString()) {
            return res.status(403).json({ success: false, message: "You are not assigned to this booking" });
        }
        
        booking.paymentStatus = 'Completed';
        await booking.save();

        res.status(200).json({ success: true, message: "Cash collection confirmed", booking });
    } catch (error) {
        console.error("Error confirming cash for fixed booking:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};


// Admin accepts/assigns booking
exports.acceptBookingAdmin = async (req, res) => {
    try {
        const { id } = req.params; // booking id
        const { driverId } = req.body; // the driver the admin wants to assign it to
        const adminId = req.user.id;

        const booking = await FixedBooking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
        if (booking.status !== 'Marketplace') return res.status(400).json({ success: false, message: "Booking no longer available" });

        if (driverId) {
            const driver = await Driver.findById(driverId);
            if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

            if (booking.paymentMethod === 'Cash') {
                if (driver.walletBalance - booking.adminCommission < driver.debtLimit) {
                    return res.status(400).json({ success: false, message: "Insufficient wallet balance for this driver" });
                }
                driver.walletBalance -= booking.adminCommission;
                await driver.save();

                const tx = new Transaction({
                    user: driverId,
                    userModel: 'Driver',
                    amount: booking.adminCommission,
                    type: 'Debit',
                    category: 'Commission',
                    status: 'Completed',
                    description: `Admin commission for Fixed Route Booking ${booking._id} (Assigned by Admin)`
                });
                await tx.save();

                const admin = await Admin.findById(adminId) || await Admin.findOne();
                if (admin) {
                    admin.walletBalance = (admin.walletBalance || 0) + booking.adminCommission;
                    admin.totalEarnings = (admin.totalEarnings || 0) + booking.adminCommission;
                    await admin.save();
                    await Transaction.create({
                        user: admin._id, userModel: 'Admin', amount: booking.adminCommission, type: 'Credit',
                        category: 'Commission', status: 'Completed', description: `Admin commission for Fixed Route Booking ${booking._id} (Assigned by Admin)`
                    });
                }

                booking.commissionDeducted = true;
            }
            booking.assignedDriver = driverId;
        }

        booking.status = 'Accepted';
        booking.assignedAdmin = adminId;
        booking.acceptedAt = new Date();
        await booking.save();

        // Socket and FCM to User
        try {
            const io = getIO();
            if (io) {
                // Remove from marketplace for everyone
                io.emit('removeFixedBookingMarketplace', { bookingId: booking._id });
                // Notify user
                io.to(booking.user.toString()).emit('booking_update', { bookingId: booking._id });
                io.to(booking.user.toString()).emit('fixedBookingAccepted', { bookingId: booking._id });
            }

            if (driverId) {
                const user = await User.findById(booking.user);
                const driver = await Driver.findById(driverId);
                if (user && user.fcmToken && driver) {
                    sendPushNotification(user.fcmToken, {
                        title: "Ride Assigned! 🚖",
                        body: `${driver.name} has been assigned to your package ride.`,
                        data: { bookingId: booking._id.toString(), type: "FIXED_BOOKING_ACCEPTED" }
                    });
                }
            }
        } catch (err) {
            console.error("Error sending accept admin notifications:", err);
        }

        res.status(200).json({ success: true, message: "Booking accepted/assigned by Admin", booking });
    } catch (error) {
        console.error("Error accepting booking admin:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Admin deletes a booking
exports.deleteBookingAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await FixedBooking.findById(id);
        
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // --- WebSocket & FCM Notifications ---
        try {
            const io = getIO();
            if (io) {
                // 1. Remove from Driver & Admin Marketplace
                io.emit('removeFixedBookingMarketplace', { bookingId: booking._id });
                
                // 2. Notify the User via WebSocket
                io.to(booking.user.toString()).emit('fixedBookingCancelled', { bookingId: booking._id });
                io.to(booking.user.toString()).emit('booking_update', { bookingId: booking._id });
            }

            // 3. Notify the User via FCM Push Notification
            const user = await User.findById(booking.user);
            if (user && user.fcmToken) {
                await sendPushNotification(user.fcmToken, {
                    title: "Ride Cancelled ❌",
                    body: "Your package ride request was cancelled by the administrator.",
                    data: { bookingId: booking._id.toString(), type: "FIXED_BOOKING_CANCELLED" }
                });
            }
        } catch (notifyErr) {
            console.error("Error sending delete notifications from admin:", notifyErr);
        }

        await FixedBooking.findByIdAndDelete(id);

        res.status(200).json({ success: true, message: "Booking deleted successfully" });
    } catch (error) {
        console.error("Error deleting booking:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Download Receipt for Fixed Booking
exports.downloadReceipt = async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await FixedBooking.findById(id)
            .populate('user', 'name phone email')
            .populate('assignedDriver', 'name phone carDetails')
            .populate('carCategory', 'name')
            .populate('fixedRoute', 'routeName pickupLocation dropLocation');

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const { generateFixedBookingReceipt } = require('../utils/pdfGenerator');
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Fixed_Receipt_${booking._id.toString().slice(-6).toUpperCase()}.pdf"`);
        
        await generateFixedBookingReceipt(booking, res);
    } catch (error) {
        console.error("Error downloading fixed booking receipt:", error);
        res.status(500).json({ success: false, message: "Server error generating receipt", error: error.message });
    }
};
