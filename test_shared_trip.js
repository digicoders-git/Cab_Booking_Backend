const connectDB = require("./config/db");
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
                try {
                    resolve(JSON.parse(resData));
                } catch(e) {
                    resolve(resData);
                }
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
        console.log("Database Connected!\n");

        // 1. Get Category
        const sedan = await CarCategory.findOne({ name: "Sedan" }); // has 4 seats

        // 2. Clear previous requests to avoid interference
        await RideRequest.deleteMany({});
        
        // 3. Reset Rajesh Driver to be completely free
        const driver = await Driver.findOneAndUpdate(
            { email: "rajesh_driver@test.com" },
            {
                isOnline: true,
                isAvailable: true,
                currentRideType: null,
                availableSeats: 0,
                "carDetails.carType": sedan._id,
                currentLocation: { latitude: 28.6304, longitude: 77.2177, lastUpdated: new Date() }
            },
            { new: true }
        );
        const driverToken = jwt.sign({ id: driver._id, role: "driver" }, process.env.JWT_SECRET, { expiresIn: "10m" });

        console.log("🚕 DRIVER RESET: Rajesh is Online, Empty Car, Available.\n");

        // --- RIDE 1 ---
        console.log("--- RIDE 1 (2 Seats Shared) ---");
        const booking1 = await Booking.create({
            passengerDetails: { name: "Ravi", phone: "1111" },
            rideType: "Shared",
            carCategory: sedan._id,
            seatsBooked: 2,
            pickup: { address: "CP", latitude: 28.6310, longitude: 77.2180 },
            drop: { address: "Airport", latitude: 28.5562, longitude: 77.1000 },
            estimatedDistanceKm: 15, pickupDate: new Date(), pickupTime: "10:00", fareEstimate: 100, tripData: { startOtp: "1111" }
        });

        let match1 = await makeRequest('/api/trips/trigger-match/' + booking1._id, 'POST');
        console.log("Trigger Match 1: ", match1.message || match1);

        if (match1.requestId) {
            let accept1 = await makeRequest('/api/trips/requests/' + match1.requestId + '/respond', 'PUT', driverToken, { action: "Accept" });
            console.log("Driver Accept 1: ", accept1.message);
            
            // Check driver state in DB
            let d1 = await Driver.findById(driver._id);
            console.log(`Driver STATE => Available: ${d1.isAvailable}, RideType: ${d1.currentRideType}, Free Seats: ${d1.availableSeats}\n`);
        }

        // --- RIDE 2 ---
        console.log("--- RIDE 2 (1 Seat Shared) ---");
        const booking2 = await Booking.create({
            passengerDetails: { name: "Sunil", phone: "2222" },
            rideType: "Shared",
            carCategory: sedan._id,
            seatsBooked: 1,
            pickup: { address: "CP", latitude: 28.6315, longitude: 77.2185 },
            drop: { address: "Noida", latitude: 28.5355, longitude: 77.3910 },
            estimatedDistanceKm: 18, pickupDate: new Date(), pickupTime: "10:15", fareEstimate: 80, tripData: { startOtp: "2222" }
        });

        let match2 = await makeRequest('/api/trips/trigger-match/' + booking2._id, 'POST');
        console.log("Trigger Match 2: ", match2.message || match2);

        if (match2.requestId) {
            let accept2 = await makeRequest('/api/trips/requests/' + match2.requestId + '/respond', 'PUT', driverToken, { action: "Accept" });
            console.log("Driver Accept 2: ", accept2.message);
            
            // Check driver state in DB
            let d2 = await Driver.findById(driver._id);
            console.log(`Driver STATE => Available: ${d2.isAvailable}, RideType: ${d2.currentRideType}, Free Seats: ${d2.availableSeats}\n`);
        }

        // --- RIDE 3 ---
        console.log("--- RIDE 3 (2 Seats Shared) - SHOULD FAIL ---");
        const booking3 = await Booking.create({
            passengerDetails: { name: "Anil", phone: "3333" },
            rideType: "Shared",
            carCategory: sedan._id,
            seatsBooked: 2, // Driver only has 1 seat left (4 - 2 - 1 = 1)
            pickup: { address: "CP", latitude: 28.6310, longitude: 77.2170 },
            drop: { address: "Gurgaon", latitude: 28.4595, longitude: 77.0266 },
            estimatedDistanceKm: 25, pickupDate: new Date(), pickupTime: "10:30", fareEstimate: 120, tripData: { startOtp: "3333" }
        });

        let match3 = await makeRequest('/api/trips/trigger-match/' + booking3._id, 'POST');
        console.log("Trigger Match 3: ", match3.message); // Should say no nearby drivers found

        console.log("\n✅ SHARED ENGINE TEST COMPLETED!");
        mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error("Test Failed: ", error);
        mongoose.connection.close();
        process.exit(1);
    }
}

// Timeout to allow server to start
setTimeout(runTest, 1000);
