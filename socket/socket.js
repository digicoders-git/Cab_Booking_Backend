const { Server } = require("socket.io");
const Driver = require("../models/Driver");
const Booking = require("../models/Booking");


let io;
const lastDBUpdate = {}; // Optimized: Throttling ke liye driver update time tracking

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*", // Adjust in production
            methods: ["GET", "POST"]
        }
    });

    console.log("Socket.io Initialized");

    io.on("connection", (socket) => {
        console.log(`User Connected: ${socket.id}`);

        // 1. Join Room (For Driver/Admin/User/Agent)
        socket.on("join_room", async (data) => {
            const { userId, role } = data; // role: 'driver', 'admin', 'user', 'agent', 'fleet'
            socket.userId = userId; // Store userId for cleanup on disconnect
            socket.role = role;     // Store role for cleanup on disconnect
            socket.join(userId);

            if (role === 'admin') socket.join('admin_room');
            if (role === 'agent') socket.join(`agent_${userId}`);
            if (role === 'vendor') socket.join(`vendor_${userId}`); // NEW: Vendor specific room

            // --- NEW: Fleet Owner joining their specific fleet room ---
            if (role === 'fleet') socket.join(`fleet_${userId}`);

            // --- NEW: Driver fetching their Fleet/Vendor ID for location streaming ---
            if (role === 'driver') {
                try {
                    const driver = await Driver.findById(userId).select("createdBy createdByModel");
                    if (driver && driver.createdBy) {
                        if (driver.createdByModel === "Fleet") {
                            socket.fleetId = driver.createdBy.toString();
                            console.log(`Driver ${userId} linked to Fleet: ${socket.fleetId}`);
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
            } catch (error) {
                console.error("Online Status Error:", error.message);
            }
        });

        // 1c. Driver Offline status update
        socket.on("driver_offline", async ({ driverId }) => {
            try {
                await Driver.findByIdAndUpdate(driverId, { isOnline: false });
                console.log(`Driver ${driverId} is now OFFLINE ❌`);
            } catch (error) {
                console.error("Offline Status Error:", error.message);
            }
        });

        // 2. Driver Update Location (Live Stream Optimization)
        socket.on("update_location", async (data) => {
            const { driverId, latitude, longitude, heading } = data;

            try {
                // --- STEP 1: FAST BROADCAST (Bina DB touch kiye) ---
                const updatePayload = {
                    driverId,
                    latitude,
                    longitude,
                    heading,
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

                        if (booking.agent) {
                            const agentRoom = `agent_${booking.agent.toString()}`;
                            io.to(agentRoom).emit("driver_location_update", payloadWithBookingId);
                            console.log(`📢 Live Update -> Agent Room: ${agentRoom}`);
                        }
                        if (booking.user) {
                            const userRoom = booking.user.toString();
                            io.to(userRoom).emit("driver_location_update", payloadWithBookingId);
                            console.log(`📢 Live Update -> User Room: ${userRoom}`);
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

                    // NEW: Update active bookings with new location for persistence
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

                    lastDBUpdate[driverId] = now; // Aakhri update time save kar liya
                    console.log(`💾 Driver ${driverId} location saved to DB (Throttled)`);
                }
            } catch (error) {
                console.error("Socket Update Error:", error.message);
            }
        });

        socket.on("disconnect", async () => {
            console.log(`User Disconnected: ${socket.id} (ID: ${socket.userId}, Role: ${socket.role})`);

            // FAIL-SAFE: If a driver disconnects (tab close, logout, network loss), mark them offline
            if (socket.role === 'driver' && socket.userId) {
                try {
                    await Driver.findByIdAndUpdate(socket.userId, { isOnline: false });
                    console.log(`💾 Driver ${socket.userId} automatically marked OFFLINE on disconnect ✅`);
                } catch (error) {
                    console.error("Disconnect Cleanup Error:", error.message);
                }
            }
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
