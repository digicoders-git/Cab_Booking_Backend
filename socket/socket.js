const { Server } = require("socket.io");
const Driver = require("../models/Driver");
const Booking = require("../models/Booking");
const RentalBooking = require("../models/RentalBooking");


let io;
const lastDBUpdate = {}; // Optimized: Throttling ke liye driver update time tracking
// ytr
const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*", // Adjust in production
            methods: ["GET", "POST"]
        }
    });
    // oiuygfd
    // iuy

    console.log("Socket.io Initialized");

    io.on("connection", (socket) => {
        console.log(`User Connected: ${socket.id}`);

        // 1. Join Room (For Driver/Admin/User/Agent/Public Trackers)
        socket.on("join_room", async (data) => {
            const { userId, role, bookingRoom } = data || {}; // role: 'driver', 'admin', 'user', 'agent', 'fleet', 'tracker'
            socket.userId = userId; // Store userId for cleanup on disconnect
            socket.role = role;     // Store role for cleanup on disconnect
            if (userId) socket.join(userId);

            if (role === 'admin') socket.join('admin_room');
            if (role === 'agent' && userId) socket.join(`agent_${userId}`);
            if (role === 'vendor' && userId) socket.join(`vendor_${userId}`); // NEW: Vendor specific room

            // --- Tracking Room for Live Ride Sharing (Web Visitors / Family) ---
            if (bookingRoom) {
                socket.join(bookingRoom);
                console.log(`🌐 Public Tracker joined room: ${bookingRoom}`);
            }

            // --- NEW: Fleet Owner joining their specific fleet room ---
            if (role === 'fleet') socket.join(`fleet_${userId}`);

            // --- NEW: Driver fetching their Fleet/Vendor ID (and parent Vendor) for location streaming ---
            if (role === 'driver') {
                try {
                    const Fleet = require("../models/Fleet");
                    const driver = await Driver.findById(userId).select("createdBy createdByModel");

                    if (driver && driver.createdBy) {
                        if (driver.createdByModel === "Fleet") {
                            socket.fleetId = driver.createdBy.toString();
                            console.log(`Driver ${userId} linked to Fleet: ${socket.fleetId}`);

                            // Check if this Fleet belongs to a Vendor
                            const fleet = await Fleet.findById(driver.createdBy).select("createdBy createdByModel");
                            if (fleet && fleet.createdByModel === "Vendor") {
                                socket.vendorId = fleet.createdBy.toString();
                                console.log(`Driver ${userId} also linked to Vendor (via Fleet): ${socket.vendorId}`);
                            }
                        } else if (driver.createdByModel === "Vendor") {
                            socket.vendorId = driver.createdBy.toString();
                            console.log(`Driver ${userId} linked to Vendor: ${socket.vendorId}`);
                        }
                    }
                } catch (err) {
                    console.error("Error fetching driver parent info:", err.message);
                }
            }

            console.log(`User ${userId} with role ${role} joined room`);
        });

        // 1b. Driver Online status update
        socket.on("driver_online", async ({ driverId }) => {
            try {
                await Driver.findByIdAndUpdate(driverId, { isOnline: true });
                console.log(`Driver ${driverId} is now ONLINE ✅`);

                // Notify Admins
                io.to('admin_room').emit("driver_location_update", {
                    driverId,
                    status: "Idle", // Since they just came online
                    isOnline: true
                });
            } catch (error) {
                console.error("Online Status Error:", error.message);
            }
        });

        // 1c. Driver Offline status update
        socket.on("driver_offline", async ({ driverId }) => {
            try {
                await Driver.findByIdAndUpdate(driverId, { isOnline: false });
                console.log(`Driver ${driverId} is now OFFLINE ❌`);

                // Notify Admins
                io.to('admin_room').emit("driver_location_update", {
                    driverId,
                    status: "Offline",
                    isOnline: false
                });
            } catch (error) {
                console.error("Offline Status Error:", error.message);
            }
        });

        // 2. Driver Update Location (Live Stream Optimization)
        socket.on("update_location", async (data) => {
            const { driverId, latitude, longitude, heading } = data;

            // debugging ke liye heading check kar rahe hain
            console.log(`📡 Incoming Location: Driver ${driverId} -> Heading: ${heading}`);

            try {
                // Fetch driver to get latest status/info for broadcast
                const driver = await Driver.findById(driverId).select("isOnline isAvailable currentRideType");
                let activityStatus = "Offline";

                if (driver) {
                    if (driver.isOnline) {
                        if (driver.isAvailable) {
                            activityStatus = "Idle";
                        } else {
                            activityStatus = driver.currentRideType === "Shared" ? "On Shared Ride" : "On Private Ride";
                        }
                    }
                }

                // --- STEP 1: FAST BROADCAST (Admins, Fleets, Vendors) ---
                const updatePayload = {
                    driverId,
                    latitude,
                    longitude,
                    heading,
                    status: activityStatus,
                    timestamp: new Date()
                };

                // Broadcast to Admins instantly
                io.to('admin_room').emit("driver_location_update", updatePayload);

                // --- NEW: Broadcast to Fleet Owner (if driver belongs to a fleet) ---
                if (socket.fleetId) {
                    io.to(`fleet_${socket.fleetId}`).emit("driver_location_update", updatePayload);
                }

                // --- NEW: Broadcast to Vendor (if driver belongs to a vendor) ---
                if (socket.vendorId) {
                    io.to(`vendor_${socket.vendorId}`).emit("driver_location_update", updatePayload);
                }

                // Broadcast to Agent/User if current trip is active
                const activeBookings = await Booking.find({
                    assignedDriver: driverId,
                    bookingStatus: { $in: ["Accepted", "Ongoing"] }
                }).select("agent user _id"); // Select IDs properly

                if (activeBookings && activeBookings.length > 0) {
                    activeBookings.forEach(booking => {
                        const payloadWithBookingId = { ...updatePayload, bookingId: booking._id.toString() };

                        // 1. Emit to Public Tracking Web Page room
                        const trackingRoom = `tracking_${booking._id.toString()}`;
                        io.to(trackingRoom).emit("driver_location_update", payloadWithBookingId);
                        console.log(`📢 Live Update -> Tracking Room: ${trackingRoom}`);

                        // 2. Emit to Agent Room
                        if (booking.agent) {
                            const agentRoom = `agent_${booking.agent.toString()}`;
                            io.to(agentRoom).emit("driver_location_update", payloadWithBookingId);
                            console.log(`📢 Live Update -> Agent Room: ${agentRoom}`);
                        }

                        // 3. Emit to User Personal App Room
                        if (booking.user) {
                            const userRoom = booking.user.toString();
                            io.to(userRoom).emit("driver_location_update", payloadWithBookingId);
                            console.log(`📢 Live Update -> User Room: ${userRoom}`);
                        }
                    });
                }

                // Broadcast to Rental User if current rental trip is active
                const activeRentalBookings = await RentalBooking.find({
                    driver: driverId,
                    status: { $in: ["Accepted", "Arrived", "Started"] }
                }).select("user _id");

                if (activeRentalBookings && activeRentalBookings.length > 0) {
                    activeRentalBookings.forEach(rb => {
                        const payloadWithBookingId = { ...updatePayload, bookingId: rb._id.toString() };

                        // Emit to Rental User Personal App Room
                        if (rb.user) {
                            const userRoom = rb.user.toString();
                            io.to(userRoom).emit("driver_location_update", payloadWithBookingId);
                            console.log(`📢 Live Rental Location Update -> User Room: ${userRoom}`);
                        }
                    });
                }

                // --- STEP 2: SMART DB UPDATE (Har 2 Minute mein ek baar) ---
                const now = Date.now();
                const lastUpdate = lastDBUpdate[driverId] || 0;

                // 2 minutes = 120,000 milliseconds
                if (now - lastUpdate > 120000) {
                    // Update Driver Current State
                    await Driver.findByIdAndUpdate(driverId, {
                        currentLocation: { latitude, longitude, lastUpdated: new Date() },
                        currentHeading: heading || 0
                    });

                    // Update regular active bookings
                    await Booking.updateMany(
                        { assignedDriver: driverId, bookingStatus: { $in: ["Accepted", "Ongoing"] } },
                        {
                            $set: {
                                driverLocation: {
                                    latitude,
                                    longitude,
                                    heading: heading || 0,
                                    lastUpdated: new Date()
                                }
                            }
                        }
                    );

                    // Update active rental bookings with latest driver location
                    await RentalBooking.updateMany(
                        { driver: driverId, status: { $in: ["Accepted", "Arrived", "Started"] } },
                        {
                            $set: {
                                driverLocation: {
                                    latitude,
                                    longitude,
                                    heading: heading || 0,
                                    lastUpdated: new Date()
                                }
                            }
                        }
                    );

                    lastDBUpdate[driverId] = now; // Aakhri update time save kar liya
                    console.log(`💾 Driver ${driverId} location saved to DB (Throttled)`);
                }
            } catch (error) {
                console.error("Socket Update Error:", error.message);
            }
        });

        socket.on("disconnect", async () => {
            console.log(`User Disconnected: ${socket.id} (ID: ${socket.userId}, Role: ${socket.role})`);
            // Driver offline marking removed. 
            // Drivers stay online until manual toggle or logout.
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};

module.exports = { initSocket, getIO };
