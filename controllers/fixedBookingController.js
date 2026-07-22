const FixedRoute = require("../models/FixedRoute");
const FixedBooking = require("../models/FixedBooking");
const Driver = require("../models/Driver");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const { RazorpayHandler } = require("../utils/RazorpayHandler");
const razorpayHandler = RazorpayHandler.getInstance();

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
            paymentMethod: paymentMethod || 'Cash'
        });

        await newBooking.save();
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
            status: { $in: ['Accepted', 'Completed'] }
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

        // If it was already accepted, we need to refund the driver
        if (booking.status === 'Accepted' && booking.commissionDeducted && booking.assignedDriver) {
            const driver = await Driver.findById(booking.assignedDriver);
            if (driver) {
                driver.walletBalance += booking.adminCommission;
                await driver.save();
                await Transaction.create({
                    user: booking.assignedDriver, userModel: 'Driver', amount: booking.adminCommission, type: 'Credit',
                    category: 'Refund', status: 'Completed', description: `Commission refund for cancelled booking ${booking._id} (User Cancelled)`
                });
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

        const sessionResponse = await razorpayHandler.orderSession({
            amount: booking.price, // the full fare
            currency: 'INR',
            order_id: `fb_${booking._id.toString().slice(-6)}_${Date.now()}`,
            customer_id: booking.user.name || "Customer",
            customer_email: booking.user.email || "customer@example.com",
            customer_phone: booking.user.phone || "",
            return_url: `${req.protocol}://${req.get('host')}/api/fixed-routes/bookings/${booking._id}/verify-payment`
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
        const { razorpay_payment_id, razorpay_payment_link_id, razorpay_payment_link_reference_id, razorpay_payment_link_status, razorpay_signature } = req.query;

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

        const driverEarning = booking.price - booking.adminCommission;
        
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
        const { io } = require('../socket/socket');
        try {
            if (io) {
                io.emit('fixedBookingPaymentSuccess', { bookingId: booking._id, status: 'Completed' });
            }
        } catch (sockErr) {
            console.error("Socket error during payment success:", sockErr);
        }

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/my-booking?payment_success=true&booking_id=${booking._id}`);
    } catch (error) {
        console.error("Error verifying online payment:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Driver completes booking
exports.completeBookingDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const driverId = req.user.id;

        const booking = await FixedBooking.findById(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Ensure the booking is assigned to this driver and is currently Accepted
        if (booking.assignedDriver.toString() !== driverId.toString()) {
            return res.status(403).json({ success: false, message: "You are not assigned to this booking" });
        }
        if (booking.status !== 'Accepted') {
            return res.status(400).json({ success: false, message: "Only accepted bookings can be completed" });
        }

        booking.status = 'Completed';
        // Add completed timestamp if you have one, or just update status
        await booking.save();

        res.status(200).json({ success: true, message: "Booking marked as completed", booking });
    } catch (error) {
        console.error("Error completing booking:", error);
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

        await FixedBooking.findByIdAndDelete(id);

        res.status(200).json({ success: true, message: "Booking deleted successfully" });
    } catch (error) {
        console.error("Error deleting booking:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
