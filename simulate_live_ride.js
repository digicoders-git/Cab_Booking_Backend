const mongoose = require("mongoose");
const { io: ioClient } = require("socket.io-client");
require("dotenv").config({ path: "./.env" });

const Booking = require("./models/Booking");
const Driver = require("./models/Driver");
const CarCategory = require("./models/CarCategory");
const User = require("./models/User");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/Carbooking";
const PORT = process.env.PORT || 8000;
const SOCKET_URL = `http://localhost:${PORT}`;

async function runSimulator() {
    console.log("==================================================");
    console.log("🚀 KWIKCAB LIVE TRACKING SIMULATOR STARTED");
    console.log("==================================================");

    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ MongoDB Connected");

        // 1. Get or create test Category
        let category = await CarCategory.findOne();
        if (!category) {
            category = await CarCategory.create({
                name: "Sedan Test",
                baseFare: 100,
                perKmRate: 12,
                seatCapacity: 4,
                isActive: true
            });
        }

        // 2. Get or create test Driver
        let driver = await Driver.findOne({ phone: "9999988888" });
        if (!driver) {
            driver = await Driver.create({
                name: "Rahul Verma (Test Driver)",
                phone: "9999988888",
                isOnline: true,
                isAvailable: false,
                currentRideType: "Private",
                carDetails: {
                    carModel: "Maruti Swift Dzire",
                    carNumber: "UP 32 AB 1234"
                },
                currentLocation: {
                    latitude: 26.8467,
                    longitude: 80.9462
                }
            });
        } else {
            driver.isOnline = true;
            driver.isAvailable = false;
            await driver.save();
        }

        // 3. Create or find an Active test Booking
        let booking = await Booking.findOne({
            bookingStatus: { $in: ["Accepted", "Ongoing"] }
        });

        if (!booking) {
            booking = await Booking.create({
                passengerDetails: {
                    name: "Vivek (Rider)",
                    phone: "9876543210"
                },
                rideType: "Private",
                carCategory: category._id,
                pickup: {
                    address: "Hazratganj, Lucknow",
                    latitude: 26.8500,
                    longitude: 80.9499
                },
                drop: {
                    address: "Charbagh Railway Station, Lucknow",
                    latitude: 26.8320,
                    longitude: 80.9200
                },
                fareEstimate: 250,
                bookingStatus: "Ongoing",
                assignedDriver: driver._id,
                tripData: {
                    startOtp: "1234"
                }
            });
        } else {
            booking.bookingStatus = "Ongoing";
            booking.assignedDriver = driver._id;
            await booking.save();
        }

        const bookingId = booking._id.toString();

        console.log("\n🎯 TEST BOOKING READY!");
        console.log("🆔 Booking ID:", bookingId);
        console.log("🚗 Driver:", driver.name, `(${driver.carDetails.carNumber})`);
        console.log("\n👉 AB APNE BROWSER ME YEH LINK KHOLIYE:");
        console.log(`🌐 http://localhost:5173/driver-tracking/${bookingId}`);
        console.log("==================================================\n");

        // 4. Connect Driver Socket to simulate car movement
        const socket = ioClient(SOCKET_URL, { transports: ["websocket"] });

        socket.on("connect", () => {
            console.log("🔌 Simulator Driver Socket Connected! ID:", socket.id);
            socket.emit("join_room", { userId: driver._id.toString(), role: "driver" });

            // Start Location Stream every 2.5 seconds
            let step = 0;
            // Lucknow route coordinates simulation
            const startLat = 26.8467;
            const startLng = 80.9462;
            const endLat = 26.8320;
            const endLng = 80.9200;
            const totalSteps = 40;

            console.log("⏳ Starting live GPS coordinate broadcast (every 2.5s)... Watch your browser map!\n");

            const interval = setInterval(async () => {
                step++;
                const progress = step / totalSteps;
                const currentLat = startLat + (endLat - startLat) * progress;
                const currentLng = startLng + (endLng - startLng) * progress;
                const heading = 215.0; // Heading towards SW

                console.log(`📍 [STEP ${step}/${totalSteps}] Driver Live GPS -> Lat: ${currentLat.toFixed(6)}, Lng: ${currentLng.toFixed(6)}`);

                socket.emit("update_location", {
                    driverId: driver._id.toString(),
                    latitude: currentLat,
                    longitude: currentLng,
                    heading: heading
                });

                if (step >= totalSteps) {
                    clearInterval(interval);
                    console.log("\n🏁 Simulation ride completed!");
                    process.exit(0);
                }
            }, 2500);
        });

    } catch (err) {
        console.error("❌ Error in simulator:", err);
        process.exit(1);
    }
}

runSimulator();
