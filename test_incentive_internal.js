require('dotenv').config();
const mongoose = require('mongoose');
const Driver = require('./models/Driver');
const Incentive = require('./models/Incentive');
const Transaction = require('./models/Transaction');
const DriverIncentiveProgress = require('./models/DriverIncentiveProgress');
const incentiveController = require('./controllers/incentiveController');

async function test() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Carbooking');
    console.log("==== DB Connected ====");

    // Clear old test data
    await Incentive.deleteMany({ title: "TEST INCENTIVE" });
    await Driver.deleteMany({ name: "Test Driver Inc" });
    await DriverIncentiveProgress.deleteMany({});
    await Transaction.deleteMany({ category: "Incentive Reward" });

    // 1. Create Incentive
    const inc = await Incentive.create({
        title: "RENTAL BOOKING INCENTIVE",
        targetType: "Rental",
        targetCount: 1,
        rewardAmount: 800,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000), // Valid for 1 day
        isActive: true
    });
    console.log("1. Created Incentive:", inc.title, "| Target Trips:", inc.targetCount, "| Reward:", inc.rewardAmount);

    // 2. Setup Driver
    let driver = await Driver.create({ name: "Test Driver Rental", phone: "9999944444", email: "rental@inc.com", password: "123", walletBalance: 3000 });
    let initialBalance = driver.walletBalance;
    console.log("2. Created Test Driver. Initial Wallet Balance: ₹", initialBalance);

    // 3. Simulate End of 'Rental' Trip
    console.log("3. Simulating 'Rental' Booking trip completion...");
    // tripController me rental trip end hoti hai tab yahi function call hota hai
    await incentiveController.processIncentiveForDriver(driver._id, 'Rental');

    // 4. Verify Results
    driver = await Driver.findById(driver._id);
    console.log("4. Driver Wallet Balance after trip: ₹", driver.walletBalance);
    
    if (driver.walletBalance === initialBalance + 800) {
        console.log("✅ SUCCESS: Incentive successfully credited to driver wallet!");
    } else {
        console.log("❌ FAILED: Incentive money was not credited.");
    }

    const tx = await Transaction.findOne({ user: driver._id, category: "Incentive Reward" }).sort({ createdAt: -1 });
    if (tx) {
        console.log("✅ SUCCESS: Transaction history generated!");
        console.log("   -> Tx Amount: ₹", tx.amount);
        console.log("   -> Tx Description:", tx.description);
    } else {
        console.log("❌ FAILED: Transaction NOT found in DB!");
    }
    
    process.exit(0);
}

test();
