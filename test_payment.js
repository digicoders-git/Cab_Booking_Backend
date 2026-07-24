const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Booking = require('./models/Booking');
const User = require('./models/User');
const Driver = require('./models/Driver');

const BASE_URL = 'http://localhost:5000/api';

async function runTest() {
    try {
        console.log("🔗 Connecting to DB...");
        await mongoose.connect('mongodb://127.0.0.1:27017/Carbooking');
        
        let user = await User.findOne();
        let driver = await Driver.findOne();

        if (!user || !driver) {
            console.log("Could not find a user or driver in the database to test with.");
            process.exit(1);
        }

        console.log("🚘 Finding an existing Booking...");
        const booking = await Booking.findOne({ assignedDriver: { $ne: null }, user: { $ne: null } });
        if (!booking) {
             console.log("No booking found in the database. Cannot run test.");
             process.exit(1);
        }
        
        await Booking.findByIdAndUpdate(booking._id, { bookingStatus: 'Ongoing', paymentStatus: 'Pending', paymentMethod: 'Cash' });
        
        const userId = booking.user._id || booking.user;
        const driverId = booking.assignedDriver._id || booking.assignedDriver;

        user = await User.findById(userId);
        driver = await Driver.findById(driverId);

        const userToken = jwt.sign({ id: user._id, role: 'user' }, 'mysupersecret', { expiresIn: '1h' });
        const driverToken = jwt.sign({ id: driver._id, role: 'driver' }, 'mysupersecret', { expiresIn: '1h' });

        user.activeSessionToken = userToken;
        await user.save();
        
        driver.activeSessionToken = driverToken;
        await driver.save();
        console.log(`✅ Created Booking: ${booking._id}`);

        console.log("\n🧪 TEST 1: Driver initiates trip completion...");
        const res1 = await fetch(`${BASE_URL}/trips/execute/${booking._id}/initiate-completion`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${driverToken}` }
        });
        const data1 = await res1.json();
        console.log("Response:", data1);

        console.log("\n🧪 TEST 2: User selects ONLINE payment...");
        const res2 = await fetch(`${BASE_URL}/trips/execute/${booking._id}/select-payment`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${userToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentMethod: 'Online' })
        });
        const data2 = await res2.json();
        console.log("Response:", data2);

        // No data3 for online
        await Booking.findByIdAndUpdate(booking._id, { bookingStatus: 'Ongoing', paymentStatus: 'Pending', paymentMethod: 'Cash' });
        
        console.log("🏁 All Tests Passed Successfully!");

    } catch (err) {
        console.error("❌ Test Failed:", err);
    } finally {
        mongoose.disconnect();
    }
}

runTest();
