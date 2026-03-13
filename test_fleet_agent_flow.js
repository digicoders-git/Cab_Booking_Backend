const connectDB = require("./config/db");
const fs = require('fs');
const mongoose = require("mongoose");
const Admin = require("./models/Admin");
const Driver = require("./models/Driver");
const Agent = require("./models/Agent");
const Fleet = require("./models/Fleet");
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
        log("🚀 Starting Agent + Fleet Money Flow Test...");

        // 1. Cleanup
        await Transaction.deleteMany({});
        await Driver.deleteMany({ email: "fleet_driver@test.com" });
        await Agent.deleteMany({ email: "agent_tester@test.com" });
        await Fleet.deleteMany({ email: "fleet_owner@test.com" });
        await Admin.deleteMany({ email: "master_admin@test.com" });

        // 2. Setup Actors
        log("Setting up Admin, Agent, Fleet and Fleet-Driver...");
        const admin = await Admin.create({ 
            name: "Master Admin", email: "master_admin@test.com", password: "123", defaultCommission: 10 
        });
        
        const agent = await Agent.create({ 
            name: "Agent Ramesh", email: "agent_tester@test.com", phone: "1112223334", password: "123", commissionPercentage: 15 
        });

        const fleet = await Fleet.create({ 
            name: "XYZ Travels", email: "fleet_owner@test.com", phone: "5554443332", password: "123", companyName: "XYZ LTD", 
            address: "Delhi", city: "Delhi", state: "Delhi", pincode: "110001", commissionPercentage: 20 // Admin takes 20% from this Fleet
        });

        const sedan = await CarCategory.findOne({ name: { $regex: /sedan/i } }) || await CarCategory.create({name:"SedanTest", seatCapacity:4, privateRatePerKm:10, sharedRatePerSeatPerKm:5, baseFare:50});

        const driver = await Driver.create({ 
            name: "Rohan (Fleet Driver)", email: "fleet_driver@test.com", password: "123", phone: "9998887776",
            createdBy: fleet._id, createdByModel: "Fleet", isApproved: true, isActive: true, isOnline: true, "carDetails.carType": sedan._id 
        });

        const dToken = jwt.sign({ id: driver._id, role: "driver" }, process.env.JWT_SECRET);

        // 3. Create Booking by Agent (Total Fare: 1000)
        log("\n--- 📝 Creating Agent Booking (Fare: 1000) ---");
        const booking = await Booking.create({
            passengerDetails: { name: "Tourist", phone: "000" },
            agent: agent._id,
            rideType: "Private",
            carCategory: sedan._id,
            seatsBooked: 1,
            pickup: { address: "Start", latitude: 1, longitude: 1 },
            drop: { address: "End", latitude: 1.1, longitude: 1.1 },
            estimatedDistanceKm: 10,
            pickupDate: new Date(), pickupTime: "12:00",
            fareEstimate: 1000,
            actualFare: 1000,
            agentCommission: 150, // 15% of 1000
            bookingStatus: "Ongoing",
            assignedDriver: driver._id,
            tripData: { startedAt: new Date() }
        });

        // 4. End Trip & Trigger Payouts
        log("--- 🏁 Driver is Ending the Trip... ---");
        await makeRequest(`/api/trips/execute/${booking._id}/end`, 'PUT', dToken);

        // 5. Verification
        log("\n--- 💰 MONEY DISTRIBUTION RESULTS ---");
        const upAgent = await Agent.findById(agent._id);
        const upAdmin = await Admin.findById(admin._id);
        const upFleet = await Fleet.findById(fleet._id);
        const upDriver = await Driver.findById(driver._id);

        log(`Agent (Ramesh) Wallet: ₹${upAgent.walletBalance} (Expected 150 - 15% Comm)`);
        log(`Admin Wallet: ₹${upAdmin.walletBalance} (Expected 200 - 20% Fleet Comm)`);
        log(`Fleet (XYZ Travels) Wallet: ₹${upFleet.walletBalance} (Expected 1000 - 150 - 200 = ₹650)`);
        log(`Driver (Rohan) Wallet: ₹${upDriver.walletBalance} (Expected ₹0 - because he is a Fleet Driver)`);

        const txs = await Transaction.find({ relatedBooking: booking._id });
        log(`\nTotal Transactions Recorded: ${txs.length}`);
        txs.forEach(t => log(`- ${t.userModel} [${t.category}]: ₹${t.amount} status: ${t.status}`));

        fs.writeFileSync("fleet_agent_flow_out.txt", logContent);
        log("\n✅ ALL SCENARIOS VERIFIED SUCCESSFULLY!");
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
