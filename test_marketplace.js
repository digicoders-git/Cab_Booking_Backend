const connectDB = require("./config/db");
const fs = require('fs');
const mongoose = require("mongoose");
const CarCategory = require("./models/CarCategory");
const Driver = require("./models/Driver");
const Booking = require("./models/Booking");
const RideRequest = require("./models/RideRequest");
const jwt = require("jsonwebtoken");
const http = require("http");
require("dotenv").config();

let logContent = "";
function log(msg) {
    logContent += msg + "\n";
}

function makeRequest(path, method, token = null, data = null) {
    return new Promise((resolve, reject) => {
        const options = { hostname: 'localhost', port: 5000, path: path, method: method, headers: { 'Content-Type': 'application/json' } };
        if (token) options.headers['Authorization'] = `Bearer ${token}`;
        if (data) {
            const body = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(body);
        }
        const req = http.request(options, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => { try { resolve(JSON.parse(resData)); } catch(e) { resolve(resData); } });
        });
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function runTest() {
    try {
        await connectDB();
        log("Database Connected!\n");

        // 1. Setup Car Category with Seat Layout
        const suv = await CarCategory.findOneAndUpdate(
            { name: "SUV Shared" },
            { seatCapacity: 4, seatLayout: ["Front", "Back-Left", "Back-Middle", "Back-Right"], privateRatePerKm: 20, sharedRatePerSeatPerKm: 10, baseFare: 50 },
            { upsert: true, new: true }
        );

        await RideRequest.deleteMany({});
        await Booking.deleteMany({});

        // 2. Setup Driver
        const driver = await Driver.findOneAndUpdate(
            { email: "marketplace_driver@test.com" },
            {
                name: "Suresh (SUV Driver)", phone: "82736483562", password: "hashed_password", isOnline: true, isAvailable: true, isActive: true, isApproved: true, currentRideType: null, availableSeats: 0, currentHeading: null,
                "carDetails.carType": suv._id, currentLocation: { latitude: 28.6300, longitude: 77.2100 }, seatMap: []
            },
            { upsert: true, new: true }
        );
        const dToken = jwt.sign({ id: driver._id, role: "driver" }, process.env.JWT_SECRET, { expiresIn: "1h" });

        log("🚕 DRIVER SETUP: Suresh is Online (Layout: Front, Back-Left, Back-Middle, Back-Right)\n");

        // --- PHASE 1: EXACT SEAT BOOKING TEST ---
        log("--- 🕵️‍♂️ USER 1 Books a specific seat ---");
        const b1 = await Booking.create({
            passengerDetails: { name: "Ankit", phone: "555" }, rideType: "Shared", carCategory: suv._id, seatsBooked: 1,
            pickup: { address: "CP", latitude: 28.6300, longitude: 77.2100 }, drop: { address: "Airport", latitude: 28.5562, longitude: 77.1000 },
            estimatedDistanceKm: 15, pickupDate: new Date(), pickupTime: "12:00", fareEstimate: 100
        });

        // Step 1: User Searches
        let searchRes = await makeRequest('/api/trips/shared-rides/search/' + b1._id, 'GET');
        log("🔍 USER 1 Searching Shared Rides...");
        log("API Response: " + JSON.stringify(searchRes));
        log(`Found ${searchRes.count} driver(s) nearby!`);
        log("Driver 0 SeatMap: " + JSON.stringify(searchRes.drivers[0].seatMap.map(s => `${s.seatName}=${s.isBooked?'Red':'Green'}`)));

        // Step 2: User Selects 'Front'
        log("\n👉 USER 1 Selects 'Front' Seat!");
        let reqSeatRes = await makeRequest('/api/trips/shared-rides/book-seat/' + b1._id, 'POST', null, {
            driverId: searchRes.drivers[0].driverId, selectedSeats: ["Front"]
        });
        log("Result: " + reqSeatRes.message);

        // Step 3: Driver Accepts
        let accept1 = await makeRequest('/api/trips/requests/' + reqSeatRes.requestId + '/respond', 'PUT', dToken, { action: "Accept" });
        log("✅ Driver Accepted! Booking Status: " + accept1.booking.bookingStatus);


        // --- PHASE 2: DOES THE MAP UPDATE FOR SECOND USER? ---
        log("\n--- 🕵️‍♂️ USER 2 Books a specific seat (Should see Front is RED) ---");
        const b2 = await Booking.create({
            passengerDetails: { name: "Riya", phone: "777" }, rideType: "Shared", carCategory: suv._id, seatsBooked: 1,
            pickup: { address: "CP", latitude: 28.6300, longitude: 77.2100 }, drop: { address: "Airport", latitude: 28.5562, longitude: 77.1000 },
            estimatedDistanceKm: 15, pickupDate: new Date(), pickupTime: "12:05", fareEstimate: 100
        });

        let searchRes2 = await makeRequest('/api/trips/shared-rides/search/' + b2._id, 'GET');
        log("🔍 USER 2 Searching...");
        log("Driver 0 SeatMap NOW: " + JSON.stringify(searchRes2.drivers[0].seatMap.map(s => `${s.seatName}=${s.isBooked?'Red':'Green'}`)));

        log("\n👉 USER 2 Tries to maliciously select 'Front' anyway (should fail)!");
        let failSeatRes = await makeRequest('/api/trips/shared-rides/book-seat/' + b2._id, 'POST', null, {
            driverId: searchRes2.drivers[0].driverId, selectedSeats: ["Front"]
        });
        log("Result: " + failSeatRes.message);

        log("\n👉 USER 2 Selects 'Back-Right' correctly!");
        let passSeatRes = await makeRequest('/api/trips/shared-rides/book-seat/' + b2._id, 'POST', null, {
            driverId: searchRes2.drivers[0].driverId, selectedSeats: ["Back-Right"]
        });
        log("Result: " + passSeatRes.message);

        let accept2 = await makeRequest('/api/trips/requests/' + passSeatRes.requestId + '/respond', 'PUT', dToken, { action: "Accept" });
        log("✅ Driver Accepted User 2!");

        // Confirm
        let driverDb = await Driver.findById(driver._id);
        log("\n🏆 FINAL DRIVER SEAT MAP IN DATABASE:");
        driverDb.seatMap.forEach(s => log(`Seat [${s.seatName}] => Booked: ${s.isBooked}`));

        log("\n✅ MARKETPLACE SEAT MATCHING FULLY TESTED!");
        fs.writeFileSync("flow_output.txt", logContent);
        mongoose.connection.close();
        process.exit(0);

    } catch (e) {
        log("Failed Exception: " + e.message);
        fs.writeFileSync("flow_output.txt", logContent);
        mongoose.connection.close();
        process.exit(1);
    }
}

setTimeout(runTest, 1000);
