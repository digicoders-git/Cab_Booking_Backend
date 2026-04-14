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

        // Base query for matching
        let driverQuery = {
            isOnline: true,
            isAvailable: true,
            isActive: true,
            isApproved: true,
            "carDetails.carType": booking.carCategory
        };

        if (booking.rideType === "Private") {
            // FIX: Be robust against primitive null or string "null"
            driverQuery.$or = [
                { currentRideType: null },
                { currentRideType: "null" },
                { currentRideType: "" }
            ];
        } else if (booking.rideType === "Shared") {
            driverQuery.$or = [
                { currentRideType: null },
                { currentRideType: "null" },
                { currentRideType: "" },
                { currentRideType: "Shared", availableSeats: { $gte: booking.seatsBooked } }
            ];
        }

        const availableDrivers = await Driver.find(driverQuery)
            .populate("carDetails.carType")
            .select("_id name phone currentLocation availableSeats currentRideType currentHeading carDetails isAvailable seatMap");

        const newBookingHeading = calculateHeading(
            booking.pickup.latitude, booking.pickup.longitude,
            booking.drop.latitude, booking.drop.longitude
        );

        let nearestDriver = null;
        let minDistance = 50; // Increased search radius

        for (const driver of availableDrivers) {
            if (excludedDriverIds.includes(driver._id.toString())) continue;

            if (booking.rideType === "Shared") {
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

            if (dist < minDistance) {
                minDistance = dist;
                nearestDriver = driver;
            }
        }

        if (!nearestDriver) {
            return { success: false, status: 404, message: "No available nearby drivers found" };
        }

        const newRequest = await RideRequest.create({
            booking: booking._id,
            driver: nearestDriver._id,
            status: "Pending"
        });

        // SEND NOTIFICATION TO DRIVER
        await Notification.create({
            title: "New Ride Request",
            message: `You have a new ${booking.rideType} ride request from ${booking.pickup.address}.`,
            recipient: nearestDriver._id,
            recipientModel: 'Driver',
            createdBy: booking.user || booking.agent,
            createdByModel: booking.user ? 'User' : 'Agent'
        });

        // 🎯 LIVE NOTIFICATION: Tell Driver about the New Request!
        try {
            const io = getIO();
            io.to(nearestDriver._id.toString()).emit("new_ride_request", {
                bookingId: booking._id,
                requestId: newRequest._id,
                pickup: booking.pickup.address,
                drop: booking.drop.address,
                distance: booking.estimatedDistanceKm,
                rideType: booking.rideType,
                fare: booking.fareEstimate,
                expiresAt: Date.now() + 10000 // Send exact expiry time (10s from now)
            });
            console.log(`Driver ${nearestDriver.name} notified via Socket about New Request! 🟢`);
        } catch (err) {
            console.error("Socket error (autoMatchDriver):", err.message);
        }

        return {
            success: true,
            message: "Request sent to nearest driver",
            driverDetails: { id: nearestDriver._id, name: nearestDriver.name, distanceKm: Math.round(minDistance * 10) / 10 },
            requestId: newRequest._id
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
            // Calculate expiresAt based on createdAt + 10 seconds
            reqObj.expiresAt = new Date(req.createdAt).getTime() + 10000;
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

        const booking = await Booking.findById(request.booking);

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
            booking.assignedCar = null;

            // NEW: Set Initial Driver Location on Booking for Real-time mismatch fix
            booking.driverLocation = {
                latitude: driver.currentLocation.latitude,
                longitude: driver.currentLocation.longitude,
                heading: driver.currentHeading || 0,
                lastUpdated: new Date()
            };

            await booking.save();

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
            }

            // Real-time Update to USER (If booking belongs to a user)
            if (booking.user) {
                try {
                    const io = getIO();
                    io.to(booking.user.toString()).emit("booking_update", {
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
                    const io = getIO();
                    io.to(`agent_${booking.agent.toString()}`).emit("booking_update", {
                        bookingId: booking._id,
                        status: "Accepted",
                        driverName: driver.name,
                        driverPhone: driver.phone,
                        driverId: driver._id.toString(), // FIX: Agent map tracking ke liye driver._id bheja
                        driverLocation: {               // FIX: Initial driver location bhi bhejo takki map turant dikhaye
                            latitude: driver.currentLocation?.latitude || null,
                            longitude: driver.currentLocation?.longitude || null,
                            heading: driver.currentHeading || 0
                        }
                    });
                    console.log(`Agent ${booking.agent} notified via Socket (with driverId + location) ✅`);
                } catch (err) {
                    console.error("Agent Socket Notification Error:", err.message);
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
        await booking.save();

        // REAL-TIME UPDATE TO AGENT & USER
        try {
            const io = getIO();
            if (booking.agent) {
                io.to(`agent_${booking.agent.toString()}`).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Ongoing"
                });
                console.log(`Agent ${booking.agent} notified via Socket (Trip Started)`);
            }
            if (booking.user) {
                io.to(booking.user.toString()).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Ongoing"
                });
                console.log(`User ${booking.user} notified via Socket (Trip Started)`);
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

        if (booking.bookingStatus !== "Ongoing") {
            return res.status(400).json({ success: false, message: "Only Ongoing trips can be ended" });
        }

        // Setup completion
        booking.bookingStatus = "Completed";
        booking.tripData.endedAt = new Date();

        // Finalize fare and payment method
        booking.actualFare = booking.fareEstimate;
        booking.paymentMethod = paymentMethod;
        booking.paymentStatus = "Completed"; 
        await booking.save();

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
                if(driver.seatMap) driver.seatMap.forEach(s => { s.isBooked = false; s.bookingId = null; });
            } else {
                driver.isAvailable = true; // Still has others, but can take new ones
            }
        }

        // Stats update
        driver.totalTrips += 1;

        // ===============================================
        // PHASE 4: MONEY SPLIT (The Financial Engine)
        // Wrapped in TRY-CATCH so driver release isn't blocked by financial errors
        // ===============================================
        try {
            const totalFare = booking.actualFare;
            const isCash = booking.paymentMethod === 'Cash';

            // 1. Calculate Agent Commission
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

            // 2. Calculate Admin Commission
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

            // 3. Vendor Commission Logic
            let vendorCut = 0;
            if (driver.createdByModel === "Vendor" && driver.createdBy) {
                const vendor = await Vendor.findById(driver.createdBy);
                if (vendor && admin) {
                    vendorCut = Math.round(adminCut * (vendor.commissionPercentage / 100));
                    admin.walletBalance -= vendorCut;
                    admin.totalEarnings -= vendorCut;
                    await admin.save();
                    await Transaction.create({
                        user: admin._id, userModel: 'Admin', amount: vendorCut, type: 'Debit',
                        category: 'Vendor Commission', status: 'Completed', relatedBooking: booking._id,
                        description: `Vendor '${vendor.name}' fee paid`
                    });
                    vendor.walletBalance += vendorCut;
                    vendor.totalEarnings += vendorCut;
                    await vendor.save();
                    await Transaction.create({
                        user: vendor._id, userModel: 'Vendor', amount: vendorCut, type: 'Credit',
                        category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                        description: `Commission earned from Trip ${booking._id}`
                    });
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

        } catch (finError) {
            console.error("Financial Calculation Error (Trip Ended anyway):", finError.message);
            // We don't throw here, so the driver.save() below still runs to free the driver.
        }

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
            const io = getIO();
            if (booking.agent) {
                io.to(`agent_${booking.agent.toString()}`).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Completed",
                    finalFare: booking.actualFare
                });
            }
            if (booking.user) {
                io.to(booking.user.toString()).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Completed",
                    finalFare: booking.actualFare
                });
            }
        } catch (err) {}

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
            .populate("carCategory", "name image")
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
