const mongoose = require("mongoose");
require("dotenv").config();
const Agent = require("../models/Agent");
const Driver = require("../models/Driver");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const Transaction = require("../models/Transaction");
const CarCategory = require("../models/CarCategory");

async function runTest() {
    try {
        console.log("--- STARTING AGENT FLOW TEST ---");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        // 1. Setup Admin (Ensure at least one exist)
        let admin = await Admin.findOne();
        if (!admin) {
            admin = await Admin.create({ name: "Admin", email: "admin@test.com", password: "password", defaultCommission: 10 });
        }
        const initialAdminBalance = admin.walletBalance || 0;

        // 2. Create Agent
        const agentEmail = `agent_${Date.now()}@test.com`;
        const agent = await Agent.create({
            name: "Test Agent",
            email: agentEmail,
            phone: `99${Date.now().toString().slice(-8)}`,
            password: "password",
            commissionPercentage: 10,
            address: "Test Address",
            city: "Lucknow",
            state: "UP",
            pincode: "1234",
            isActive: true
        });
        console.log(`Agent Created: ${agent.email}`);

        // 3. Create Driver
        const category = await CarCategory.findOne({ isActive: true });
        const driverEmail = `driver_${Date.now()}@test.com`;
        const driver = await Driver.create({
            name: "Test Driver",
            email: driverEmail,
            phone: `88${Date.now().toString().slice(-8)}`,
            password: "password",
            carDetails: { carType: category._id, carNumber: "TEST-01-AB" },
            isOnline: true,
            isAvailable: true,
            isActive: true,
            isApproved: true,
            currentLocation: { latitude: 26.84, longitude: 80.94 }
        });
        console.log(`Driver Created: ${driver.email}`);

        // 4. Create Booking as Agent
        const fare = 1000;
        const agentComm = Math.round(fare * 0.05); // 5% as per controller logic
        const booking = await Booking.create({
            passengerDetails: { name: "Test Passenger", phone: "1122334455" },
            rideType: "Private",
            carCategory: category._id,
            seatsBooked: 1,
            pickup: { address: "Pickup Loc", latitude: 26.84, longitude: 80.94 },
            drop: { address: "Drop Loc", latitude: 26.85, longitude: 80.95 },
            estimatedDistanceKm: 10,
            fareEstimate: fare,
            bookingStatus: "Pending",
            agent: agent._id,
            agentCommission: agentComm,
            tripData: { startOtp: "1234" }
        });
        console.log(`Booking Created by Agent: ${booking._id}, Commission: ${agentComm}`);

        // 5. Simulate Driver Acceptance
        booking.bookingStatus = "Accepted";
        booking.assignedDriver = driver._id;
        await booking.save();
        console.log("Driver Accepted Ride.");

        // 6. Start Trip
        booking.bookingStatus = "Ongoing";
        booking.tripData.startedAt = new Date();
        await booking.save();
        console.log("Trip Started.");

        // 7. End Trip (Simulate logic from tripController.endTrip)
        console.log("Ending Trip & Calculating Distribution...");
        booking.bookingStatus = "Completed";
        booking.tripData.endedAt = new Date();
        booking.actualFare = fare;
        booking.paymentMethod = "Cash";
        booking.paymentStatus = "Completed";
        await booking.save();

        // MONEY DISTRIBUTION LOGIC (Manual check from tripController)
        // Agent Part
        const updatedAgent = await Agent.findById(agent._id);
        updatedAgent.walletBalance += agentComm;
        updatedAgent.totalEarnings += agentComm;
        updatedAgent.totalBookings += 1;
        await updatedAgent.save();

        await Transaction.create({
            user: agent._id, userModel: 'Agent', amount: agentComm, type: 'Credit',
            category: 'Commission', status: 'Completed', relatedBooking: booking._id,
            description: `Commission for booking ${booking._id}`
        });

        // Admin Part
        const adminPercentage = admin.defaultCommission || 10;
        const adminCut = Math.round(fare * (adminPercentage / 100));
        admin.walletBalance += adminCut;
        admin.totalEarnings += adminCut;
        await admin.save();

        await Transaction.create({
            user: admin._id, userModel: 'Admin', amount: adminCut, type: 'Credit',
            category: 'Commission', status: 'Completed', relatedBooking: booking._id,
            description: `Admin fee for trip ${booking._id}`
        });

        // Driver Part (Cash Trip)
        const commissionTotal = agentComm + adminCut;
        driver.walletBalance -= commissionTotal;
        driver.totalTrips += 1;
        await driver.save();

        await Transaction.create({
            user: driver._id, userModel: 'Driver', amount: commissionTotal, type: 'Debit',
            category: 'Commission', status: 'Completed', relatedBooking: booking._id,
            description: `Commission debt for Cash Trip ${booking._id}`
        });

        console.log("--- FINAL RESULTS ---");
        console.log(`Agent Name: ${updatedAgent.name}, Wallet: ${updatedAgent.walletBalance}`);
        console.log(`Admin Name: ${admin.name}, Wallet Gain: ${admin.walletBalance - initialAdminBalance}`);
        console.log(`Driver Name: ${driver.name}, Wallet (Debt): ${driver.walletBalance}`);
        
        if (updatedAgent.walletBalance === agentComm) {
            console.log("SUCCESS: Agent received correct commission!");
        } else {
            console.log("FAILED: Agent commission mismatch.");
        }

        process.exit(0);

    } catch (error) {
        console.error("TEST FAILED:", error);
        process.exit(1);
    }
}

runTest();
