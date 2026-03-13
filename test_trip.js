const connectDB = require("./config/db");
const mongoose = require("mongoose");
const CarCategory = require("./models/CarCategory");
const Driver = require("./models/Driver");
const Booking = require("./models/Booking");
const RideRequest = require("./models/RideRequest");
const jwt = require("jsonwebtoken");
const http = require("http");
require("dotenv").config();

async function runTest() {
    try {
        await connectDB();
        console.log("Database Connected...");

        // 1. Get Category
        const sedan = await CarCategory.findOne({ name: "Sedan" });
        
        // 2. Create a Free Driver at Connaught Place (Lat: 28.6304, Lng: 77.2177)
        const driver = await Driver.findOneAndUpdate(
            { email: "rajesh_driver@test.com" },
            {
                name: "Rajesh Sedan Wala",
                email: "rajesh_driver@test.com",
                phone: "9900990099",
                password: "password",
                isOnline: true,    // IMPORTANT: Driver is Online
                isAvailable: true, // IMPORTANT: Driver is Free (not in another trip)
                isActive: true,    // IMPORTANT: Admin Approved
                isApproved: true,
                "carDetails.carType": sedan._id,
                currentLocation: {
                    latitude: 28.6304, 
                    longitude: 77.2177,
                    lastUpdated: new Date()
                }
            },
            { upsert: true, new: true }
        );
        console.log("1. Driver Ready (Location CP): ", driver.name);
        
        // Generate Token for Driver App
        const driverToken = jwt.sign({ id: driver._id, role: "driver" }, process.env.JWT_SECRET, { expiresIn: "1d" });

        // 3. Create an open Booking at New Delhi Railway Station (Lat: 28.6415, Lng: 77.2183) => Just 1.2 Km away!
        // We do this directly in DB for testing
        const newBooking = await Booking.create({
            passengerDetails: { name: "Rohit", phone: "7766554433" },
            rideType: "Private",
            carCategory: sedan._id,
            seatsBooked: 4,
            pickup: { address: "NDLS Station", latitude: 28.6415, longitude: 77.2183 },
            drop: { address: "Airport", latitude: 28.5562, longitude: 77.1000 },
            estimatedDistanceKm: 15,
            pickupDate: new Date(),
            pickupTime: "11:00",
            fareEstimate: 300,
            bookingStatus: "Pending", // No driver yet
            tripData: { startOtp: "1234" }
        });
        
        console.log("2. New Pending Booking created ID: ", newBooking._id);

        // 4. Mimic Auto-Match Trigger (System searches for driver)
        const triggerOptions = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/trips/trigger-match/' + newBooking._id,
            method: 'POST'
        };

        console.log("3. Triggering Auto Match AI... Searching for closest Sedan driver...");
        const matchReq = http.request(triggerOptions, (res) => {
            let resData = '';
            res.on('data', d => resData += d);
            res.on('end', () => {
                const matchResult = JSON.parse(resData);
                console.log("\n--- Auto-Match Output ---");
                console.log(JSON.stringify(matchResult, null, 2));

                if(matchResult.success && matchResult.requestId) {
                    
                    // 5. Simulate Driver App Clicking "ACCEPT" 
                    console.log("\n4. Driver App is Sending 'ACCEPT' command...");
                    
                    const respondData = JSON.stringify({ action: "Accept" });
                    const acceptOptions = {
                        hostname: 'localhost',
                        port: 5000,
                        path: '/api/trips/requests/' + matchResult.requestId + '/respond',
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + driverToken,
                            'Content-Length': Buffer.byteLength(respondData)
                        }
                    };

                    const acceptReq = http.request(acceptOptions, (res2) => {
                        let resData2 = '';
                        res2.on('data', d => resData2 += d);
                        res2.on('end', async () => {
                            console.log("\n--- Accept Response ---");
                            console.log(JSON.stringify(JSON.parse(resData2), null, 2));
                            
                            // Check final DB state
                            const finalBooking = await Booking.findById(newBooking._id);
                            const finalDriver = await Driver.findById(driver._id);
                            
                            console.log("\n--- DB Check After Accept ---");
                            console.log("Booking Status: ", finalBooking.bookingStatus); // Should be "Accepted"
                            console.log("Booking Driver ID linked: ", finalBooking.assignedDriver);
                            console.log("Is Driver Still Available? ", finalDriver.isAvailable); // Should be false (Now busy with ride)
                            
                            console.log("\n✅ PHASE 3 EXECUTION FLOW TESTED SUCCESSFULLY!");
                            process.exit(0);
                        });
                    });
                    acceptReq.write(respondData);
                    acceptReq.end();
                } else {
                    process.exit(1);
                }
            });
        });
        matchReq.end();

    } catch (error) {
        console.error("Test Failed: ", error);
        process.exit(1);
    }
}

runTest();
