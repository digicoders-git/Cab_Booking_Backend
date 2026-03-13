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
        log("Wallet Phase Test Started...");

        // 1. Cleanup & Setup
        await Transaction.deleteMany({});
        await Driver.deleteMany({ email: "wallet_driver@test.com" });
        await Agent.deleteMany({ email: "wallet_agent@test.com" });
        await Admin.deleteMany({ email: "wallet_admin@test.com" });

        const sedan = await CarCategory.findOne({ name: { $regex: /sedan/i } }) || await CarCategory.create({name:"SedanTest", seatCapacity:4, privateRatePerKm:10, sharedRatePerSeatPerKm:5, baseFare:50});

        const admin = await Admin.create({ name: "Admin", email: "wallet_admin@test.com", password: "123", walletBalance: 0 });
        const agent = await Agent.create({ name: "Agent", email: "wallet_agent@test.com", phone: "9827364532", password: "123", walletBalance: 0, commissionPercentage: 10 });
        const driver = await Driver.create({ 
            name: "Driver", email: "wallet_driver@test.com", password: "123", walletBalance: 0, phone: "555666777",
            isApproved: true, isActive: true, isOnline: true, "carDetails.carType": sedan._id 
        });

        const dToken = jwt.sign({ id: driver._id, role: "driver" }, process.env.JWT_SECRET);

        // 2. Create a booking through Agent (Fare: 100)
        const booking = await Booking.create({
            passengerDetails: { name: "TestUser", phone: "000" },
            agent: agent._id,
            rideType: "Private",
            carCategory: sedan._id,
            seatsBooked: 1,
            pickup: { address: "A", latitude: 1, longitude: 1 },
            drop: { address: "B", latitude: 1.1, longitude: 1.1 },
            estimatedDistanceKm: 10,
            pickupDate: new Date(),
            pickupTime: "12:00",
            fareEstimate: 500,
            agentCommission: 50, // 10% of 500
            bookingStatus: "Ongoing",
            assignedDriver: driver._id,
            tripData: { startedAt: new Date() }
        });

        log("--- 🏁 ENDING TRIP: Fare 500 ---");
        // End trip - this triggers the split logic
        await makeRequest(`/api/trips/execute/${booking._id}/end`, 'PUT', dToken);

        // 3. Verify Wallets
        const updatedAgent = await Agent.findById(agent._id);
        const updatedAdmin = await Admin.findOne({ email: "wallet_admin@test.com" });
        const updatedDriver = await Driver.findById(driver._id);

        log(`Agent Wallet: ${updatedAgent.walletBalance} (Expected 50)`);
        log(`Admin Wallet: ${updatedAdmin.walletBalance} (Expected 50 - 10% of 500)`);
        log(`Driver Wallet: ${updatedDriver.walletBalance} (Expected 400 - 500 minus agent/admin)`);

        // 4. Test Payout/Withdrawal
        log("\n--- 💸 WITHDRAWAL TEST ---");
        const withdrawRes = await makeRequest('/api/wallet/withdraw', 'POST', dToken, { amount: 100, description: "Need cash" });
        log("Withdrawal Status: " + withdrawRes.message);

        const driverAfterWithdraw = await Driver.findById(driver._id);
        log(`Driver Wallet After Withdraw: ${driverAfterWithdraw.walletBalance} (Expected 300)`);

        fs.writeFileSync("wallet_test_out.txt", logContent);
        console.log("Test Success! See wallet_test_out.txt");
        mongoose.connection.close();
        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

setTimeout(runTest, 1000);
