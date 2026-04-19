const { Server } = require("socket.io");
const Driver = require("../models/Driver");
const Booking = require("../models/Booking");


let io;
const lastDBUpdate = {}; // Optimized: Throttling ke liye driver update time tracking
const disconnectTimers = {}; // Grace period timers for refresh detection

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

            // REFRESH FIX: 8 second grace period dete hain
            // Agar driver refresh kar raha hai toh woh 8 sec mein reconnect kar lega
            // Sirf tab offline mark karo jab genuinely disconnect ho (tab close, logout)
            if (socket.role === 'driver' && socket.userId) {
                const driverId = socket.userId;

                // Pehle koi timer chal raha hai toh cancel karo
                if (disconnectTimers[driverId]) {
                    clearTimeout(disconnectTimers[driverId]);
                }

                disconnectTimers[driverId] = setTimeout(async () => {
                    try {
                        // Check karo: kya driver ka koi active socket room mein hai?
                        const rooms = io.sockets.adapter.rooms;
                        const driverRoom = rooms.get(driverId);

                        // Agar room empty hai (koi reconnect nahi hua) tabhi offline karo
                        if (!driverRoom || driverRoom.size === 0) {
                            await Driver.findByIdAndUpdate(driverId, { isOnline: false });
                            io.to('admin_room').emit("driver_location_update", {
                                driverId,
                                status: "Offline",
                                isOnline: false
                            });
                            console.log(`💾 Driver ${driverId} marked OFFLINE after grace period ✅`);
                        } else {
                            console.log(`🔄 Driver ${driverId} reconnected during grace period — staying ONLINE ✅`);
                        }
                    } catch (error) {
                        console.error("Disconnect Cleanup Error:", error.message);
                    } finally {
                        delete disconnectTimers[driverId];
                    }
                }, 3600000); // 1 hour grace period (3,600,000 ms)

                console.log(`⏳ Driver ${driverId} disconnect grace period started (1 hour)...`);
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
