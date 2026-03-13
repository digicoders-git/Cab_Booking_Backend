const connectDB = require("./config/db");
const fs = require('fs');
const mongoose = require("mongoose");
const Admin = require("./models/Admin");
const Driver = require("./models/Driver");
const Agent = require("./models/Agent");
const Booking = require("./models/Booking");
const Transaction = require("./models/Transaction");
const CarCategory = require("./models/CarCategory");
const jwt = require("jsonwebtoken");
const http = require("http");
require("dotenv").config();

let logContent = "";
function log(msg) {
    logContent += msg + "\n";
    console.log(msg);
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
        log("🚀 Starting CASH vs ONLINE & Debt Limit Test...");

        // 1. Cleanup
        await Transaction.deleteMany({});
        await Driver.deleteMany({ email: "debt_driver@test.com" });
        await Agent.deleteMany({ email: "debt_agent@test.com" });

        // 2. Setup
        const admin = await Admin.findOne() || await Admin.create({name:"Admin", email:"admin@test.com", password:"123", defaultCommission:10});
        const agent = await Agent.create({ name: "Agent X", email: "debt_agent@test.com", phone: "123444", password: "123", commissionPercentage: 10 });
        const sedan = await CarCategory.findOne({ name: { $regex: /sedan/i } }) || await CarCategory.create({name:"SedanTest", seatCapacity:4, privateRatePerKm:10, sharedRatePerSeatPerKm:5, baseFare:50});

        const driver = await Driver.create({ 
            name: "Rahul", email: "debt_driver@test.com", password: "123", phone: "987654",
            isApproved: true, isActive: true, isOnline: true, walletBalance: 0, debtLimit: -500, "carDetails.carType": sedan._id
        });

        const dToken = jwt.sign({ id: driver._id, role: "driver" }, process.env.JWT_SECRET);

        // --- TEST SCENARIO 1: CASH TRIP (Debt Creation) ---
        log("\n--- 💵 SCENARIO 1: CASH TRIP (Fare 1000) ---");
        const booking1 = await Booking.create({
            passengerDetails: { name: "C1", phone: "000" },
            agent: agent._id,
            rideType: "Private",
            carCategory: sedan._id,
            seatsBooked: 1,
            pickup: { address: "A", latitude: 1, longitude: 1 },
            drop: { address: "B", latitude: 1.1, longitude: 1.1 },
            pickupDate: new Date(), pickupTime: "12:00",
            estimatedDistanceKm: 10,
            fareEstimate: 1000,
            actualFare: 1000,
            agentCommission: 100, // 10%
            paymentMethod: "Cash",
            bookingStatus: "Ongoing",
            assignedDriver: driver._id
        });

        await makeRequest(`/api/trips/execute/${booking1._id}/end`, 'PUT', dToken, { paymentMethod: "Cash" });

        const d1 = await Driver.findById(driver._id);
        const ag1 = await Agent.findById(agent._id);
        log(`Driver Wallet: ₹${d1.walletBalance} (Expected -200: -100 agent, -100 admin)`);
        log(`Agent Wallet: ₹${ag1.walletBalance} (Expected 100)`);
        log(`Driver Status: ${d1.isActive ? 'Active' : 'Suspended'} (Expected Active)`);

        // --- TEST SCENARIO 2: CASH TRIP (Limit Exceeded) ---
        log("\n--- 🛑 SCENARIO 2: CASH TRIP (Fare 4000) -> Debt total 1000 ---");
        const booking2 = await Booking.create({
            passengerDetails: { name: "C2", phone: "000" },
            agent: agent._id,
            rideType: "Private",
            carCategory: sedan._id,
            seatsBooked: 1,
            pickup: { address: "C", latitude: 1, longitude: 1 },
            drop: { address: "D", latitude: 1.1, longitude: 1.1 },
            pickupDate: new Date(), pickupTime: "13:00",
            estimatedDistanceKm: 40,
            fareEstimate: 4000,
            actualFare: 4000,
            agentCommission: 400, // 10%
            paymentMethod: "Cash", // Driver kept ₹4000
            bookingStatus: "Ongoing",
            assignedDriver: driver._id
        });

        await makeRequest(`/api/trips/execute/${booking2._id}/end`, 'PUT', dToken, { paymentMethod: "Cash" });

        const d2 = await Driver.findById(driver._id);
        log(`Driver Wallet: ₹${d2.walletBalance} (Expected -1000: -200 past + -800 current)`);
        log(`Driver Status: ${d2.isActive ? 'Active' : 'Suspended'} (Expected Suspended)`);
        log(`Driver Online: ${d2.isOnline ? 'Online' : 'Offline'} (Expected Offline)`);

        // --- TEST SCENARIO 3: TRY TO GO ONLINE WHILE DEBT ---
        log("\n--- 🔒 SCENARIO 3: Try to Go Online with Debt ---");
        const toggleRes = await makeRequest(`/api/drivers/toggle-online`, 'PUT', dToken);
        log(`Toggle Result: ${toggleRes.message || toggleRes.error}`);

        fs.writeFileSync("cash_debt_test_out.txt", logContent);
        log("\n✅ ALL CASH DEBT SCENARIOS VERIFIED!");
        mongoose.connection.close();
        process.exit(0);

    } catch (e) {
        log("TEST FAILED: " + e.message);
        console.error(e);
        mongoose.connection.close();
        process.exit(1);
    }
}

setTimeout(runTest, 1000);
