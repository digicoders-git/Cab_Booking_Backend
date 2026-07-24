const Booking = require("../models/Booking");
const Driver = require("../models/Driver");
const RideRequest = require("../models/RideRequest");
const Transaction = require("../models/Transaction");
const Agent = require("../models/Agent");
const Admin = require("../models/Admin");
const Fleet = require("../models/Fleet");
const Vendor = require("../models/Vendor");
const Notification = require("../models/Notification");
const { getIO } = require("../socket/socket");
const { sendPushNotification } = require("../utils/fcmNotification");
const User = require("../models/User");
const mongoose = require("mongoose");
const BulkBooking = require("../models/BulkBooking");
// const { PaymentHandler, validateHMAC_SHA256 } = require("../utils/PaymentHandler");
// const paymentHandler = PaymentHandler.getInstance();
const { RazorpayHandler } = require("../utils/RazorpayHandler");
const razorpayHandler = RazorpayHandler.getInstance();

// Haversine formula to get distance between two points in km
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity; // Return infinite if missing data
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Calculate compass heading between two points (0 to 360 degrees)
function calculateHeading(lat1, lon1, lat2, lon2) {
    const dLon = deg2rad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(deg2rad(lat2));
    const x = Math.cos(deg2rad(lat1)) * Math.sin(deg2rad(lat2)) -
        Math.sin(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.cos(dLon);
    let brng = Math.atan2(y, x);
    brng = brng * (180 / Math.PI);
    brng = (brng + 360) % 360;
    return brng;
}

// Check difference between two headings (tolerance in degrees)
function isHeadingSimilar(heading1, heading2, maxTolerance = 45) {
    if (heading1 === null || heading2 === null) return true; // If no previous heading (first ride)
    let diff = Math.abs(heading1 - heading2);
    if (diff > 180) diff = 360 - diff;
    return diff <= maxTolerance;
}

// 1. Core Background Logic: Find Nearest Driver and Send Request
exports.findAndAssignDriver = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const result = await exports.autoMatchDriver(bookingId);

        if (!result.success) {
            return res.status(result.status || 400).json(result);
        }

        res.json(result);

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Helper function for Internal use (Without req/res)
exports.autoMatchDriver = async (bookingId) => {
    try {
        const booking = await Booking.findById(bookingId);
        if (!booking || booking.bookingStatus !== "Pending") {
            return { success: false, status: 400, message: "Booking not found or not in Pending status" };
        }

        // Find all drivers who previously rejected or missed this request
        const previousRequests = await RideRequest.find({ booking: bookingId }).select("driver");
        const excludedDriverIds = previousRequests.map(r => r.driver.toString());

        // --- NEW: WATERFALL UPGRADE LOGIC ---
        const timeElapsedSecs = (Date.now() - booking.createdAt.getTime()) / 1000;
        let targetCategoryIds = [booking.carCategory];

        if (timeElapsedSecs >= 120) {
            const CarCategory = require("../models/CarCategory");
            const originalCategory = await CarCategory.findById(booking.carCategory);
            if (originalCategory) {
                const largerCategories = await CarCategory.find({
                    seatCapacity: { $gte: originalCategory.seatCapacity }
                }).select('_id');
                targetCategoryIds = largerCategories.map(c => c._id);
                console.log(`🚀 [WATERFALL UPGRADE] Time elapsed ${Math.round(timeElapsedSecs)}s. Expanding search to ${targetCategoryIds.length} categories with >= ${originalCategory.seatCapacity} seats.`);
            }
        }

        // Base query for matching
        let driverQuery = {
            isOnline: true,
            isAvailable: true,
            isActive: true,
            isApproved: true,
            "carDetails.carType": { $in: targetCategoryIds }
        };

        const normalizedRideType = booking.rideType ? booking.rideType.toLowerCase() : "";

        if (normalizedRideType === "private") {
            // FIX: Be robust against primitive null or string "null"
            driverQuery.$or = [
                { currentRideType: null },
                { currentRideType: "null" },
                { currentRideType: "" }
            ];
        } else if (normalizedRideType === "shared") {
            driverQuery.$or = [
                { currentRideType: null },
                { currentRideType: "null" },
                { currentRideType: "" },
                { currentRideType: "Shared", availableSeats: { $gte: booking.seatsBooked } }
            ];
        }

        const availableDrivers = await Driver.find(driverQuery)
            .populate("carDetails.carType")
            .select("_id name phone currentLocation availableSeats currentRideType currentHeading carDetails isAvailable seatMap fcmToken");

        console.log(`🔍 [MATCHING DEBUG] Found ${availableDrivers.length} Online Drivers in DB query.`);
        console.log(`🔍 [MATCHING DEBUG] Booking expects CarCategory ID: ${booking.carCategory}`);

        const newBookingHeading = calculateHeading(
            booking.pickup.latitude, booking.pickup.longitude,
            booking.drop.latitude, booking.drop.longitude
        );

        let driversWithDist = [];

        for (const driver of availableDrivers) {
            console.log(`   🔸 Checking Driver: ${driver.name} | Category: ${driver.carDetails?.carType?._id || driver.carDetails?.carType}`);

            if (excludedDriverIds.includes(driver._id.toString())) {
                console.log(`      ❌ Rejected: Driver previously rejected this ride.`);
                continue;
            }

            // --- 🛡️ SMART FILTER: Check for Upcoming Bulk Trip Conflicts ---
            const bufferHours = 4;
            const now = new Date();
            const bufferWindow = new Date(now.getTime() + bufferHours * 60 * 60 * 1000);

            const hasBulkConflict = await BulkBooking.findOne({
                "assignedDrivers.driver": driver._id,
                status: 'Accepted',
                pickupDateTime: { $gte: now, $lte: bufferWindow }
            });

            if (hasBulkConflict) {
                console.log(`      ❌ Rejected: Driver has an upcoming Bulk Trip at ${hasBulkConflict.pickupDateTime.toLocaleString()}`);
                continue;
            }

            if (normalizedRideType === "shared") {
                // Direction check: Only if driver is ALREADY doing a shared ride
                if (driver.currentRideType === "Shared" && driver.currentHeading !== null) {
                    // Increased tolerance to 60 for real-world road curvature
                    if (!isHeadingSimilar(driver.currentHeading, newBookingHeading, 60)) continue;
                }

                // INITIALIZE SEAT MAP (If new driver or empty map)
                let finalSeatMap = driver.seatMap || [];
                if (finalSeatMap.length === 0) {
                    const layout = driver.carDetails?.carType?.seatLayout;
                    if (layout && layout.length > 0) {
                        finalSeatMap = layout.map(s => ({ seatName: s, isBooked: false, bookingId: null }));
                        driver.seatMap = finalSeatMap;
                        // Avoid multiple saves in loop for performance, but ensure UI/Matching has current state
                    }
                }

                // Specific Seat Availability Check
                if (booking.selectedSeats && booking.selectedSeats.length > 0) {
                    if (finalSeatMap.length === 0) {
                        // Category has no named seats, but user requested a named seat. 
                        // Fallback: Skip if we can't fulfill the specific seat request.
                        continue;
                    }

                    let allSeatsFree = true;
                    for (const sName of booking.selectedSeats) {
                        const seat = finalSeatMap.find(s => s.seatName === sName);
                        if (!seat || seat.isBooked) {
                            allSeatsFree = false;
                            break;
                        }
                    }
                    if (!allSeatsFree) continue;
                }
            }

            const dist = getDistanceFromLatLonInKm(
                booking.pickup.latitude, booking.pickup.longitude,
                driver.currentLocation.latitude, driver.currentLocation.longitude
            );

            console.log(`      📍 Distance: ${dist.toFixed(2)} km`);

            // Use a max distance of 50km
            if (dist < 50) {
                console.log(`      ✅ Potential Match!`);
                driversWithDist.push({ driver, dist });
            } else {
                console.log(`      ❌ Rejected: Too far (> 50km)`);
            }
        }

        if (driversWithDist.length === 0) {
            return { success: false, status: 404, message: "No available nearby drivers found" };
        }

        // Sort drivers by distance and pick top 2
        driversWithDist.sort((a, b) => a.dist - b.dist);
        const topDrivers = driversWithDist.slice(0, 2).map(d => d.driver);

        const newRequests = [];
        const io = getIO();

        for (const driver of topDrivers) {
            const newRequest = await RideRequest.create({
                booking: booking._id,
                driver: driver._id,
                status: "Pending"
            });
            newRequests.push(newRequest);

            // SEND NOTIFICATION TO DRIVER
            await Notification.create({
                title: "New Ride Request",
                message: `You have a new ${booking.rideType} ride request from ${booking.pickup.address}.`,
                recipient: driver._id,
                recipientModel: 'Driver',
                createdBy: booking.user || booking.agent,
                createdByModel: booking.user ? 'User' : 'Agent'
            });

            // 🎯 LIVE NOTIFICATION: Tell Driver about the New Request!
            try {
                io.to(driver._id.toString()).emit("new_ride_request", {
                    bookingId: booking._id,
                    requestId: newRequest._id,
                    passengerName: booking.passengerDetails?.name || 'Passenger',
                    passengerPhone: booking.passengerDetails?.phone || 'N/A',
                    pickup: booking.pickup.address,
                    drop: booking.drop.address,
                    stops: booking.stops || [],
                    distance: booking.estimatedDistanceKm,
                    rideType: booking.rideType,
                    fare: booking.fareEstimate,
                    expiresAt: Date.now() + 16000 // 🔥 Using immediate time for zero delay
                });
                console.log(`Driver ${driver.name} notified via Socket about New Request! 🟢`);
            } catch (err) {
                console.error("Socket error (autoMatchDriver):", err.message);
            }

            // 🎯 PUSH NOTIFICATION: If driver has a token, send a push!
            if (driver.fcmToken) {
                console.log(`[TRIP-DEBUG] Attempting FCM to Driver: ${driver.name}. Token present.`);
                let notificationBody = `${booking.estimatedDistanceKm} km | Pickup: ${booking.pickup.address.split(',')[0]}`;

                // If Agent booked it, mention it in notification!
                if (booking.agent) {
                    try {
                        const agent = await Agent.findById(booking.agent);
                        if (agent) {
                            notificationBody = `Agent ${agent.name} booked: ${notificationBody}`;
                        }
                    } catch (err) { }
                }

                try {
                    const fcmResult = await sendPushNotification(driver.fcmToken, {
                        title: `New Ride: Rs.${booking.fareEstimate}`,
                        body: notificationBody,
                        data: {
                            bookingId: booking._id.toString(),
                            type: "NEW_RIDE_REQUEST",
                            pickup: booking.pickup?.address ?? '',
                            drop: booking.destination?.address ?? '',
                            fare: (booking.fareEstimate ?? 0).toString(),
                            distance: (booking.estimatedDistanceKm ?? 0).toString(),
                        }
                    });
                    console.log(`[TRIP-DEBUG] FCM Success for Driver ${driver.name}:`, fcmResult);
                } catch (fcmErr) {
                    console.error(`[TRIP-DEBUG] FCM Error for Driver ${driver.name}:`, fcmErr.message);
                }
            } else {
                console.log(`[TRIP-DEBUG] ⚠️ Driver ${driver.name} has NO FCM token. Notification skipped.`);
            }
        }

        return {
            success: true,
            message: `Request sent to ${topDrivers.length} nearest driver(s)`,
            driverDetails: topDrivers.map(d => ({ id: d._id, name: d.name })),
            requestIds: newRequests.map(r => r._id)
        };

    } catch (error) {
        return { success: false, status: 500, message: error.message };
    }
};

// 2. Used by Driver App: Fetch New Pending Ride Requests (Screen: "New Ride Requests")
exports.getPendingRequests = async (req, res) => {
    try {
        const driverId = req.user.id; // From Auth Token

        const requests = await RideRequest.find({ driver: driverId, status: "Pending" })
            .populate("booking")
            .sort({ createdAt: -1 });

        // Filter: Sirf wahi requests dikhao jinki booking abhi bhi "Pending" hai
        const activeRequests = requests.filter(req => req.booking && req.booking.bookingStatus === "Pending").map(req => {
            const reqObj = req.toObject();
            reqObj.expiresAt = new Date(req.createdAt).getTime() + 16000;
            return reqObj;
        });

        res.json({
            success: true,
            requests: activeRequests
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 3. Driver App Action: Accept or Reject the Ride
exports.respondToRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { action } = req.body; // "Accept" or "Reject"
        const driverId = req.user.id;

        const request = await RideRequest.findOne({ _id: requestId, driver: driverId });
        if (!request) return res.status(404).json({ success: false, message: "Request not found" });

        if (request.status !== "Pending") {
            return res.status(400).json({ success: false, message: "You already responded to this or it expired" });
        }

        const booking = await Booking.findById(request.booking).populate("user").populate("agent");

        if (action === "Accept") {
            // Did someone else already accept it?
            if (booking.bookingStatus !== "Pending") {
                request.status = "Cancelled";
                await request.save();
                return res.status(400).json({ success: false, message: "Sorry, this ride is no longer available." });
            }

            // Mark driver accepted
            request.status = "Accepted";
            await request.save();

            // Lock the booking
            booking.bookingStatus = "Accepted";
            booking.assignedDriver = driverId;

            const driver = await Driver.findById(driverId).populate("carDetails.carType");

            // NEW: Set Initial Driver Location on Booking for Real-time mismatch fix
            booking.driverLocation = {
                latitude: driver.currentLocation.latitude,
                longitude: driver.currentLocation.longitude,
                heading: driver.currentHeading || 0,
                lastUpdated: new Date()
            };

            await booking.save();

            // CANCEL OTHER PENDING REQUESTS FOR THIS BOOKING
            const otherRequests = await RideRequest.find({ booking: booking._id, status: "Pending", _id: { $ne: request._id } });
            if (otherRequests.length > 0) {
                await RideRequest.updateMany(
                    { booking: booking._id, status: "Pending", _id: { $ne: request._id } },
                    { status: "Cancelled" }
                );

                const io = getIO();
                for (const otherReq of otherRequests) {
                    try {
                        io.to(otherReq.driver.toString()).emit("ride_request_cancelled", {
                            requestId: otherReq._id,
                            bookingId: booking._id,
                            message: "Ride accepted by another driver"
                        });
                    } catch (err) {
                        console.error("Socket error cancelling other driver:", err.message);
                    }
                }
            }

            // SEND NOTIFICATION TO USER
            if (booking.user) {
                await Notification.create({
                    title: "Ride Accepted",
                    message: `Driver ${driver.name} has accepted your ride request.`,
                    recipient: booking.user,
                    recipientModel: 'User',
                    createdBy: driverId,
                    createdByModel: 'Driver'
                });

                // 🚀 FCM Push Notification to User
                if (booking.user && booking.user.fcmToken) {
                    await sendPushNotification(booking.user.fcmToken, {
                        title: "🚖 Ride Accepted!",
                        body: `Driver ${driver.name} is on the way to pick you up.`,
                        data: {
                            bookingId: booking._id.toString(),
                            type: "ride_accepted",
                            url: `/booking-details/${booking._id.toString()}`
                        }
                    });
                    console.log(`FCM Push sent to User ${booking.user.name} ✅`);
                } else {
                    console.log(`FCM Token Missing for User ${booking.user?.name || 'Unknown'} ⚠️ (Push notification skipped)`);
                }
            }

            // Real-time Update to USER (If booking belongs to a user)
            if (booking.user) {
                try {
                    const userId = booking.user._id || booking.user;
                    const io = getIO();
                    io.to(userId.toString()).emit("booking_update", {
                        bookingId: booking._id,
                        status: "Accepted",
                        driverName: driver.name,
                        driverPhone: driver.phone,
                        driverId: driver._id.toString(),
                        driverLocation: {
                            latitude: driver.currentLocation?.latitude || null,
                            longitude: driver.currentLocation?.longitude || null,
                            heading: driver.currentHeading || 0
                        }
                    });
                    console.log(`User ${booking.user} notified via Socket (Accepted) ✅`);
                } catch (err) {
                    console.error("User Socket Notification Error:", err.message);
                }
            }

            // Real-time Update to AGENT (If booking belongs to an agent)
            if (booking.agent) {
                try {
                    const agentId = booking.agent._id || booking.agent;
                    const io = getIO();
                    io.to(`agent_${agentId.toString()}`).emit("booking_update", {
                        bookingId: booking._id,
                        status: "Accepted",
                        driverName: driver.name,
                        driverPhone: driver.phone,
                        driverId: driver._id.toString(),
                        driverLocation: {
                            latitude: driver.currentLocation?.latitude || null,
                            longitude: driver.currentLocation?.longitude || null,
                            heading: driver.currentHeading || 0
                        }
                    });
                    console.log(`Agent ${agentId} notified via Socket (Accepted) ✅`);
                } catch (err) {
                    console.error("Agent Socket Notification Error:", err.message);
                }

                // 🚀 NEW: FCM Push Notification to Agent
                const agent = booking.agent;
                if (agent && agent.fcmToken) {
                    try {
                        await sendPushNotification(booking.agent.fcmToken, {
                            title: "🚖 Ride Accepted!",
                            body: `Driver ${driver.name} has accepted the ride for ${booking.passengerDetails.name}.`,
                            data: {
                                bookingId: booking._id.toString(),
                                type: "ride_accepted",
                                url: `/booking-details/${booking._id.toString()}`
                            }
                        });
                        console.log(`FCM Push sent to Agent ${booking.agent.name} ✅`);
                    } catch (err) {
                        console.error("Agent FCM Error:", err.message);
                    }
                } else {
                    console.log(`FCM Token Missing for Agent ${booking.agent?.name || 'Unknown'} ⚠️`);
                }
            }

            // ============================================
            // SHARED RIDE VS PRIVATE RIDE CORE LOGIC
            // ============================================

            if (booking.rideType === "Private") {
                // Completely locked. Driver becomes busy.
                driver.currentRideType = "Private";
                driver.isAvailable = false;
                driver.availableSeats = 0;
                driver.currentHeading = null;
            } else if (booking.rideType === "Shared") {
                // If car was completely empty, setup capacity first
                const capacity = driver.carDetails?.carType?.seatCapacity || 4;

                if (driver.currentRideType !== "Shared") {
                    driver.currentRideType = "Shared";
                    driver.availableSeats = capacity;

                    // Set heading based on first passenger's route!
                    driver.currentHeading = calculateHeading(
                        booking.pickup.latitude, booking.pickup.longitude,
                        booking.drop.latitude, booking.drop.longitude
                    );
                }

                // EXACT SEAT LOCKING:
                if (booking.selectedSeats && booking.selectedSeats.length > 0) {
                    // INITIALIZE SEAT MAP IF EMPTY (Fix: New driver or first shared ride needs map setup)
                    if (!driver.seatMap || driver.seatMap.length === 0) {
                        const layout = driver.carDetails?.carType?.seatLayout;
                        if (layout && layout.length > 0) {
                            driver.seatMap = layout.map(s => ({ seatName: s, isBooked: false, bookingId: null }));
                        }
                    }

                    for (let seatName of booking.selectedSeats) {
                        const seatEntry = driver.seatMap.find(s => s.seatName === seatName);
                        if (seatEntry) {
                            seatEntry.isBooked = true;
                            seatEntry.bookingId = booking._id; // Mark locked permanently
                        }
                    }
                }

                // Occupy the newly booked seats numerically
                driver.availableSeats -= booking.seatsBooked;

                // Important logic: Is the car fully packed now?
                if (driver.availableSeats <= 0) {
                    driver.isAvailable = false; // Driver is full, stop receiving new ride requests
                } else {
                    driver.isAvailable = true;  // Driver still has empty seats for more passengers!
                }
            }

            await driver.save();

            // 🎯 Real-time Status Update to ADMIN PANEL
            try {
                const io = getIO();
                const activityStatus = driver.currentRideType === "Shared" ? "On Shared Ride" : "On Private Ride";

                io.to('admin_room').emit("driver_location_update", {
                    driverId: driver._id.toString(),
                    status: activityStatus,
                    latitude: driver.currentLocation?.latitude,
                    longitude: driver.currentLocation?.longitude,
                    heading: driver.currentHeading || 0,
                    currentTrip: {
                        type: driver.currentRideType,
                        pickup: { address: booking.pickup.address, latitude: booking.pickup.latitude, longitude: booking.pickup.longitude },
                        drop: { address: booking.drop.address, latitude: booking.drop.latitude, longitude: booking.drop.longitude },
                        passengers: booking.seatsBooked || 1
                    }
                });
                console.log(`Admin notified of Driver ${driver.name} status change to ${activityStatus} (Accepted) 🟢`);
            } catch (err) {
                console.error("Admin Socket Notification Error (Accepted):", err.message);
            }

            return res.json({ success: true, message: "Ride Accepted! Proceed to pickup.", booking });

        } else if (action === "Reject") {
            request.status = "Rejected";
            await request.save();
            return res.json({ success: true, message: "Ride Rejected. Waiting for next request." });
        } else {
            return res.status(400).json({ success: false, message: "Invalid action. Use Accept or Reject" });
        }

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 4. Start Trip: Driver enters the OTP customer provided
exports.startTrip = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { otp } = req.body;
        const driverId = req.user.id;

        const booking = await Booking.findOne({ _id: bookingId, assignedDriver: driverId });
        if (!booking) return res.status(404).json({ success: false, message: "Booking not assigned to you" });

        if (booking.bookingStatus !== "Accepted") {
            return res.status(400).json({ success: false, message: "Booking must be Accepted to start" });
        }

        if (booking.tripData.startOtp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP! Customer must provide correct OTP to start." });
        }

        booking.bookingStatus = "Ongoing";
        booking.tripData.startedAt = new Date();

        // ⏱️ WAITING CHARGE CALCULATION (Phase 1)
        if (booking.tripData.arrivedAt) {
            try {
                // Fetch car category to get specific waiting rules
                const carCategory = await mongoose.model("CarCategory").findById(booking.carCategory);
                if (carCategory) {
                    const freeTime = (carCategory.freeWaitingMin || 3) * 60 * 1000; // in ms
                    const ratePerMin = carCategory.waitingChargePerMin || 2;
                    const totalWaitMs = booking.tripData.startedAt - booking.tripData.arrivedAt;

                    if (totalWaitMs > freeTime) {
                        const extraMs = totalWaitMs - freeTime;
                        const extraMin = Math.ceil(extraMs / (60 * 1000));
                        const totalWaitingCharges = extraMin * ratePerMin;

                        booking.tripData.waitingTimeMin = extraMin;
                        booking.tripData.waitingCharges = totalWaitingCharges;

                        // Add waiting charges to the overall fare
                        booking.fareEstimate += totalWaitingCharges;
                        console.log(`⏱️ Waiting Charges Calculated: ${extraMin} min extra = ₹${totalWaitingCharges}`);
                    }
                }
            } catch (err) {
                console.error("Waiting Calculation Error:", err.message);
            }
        }

        booking.markModified("tripData");
        await booking.save();

        // 🚀 FCM Push to Driver & Rider for Ongoing Status
        try {
            const driver = await Driver.findById(driverId);
            if (driver && driver.fcmToken) {
                await sendPushNotification(driver.fcmToken, {
                    title: "🚕 Trip Started!",
                    body: `Your trip ${booking._id.toString().slice(-6)} has begun. Drive safely!`,
                    data: { type: "TRIP_ONGOING", bookingId: booking._id.toString() }
                });
            }

            // Also Notify Rider
            if (booking.user) {
                const rider = await User.findById(booking.user);
                if (rider && rider.fcmToken) {
                    await sendPushNotification(rider.fcmToken, {
                        title: "🚕 Your trip has started!",
                        body: `Your ride ${booking._id.toString().slice(-6)} with ${driver?.name || 'driver'} has begun.`,
                        data: { type: "TRIP_ONGOING", bookingId: booking._id.toString() }
                    });
                }
            }

            // Also Notify Agent
            if (booking.agent) {
                const agent = await Agent.findById(booking.agent._id || booking.agent);
                if (agent && agent.fcmToken) {
                    await sendPushNotification(agent.fcmToken, {
                        title: "🚕 Trip Started",
                        body: `Ride for ${booking.passengerDetails?.name || 'Passenger'} has begun.`,
                        data: { type: "TRIP_ONGOING", bookingId: booking._id.toString() }
                    });
                    console.log(`FCM Ongoing Push sent to Agent ${agent.name} ✅`);
                }
            }
        } catch (fcmErr) { console.error("FCM Ongoing Error:", fcmErr.message); }

        // REAL-TIME UPDATE TO AGENT & USER
        try {
            const agentId = booking.agent?._id || booking.agent;
            const userId = booking.user?._id || booking.user;
            const io = getIO();
            if (agentId) {
                io.to(`agent_${agentId.toString()}`).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Ongoing"
                });
                console.log(`Agent ${agentId} notified via Socket (Trip Started)`);
            }
            if (userId) {
                io.to(userId.toString()).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Ongoing"
                });
                console.log(`User ${userId} notified via Socket (Trip Started)`);
            }

            // 🎯 Real-time Status Update to ADMIN PANEL
            const driver = await Driver.findById(driverId);
            const activityStatus = driver.currentRideType === "Shared" ? "On Shared Ride" : "On Private Ride";
            io.to('admin_room').emit("driver_location_update", {
                driverId: driver._id.toString(),
                status: activityStatus,
                latitude: driver.currentLocation?.latitude,
                longitude: driver.currentLocation?.longitude,
                heading: driver.currentHeading || 0,
                currentTrip: {
                    type: driver.currentRideType,
                    pickup: { address: booking.pickup.address, latitude: booking.pickup.latitude, longitude: booking.pickup.longitude },
                    drop: { address: booking.drop.address, latitude: booking.drop.latitude, longitude: booking.drop.longitude },
                    passengers: booking.seatsBooked || 1
                }
            });
            console.log(`Admin notified: Trip Started (Status: ${activityStatus})`);

        } catch (err) {
            console.error("Socket Notification Error (startTrip):", err.message);
        }

        res.json({ success: true, message: "Trip Started Successfully!", booking });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 5. End Trip: Complete the ride
exports.endTrip = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { paymentMethod } = req.body; // Driver chooses this at the end
        const driverId = req.user.id;

        if (!paymentMethod || !['Cash', 'Online'].includes(paymentMethod)) {
            return res.status(400).json({
                success: false,
                message: "Please choose payment method (Cash or Online) to end trip"
            });
        }

        const booking = await Booking.findOne({ _id: bookingId, assignedDriver: driverId });
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.bookingStatus !== "Ongoing" && booking.bookingStatus !== "Payment_Pending") {
            return res.status(400).json({ success: false, message: "Only Ongoing or Payment Pending trips can be ended" });
        }

        // --- NEW: MANDATORY STOP COMPLETION CHECK ---
        if (booking.stops && booking.stops.length > 0) {
            const incompleteStop = booking.stops.find(s => s.status !== "Completed");
            if (incompleteStop) {
                return res.status(400).json({
                    success: false,
                    message: `Pehle saare intermediate stops complete karo! (${incompleteStop.address} baki hai)`
                });
            }
        }
        // --------------------------------------------

        // Setup completion
        booking.bookingStatus = "Completed";
        booking.tripData.endedAt = new Date();

        // Finalize fare (Keep the waiting charges added during stops)
        booking.actualFare = booking.actualFare > 0 ? booking.actualFare : booking.fareEstimate;
        booking.paymentMethod = paymentMethod;
        booking.paymentStatus = "Completed";
        await booking.save();

        // 🚀 FCM Push to Driver & Rider for Completed Status
        try {
            const driverForFcm = await Driver.findById(driverId);
            if (driverForFcm && driverForFcm.fcmToken) {
                await sendPushNotification(driverForFcm.fcmToken, {
                    title: "🏁 Trip Completed",
                    body: `Trip ${booking._id.toString().slice(-6)} ended. ${booking.actualFare} INR earned.`,
                    data: { type: "TRIP_COMPLETED", bookingId: booking._id.toString() }
                });
            }

            // Also Notify Rider
            if (booking.user) {
                const rider = await User.findById(booking.user);
                if (rider && rider.fcmToken) {
                    await sendPushNotification(rider.fcmToken, {
                        title: "🏁 Trip Completed",
                        body: `You have reached your destination. Hope you had a great ride!`,
                        data: { type: "TRIP_COMPLETED", bookingId: booking._id.toString() }
                    });
                }
            }

            // Also Notify Agent
            if (booking.agent) {
                const agent = await Agent.findById(booking.agent._id || booking.agent);
                if (agent && agent.fcmToken) {
                    await sendPushNotification(agent.fcmToken, {
                        title: "🏁 Trip Completed",
                        body: `Ride for ${booking.passengerDetails?.name || 'Passenger'} has been completed successfully.`,
                        data: { type: "TRIP_COMPLETED", bookingId: booking._id.toString() }
                    });
                    console.log(`FCM Completed Push sent to Agent ${agent.name} ✅`);
                }
            }
        } catch (fcmErr) { console.error("FCM Completed Error:", fcmErr.message); }

        // 🟢 PRE-RELEASE DRIVER (Make driver available immediately)
        const driver = await Driver.findById(driverId).populate("carDetails.carType");
        if (!driver) return res.status(404).json({ success: false, message: "Driver details not found" });

        // Logic for Shared/Private released
        if (booking.rideType === "Private") {
            driver.isAvailable = true;
            driver.currentRideType = null;
            driver.availableSeats = 0;
            driver.currentHeading = null;
        } else if (booking.rideType === "Shared") {
            // EXACT SEAT UNLOCKING
            if (booking.selectedSeats && booking.selectedSeats.length > 0) {
                for (let seatName of booking.selectedSeats) {
                    const seatEntry = (driver.seatMap || []).find(s => s.seatName === seatName);
                    if (seatEntry && seatEntry.bookingId && seatEntry.bookingId.toString() === booking._id.toString()) {
                        seatEntry.isBooked = false;
                        seatEntry.bookingId = null;
                    }
                }
            }
            driver.availableSeats += booking.seatsBooked;
            const capacity = driver.carDetails?.carType?.seatCapacity || 4;

            if (driver.availableSeats >= capacity) {
                driver.isAvailable = true;
                driver.currentRideType = null;
                driver.availableSeats = 0;
                driver.currentHeading = null;
                if (driver.seatMap) driver.seatMap.forEach(s => { s.isBooked = false; s.bookingId = null; });
            } else {
                driver.isAvailable = true; // Still has others, but can take new ones
            }
        }

        // Stats update
        driver.totalTrips += 1;

        // 🟢 MONEY SPLIT & SETTLEMENTS
        await exports.processTripSettlement(booking, driver);

        // Final Safety Check & Save Driver
        if (driver.walletBalance < (driver.debtLimit || -500)) {
            driver.isActive = false;
            driver.isOnline = false;
        }

        await driver.save();

        // 🎯 Real-time Status Update to ADMIN PANEL
        try {
            const io = getIO();
            const activityStatus = driver.isOnline ? (driver.isAvailable ? "Idle" : (driver.currentRideType === "Shared" ? "On Shared Ride" : "On Private Ride")) : "Offline";

            io.to('admin_room').emit("driver_location_update", {
                driverId: driver._id.toString(),
                status: activityStatus,
                latitude: driver.currentLocation?.latitude,
                longitude: driver.currentLocation?.longitude,
                heading: driver.currentHeading || 0,
                currentTrip: null // Clear trip on end
            });
            console.log(`Admin notified: Trip Ended (Driver Status: ${activityStatus})`);
        } catch (err) {
            console.error("Admin Socket Notification Error (endTrip):", err.message);
        }

        // REAL-TIME UPDATE TO AGENT & USER
        try {
            const agentId = booking.agent?._id || booking.agent;
            const userId = booking.user?._id || booking.user;
            const io = getIO();
            if (agentId) {
                io.to(`agent_${agentId.toString()}`).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Completed",
                    finalFare: booking.actualFare,
                    paymentMethod: booking.paymentMethod
                });
            }
            if (userId) {
                io.to(userId.toString()).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Completed",
                    finalFare: booking.actualFare,
                    paymentMethod: booking.paymentMethod
                });
            }
        } catch (err) { }

        res.json({ success: true, message: "Trip Ended successfully", finalFare: booking.actualFare });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 6. Track Driver Location (User/Agent Only)
exports.getDriverLocation = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId).populate("assignedDriver");

        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
        if (!booking.assignedDriver) return res.status(400).json({ success: false, message: "No driver assigned yet" });

        res.json({
            success: true,
            driverId: booking.assignedDriver._id,
            driverName: booking.assignedDriver.name,
            location: booking.assignedDriver.currentLocation
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
// 7. Get Driver's Assigned Bookings (My Trips)
exports.getDriverTrips = async (req, res) => {
    try {
        const driverId = req.user.id;

        // Find all bookings assigned to this driver
        const bookings = await Booking.find({ assignedDriver: driverId })
            .select("-tripData.startOtp") // SECURITY: Don't show OTP to driver!
            .populate("carCategory", "name image freeWaitingMin waitingChargePerMin")
            .populate("user", "name phone")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: bookings.length,
            trips: bookings
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 8. Driver notify Arrival at Pickup (Phase 1 Waiting Feature)
exports.markArrived = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const driverId = req.user.id;

        const booking = await Booking.findOne({ _id: bookingId, assignedDriver: driverId });
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.bookingStatus !== "Accepted") {
            return res.status(400).json({ success: false, message: "Booking must be in 'Accepted' status to mark arrived" });
        }

        // 1. Mark Arrived
        booking.tripData.arrivedAt = new Date();
        await booking.save();

        // 2. Notify USER (Socket)
        if (booking.user) {
            try {
                const io = getIO();
                io.to(booking.user.toString()).emit("driver_arrived", {
                    bookingId: booking._id,
                    message: "Driver has arrived at the pickup location and is waiting.",
                    arrivedAt: booking.tripData.arrivedAt
                });
            } catch (err) { }
        }

        // 3. Notify AGENT (Socket)
        if (booking.agent) {
            try {
                const agentId = booking.agent._id || booking.agent;
                const io = getIO();
                io.to(`agent_${agentId.toString()}`).emit("driver_arrived", {
                    bookingId: booking._id,
                    passengerName: booking.passengerDetails?.name,
                    message: "Driver Arrived at Pickup"
                });
            } catch (err) { }
        }

        // 4. Send Push Notification to User
        if (booking.user) {
            const user = await User.findById(booking.user);
            if (user && user.fcmToken) {
                await sendPushNotification(user.fcmToken, {
                    title: "🚕 Driver Arrived!",
                    body: "Your driver is waiting at the pickup location. Please reach the car soon.",
                    data: {
                        type: "DRIVER_ARRIVED",
                        bookingId: booking._id.toString(),
                        url: `/booking-details/${booking._id.toString()}`
                    }
                });
            }
        }

        res.json({ success: true, message: "Check-in successful. Waiting timer started.", arrivedAt: booking.tripData.arrivedAt });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 9. Driver Cancel Trip (Allowed after Accept but before Start)
exports.cancelTripByDriver = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { reason } = req.body;
        const driverId = req.user.id;

        const booking = await Booking.findOne({ _id: bookingId, assignedDriver: driverId });
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found or not assigned to you" });

        // Only allow cancel if not started (Ongoing/Completed can't be cancelled)
        if (!["Accepted", "Arrived"].includes(booking.bookingStatus)) {
            return res.status(400).json({
                success: false,
                message: `You cannot cancel this trip because it is already ${booking.bookingStatus}`
            });
        }

        const driver = await Driver.findById(driverId).populate("carDetails.carType");

        // 1. Update Booking Status
        booking.bookingStatus = "Cancelled";
        booking.cancelReason = reason || "Driver cancelled the trip";
        booking.cancelledBy = "Driver";
        await booking.save();

        // 2. Reset Driver Availability
        if (booking.rideType === "Private") {
            driver.isAvailable = true;
            driver.currentRideType = null;
            driver.availableSeats = 0;
            driver.currentHeading = null;
        } else if (booking.rideType === "Shared") {
            // Restore seats
            if (booking.selectedSeats && booking.selectedSeats.length > 0) {
                for (let seatName of booking.selectedSeats) {
                    const seatEntry = (driver.seatMap || []).find(s => s.seatName === seatName);
                    if (seatEntry && seatEntry.bookingId && seatEntry.bookingId.toString() === booking._id.toString()) {
                        seatEntry.isBooked = false;
                        seatEntry.bookingId = null;
                    }
                }
            }
            driver.availableSeats += booking.seatsBooked;
            const capacity = driver.carDetails?.carType?.seatCapacity || 4;

            if (driver.availableSeats >= capacity) {
                driver.isAvailable = true;
                driver.currentRideType = null;
                driver.availableSeats = 0;
                driver.currentHeading = null;
                if (driver.seatMap) driver.seatMap.forEach(s => { s.isBooked = false; s.bookingId = null; });
            } else {
                driver.isAvailable = true;
            }
        }
        await driver.save();

        // 3. Notify User (Socket & FCM)
        if (booking.user) {
            try {
                const io = getIO();
                io.to(booking.user.toString()).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Cancelled",
                    message: "Sorry, your driver has cancelled the trip."
                });

                const rider = await User.findById(booking.user);
                if (rider && rider.fcmToken) {
                    await sendPushNotification(rider.fcmToken, {
                        title: "🚨 Ride Cancelled by Driver",
                        body: `We're sorry, Driver ${driver.name} had to cancel your trip.`,
                        data: { type: "RIDE_CANCELLED", bookingId: booking._id.toString() }
                    });
                }
            } catch (err) { }
        }

        // 4. Notify Agent (Socket & FCM)
        if (booking.agent) {
            try {
                const io = getIO();
                io.to(`agent_${booking.agent.toString()}`).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Cancelled",
                    message: "Driver has cancelled the trip."
                });

                const agent = await Agent.findById(booking.agent);
                if (agent && agent.fcmToken) {
                    await sendPushNotification(agent.fcmToken, {
                        title: "🚨 Ride Cancelled by Driver",
                        body: `Driver ${driver.name} cancelled the ride for ${booking.passengerDetails?.name}.`,
                        data: { type: "RIDE_CANCELLED", bookingId: booking._id.toString() }
                    });
                }
            } catch (err) { }
        }

        // 5. Notify Admin (Socket)
        try {
            const io = getIO();
            io.to('admin_room').emit("driver_location_update", {
                driverId: driver._id.toString(),
                status: "Idle",
                latitude: driver.currentLocation?.latitude,
                longitude: driver.currentLocation?.longitude
            });
        } catch (err) { }

        res.json({ success: true, message: "Trip cancelled successfully. You are now available for new rides." });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 8b. Stop Management: Mark Arrival at a specific Stop
exports.markStopArrived = async (req, res) => {
    try {
        const { bookingId, stopIndex } = req.params;
        const driverId = req.user.id;

        const booking = await Booking.findOne({ _id: bookingId, assignedDriver: driverId });
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.bookingStatus !== "Ongoing") {
            return res.status(400).json({ success: false, message: "Trip must be 'Ongoing' to manage stops" });
        }

        const idx = parseInt(stopIndex);
        if (!booking.stops[idx]) {
            return res.status(400).json({ success: false, message: "Invalid stop index" });
        }

        booking.stops[idx].status = "Arrived";
        booking.stops[idx].arrivedAt = new Date();
        await booking.save();

        // Notify User/Agent
        const io = require("../socket/socket").getIO();
        const userId = booking.user?.toString();
        const agentId = booking.agent?._id || booking.agent;

        const socketData = {
            bookingId: booking._id,
            stopIndex: idx,
            status: "Arrived",
            arrivedAt: booking.stops[idx].arrivedAt,
            message: `Driver arrived at stop: ${booking.stops[idx].address}`
        };

        if (userId) io.to(userId).emit("stop_update", socketData);
        if (agentId) io.to(`agent_${agentId.toString()}`).emit("stop_update", socketData);

        res.json({ success: true, message: "Arrived at stop ✅", stop: booking.stops[idx] });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 8c. Stop Management: Mark Stop Completed (Calculate Charges)
exports.completeStop = async (req, res) => {
    try {
        const { bookingId, stopIndex } = req.params;
        const driverId = req.user.id;

        const booking = await Booking.findOne({ _id: bookingId, assignedDriver: driverId }).populate("carCategory");
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        const idx = parseInt(stopIndex);
        if (!booking.stops[idx] || booking.stops[idx].status !== "Arrived") {
            return res.status(400).json({ success: false, message: "Stop must be marked 'Arrived' first" });
        }

        const now = new Date();
        const arrivedAt = booking.stops[idx].arrivedAt;
        const elapsedMin = Math.floor((now - arrivedAt) / 60000);

        const freeMin = booking.carCategory?.freeWaitingMin || 5;
        const rate = booking.carCategory?.waitingChargePerMin || 2;

        let waitMin = 0;
        let waitCharge = 0;

        if (elapsedMin > freeMin) {
            waitMin = elapsedMin - freeMin;
            waitCharge = waitMin * rate;
        }

        booking.stops[idx].status = "Completed";
        booking.stops[idx].completedAt = now;
        booking.stops[idx].waitingTimeMin = waitMin;
        booking.stops[idx].waitingCharges = waitCharge;

        // Add to total actual fare
        booking.actualFare = (booking.actualFare || booking.fareEstimate) + waitCharge;

        await booking.save();

        // Notify User/Agent
        const io = require("../socket/socket").getIO();
        const userId = booking.user?.toString();
        const agentId = booking.agent?._id || booking.agent;

        const socketData = {
            bookingId: booking._id,
            stopIndex: idx,
            status: "Completed",
            waitingTimeMin: waitMin,
            waitingCharges: waitCharge,
            totalFare: booking.actualFare,
            message: `Stop completed. Waiting charges: ₹${waitCharge}`
        };

        if (userId) io.to(userId).emit("stop_update", socketData);
        if (agentId) io.to(`agent_${agentId.toString()}`).emit("stop_update", socketData);

        res.json({
            success: true,
            message: "Stop completed ✅",
            waitCharge,
            totalFare: booking.actualFare
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 20. Initiate Online Payment for Normal Trip
exports.initiateTripPayment = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const driverId = req.user.id;

        const booking = await Booking.findOne({ _id: bookingId, assignedDriver: driverId });
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        const amountToCollect = booking.actualFare > 0 ? booking.actualFare : booking.fareEstimate;

        if (amountToCollect <= 0) {
            return res.status(400).json({ success: false, message: "Invalid fare amount" });
        }

        const orderIdString = `order_${bookingId.slice(-6)}_${Date.now()}`;

        const frontendOrigin = req.headers.origin || process.env.FRONTEND_DRIVER_URL || 'http://localhost:5174';
        const protocol = req.get('host').includes('localhost') || req.get('host').includes('127.0.0.1') ? req.protocol : 'https';
        const returnUrl = `${protocol}://${req.get('host')}/api/trips/execute/payment-return?redirect=${encodeURIComponent(frontendOrigin + '/driver/trip/' + booking._id)}`;

        // const sessionResponse = await paymentHandler.orderSession({
        const sessionResponse = await razorpayHandler.orderSession({
            order_id: orderIdString,
            amount: amountToCollect.toFixed(2),
            customer_id: booking.user ? booking.user.toString() : "guest",
            customer_email: "test@example.com",
            customer_phone: booking.passengerDetails?.phone || "9999999999",
            return_url: returnUrl
        });

        booking.hdfcOrderId = orderIdString;
        await booking.save();

        // 🎯 Notify User that Payment has been Requested
        try {
            const { getIO } = require("../socket/socket");
            const io = getIO();
            if (booking.user) {
                io.to(booking.user.toString()).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Payment_Requested",
                    paymentMethod: "Online",
                    finalFare: amountToCollect,
                    paymentLinks: sessionResponse.payment_links || sessionResponse
                });
            }
        } catch (err) {
            console.error("Socket error on payment initiation:", err.message);
        }

        res.json({
            success: true,
            orderId: orderIdString,
            amount: amountToCollect,
            paymentLinks: sessionResponse.payment_links || sessionResponse
        });

    } catch (error) {
        console.error("HDFC Order Error:", error.message);
        res.status(500).json({ success: false, message: "Payment initiation failed", error: error.message });
    }
};

// 21. Verify Online Payment and End Trip
exports.verifyTripPayment = async (req, res) => {
    try {
        const { bookingId, hdfcOrderId, hdfcTransactionId, ...paymentParams } = req.body;
        const driverId = req.user.id;

        const booking = await Booking.findOne({ _id: bookingId, assignedDriver: driverId });
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Signature Verification is now handled by Razorpay in paymentReturn
        // Payment Success! Now End the Trip
        booking.hdfcTransactionId = hdfcTransactionId || req.body.transaction_id || req.body.order_id;
        booking.paymentMethod = "Online";
        booking.paymentStatus = "Completed";
        booking.bookingStatus = "Completed";
        booking.tripData.endedAt = new Date();
        booking.actualFare = booking.actualFare > 0 ? booking.actualFare : booking.fareEstimate;

        await booking.save();

        // --- Post-Completion Logic (Same as endTrip) ---
        // (Settlements, Notifications, Making Driver Available)
        // I will extract the settlement logic to a helper if needed, but for now I'll just call endTrip logically or copy.
        // Actually, let's just make it call a helper.

        // Notification & Status Updates
        const driver = await Driver.findById(driverId).populate("carDetails.carType");

        // 🟢 RELEASE DRIVER (Make driver available immediately)
        if (booking.rideType === "Private") {
            driver.isAvailable = true;
            driver.currentRideType = null;
            driver.availableSeats = 0;
            driver.currentHeading = null;
        } else if (booking.rideType === "Shared") {
            // EXACT SEAT UNLOCKING
            if (booking.selectedSeats && booking.selectedSeats.length > 0) {
                for (let seatName of booking.selectedSeats) {
                    const seatEntry = (driver.seatMap || []).find(s => s.seatName === seatName);
                    if (seatEntry && seatEntry.bookingId && seatEntry.bookingId.toString() === booking._id.toString()) {
                        seatEntry.isBooked = false;
                        seatEntry.bookingId = null;
                    }
                }
            }
            driver.availableSeats += booking.seatsBooked;
            const capacity = driver.carDetails?.carType?.seatCapacity || 4;

            if (driver.availableSeats >= capacity) {
                driver.isAvailable = true;
                driver.currentRideType = null;
                driver.availableSeats = 0;
                driver.currentHeading = null;
                if (driver.seatMap) driver.seatMap.forEach(s => { s.isBooked = false; s.bookingId = null; });
            } else {
                driver.isAvailable = true;
            }
        }

        await exports.processTripSettlement(booking, driver);
        await driver.save();

        // Notify Rider & Admin
        // Notify Rider, Agent & Driver
        try {
            const io = getIO();
            if (booking.user) io.to(booking.user.toString()).emit("booking_update", { bookingId: booking._id, status: "Completed" });
            if (booking.agent) io.to(`agent_${booking.agent.toString()}`).emit("booking_update", { bookingId: booking._id, status: "Completed" });
            if (driver._id) io.to(driver._id.toString()).emit("booking_update", { bookingId: booking._id, status: "Completed" });

            // Notify Admin Panel
            io.to('admin_room').emit("driver_location_update", {
                driverId: driver._id.toString(),
                status: "Available",
                latitude: driver.currentLocation?.latitude,
                longitude: driver.currentLocation?.longitude
            });
        } catch (err) { }

        res.json({ success: true, message: "Payment verified and trip ended!", booking });

    } catch (error) {
        console.error("Verification Error:", error.message);
        res.status(500).json({ success: false, message: "Verification failed", error: error.message });
    }
};

exports.paymentReturn = async (req, res) => {
    try {
        const payload = req.method === 'POST' ? req.body : req.query;
        const fallbackUrl = process.env.FRONTEND_DRIVER_URL || 'http://localhost:5174';

        /* HDFC Code Commented Out:
        if (!payload || !payload.status) {
            return res.redirect((req.query.redirect || `${fallbackUrl}/dashboard`) + '?error=invalid_payload');
        }

        const { validateHMAC_SHA256 } = require("../utils/PaymentHandler");
        const isValid = validateHMAC_SHA256(payload, process.env.HDFC_RESPONSE_KEY);
        const isUAT = process.env.HDFC_BASE_URL && process.env.HDFC_BASE_URL.includes('uat');

        if (!isValid && !isUAT) {
            return res.redirect((req.query.redirect || `${fallbackUrl}/dashboard`) + '?error=invalid_signature');
        }

        const orderId = payload.order_id;
        const status = payload.status ? payload.status.toUpperCase() : '';
        const statusId = payload.status_id ? String(payload.status_id) : '';

        if (status === 'CHARGED' || status === 'SUCCESS' || status === 'AUTHORIZING' || statusId === '21' || statusId === '28') {
        */

        if (!payload || !payload.razorpay_payment_link_status) {
            return res.redirect((req.query.redirect || `${fallbackUrl}/dashboard`) + '?error=invalid_payload');
        }

        const isValid = razorpayHandler.validateSignature(
            payload.razorpay_payment_id,
            payload.razorpay_payment_link_id,
            payload.razorpay_payment_link_reference_id,
            payload.razorpay_payment_link_status,
            payload.razorpay_signature
        );

        if (!isValid) {
            return res.redirect((req.query.redirect || `${fallbackUrl}/dashboard`) + '?error=invalid_signature');
        }

        const orderId = payload.razorpay_payment_link_reference_id;
        const status = payload.razorpay_payment_link_status ? payload.razorpay_payment_link_status.toUpperCase() : '';

        if (status === 'PAID') {
            const Booking = require("../models/Booking");
            const booking = await Booking.findOne({ hdfcOrderId: orderId });

            if (booking) {
                req.body = { bookingId: booking._id.toString(), hdfcOrderId: orderId, hdfcTransactionId: payload.transaction_id || orderId };
                req.user = { id: booking.assignedDriver };

                const targetUrl = req.query.redirect || `${fallbackUrl}/driver/trip/${booking._id}`;

                const originalJson = res.json;
                res.json = function (data) {
                    if (data.success) {
                        return res.redirect(`${targetUrl}?success=true`);
                    } else {
                        return res.redirect(`${targetUrl}?error=${encodeURIComponent(data.message)}`);
                    }
                };

                return exports.verifyTripPayment(req, res);
            }
        }
        return res.redirect((req.query.redirect || `${fallbackUrl}/dashboard`) + '?error=payment_failed');
    } catch (e) {
        console.error("Payment Return Error:", e);
        return res.redirect((req.query.redirect || `${fallbackUrl}/dashboard`) + '?error=server_error');
    }
};

// 22. Helper: Process Trip Settlements (Money Split)
exports.processTripSettlement = async (booking, driver) => {
    try {
        const totalFare = booking.actualFare;
        const isCash = booking.paymentMethod === 'Cash';

        // 1. Agent Commission
        let agentCut = 0;
        if (booking.agent) {
            const agent = await Agent.findById(booking.agent);
            if (agent) {
                agentCut = booking.agentCommission || 0;
                agent.walletBalance += agentCut;
                agent.totalEarnings += agentCut;
                agent.totalBookings += 1;
                await agent.save();
                await Transaction.create({
                    user: agent._id, userModel: 'Agent', amount: agentCut, type: 'Credit',
                    category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                    description: `Commission for booking ${booking._id}`
                });
            }
        }

        // 2. Admin Commission
        let adminPercentage = 10;
        let admin = await Admin.findOne();
        if (admin) adminPercentage = admin.defaultCommission || 10;
        if (driver.createdByModel === "Fleet") {
            const fleet = await Fleet.findById(driver.createdBy);
            if (fleet && fleet.commissionPercentage !== undefined) adminPercentage = fleet.commissionPercentage;
        }
        const adminCut = Math.round(totalFare * (adminPercentage / 100));

        if (admin) {
            admin.walletBalance = (admin.walletBalance || 0) + adminCut;
            admin.totalEarnings = (admin.totalEarnings || 0) + adminCut;
            await admin.save();
            await Transaction.create({
                user: admin._id, userModel: 'Admin', amount: adminCut, type: 'Credit',
                category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                description: `Admin fee for trip ${booking._id}`
            });
        }

        // 3. Vendor Commission Logic (Master Franchise Model)
        const uniqueVendorIds = new Set();

        // A. Driver's Creator
        if (driver.createdByModel === "Vendor" && driver.createdBy) {
            uniqueVendorIds.add(driver.createdBy.toString());
        }
        // B. Fleet's Creator
        if (driver.createdByModel === "Fleet" && driver.createdBy) {
            const fleet = await Fleet.findById(driver.createdBy);
            if (fleet && fleet.createdByModel === "Vendor" && fleet.createdBy) {
                uniqueVendorIds.add(fleet.createdBy.toString());
            }
        }
        // C. Agent's Creator
        if (booking.agent) {
            const agent = await Agent.findById(booking.agent._id || booking.agent);
            if (agent && agent.createdByVendor) {
                uniqueVendorIds.add(agent.createdByVendor.toString());
            }
        }

        // Apply Commission
        if (admin) {
            for (const vendorId of uniqueVendorIds) {
                const vendor = await Vendor.findById(vendorId);
                if (vendor) {
                    const commPct = vendor.commissionPercentage !== undefined ? vendor.commissionPercentage : 25;
                    const vendorCut = Math.round(adminCut * (commPct / 100));

                    if (vendorCut > 0) {
                        admin.walletBalance -= vendorCut;
                        admin.totalEarnings -= vendorCut;
                        await admin.save();

                        await Transaction.create({
                            user: admin._id, userModel: 'Admin', amount: vendorCut, type: 'Debit',
                            category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                            description: `Master Franchise cut paid to Vendor '${vendor.name}'`
                        });

                        vendor.walletBalance = (vendor.walletBalance || 0) + vendorCut;
                        vendor.totalEarnings = (vendor.totalEarnings || 0) + vendorCut;
                        await vendor.save();

                        await Transaction.create({
                            user: vendor._id, userModel: 'Vendor', amount: vendorCut, type: 'Credit',
                            category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                            description: `Master Franchise Commission (Trip ${booking._id.toString().slice(-6)})`
                        });
                    }
                }
            }
        }

        // 4. Driver/Fleet Profit
        const commissionTotal = agentCut + adminCut;
        const driverProfit = totalFare - commissionTotal;

        if (driver.createdByModel === "Fleet") {
            const fleet = await Fleet.findById(driver.createdBy);
            if (fleet) {
                if (isCash) {
                    fleet.walletBalance -= commissionTotal;
                    fleet.totalEarnings += driverProfit; // Record earnings even if collected as cash
                    await Transaction.create({
                        user: fleet._id, userModel: 'Fleet', amount: commissionTotal, type: 'Debit',
                        category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                        description: `Commission debt for Cash Trip ${booking._id}`
                    });
                } else {
                    fleet.walletBalance += driverProfit;
                    fleet.totalEarnings += driverProfit;
                    await Transaction.create({
                        user: fleet._id, userModel: 'Fleet', amount: driverProfit, type: 'Credit',
                        category: 'Ride Earning', status: 'Completed', relatedBooking: booking._id,
                        description: `Earning from Fleet Driver ${driver.name}`
                    });
                }
                await fleet.save();
            }
        } else {
            if (isCash) {
                driver.walletBalance -= commissionTotal;
                driver.totalEarnings += driverProfit; // Record earnings even if collected as cash
                await Transaction.create({
                    user: driver._id, userModel: 'Driver', amount: commissionTotal, type: 'Debit',
                    category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                    description: `Commission debt (Cash Trip)`
                });
            } else {
                driver.walletBalance += driverProfit;
                driver.totalEarnings += driverProfit;
                await Transaction.create({
                    user: driver._id, userModel: 'Driver', amount: driverProfit, type: 'Credit',
                    category: 'Ride Earning', status: 'Completed', relatedBooking: booking._id,
                    description: `Trip earnings`
                });
            }
        }

        // 5. Passenger (User) Transaction entry
        if (booking.user) {
            await Transaction.create({
                user: booking.user,
                userModel: 'User',
                amount: totalFare,
                type: 'Debit',
                category: 'Ride Payment',
                status: 'Completed',
                relatedBooking: booking._id,
                description: `Payment for ride #${booking._id.toString().substr(-6).toUpperCase()} (${booking.paymentMethod})`
            });
        }

        // Final Safety Check for Driver Balance
        if (driver.walletBalance < (driver.debtLimit || -500)) {
            driver.isActive = false;
            driver.isOnline = false;
        }

    } catch (finError) {
        console.error("Financial Calculation Error:", finError.message);
    }
};
// ==========================================
// USER-SIDE PAYMENT FLOW (NEW API)
// ==========================================

exports.initiateTripCompletion = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const driverId = req.user.id;

        const booking = await Booking.findOne({ _id: bookingId, assignedDriver: driverId });
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.bookingStatus !== "Ongoing") {
            return res.status(400).json({ success: false, message: "Only Ongoing trips can be ended" });
        }

        // MANDATORY STOP COMPLETION CHECK
        if (booking.stops && booking.stops.length > 0) {
            const incompleteStop = booking.stops.find(s => s.status !== "Completed");
            if (incompleteStop) {
                return res.status(400).json({
                    success: false,
                    message: `Pehle saare intermediate stops complete karo! (${incompleteStop.address} baki hai)`
                });
            }
        }

        // Finalize fare
        booking.actualFare = booking.actualFare > 0 ? booking.actualFare : booking.fareEstimate;
        booking.bookingStatus = "Payment_Pending";
        await booking.save();

        // Send Notification to User
        try {
            const io = getIO();
            const userId = booking.user?._id || booking.user;
            if (userId) {
                io.to(userId.toString()).emit("payment_requested", {
                    bookingId: booking._id,
                    finalFare: booking.actualFare
                });
            }
            
            // Notify Agent if applicable
            const agentId = booking.agent?._id || booking.agent;
            if (agentId) {
                io.to(`agent_${agentId.toString()}`).emit("payment_requested", {
                    bookingId: booking._id,
                    finalFare: booking.actualFare
                });
            }

            // Send Push
            if (booking.user) {
                const rider = await User.findById(booking.user);
                if (rider && rider.fcmToken) {
                    await sendPushNotification(rider.fcmToken, {
                        title: "💳 Payment Required",
                        body: `Trip completed! Please pay ₹${booking.actualFare}`,
                        data: { type: "PAYMENT_REQUESTED", bookingId: booking._id.toString() }
                    });
                }
            }
        } catch (err) {
            console.error("Payment Request Socket Error:", err.message);
        }

        res.json({ success: true, message: "Payment request sent to user", finalFare: booking.actualFare });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

exports.selectPaymentMethod = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { paymentMethod } = req.body; 

        const booking = await Booking.findById(bookingId).populate("assignedDriver");
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.bookingStatus !== "Payment_Pending") {
            return res.status(400).json({ success: false, message: "Payment is not pending for this trip" });
        }

        if (paymentMethod === 'Cash') {
            try {
                const io = getIO();
                if (booking.assignedDriver) {
                    const driverRoom = booking.assignedDriver._id.toString();
                    console.log(`[Backend] Emitting collect_cash to driver room: ${driverRoom}`);
                    io.to(driverRoom).emit("collect_cash", {
                        bookingId: booking._id,
                        finalFare: booking.actualFare
                    });
                } else {
                    console.log(`[Backend] No assigned driver to emit collect_cash!`);
                }
            } catch (err) {
                console.error(`[Backend] Error emitting collect_cash:`, err);
            }
            return res.json({ success: true, message: "Driver notified to collect cash" });
            
        } else if (paymentMethod === 'Online') {
            const amountToCollect = booking.actualFare > 0 ? booking.actualFare : booking.fareEstimate;
            if (amountToCollect <= 0) return res.status(400).json({ success: false, message: "Invalid fare amount" });
            
            const orderIdString = `order_${booking._id.toString().slice(-6)}_${Date.now()}`;
            const frontendOrigin = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173';
            const protocol = req.get('host').includes('localhost') || req.get('host').includes('127.0.0.1') ? req.protocol : 'https';
            const returnUrl = `${protocol}://${req.get('host')}/api/trips/execute/payment-return?redirect=${encodeURIComponent(frontendOrigin + '/booking-details/' + booking._id)}`;

            // Uses the globally required razorpayHandler at the top of the file
            const sessionResponse = await razorpayHandler.orderSession({
                order_id: orderIdString,
                amount: amountToCollect.toFixed(2),
                customer_id: booking.user ? booking.user.toString() : "guest",
                customer_email: "test@example.com",
                customer_phone: booking.passengerDetails?.phone || "9999999999",
                return_url: returnUrl
            });

            booking.hdfcOrderId = orderIdString;
            await booking.save();
            return res.json({ success: true, paymentLinks: sessionResponse.payment_links || sessionResponse });
        }
    } catch(err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.confirmCashCollection = async (req, res) => {
    // Driver confirms cash received
    if (!req.body) req.body = {};
    req.body.paymentMethod = "Cash";
    return exports.endTrip(req, res);
};
