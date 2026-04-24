const BulkBooking = require("../models/BulkBooking");
const CarCategory = require("../models/CarCategory");
const FleetCar = require("../models/FleetCar");
const Fleet = require("../models/Fleet");
const { getIO } = require("../socket/socket");
const serviceAreaController = require("./serviceAreaController");
const { sendPushNotification } = require("../utils/fcmNotification");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const Agent = require("../models/Agent");
const User = require("../models/User");


// 1. Create Bulk Booking Request
exports.createBulkBooking = async (req, res) => {
    try {
        const { 
            pickup, drop, pickupDateTime, tripType, returnDateTime,
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
        // If Round Trip, we double the distance
        let systemEstimatedPrice = 0;
        const distanceMultiplier = tripType === 'RoundTrip' ? 2 : 1;

        for (const item of carsRequired) {
            const category = await CarCategory.findById(item.category);
            if (category) {
                systemEstimatedPrice += (category.bulkBookingBasePrice || 0) * (item.quantity || 1) * (numberOfDays || 1) * (totalDistance * distanceMultiplier);
            }
        }

        const priceModifiedPercentage = systemEstimatedPrice > 0 
            ? ((offeredPrice - systemEstimatedPrice) / systemEstimatedPrice) * 100 
            : 0;

        const advanceAmount = Math.round(offeredPrice * 0.25);

        const newBooking = await BulkBooking.create({
            createdBy: req.user.id,
            createdByModel: req.user.role === 'admin' ? 'Admin' : 
                            req.user.role === 'agent' ? 'Agent' : 
                            req.user.role === 'vendor' ? 'Vendor' : 
                            req.user.role === 'fleet' ? 'Fleet' : 'User',
            pickup,
            drop,
            pickupDateTime,
            tripType: tripType || 'OneWay',
            returnDateTime: tripType === 'RoundTrip' ? returnDateTime : null,
            numberOfDays: numberOfDays || 1,
            totalDistance: totalDistance || 0,
            carsRequired,
            systemEstimatedPrice,
            offeredPrice,
            priceModifiedPercentage,
            notes,
            status: 'PendingPayment',
            advancePayment: {
                amount: advanceAmount,
                isPaid: false
            },
            startOtp: Math.floor(1000 + Math.random() * 9000).toString()
        });

        res.status(201).json({
            success: true,
            message: "Bulk request created. Please pay 25% advance to publish to marketplace.",
            bookingId: newBooking._id,
            advanceAmount: advanceAmount
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
                        tripType: newBooking.tripType,
                        returnDateTime: newBooking.returnDateTime,
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

        const securityAmount = Math.round(booking.offeredPrice * 0.20);
        
        booking.fleetSecurityPayment = {
            amount: securityAmount,
            isPaid: false
        };
        await booking.save();

        res.json({ 
            success: true, 
            message: "To accept this deal, please pay 20% security commission.", 
            securityAmount,
            bookingId: booking._id
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 3.5. Verify Bulk Payment (Advance or Security)
exports.verifyBulkPayment = async (req, res) => {
    try {
        const { bookingId, paymentId, type } = req.body; // type: 'advance' or 'security'
        const booking = await BulkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        const admin = await Admin.findOne();

        if (type === 'advance') {
            booking.advancePayment.isPaid = true;
            booking.advancePayment.razorpayPaymentId = paymentId;
            booking.status = 'Marketplace';
            await booking.save();

            // Credit Admin Wallet
            if (admin) {
                admin.walletBalance += booking.advancePayment.amount;
                await admin.save();
                await Transaction.create({
                    user: admin._id, userModel: 'Admin', amount: booking.advancePayment.amount,
                    type: 'Credit', category: 'Bulk Advance', status: 'Completed',
                    relatedBooking: booking._id, description: `Advance for Bulk Booking ${booking._id}`
                });
            }

            // 🛰️ NOTIFY FLEETS (Original Logic)
            try {
                const io = getIO();
                const fleets = await Fleet.find({ isActive: true });
                fleets.forEach(fleet => {
                    io.to(`fleet_${fleet._id}`).emit("new_bulk_deal", {
                        bookingId: booking._id,
                        pickup: booking.pickup.address,
                        offeredPrice: booking.offeredPrice
                    });
                });
            } catch (err) {}

            return res.json({ success: true, message: "Advance paid! Published to Marketplace." });

        } else if (type === 'security') {
            booking.fleetSecurityPayment.isPaid = true;
            booking.fleetSecurityPayment.razorpayPaymentId = paymentId;
            booking.status = 'Accepted';
            booking.assignedFleet = req.user.id;
            booking.acceptedAt = new Date();
            await booking.save();

            // Credit Admin Wallet
            if (admin) {
                admin.walletBalance += booking.fleetSecurityPayment.amount;
                await admin.save();
                await Transaction.create({
                    user: admin._id, userModel: 'Admin', amount: booking.fleetSecurityPayment.amount,
                    type: 'Credit', category: 'Bulk Security', status: 'Completed',
                    relatedBooking: booking._id, description: `Security from Fleet for Bulk Booking ${booking._id}`
                });
            }

            // 🛰️ NOTIFY CREATOR & REMOVE FROM MARKETPLACE
            try {
                const io = getIO();
                const fleet = await Fleet.findById(req.user.id);
                const creatorId = booking.createdBy.toString();

                // 1. Socket Notification to Creator
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

                // 2. FCM Push Notification to Creator
                let creator = null;
                if (booking.createdByModel === 'User') {
                    creator = await User.findById(creatorId);
                } else if (booking.createdByModel === 'Agent') {
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
                }

                // 3. Remove from other fleets' marketplace view
                io.emit("remove_bulk_deal", { bookingId: booking._id });

            } catch (err) {
                console.error("Payment Success Notification Error:", err.message);
            }

            return res.json({ success: true, message: "Security paid! Deal assigned to you.", booking });
        }

        res.status(400).json({ success: false, message: "Invalid payment type" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
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
        
        // 💰 AGENT COMMISSION LOGIC
        if (booking.createdByModel === 'Agent') {
            try {
                const agent = await Agent.findById(booking.createdBy);
                if (agent) {
                    const commissionPercent = agent.bulkCommissionPercentage || 5;
                    const commissionAmount = Math.round(booking.offeredPrice * (commissionPercent / 100));
                    
                    agent.walletBalance += commissionAmount;
                    agent.totalEarnings += commissionAmount;
                    await agent.save();

                    booking.agentCommissionPaid = true;
                    booking.agentCommissionAmount = commissionAmount;

                    await Transaction.create({
                        user: agent._id, userModel: 'Agent', amount: commissionAmount,
                        type: 'Credit', category: 'Commission', status: 'Completed',
                        relatedBooking: booking._id, description: `Bulk deal commission (${commissionPercent}%)`
                    });
                }
            } catch (err) {
                console.error("Bulk Agent Commission Error:", err.message);
            }
        }

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


