const mongoose = require('mongoose');
const Booking = require('./models/Booking');
const Driver = require('./models/Driver');
const CarCategory = require('./models/CarCategory');
require('dotenv').config({ path: '.env' });

async function checkQuery() {
    await mongoose.connect(process.env.MONGO_URI);
    // Simulate autoMatchDriver query
    const sampleCategory = await CarCategory.findOne();
    if (sampleCategory) {
        console.log("Querying for carCategory:", sampleCategory._id);
        const drivers = await Driver.find({
            "carDetails.carType": sampleCategory._id
        });
        console.log("Matched drivers count:", drivers.length);
    }
    process.exit(0);
}
checkQuery();
