const mongoose = require('mongoose');
const Driver = require('../models/Driver');
const FleetCar = require('../models/FleetCar');
require('dotenv').config({ path: '../.env' });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");
    
    // Find a driver created by Fleet
    const drivers = await Driver.find({ createdByModel: "Fleet" }).limit(5).populate("carDetails.carType");
    if (!drivers || drivers.length === 0) {
        console.log("No fleet driver found");
        process.exit(0);
    }
    
    for (let driver of drivers) {
        console.log("----------------------");
        console.log("Found Driver:", driver.name, driver.email);
        console.log("Car Details:", JSON.stringify(driver.carDetails, null, 2));
        console.log("isActive:", driver.isActive, "isApproved:", driver.isApproved, "isAvailable:", driver.isAvailable, "isOnline:", driver.isOnline);
    }
    process.exit(0);
}
run().catch(console.error);
