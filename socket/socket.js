const { Server } = require("socket.io");
const Driver = require("../models/Driver");
const Booking = require("../models/Booking");


let io;

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
        socket.on("join_room", (data) => {
            const { userId, role } = data; // role: 'driver', 'admin', 'user', 'agent'
            socket.join(userId);
            if (role === 'admin') socket.join('admin_room');
            if (role === 'agent') socket.join(`agent_${userId}`);
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

        // 2. Driver Update Location (Live Stream)
        socket.on("update_location", async (data) => {
            const { driverId, latitude, longitude, heading } = data;

            try {
                // Update in Database (Non-blocking)
                await Driver.findByIdAndUpdate(driverId, {
                    currentLocation: { latitude, longitude, lastUpdated: new Date() },
                    currentHeading: heading
                });

                const updatePayload = {
                    driverId,
                    latitude,
                    longitude,
                    heading
                };

                // Broadcast to Admins
                io.to('admin_room').emit("driver_location_update", updatePayload);

                // Broadcast to Agent if current trip is an Agent booking
                const activeBooking = await Booking.findOne({
                    assignedDriver: driverId,
                    bookingStatus: { $in: ["Accepted", "Ongoing"] }
                }).select("agent user");

                if (activeBooking) {
                    if (activeBooking.agent) {
                        io.to(`agent_${activeBooking.agent.toString()}`).emit("driver_location_update", updatePayload);
                    }
                    if (activeBooking.user) {
                        io.to(activeBooking.user.toString()).emit("driver_location_update", updatePayload);
                    }
                }

            } catch (error) {
                console.error("Socket Update Error:", error.message);
            }
        });

        socket.on("disconnect", () => {
            console.log("User Disconnected", socket.id);
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
