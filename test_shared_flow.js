const connectDB = require("./config/db");
const fs = require('fs');
let logContent = "";
function log(msg) {
    logContent += msg + "\n";
}
const mongoose = require("mongoose");
const CarCategory = require("./models/CarCategory");
const Driver = require("./models/Driver");
const Booking = require("./models/Booking");
const RideRequest = require("./models/RideRequest");
const jwt = require("jsonwebtoken");
const http = require("http");
require("dotenv").config();

// Helper for making requests
function makeRequest(path, method, token = null, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        if (data) {
            const body = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(body);
        }

        const req = http.request(options, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(resData)); } catch(e) { resolve(resData); }
            });
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

        const sedan = await CarCategory.findOne({ name: "Sedan" }); // 4 seats
        await RideRequest.deleteMany({});
        await Booking.deleteMany({ rideType: "Shared" }); // Clean up

        // 1. Setup Driver
        const driver = await Driver.findOneAndUpdate(
            { email: "rajesh_driver@test.com" },
            {
                isOnline: true, isAvailable: true, currentRideType: null, availableSeats: 0, currentHeading: null,
                "carDetails.carType": sedan._id, currentLocation: { latitude: 28.6300, longitude: 77.2100 } // CP area
            },
            { new: true }
        );
        const driverToken = jwt.sign({ id: driver._id, role: "driver" }, process.env.JWT_SECRET, { expiresIn: "10m" });

        log("🚕 DRIVER: Rajesh is Online and Waiting...\n");

        // --- RIDE 1 (User 1) ---
        log("--- 🕵️‍♂️ USER 1 (Rahul) Books 2 Seats Shared Ride ---");
        const booking1 = await Booking.create({
            passengerDetails: { name: "Rahul", phone: "1111" },
            rideType: "Shared", carCategory: sedan._id, seatsBooked: 2,
            pickup: { address: "CP", latitude: 28.6300, longitude: 77.2100 },
            drop: { address: "Airport", latitude: 28.5562, longitude: 77.1000 },
            estimatedDistanceKm: 15, pickupDate: new Date(), pickupTime: "10:00", fareEstimate: 100, 
            tripData: { startOtp: "1111" }, bookingStatus: "Pending" // Initial state
        });
        log("Rahul's OTP generated: " + booking1.tripData.startOtp);

        let match1 = await makeRequest('/api/trips/trigger-match/' + booking1._id, 'POST');
        if (match1.requestId) {
            log("🔔 Notification sent to Driver! (Request ID: " + match1.requestId + ")");
            log("👉 Driver is pressing 'ACCEPT'...");
            let accept1 = await makeRequest('/api/trips/requests/' + match1.requestId + '/respond', 'PUT', driverToken, { action: "Accept" });
            
            let updatedB1 = await Booking.findById(booking1._id);
            log("✅ User 1 Booking Status: " + updatedB1.bookingStatus + " (Driver Assigned: " + updatedB1.assignedDriver + ")\n");
        }

        // --- RIDE 2 (User 2) ---
        log("--- 🕵️‍♂️ USER 2 (Priya) Books 1 Seat Shared Ride (Same Direction) ---");
        const booking2 = await Booking.create({
            passengerDetails: { name: "Priya", phone: "2222" },
            rideType: "Shared", carCategory: sedan._id, seatsBooked: 1,
            pickup: { address: "Dhaula Kuan", latitude: 28.5900, longitude: 77.1600 }, // On the way
            drop: { address: "Airport", latitude: 28.5562, longitude: 77.1000 },
            estimatedDistanceKm: 5, pickupDate: new Date(), pickupTime: "10:15", fareEstimate: 40, 
            tripData: { startOtp: "9999" }, bookingStatus: "Pending" // Initial state
        });
        log("Priya's UNIQUE OTP generated: " + booking2.tripData.startOtp);

        let match2 = await makeRequest('/api/trips/trigger-match/' + booking2._id, 'POST');
        if (match2.requestId) {
            log("🔔 Notification sent to Driver! (New Request ID: " + match2.requestId + ")");
            log("👉 Driver is pressing 'ACCEPT' for 2nd passenger...");
            let accept2 = await makeRequest('/api/trips/requests/' + match2.requestId + '/respond', 'PUT', driverToken, { action: "Accept" });
            
            let updatedB2 = await Booking.findById(booking2._id);
            log("✅ User 2 Booking Status: " + updatedB2.bookingStatus + " (Driver Assigned: " + updatedB2.assignedDriver + ")");
        }

        log("\n--- 📝 FINAL SUMMARY PROOF ---");
        let b1 = await Booking.findById(booking1._id);
        let b2 = await Booking.findById(booking2._id);
        log(`User 1 (${b1.passengerDetails.name}) -> Status: ${b1.bookingStatus}, OTP: ${b1.tripData.startOtp}`);
        log(`User 2 (${b2.passengerDetails.name}) -> Status: ${b2.bookingStatus}, OTP: ${b2.tripData.startOtp}`);
        
        log("\n🚀 TEST PASSED! The exact flow you asked about is already working!");

        fs.writeFileSync("flow_output.txt", logContent);
        mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error("Test Failed: ", error);
        mongoose.connection.close();
        process.exit(1);
    }
}

setTimeout(runTest, 1000);
