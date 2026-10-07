const RentalPackage = require("../models/RentalPackage");
const RentalBooking = require("../models/RentalBooking");
const AppSetting = require("../models/AppSetting");
const { sendPushNotification } = require("../utils/fcmNotification");
const { generateId } = require("../utils/globalUniqueness"); // Assume custom ID generator exists or use simple random

// Generate unique booking ID fallback
const generateBookingId = () => {
    return 'RENTAL-' + Date.now() + Math.floor(Math.random() * 1000);
};

// --- ADMIN APIs ---

exports.createRentalPackage = async (req, res) => {
    try {
        const package = await RentalPackage.create(req.body);
        res.status(201).json({ success: true, message: "Package created", package });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateRentalPackage = async (req, res) => {
    try {
        const { id } = req.params;
        const package = await RentalPackage.findByIdAndUpdate(id, req.body, { new: true });
        if (!package) return res.status(404).json({ success: false, message: "Package not found" });
        
        res.json({ success: true, message: "Package updated successfully", package });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getRentalPackagesAdmin = async (req, res) => {
    try {
        const packages = await RentalPackage.find().populate("carCategory", "name");
        res.json({ success: true, packages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllRentalBookingsAdmin = async (req, res) => {
    try {
        const bookings = await RentalBooking.find()
            .populate("user", "name phone email")
            .populate("carCategory", "name")
            .populate("rentalPackage", "name basePrice hours baseDistance")
            .populate("driver", "name phone vehicleNumber")
            .sort({ createdAt: -1 });
        res.json({ success: true, bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteRentalBookingAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await RentalBooking.findByIdAndDelete(id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
        
        res.json({ success: true, message: "Rental booking deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.toggleRentalPackageStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const package = await RentalPackage.findById(id);
        if (!package) return res.status(404).json({ success: false, message: "Package not found" });
        
        package.isActive = !package.isActive;
        await package.save();
        res.json({ success: true, message: "Status updated", package });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteRentalPackage = async (req, res) => {
    try {
        const { id } = req.params;
        const package = await RentalPackage.findByIdAndDelete(id);
        if (!package) return res.status(404).json({ success: false, message: "Package not found" });
        
        res.json({ success: true, message: "Package deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- USER APIs ---

exports.getActiveRentalPackages = async (req, res) => {
    try {
        const packages = await RentalPackage.find({ isActive: true }).populate("carCategory", "name image");
        res.json({ success: true, packages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.bookRental = async (req, res) => {
    try {
        const { packageId, pickupLocation, paymentMethod } = req.body;
        
        const package = await RentalPackage.findById(packageId);
        if (!package) return res.status(404).json({ success: false, message: "Package not found" });

        const appSettings = await AppSetting.findOne() || {};
        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        const booking = await RentalBooking.create({
            bookingId: generateBookingId(),
            otp,
            user: req.user.id,
            carCategory: package.carCategory,
            rentalPackage: package._id,
            pickupLocation,
            paymentMethod,
            fareDetails: {
                baseFare: package.basePrice,
                totalFare: package.basePrice // Initial estimation
            }
        });

        res.status(201).json({ success: true, message: "Rental Booking created", booking });

        // Emit socket event to only online drivers with matching carCategory
        try {
            const io = require("../socket/socket").getIO();
            const Driver = require("../models/Driver");

            const eligibleDrivers = await Driver.find({
                "carDetails.carType": package.carCategory,
                isOnline: true
            });

            const socketData = {
                bookingId: booking._id,
                displayId: booking.bookingId,
                pickupLocation,
                package: package.name,
                hours: package.hours,
                distance: package.baseDistance,
                fare: package.basePrice,
                extraKmRate: package.extraKmRate,
                extraHourRate: package.extraHourRate,
                popupTimerSeconds: appSettings.driverRentalPopupTimerSeconds || 15
            };

            // Auto-cancel logic
            const timeoutMinutes = appSettings.rentalRequestTimeoutMinutes || 5;
            setTimeout(async () => {
                const checkBooking = await RentalBooking.findById(booking._id);
                if (checkBooking && checkBooking.status === "Pending") {
                    checkBooking.status = "Cancelled";
                    await checkBooking.save();
                    console.log(`Rental booking ${booking._id} auto-cancelled after ${timeoutMinutes} minutes.`);
                    io.emit("rental_request_cancelled", { bookingId: booking._id });
                }
            }, timeoutMinutes * 60 * 1000);

            eligibleDrivers.forEach(driver => {
                // 1. Socket notification
                io.to(driver._id.toString()).emit("new_rental_request", socketData);
                
                // 2. FCM Push Notification (if token exists)
                if (driver.fcmToken) {
                    sendPushNotification(driver.fcmToken, {
                        title: "New Rental Ride Request!",
                        body: `${package.name} - ₹${package.basePrice}. Tap to accept.`,
                        data: {
                            type: "NEW_RENTAL_REQUEST",
                            bookingId: booking._id.toString()
                        }
                    }).catch(err => console.error(`FCM error for driver ${driver._id}:`, err));
                }
            });
            console.log(`Sent rental request (Socket + FCM) to ${eligibleDrivers.length} eligible drivers`);
        } catch (socketErr) {
            console.error("Socket/FCM error on new rental:", socketErr);
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getUserRentalBookings = async (req, res) => {
    try {
        const bookings = await RentalBooking.find({ user: req.user.id })
            .populate("rentalPackage")
            .populate("carCategory", "name image")
            .populate("driver", "name phone vehicleNumber")
            .sort({ createdAt: -1 });
        res.json({ success: true, bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.cancelRentalBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await RentalBooking.findById(id);

        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Check ownership
        if (booking.user.toString() !== req.user.id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to cancel this booking" });
        }

        if (booking.status !== "Pending" && booking.status !== "Accepted") {
            return res.status(400).json({ success: false, message: "Cannot cancel a booking that is already in progress or completed" });
        }

        booking.status = "Cancelled";
        await booking.save();

        if (booking.driver) {
            const Driver = require("../models/Driver");
            const driver = await Driver.findByIdAndUpdate(booking.driver, {
                isAvailable: true,
                currentRideType: null
            });
            
            if (driver) {
                // Notify driver via Socket
                try {
                    const io = require("../socket/socket").getIO();
                    io.to(driver._id.toString()).emit("rental_cancelled_by_user", { bookingId: booking._id });
                } catch (socketErr) {
                    console.error("Socket error on cancel rental:", socketErr);
                }

                // Notify driver via FCM
                if (driver.fcmToken) {
                    const { sendPushNotification } = require("../utils/fcmNotification");
                    sendPushNotification(driver.fcmToken, {
                        title: "Rental Ride Cancelled",
                        body: "The customer has cancelled the rental ride.",
                        data: { type: "RENTAL_CANCELLED", bookingId: booking._id.toString() }
                    });
                }
            }
        } else {
            // If no driver was assigned yet, broadcast cancellation so drivers remove the popup
            try {
                const io = require("../socket/socket").getIO();
                io.emit("rental_request_cancelled", { bookingId: booking._id });
            } catch (socketErr) {
                console.error("Socket error on cancel rental broadcast:", socketErr);
            }
        }

        res.json({ success: true, message: "Booking cancelled successfully", booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- DRIVER APIs ---

exports.getDriverRentalBookings = async (req, res) => {
    try {
        const bookings = await RentalBooking.find({ driver: req.user.id })
            .populate("user", "name phone")
            .populate("carCategory", "name")
            .populate("rentalPackage")
            .sort({ createdAt: -1 });
        res.json({ success: true, bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Very simplified flow: driver accepts -> starts -> ends

exports.acceptRentalBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await RentalBooking.findById(id);

        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.status !== "Pending") {
            return res.status(400).json({ success: false, message: "Booking is no longer available" });
        }

        booking.driver = req.user.id;
        booking.status = "Accepted";
        await booking.save();

        const Driver = require("../models/Driver");
        await Driver.findByIdAndUpdate(req.user.id, {
            isAvailable: false,
            currentRideType: "Rental"
        });

        // Notify other drivers to remove it from their screen
        try {
            const io = require("../socket/socket").getIO();
            io.emit("rental_request_accepted", { bookingId: booking._id });
        } catch (socketErr) {
            console.error("Socket error on rental accept:", socketErr);
        }

        const populatedBooking = await RentalBooking.findById(id)
            .populate("user", "name phone")
            .populate("carCategory", "name")
            .populate("rentalPackage");

        // === ADDED: Notify User via Socket & FCM ===
        if (populatedBooking.user) {
            try {
                // Socket Notification
                const io = require("../socket/socket").getIO();
                io.to(populatedBooking.user._id.toString()).emit("booking_update", {
                    bookingId: populatedBooking._id,
                    status: "Accepted"
                });

                // FCM Notification
                const User = require("../models/User");
                const rider = await User.findById(populatedBooking.user._id);
                if (rider && rider.fcmToken) {
                    const { sendPushNotification } = require("../utils/fcmNotification");
                    await sendPushNotification(rider.fcmToken, {
                        title: "🚖 Rental Ride Accepted!",
                        body: `Driver is on the way to pick you up.`,
                        data: {
                            type: "ride_accepted",
                            bookingId: populatedBooking._id.toString()
                        }
                    });
                }
            } catch (err) {
                console.error("Socket/FCM Error on rental accept:", err.message);
            }
        }

        res.json({ success: true, message: "Rental Trip Accepted", booking: populatedBooking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.startRentalRide = async (req, res) => {
    try {
        const { bookingId, otp } = req.body;
        const booking = await RentalBooking.findById(bookingId);

        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.driver.toString() !== req.user.id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized driver" });
        }

        if (booking.status === "Cancelled") {
            return res.status(400).json({ success: false, message: "This booking was cancelled by the user." });
        }
        if (booking.status === "Completed") {
            return res.status(400).json({ success: false, message: "This booking is already completed." });
        }
        if (booking.status === "Started") {
            return res.status(400).json({ success: false, message: "This booking is already started." });
        }
        if (booking.status !== "Accepted" && booking.status !== "Arrived") {
            return res.status(400).json({ success: false, message: `Cannot start ride. Current status is ${booking.status}` });
        }

        if (booking.otp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        booking.status = "Started";
        booking.startTime = new Date();
        await booking.save();

        const populatedBooking = await RentalBooking.findById(bookingId)
            .populate("user", "name phone")
            .populate("carCategory", "name")
            .populate("rentalPackage");

        // === ADDED: Notify User via Socket & FCM ===
        if (populatedBooking.user) {
            try {
                const io = require("../socket/socket").getIO();
                io.to(populatedBooking.user._id.toString()).emit("booking_update", {
                    bookingId: populatedBooking._id,
                    status: "Started"
                });

                const User = require("../models/User");
                const rider = await User.findById(populatedBooking.user._id);
                if (rider && rider.fcmToken) {
                    const { sendPushNotification } = require("../utils/fcmNotification");
                    await sendPushNotification(rider.fcmToken, {
                        title: "🚕 Rental Trip Started!",
                        body: `Your rental trip has begun.`,
                        data: {
                            type: "TRIP_ONGOING",
                            bookingId: populatedBooking._id.toString()
                        }
                    });
                }
            } catch (err) {
                console.error("Socket/FCM Error on rental start:", err.message);
            }
        }

        res.json({ success: true, message: "Rental Ride Started", booking: populatedBooking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.endRentalTrip = async (req, res) => {
    try {
        const { bookingId, totalDistanceTravelled, paymentMethod } = req.body; // Driver submits distance and payment method

        const booking = await RentalBooking.findById(bookingId).populate("rentalPackage");
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.status === "Completed") {
            return res.status(400).json({ success: false, message: "Ride is already completed" });
        }
        if (booking.status !== "Started") {
            return res.status(400).json({ success: false, message: "Ride is not started yet" });
        }

        const endTime = new Date();
        const startTime = booking.startTime || endTime;
        const totalMinutes = Math.floor((endTime - startTime) / 60000);
        
        const pkg = booking.rentalPackage;
        let extraKmFare = 0;
        let extraTimeFare = 0;

        if (totalDistanceTravelled > pkg.baseDistance) {
            extraKmFare = (totalDistanceTravelled - pkg.baseDistance) * pkg.extraKmPrice;
        }

        const baseMinutes = pkg.hours * 60;
        if (totalMinutes > baseMinutes) {
            extraTimeFare = (totalMinutes - baseMinutes) * pkg.extraMinutePrice;
        }

        const AppSetting = require("../models/AppSetting");
        const Driver = require("../models/Driver");
        const Transaction = require("../models/Transaction"); // Assuming Transaction model exists

        const settings = await AppSetting.findOne() || { rentalCommissionPercentage: 10 };
        const commissionPercentage = settings.rentalCommissionPercentage || 10;
        
        const totalFare = pkg.basePrice + extraKmFare + extraTimeFare;
        const adminCommission = (totalFare * commissionPercentage) / 100;

        const Admin = require("../models/Admin");
        const { RazorpayHandler } = require("../utils/RazorpayHandler");
        const razorpayHandler = RazorpayHandler.getInstance();

        if (paymentMethod === 'Online') {
            // Do NOT complete yet, just generate link and return
            // Razorpay limit for reference_id is 40 chars. 'r_' + 6 chars of ID + '_' + 13 chars of timestamp = 22 chars.
            const sessionResponse = await razorpayHandler.orderSession({
                amount: totalFare,
                order_id: `r_${booking._id.toString().slice(-6)}_${Date.now()}`, 
                customer_phone: booking.user?.phone || "+919999999999",
                return_url: `${process.env.FRONTEND_URL || 'http://localhost:5174'}/driver/rental/${booking._id}?bookingId=${booking._id}`
            });
            
            // Save fare details for later completion
            booking.fareDetails.extraKmFare = extraKmFare;
            booking.fareDetails.extraTimeFare = extraTimeFare;
            booking.fareDetails.totalFare = totalFare;
            booking.fareDetails.adminCommission = adminCommission;
            booking.totalDistanceTravelled = totalDistanceTravelled;
            booking.paymentMethod = 'Online';
            await booking.save();

            // === ADDED: Notify User via Socket for Payment Request ===
            if (booking.user) {
                try {
                    const io = require("../socket/socket").getIO();
                    const userId = booking.user._id || booking.user;
                    io.to(userId.toString()).emit("booking_update", {
                        bookingId: booking._id,
                        status: "Payment_Requested",
                        paymentMethod: "Online",
                        finalFare: totalFare,
                        paymentLinks: { web: sessionResponse.payment_links.web }
                    });
                } catch (err) {
                    console.error("Socket Error on rental payment request:", err.message);
                }
            }
            // =========================================================

            return res.json({ 
                success: true, 
                message: "Please complete payment", 
                requirePayment: true,
                paymentUrl: sessionResponse.payment_links.web 
            });
        }

        // Cash flow: Complete immediately
        booking.status = "Completed";
        booking.endTime = endTime;
        booking.totalDistanceTravelled = totalDistanceTravelled;
        booking.fareDetails.extraKmFare = extraKmFare;
        booking.fareDetails.extraTimeFare = extraTimeFare;
        booking.fareDetails.totalFare = totalFare;
        booking.fareDetails.adminCommission = adminCommission;
        booking.paymentMethod = 'Cash';

        await booking.save();

        // Update Driver's & Admin's Wallet and create Transactions
        if (booking.driver) {
            const driver = await Driver.findById(booking.driver);
            const admin = await Admin.findOne();
            if (driver) {
                // Driver collected cash, deduct commission from their wallet
                driver.walletBalance -= adminCommission;
                driver.isAvailable = true;
                driver.currentRideType = null;
                await Transaction.create({
                    user: driver._id, userModel: 'Driver', amount: adminCommission, type: 'Debit',
                    category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                    description: `Commission deducted for Rental Trip ${booking._id} (Cash collected)`
                });

                if (admin) {
                    admin.walletBalance = (admin.walletBalance || 0) + adminCommission;
                    admin.totalEarnings = (admin.totalEarnings || 0) + adminCommission;
                    await admin.save();
                    await Transaction.create({
                        user: admin._id, userModel: 'Admin', amount: adminCommission, type: 'Credit',
                        category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                        description: `Admin commission from Rental Trip ${booking._id}`
                    });
                }
                await driver.save();
            }
        }

        // === ADDED: Notify User via Socket & FCM for Completion ===
        if (booking.user) {
            try {
                const io = require("../socket/socket").getIO();
                const userId = booking.user._id || booking.user;
                io.to(userId.toString()).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Completed",
                    finalFare: totalFare,
                    paymentMethod: "Cash"
                });

                const User = require("../models/User");
                const rider = await User.findById(userId);
                if (rider && rider.fcmToken) {
                    const { sendPushNotification } = require("../utils/fcmNotification");
                    await sendPushNotification(rider.fcmToken, {
                        title: "🏁 Rental Trip Completed!",
                        body: `Hope you had a great ride! Total Fare: ₹${totalFare}.`,
                        data: {
                            type: "TRIP_COMPLETED",
                            bookingId: booking._id.toString()
                        }
                    });
                }
            } catch (err) {
                console.error("Socket/FCM Error on rental end (Cash):", err.message);
            }
        }
        // ==========================================================

        res.json({ success: true, message: "Rental Trip Completed", booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.verifyRentalPayment = async (req, res) => {
    try {
        const { bookingId, razorpay_payment_id, razorpay_payment_link_id, razorpay_payment_link_reference_id, razorpay_payment_link_status, razorpay_signature } = req.body;
        
        const booking = await RentalBooking.findById(bookingId).populate("rentalPackage");
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.status === "Completed") {
            return res.json({ success: true, message: "Already completed", booking });
        }

        const { RazorpayHandler } = require("../utils/RazorpayHandler");
        const razorpayHandler = RazorpayHandler.getInstance();
        
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

        if (razorpay_payment_link_status !== "paid") {
            return res.status(400).json({ success: false, message: "Payment not completed" });
        }

        booking.status = "Completed";
        booking.endTime = new Date();
        await booking.save();

        const Admin = require("../models/Admin");
        const Driver = require("../models/Driver");
        const Transaction = require("../models/Transaction");
        
        const driver = await Driver.findById(booking.driver);
        const admin = await Admin.findOne();
        
        const adminCommission = booking.fareDetails.adminCommission;
        const totalFare = booking.fareDetails.totalFare;
        
        if (driver) {
            const driverCut = totalFare - adminCommission;
            driver.walletBalance += driverCut;
            driver.isAvailable = true;
            driver.currentRideType = null;
            await Transaction.create({
                user: driver._id, userModel: 'Driver', amount: driverCut, type: 'Credit',
                category: 'Ride Earning', status: 'Completed', relatedBooking: booking._id,
                description: `Earnings for Rental Trip ${booking._id} (Paid Online)`
            });

            if (admin) {
                admin.walletBalance = (admin.walletBalance || 0) + adminCommission;
                admin.totalEarnings = (admin.totalEarnings || 0) + adminCommission;
                await admin.save();
                await Transaction.create({
                    user: admin._id, userModel: 'Admin', amount: adminCommission, type: 'Credit',
                    category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                    description: `Admin commission from Rental Trip ${booking._id} (Online)`
                });
            }
            await driver.save();
        }

        // === ADDED: Notify User via Socket & FCM for Completion ===
        if (booking.user) {
            try {
                const io = require("../socket/socket").getIO();
                const userId = booking.user._id || booking.user;
                io.to(userId.toString()).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Completed",
                    finalFare: booking.fareDetails.totalFare,
                    paymentMethod: "Online"
                });

                const User = require("../models/User");
                const rider = await User.findById(userId);
                if (rider && rider.fcmToken) {
                    const { sendPushNotification } = require("../utils/fcmNotification");
                    await sendPushNotification(rider.fcmToken, {
                        title: "🏁 Rental Trip Completed!",
                        body: `Payment verified. Hope you had a great ride!`,
                        data: {
                            type: "TRIP_COMPLETED",
                            bookingId: booking._id.toString()
                        }
                    });
                }
            } catch (err) {
                console.error("Socket/FCM Error on rental verify payment:", err.message);
            }
        }
        // ==========================================================

        res.json({ success: true, message: "Payment verified and Trip Completed", booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
