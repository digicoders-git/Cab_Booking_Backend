const mongoose = require('mongoose');
require('dotenv').config();
const Driver = require('../models/Driver');

async function cleanupDrivers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB for driver seatMap cleanup.");

        const drivers = await Driver.find({ "seatMap.0": { $exists: true } });
        let fixCount = 0;

        for (const driver of drivers) {
            let needsReset = false;
            // If the first seat name looks like a JSON array
            if (driver.seatMap[0] && driver.seatMap[0].seatName && driver.seatMap[0].seatName.startsWith('[')) {
                needsReset = true;
            }

            if (needsReset) {
                // Clear the broken seatMap so tripController can re-initialize it correctly from the fixed category
                driver.seatMap = [];
                await driver.save();
                console.log(`Reset seatMap for driver: ${driver.name}`);
                fixCount++;
            }
        }

        console.log(`Cleanup finished. Reset ${fixCount} drivers.`);
        process.exit(0);
    } catch (err) {
        console.error("Cleanup error:", err);
        process.exit(1);
    }
}

cleanupDrivers();
