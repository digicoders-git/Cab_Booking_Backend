const BulkBooking = require("../models/BulkBooking");
const CarCategory = require("../models/CarCategory");
const FleetCar = require("../models/FleetCar");
const Fleet = require("../models/Fleet");
const { getIO } = require("../socket/socket");
const serviceAreaController = require("./serviceAreaController");
const { sendPushNotification } = require("../utils/fcmNotification");


// 1. Create Bulk Booking Request
exports.createBulkBooking = async (req, res) => {
    try {
        const { 
            pickup, drop, pickupDateTime, 
            numberOfDays, totalDistance, carsRequired, offeredPrice, notes 
        } = req.body;

        // Validation
        if (!pickup || !drop || !pickupDateTime || !carsRequired || !offeredPrice) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // --- NEW: Service Availability Enforcement (GPS VERSION) ---
        const isServiceable = await serviceAreaController.checkServiceAvailability(pickup.latitude, pickup.longitude);
        
        if (!isServiceable) {
            return res.status(400).json({
                success: false,
                message: "Bulk bookings are not available at this location yet. Please check back later."
            });
        }


        // Calculate System Estimated Price
        // Formula: Rate (per KM) * Quantity * Days * Distance
        let systemEstimatedPrice = 0;
        for (const item of carsRequired) {
            const category = await CarCategory.findById(item.category);
            if (category) {
                systemEstimatedPrice += (category.bulkBookingBasePrice || 0) * (item.quantity || 1) * (numberOfDays || 1) * (totalDistance || 0);
            }
        }

        const priceModifiedPercentage = systemEstimatedPrice > 0 
            ? ((offeredPrice - systemEstimatedPrice) / systemEstimatedPrice) * 100 
            : 0;

        const newBooking = await BulkBooking.create({
            createdBy: req.user.id,
            createdByModel: req.user.role === 'admin' ? 'Admin' : 
                            req.user.role === 'agent' ? 'Agent' : 
                            req.user.role === 'vendor' ? 'Vendor' : 
                            req.user.role === 'fleet' ? 'Fleet' : 'User',
            pickup,
            drop,
            pickupDateTime,
            numberOfDays: numberOfDays || 1,
            totalDistance: totalDistance || 0,
            carsRequired,
            systemEstimatedPrice,
            offeredPrice,
            priceModifiedPercentage,
            notes,
            startOtp: Math.floor(1000 + Math.random() * 9000).toString() // 4-digit OTP
        });


        // 🛰️ STRICT TARGETED NOTIFICATION LOGIC
        // Find Fleets that have ENOUGH quantity of required approved cars
        const fleets = await Fleet.find({ isActive: true });
        console.log(`[BULK-DEBUG] Total Active Fleets found: ${fleets.length}`);

        let eligibleFleetIds = [];

        for (const fleet of fleets) {
            let isEveryRequirementMet = true;
            console.log(`[BULK-DEBUG] Checking eligibility for Fleet: ${fleet.companyName} (${fleet._id})`);

            for (const reqItem of carsRequired) {
                const availableCount = await FleetCar.countDocuments({
                    fleetId: fleet._id,
                    carType: reqItem.category,
                    isApproved: true,
                    isActive: true
                });

                console.log(`  - Category ${reqItem.category}: Needs ${reqItem.quantity}, Has ${availableCount}`);

                if (availableCount < (reqItem.quantity || 1)) {
                    isEveryRequirementMet = false;
                    console.log(`  - ❌ Requirement not met for this category.`);
                    break;
                }
            }

            if (isEveryRequirementMet) {
                eligibleFleetIds.push(fleet._id);
                console.log(`  - ✅ Fleet ${fleet.companyName} is ELIGIBLE.`);
            }
        }

        if (eligibleFleetIds.length > 0) {
            try {
                const io = getIO();
                eligibleFleetIds.forEach(fleetId => {
                    io.to(`fleet_${fleetId.toString()}`).emit("new_bulk_deal", {
                        bookingId: newBooking._id,
                        pickup: pickup.address,
                        drop: drop.address,
                        dateTime: pickupDateTime,
                        offeredPrice: offeredPrice,
                        cars: carsRequired.length
                    });
                });
                console.log(`[BULK-DEBUG] Socket events emitted to ${eligibleFleetIds.length} Fleets.`);
                
                // --- FCM PUSH NOTIFICATION ---
                for (const fleetId of eligibleFleetIds) {
                    const fleet = await Fleet.findById(fleetId);
                    if (fleet && fleet.fcmToken) {
                        console.log(`[BULK-DEBUG] Sending FCM to ${fleet.companyName}. Token: ${fleet.fcmToken.substring(0, 10)}...`);
                        try {
                            const fcmResult = await sendPushNotification(fleet.fcmToken, {
                                title: `📦 New Bulk Deal: ₹${offeredPrice}`,
                                body: `New bulk request at ${pickup.address.split(',')[0]}. Check marketplace!`,
                                data: {
                                    bookingId: newBooking._id.toString(),
                                    type: "NEW_BULK_DEAL"
                                }
                            });
                            console.log(`[BULK-DEBUG] FCM Success for ${fleet.companyName}:`, fcmResult);
                        } catch (fcmErr) {
                            console.error(`[BULK-DEBUG] FCM Error for ${fleet.companyName}:`, fcmErr.message);
                        }
                    } else {
                        console.log(`[BULK-DEBUG] ⚠️ Skipping FCM for ${fleet?.companyName || fleetId} - Token Missing!`);
                    }
                }

            } catch (err) {
                console.error("[BULK-DEBUG] Major Socket/FCM Error:", err.message);
            }
        } else {
            console.log("[BULK-DEBUG] ⚠️ No eligible fleets found for this requirement.");
        }


        res.status(201).json({
            success: true,
            message: "Bulk booking request created in Marketplace",
            booking: newBooking
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 2. Get Available Bulk Bookings for Fleets (Marketplace View)
exports.getMarketplace = async (req, res) => {
    try {
        const { id, role } = req.user;

        let query = { status: 'Marketplace' };

        // If it's a Fleet Owner, only show deals relevant to their approved cars
        if (role === 'fleet') {
            const approvedCategories = await FleetCar.distinct("carType", {
                fleetId: id,
                isApproved: true,
                isActive: true
            });
            query["carsRequired.category"] = { $in: approvedCategories };
        }
        
        // Admins see everything in Marketplace, Fleets see relevant with enough quantity
        const allBookings = await BulkBooking.find(query)
            .populate("carsRequired.category", "name image")
            .populate("createdBy", "name phone image")
            .sort({ createdAt: -1 });

        if (role === 'fleet') {
            // Filter bookings where this fleet meets the quantity requirement for ALL cars in the request
            const filteredBookings = [];
            for (const booking of allBookings) {
                let canHandle = true;
                for (const reqItem of booking.carsRequired) {
                    const availableCount = await FleetCar.countDocuments({
                        fleetId: id,
                        carType: reqItem.category._id,
                        isApproved: true,
                        isActive: true
                    });
                    if (availableCount < (reqItem.quantity || 1)) {
                        canHandle = false;
                        break;
                    }
                }
                if (canHandle) filteredBookings.push(booking);
            }
            return res.json({ success: true, count: filteredBookings.length, bookings: filteredBookings });
        }

        res.json({ success: true, count: allBookings.length, bookings: allBookings });


    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 3. Accept Bulk Booking (Fleet Action)
exports.acceptBulkBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const fleetId = req.user.id;

        const booking = await BulkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.status !== "Marketplace") {
            return res.status(400).json({ success: false, message: "Sorry, this deal is already taken or unavailable." });
        }

        // Lock the booking
        booking.status = "Accepted";
        booking.assignedFleet = fleetId;
        booking.acceptedAt = new Date();
        await booking.save();

        const fleet = await Fleet.findById(fleetId);

        // Notify Rider (Creator) via Socket and FCM
        try {
            const io = getIO();
            const creatorId = booking.createdBy.toString();
            
            // 1. Socket Notification
            io.to(creatorId).emit("bulk_booking_update", {
                bookingId: booking._id,
                status: "Accepted",
                fleetName: fleet ? fleet.companyName : "A Fleet Owner",
                message: "Your bulk booking has been accepted!"
            });

            if (booking.createdByModel === 'Agent') {
                io.to(`agent_${creatorId}`).emit("bulk_booking_update", {
                    bookingId: booking._id,
                    status: "Accepted",
                    fleetName: fleet ? fleet.companyName : "A Fleet Owner"
                });
            }

            // 2. FCM Push Notification
            const User = require("../models/User");
            const Agent = require("../models/Agent");
            const { sendPushNotification } = require("../utils/fcmNotification");

            let creator = null;
            if (booking.createdByModel === 'User') {
                creator = await User.findById(creatorId);
            } else {
                creator = await Agent.findById(creatorId);
            }

            if (creator && creator.fcmToken) {
                await sendPushNotification(creator.fcmToken, {
                    title: "📦 Bulk Booking Accepted!",
                    body: `Your booking has been accepted by ${fleet ? fleet.companyName : 'a Fleet Owner'}.`,
                    data: {
                        bookingId: booking._id.toString(),
                        type: "BULK_BOOKING_ACCEPTED"
                    }
                });
                console.log(`FCM Sent to Creator (${booking.createdByModel}): ${creator.name} ✅`);
            }

            // Remove from other fleets' marketplace view
            io.emit("remove_bulk_deal", { bookingId: booking._id });

        } catch (err) {
            console.error("Notification Error (Accept Bulk):", err.message);
        }

        res.json({ success: true, message: "Bulk deal accepted successfully!", booking });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 4. Get Fleet's Own Bulk Bookings
exports.getMyBulkBookings = async (req, res) => {
    try {
        const fleetId = req.user.id;
        const bookings = await BulkBooking.find({ assignedFleet: fleetId })
            .populate("carsRequired.category", "name image")
            .populate("createdBy", "name phone image") // 🟢 Added this line
            .sort({ acceptedAt: -1 });


        res.json({ success: true, count: bookings.length, bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 5. Get Requests Created by Logged In User
exports.getMyCreatedRequests = async (req, res) => {
    try {
        const bookings = await BulkBooking.find({ createdBy: req.user.id })
            .populate("carsRequired.category", "name image")
            .populate("assignedFleet", "companyName phone")
            .sort({ createdAt: -1 });

        res.json({ success: true, count: bookings.length, bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 6. Cancel Bulk Request
exports.cancelBulkBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const booking = await BulkBooking.findById(bookingId);

        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Only creator or admin can cancel
        if (booking.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Not authorized to cancel this booking" });
        }

        // Can only cancel if in Marketplace or Accepted (before ongoing)
        if (!['Marketplace', 'Accepted'].includes(booking.status)) {
            return res.status(400).json({ success: false, message: `Cannot cancel a ${booking.status} ride` });
        }

        booking.status = 'Cancelled';
        await booking.save();

        // Socket notify
        try {
            getIO().emit("remove_bulk_deal", { bookingId: booking._id });
        } catch (err) {}

        res.json({ success: true, message: "Booking cancelled successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 7. Hard Delete Bulk Booking (Admin Only)
exports.deleteBulkBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        // Security check: Only Admins can delete
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Only Admins are allowed to delete bookings permanently." });
        }

        const booking = await BulkBooking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // Optional: Check if trip is ongoing
        if (['Ongoing', 'Accepted'].includes(booking.status)) {
            // Agar aap chahte hain ki Accepted rides bhi delete ho jayein, toh ye condition hata sakte hain.
            // Lekin safety ke liye main ise rakha hai.
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete a ${booking.status} ride. Please cancel it first or wait for completion.` 
            });
        }

        await BulkBooking.findByIdAndDelete(bookingId);

        res.json({
            success: true,
            message: "Bulk booking record deleted successfully from database."
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 8. Start Bulk Trip (OTP Search)
exports.startBulkBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { otp } = req.body;

        const booking = await BulkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Security: Only assigned fleet can start
        if (booking.assignedFleet?.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "Not authorized. Only the assigned fleet can start this trip." });
        }

        if (booking.status !== "Accepted") {
            return res.status(400).json({ success: false, message: `Booking must be in 'Accepted' status to start. Current status: ${booking.status}` });
        }

        if (booking.startOtp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP! Please check with the customer." });
        }

        booking.status = "Ongoing";
        await booking.save();

        // Notify Creator
        try {
            getIO().to(booking.createdBy.toString()).emit("bulk_booking_update", {
                bookingId: booking._id,
                status: "Ongoing",
                message: "Your bulk trip has officially started!"
            });
        } catch (err) {}

        res.json({ success: true, message: "Trip started successfully! Enjoy the ride.", booking });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 9. End Bulk Trip
exports.endBulkBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        const booking = await BulkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.assignedFleet?.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Not authorized to end this trip." });
        }

        if (booking.status !== "Ongoing") {
            return res.status(400).json({ success: false, message: "Only Ongoing trips can be ended." });
        }

        booking.status = "Completed";
        await booking.save();

        // Notify Creator
        try {
            getIO().to(booking.createdBy.toString()).emit("bulk_booking_update", {
                bookingId: booking._id,
                status: "Completed",
                message: "Your bulk trip has been completed successfully."
            });
        } catch (err) {}

        res.json({ success: true, message: "Trip completed successfully!", booking });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};


