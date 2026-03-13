const connectDB = require("./config/db");
const mongoose = require("mongoose");
const CarCategory = require("./models/CarCategory");
const Agent = require("./models/Agent");
const jwt = require("jsonwebtoken");
const http = require("http");
require("dotenv").config();

async function runTest() {
    try {
        await connectDB();
        
        // 1. Get Sedan Car Category
        const sedan = await CarCategory.findOne({ name: "Sedan" });
        if (!sedan) {
            console.log("Sedan category not found! Run test_categories.js first.");
            process.exit(1);
        }

        // 2. Create a Dummy Agent directly in DB
        const agent = await Agent.findOneAndUpdate(
            { email: "testagent@gmail.com" },
            { 
                name: "Ramesh Babu", 
                email: "testagent@gmail.com", 
                phone: "1122334455", 
                password: "password123",
                commissionRate: 5,
                walletBalance: 0
            },
            { upsert: true, new: true }
        );

        console.log("1. Dummy Agent Created: " + agent.name);

        // 3. Generate a Login Token for Agent (Mimicking Postman Login)
        const token = jwt.sign(
            { id: agent._id, role: "agent" },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        console.log("2. Generated Agent Token: Bearer " + token.substring(0, 15) + "...");

        // 4. Mimic Postman Calling the API to Create a Booking (Agent booking for a customer)
        const postData = JSON.stringify({
            passengerName: "Chacha Ji",
            passengerPhone: "9988775533",
            rideType: "Private",
            carCategoryId: sedan._id.toString(),
            seatsBooked: 4,
            pickupAddress: "Railway Station",
            pickupLat: 28.6139,
            pickupLng: 77.2090,
            dropAddress: "Delhi Airport",
            dropLat: 28.5562,
            dropLng: 77.1000,
            distanceKm: 15,
            pickupDate: "2026-03-13",
            pickupTime: "10:00"
        });

        const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/bookings/create',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`, // Passing Token like Postman
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        console.log("3. Calling /api/bookings/create API as Agent...");

        const req = http.request(options, (res) => {
            let resData = '';
            res.on('data', (d) => resData += d);
            res.on('end', async () => {
                console.log("\n--- API RESPONSE ---");
                console.log(JSON.stringify(JSON.parse(resData), null, 2));

                // 5. Verify Commission was applied in Database
                const Booking = require("./models/Booking");
                const bookingRecord = await Booking.findOne({ passengerDetails: { name: "Chacha Ji", phone: "9988775533" } }).sort({ createdAt: -1 });
                
                console.log("\n--- DATABASE VERIFICATION ---");
                console.log("Agent Commission Saved as: ₹" + bookingRecord.agentCommission);
                console.log("Actual Estimated Fare was: ₹" + bookingRecord.fareEstimate);
                
                console.log("\n✅ TESTING SUCCESSFUL!");
                mongoose.connection.close();
                process.exit(0);
            });
        });

        req.write(postData);
        req.end();

    } catch (error) {
        console.error("Test Failed: ", error);
        mongoose.connection.close();
        process.exit(1);
    }
}

runTest();
